import { useState, useEffect, useMemo, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import DashboardLayout from '../../components/DashboardLayout'
import { useAuth } from '../../context/AuthContext'
import axiosInstance from '../../api/axiosInstance'
import {
  Calendar, CheckCircle2, Clock, User as UserIcon, AlertCircle,
  PlusCircle, Activity, FileText, Sparkles, CheckSquare, Wand2, Star
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import VideoConsultation from '../../components/VideoConsultation'

const STATUS_MAP = {
  pending:   { bg: 'bg-amber-100 dark:bg-amber-900/20',   color: 'text-amber-600 dark:text-amber-400',   label: 'Open' },
  completed: { bg: 'bg-emerald-100 dark:bg-emerald-900/20', color: 'text-emerald-600 dark:text-emerald-400', label: 'Done' },
  cancelled: { bg: 'bg-red-100 dark:bg-red-900/20',     color: 'text-red-600 dark:text-red-400',     label: 'Cancelled' },
  booked:    { bg: 'bg-teal-100 dark:bg-teal-900/20',    color: 'text-teal-600 dark:text-teal-400',    label: 'Booked' },
}

const TIME_OPTIONS = [
  '08:00 AM','08:30 AM','09:00 AM','09:30 AM','10:00 AM','10:30 AM',
  '11:00 AM','11:30 AM','12:00 PM','12:30 PM','01:00 PM','01:30 PM',
  '02:00 PM','02:30 PM','03:00 PM','03:30 PM','04:00 PM','04:30 PM','05:00 PM',
]

export default function DoctorDashboard() {
  const { user } = useAuth()
  const [tab, setTab] = useState('schedule')
  const [viewDate, setViewDate] = useState(() => new Date().toISOString().split('T')[0])
  const [slots, setSlots] = useState([])
  const [selected, setSelected] = useState(null)
  const [prescription, setPrescription] = useState('')
  const [saved, setSaved] = useState({})
  const [loading, setLoading] = useState(true)
  const [ratingData, setRatingData] = useState({ average: 0, count: 0 })
  const { t } = useTranslation()

  const [newSlot, setNewSlot] = useState({ date: '', time: '', startTime: '', endTime: '' })
  const [adding, setAdding] = useState(false)
  const [addError, setAddError] = useState('')
  const [addSuccess, setAddSuccess] = useState('')
  const [aiLoading, setAiLoading] = useState(false)
  const [activeVideoRoom, setActiveVideoRoom] = useState(null)

  const today = new Date().toISOString().split('T')[0]

  // ── Fetch doctor's slots for a given date ─────────────────────────────
  // useCallback: stabilises the function reference so it can be used as a
  // useEffect dependency and passed as a prop without triggering extra renders.
  const fetchSlots = useCallback((date) => {
    if (!user?.id) return
    setLoading(true)
    axiosInstance.get(`/slots/doctor/${user.id}?date=${date}`)
      .then(r => setSlots(r.data))
      .catch(() => setSlots([]))
      .finally(() => setLoading(false))
  }, [user?.id])

  useEffect(() => { fetchSlots(viewDate) }, [user?.id, viewDate, fetchSlots])

  // ── Fetch doctor's average rating ─────────────────────────────────────
  useEffect(() => {
    if (!user?.id) return
    axiosInstance.get(`/reviews/doctor/${user.id}`)
      .then(r => setRatingData(r.data))
      .catch(() => {})
  }, [user?.id])

  // ── useMemo: derive stats — only recomputed when `slots` changes ──────
  // Without useMemo this object is recreated on EVERY render (including
  // state changes for prescription text, selected slot, etc.), causing
  // all three StatCard children to unnecessarily re-render.
  const stats = useMemo(() => ({
    total:   slots.length,
    pending: slots.filter(s => !s.isBooked).length,
    done:    slots.filter(s => s.isBooked).length,
  }), [slots])

  // ── useMemo: sorted slot list for the schedule panel ─────────────────
  // Sorting is O(n log n) — memoising means we only sort when the fetched
  // slot array actually changes, not on every keystroke in the prescription
  // textarea.
  const sortedSlots = useMemo(() => {
    return [...slots].sort((a, b) => {
      const t1 = a.startTime || a.time || ''
      const t2 = b.startTime || b.time || ''
      return t1.localeCompare(t2)
    })
  }, [slots])

  // ── Handle new slot creation ──────────────────────────────────────────
  // useCallback: form submit handler — stabilised so the <form> element
  // doesn't see a new onSubmit reference on every render.
  const handleAddSlot = useCallback(async (e) => {
    e.preventDefault()
    if (!newSlot.date || !newSlot.time) return
    setAdding(true); setAddError(''); setAddSuccess('')
    try {
      // Convert 12h display time (e.g. "02:00 PM") to 24h (e.g. "14:00")
      const to24h = (t12) => {
        const [time, period] = t12.split(' ')
        let [h, m] = time.split(':').map(Number)
        if (period === 'PM' && h !== 12) h += 12
        if (period === 'AM' && h === 12) h = 0
        return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
      }
    
      // Calculate endTime as startTime + 30 minutes
      const calcEndTime = (start24) => {
        const [h, m] = start24.split(':').map(Number)
        const totalMins = h * 60 + m + 30
        return `${String(Math.floor(totalMins / 60)).padStart(2, '0')}:${String(totalMins % 60).padStart(2, '0')}`
      }
    
      const startTime = to24h(newSlot.time)
      const endTime   = calcEndTime(startTime)
    
      await axiosInstance.post('/slots', {
        doctorId:  user.id,
        date:      newSlot.date,
        time:      newSlot.time,
        startTime,
        endTime,
      })
      setAddSuccess(`✅ Slot added for ${newSlot.date} at ${newSlot.time}`)
      setNewSlot({ date: '', time: '' })
      if (viewDate === newSlot.date) fetchSlots(viewDate)
    } catch (err) {
      setAddError(err.response?.data?.error || 'Failed to add slot')
    } finally {
      setAdding(false)
    }
  }, [newSlot, user?.id, viewDate, fetchSlots])

  // ── AI prescription suggestion ────────────────────────────────────────
  // useCallback: async handler for the "AI Assist" button — deps are
  // selected.symptomBrief so it only changes when the selected slot changes.
  const handleAIAssist = useCallback(async () => {
    if (!selected?.symptomBrief) return
    setAiLoading(true)
    try {
      const { data } = await axiosInstance.post('/bookings/ai-suggest', {
        symptomBrief: selected.symptomBrief,
      })
      if (data.suggestion) setPrescription(data.suggestion)
    } catch (_) {
      // fail silently — doctor can still write manually
    } finally {
      setAiLoading(false)
    }
  }, [selected?.symptomBrief])

  // ── Complete consultation + queue PDF job ─────────────────────────────
  // useCallback: deps are prescription, saved map, selected slot, viewDate.
  const handleComplete = useCallback(async () => {
    const currentPrescription = saved[selected?._id] || prescription
    if (!currentPrescription.trim()) return
    try {
      const bookingId = selected?.bookingId
      if (!bookingId) {
        alert('Error: This slot is missing its booking reference. Try refreshing the schedule.')
        return
      }
      await axiosInstance.post(`/bookings/complete/${bookingId}`, {
        prescription: currentPrescription,
      })
      setSaved(p => ({ ...p, [selected._id]: currentPrescription }))
      fetchSlots(viewDate)
    } catch {
      alert('Failed to complete consultation. Please try again.')
    }
  }, [prescription, saved, selected, viewDate, fetchSlots])

  // ── Deactivate open slot ─────────────────────────────────────────────
  const handleDeactivate = useCallback(async () => {
    if (!selected || selected.isBooked) return
    if (!window.confirm('Are you sure you want to deactivate this open slot?')) return
    try {
      await axiosInstance.patch(`/slots/${selected._id}/deactivate`)
      setSelected(null)
      fetchSlots(viewDate)
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to deactivate slot')
    }
  }, [selected, viewDate, fetchSlots])

  // ── Stat card component (defined outside render to avoid re-creation) ─
  const StatCard = useCallback(({ icon: Icon, value, label, colorClass, delay }) => (
    <motion.div
      initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay }}
      className="bg-white dark:bg-slate-900 p-6 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800 flex items-center gap-5 hover:shadow-md transition-all"
    >
      <div className={`p-4 rounded-xl ${colorClass}`}>
        <Icon size={28} />
      </div>
      <div>
        <div className="text-3xl font-bold text-slate-800 dark:text-white">{value}</div>
        <div className="text-sm font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide mt-1">{label}</div>
      </div>
    </motion.div>
  ), [])

  return (
    <DashboardLayout
      title={
        <div className="flex items-center gap-4">
          <span className="dark:text-white">{t('Welcome, ')} {user?.name ?? 'Doctor'} 👋</span>
          {ratingData.count > 0 && (
            <div className="flex items-center gap-1.5 px-3 py-1 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-900/50 rounded-full text-sm">
              <Star size={16} className="text-amber-500 fill-amber-500" />
              <span className="font-bold text-amber-700 dark:text-amber-400">{ratingData.average}</span>
              <span className="text-amber-600/70 dark:text-amber-400/70 text-xs font-medium">({ratingData.count} reviews)</span>
            </div>
          )}
        </div>
      }
      subtitle={`${user?.specialty ?? 'Specialist'} · ${t('Manage schedule, review clinical briefs, issue prescriptions')}`}
    >
      {/* Stats Grid — values come from useMemo(stats) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <StatCard icon={Calendar}     value={stats.total}   label={t('Slots on Today')} colorClass="bg-sky-100 dark:bg-sky-900/20 text-[#0284c7] dark:text-[#38bdf8]" delay={0.1} />
        <StatCard icon={Clock}        value={stats.pending} label={t('Open Slots')}     colorClass="bg-amber-100 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400"     delay={0.2} />
        <StatCard icon={CheckCircle2} value={stats.done}    label={t('Booked / Done')}  colorClass="bg-emerald-100 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400" delay={0.3} />
      </div>

      {/* Tabs */}
      <div className="flex bg-slate-200/50 dark:bg-slate-800 p-1.5 rounded-xl mb-8 w-fit transition-colors">
        {[['schedule', t('My Schedule')], ['add', t('Add Slots')]].map(([key, label]) => (
          <button
            key={key}
            className={`px-6 py-2.5 text-sm font-bold rounded-lg transition-all flex items-center gap-2 ${tab === key ? 'bg-white dark:bg-slate-700 text-slate-800 dark:text-white shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}`}
            onClick={() => setTab(key)}
          >
            {key === 'add'      && <PlusCircle size={16} />}
            {key === 'schedule' && <Calendar size={16} />}
            {label}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        {/* ── Add Slot Tab ── */}
        {tab === 'add' && (
          <motion.div
            key="add" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }}
            className="bg-white dark:bg-slate-900 p-8 rounded-3xl shadow-sm border border-slate-100 dark:border-slate-800 max-w-lg transition-colors"
          >
            <h3 className="text-xl font-bold text-slate-800 dark:text-white mb-2 flex items-center gap-2">
              <PlusCircle className="text-[#0284c7] dark:text-[#38bdf8]" size={24} /> {t('Add Availability Slot')}
            </h3>
            <p className="text-sm font-medium text-slate-500 dark:text-slate-400 mb-8">{t('Patients will be able to book these slots once you add them.')}</p>

            <form onSubmit={handleAddSlot} className="space-y-5">
              <div>
                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-2">{t('Date')}</label>
                <input
                  type="date" required min={today}
                  value={newSlot.date} onChange={e => setNewSlot({ ...newSlot, date: e.target.value })}
                  className="w-full px-4 py-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-[#0284c7]/50 transition-all font-medium text-slate-700 dark:text-slate-200"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-2">{t('Time Slot')}</label>
                <select
                  required value={newSlot.time} onChange={e => setNewSlot({ ...newSlot, time: e.target.value })}
                  className="w-full px-4 py-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-[#0284c7]/50 transition-all font-medium text-slate-700 dark:text-slate-200"
                >
                  <option value="">{t('Select a time...')}</option>
                  {TIME_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>

              {addError && (
                <div className="flex items-center gap-2 p-3 bg-red-50 text-red-600 text-sm font-medium rounded-lg border border-red-100">
                  <AlertCircle size={16} /> <p>{addError}</p>
                </div>
              )}
              {addSuccess && (
                <div className="flex items-center gap-2 p-3 bg-emerald-50 text-emerald-600 text-sm font-medium rounded-lg border border-emerald-100">
                  <CheckCircle2 size={16} /> <p>{addSuccess}</p>
                </div>
              )}

              <button
                type="submit" disabled={adding}
                className={`w-full mt-2 py-4 rounded-xl font-bold text-white shadow-md flex items-center justify-center transition-all ${adding ? 'bg-slate-300 cursor-not-allowed shadow-none' : 'bg-[#075985] hover:bg-[#0369a1]'}`}
              >
                {adding ? t('Adding...') : t('Add Slot')}
              </button>
            </form>
          </motion.div>
        )}

        {/* ── Schedule Tab ── */}
        {tab === 'schedule' && (
          <motion.div
            key="schedule" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }}
            className="grid grid-cols-1 lg:grid-cols-12 gap-8"
          >
            {/* Left Panel: Slot List — uses sortedSlots from useMemo */}
            <div className="lg:col-span-5 bg-white dark:bg-slate-900 rounded-3xl shadow-sm border border-slate-100 dark:border-slate-800 overflow-hidden flex flex-col max-h-[600px] transition-colors">
              <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50/50 dark:bg-slate-900/50">
                <h3 className="font-bold text-slate-800 dark:text-slate-200">{t('Schedule')}</h3>
                <input
                  type="date" value={viewDate}
                  onChange={e => { setViewDate(e.target.value); setSelected(null) }}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-sm font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-[#0284c7]/50 transition-colors"
                />
              </div>

              <div className="overflow-y-auto flex-1 p-3 space-y-2">
                {loading ? (
                  <div className="flex flex-col justify-center items-center h-48 space-y-3">
                    <div className="w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
                    <p className="text-sm font-medium text-slate-500">Loading schedule...</p>
                  </div>
                ) : sortedSlots.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-48 text-center px-4">
                    <Calendar size={32} className="text-slate-300 mb-3" />
                    <p className="text-sm font-medium text-slate-500 mb-4">{t('No slots scheduled on this date.')}</p>
                    <button
                      className="px-4 py-2 bg-primary/10 text-[#0284c7] font-bold rounded-lg text-sm hover:bg-primary/20 transition-colors"
                      onClick={() => setTab('add')}
                    >
                      {t('+ Add a Slot')}
                    </button>
                  </div>
                ) : (
                  // sortedSlots is memoised — re-sorts only when slots array changes
                  sortedSlots.map((slot) => {
                    const statusKey = slot.bookingStatus || (slot.isBooked ? 'booked' : 'pending')
                    const s = STATUS_MAP[statusKey] || STATUS_MAP.pending
                    const isSelected = selected?._id === slot._id

                    return (
                      <button
                        key={slot._id}
                        onClick={() => { setSelected(slot); setPrescription('') }}
                        className={`w-full text-left p-4 rounded-2xl border transition-all flex items-center justify-between ${isSelected ? 'border-[#0284c7] bg-sky-50 dark:bg-[#075985]/20 shadow-sm ring-1 ring-[#0284c7]' : 'border-slate-100 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800/50'}`}
                      >
                        <div className="flex items-center gap-3">
                          <div className={`w-10 h-10 rounded-full flex items-center justify-center ${isSelected ? 'bg-[#0284c7] text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'}`}>
                            {slot.isBooked ? <UserIcon size={18} /> : <Clock size={18} />}
                          </div>
                          <div>
                            <div className="font-bold text-slate-800 dark:text-slate-200 text-sm mb-0.5">
                              {(slot.proxyPatientName || slot.bookedBy?.name) ?? (slot.isBooked ? t('Patient') : t('Open Slot'))}
                            </div>
                            <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
                              {slot.time ?? slot.startTime}
                            </div>
                          </div>
                        </div>
                        <span className={`px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider ${s.bg} ${s.color}`}>
                          {t(s.label)}
                        </span>
                      </button>
                    )
                  })
                )}
              </div>
            </div>

            {/* Right Panel: Consultation Detail */}
            <div className="lg:col-span-7 bg-white dark:bg-slate-900 rounded-3xl shadow-sm border border-slate-100 dark:border-slate-800 overflow-hidden flex flex-col h-full min-h-[500px] transition-colors">
              {!selected ? (
                <div className="flex flex-col items-center justify-center h-full text-center p-8 bg-slate-50/30 dark:bg-slate-900/30">
                  <div className="w-16 h-16 bg-slate-100 dark:bg-slate-800 text-slate-400 rounded-full flex items-center justify-center mb-4">
                    <Activity size={32} />
                  </div>
                  <h3 className="text-lg font-bold text-slate-700 dark:text-slate-300 mb-2">{t('No Consultation Selected')}</h3>
                  <p className="text-sm font-medium text-slate-500 max-w-sm">{t('Select a slot from your schedule on the left to view patient details and write prescriptions.')}</p>
                </div>
              ) : (
                <div className="p-8 flex flex-col h-full">
                  {/* Header */}
                  <div className="flex justify-between items-start mb-8 pb-6 border-b border-slate-100 dark:border-slate-800">
                    <div>
                      <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-200 mb-1">
                        {(selected.proxyPatientName || selected.bookedBy?.name) ?? t('Open Slot')}
                      </h2>
                      <p className="text-sm font-medium text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                        <Clock size={14} /> {selected.time ?? selected.startTime}
                      </p>
                    </div>
                    {(() => {
                      const sKey = selected.bookingStatus || (selected.isBooked ? 'booked' : 'pending')
                      const s = STATUS_MAP[sKey] || STATUS_MAP.pending
                      return (
                        <span className={`px-3 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider ${s.bg} ${s.color}`}>
                          {t(s.label)}
                        </span>
                      )
                    })()}
                  </div>

                  {/* AI Symptom Brief */}
                  {selected.symptomBrief && (
                    <div className="bg-sky-50/50 dark:bg-[#075985]/10 border border-sky-200/50 dark:border-[#075985]/30 rounded-2xl p-5 mb-8 relative overflow-hidden">
                      <div className="absolute top-0 left-0 w-1 h-full bg-[#0284c7] dark:bg-[#38bdf8]" />
                      <div className="flex items-center gap-2 mb-3">
                        <Sparkles size={18} className="text-[#0284c7] dark:text-[#38bdf8]" />
                        <span className="text-sm font-bold text-[#0284c7] dark:text-[#38bdf8] tracking-wide uppercase">AI Symptom Brief</span>
                      </div>
                      <p className="text-slate-700 dark:text-slate-300 text-sm leading-relaxed font-medium">
                        {selected.symptomBrief}
                      </p>
                    </div>
                  )}

                  {/* Video Call */}
                  {selected.isBooked && selected.videoLink && (
                    <div className="mb-6">
                      <button
                        onClick={() => {
                          const roomName = selected.videoLink.split('/').pop()
                          setActiveVideoRoom(roomName)
                        }}
                        className="flex items-center justify-center gap-2 w-full py-3 rounded-xl font-bold text-sm bg-blue-600 hover:bg-blue-700 text-white transition-colors shadow-sm"
                      >
                        🎥 Start Video Call
                      </button>
                    </div>
                  )}

                  {/* Prescription Section */}
                  {selected.isBooked && (
                    <div className="flex flex-col flex-1">
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wide flex items-center gap-2">
                          <FileText size={16} className="text-slate-400" /> {t('Write Prescription')}
                        </h3>
                        {selected.symptomBrief && !saved[selected._id] && (
                          <button
                            onClick={handleAIAssist}
                            disabled={aiLoading}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-sky-100/50 dark:bg-[#075985]/20 text-[#0284c7] dark:text-[#38bdf8] hover:bg-sky-100 dark:hover:bg-[#075985]/40 font-bold text-xs rounded-lg transition-colors"
                          >
                            {aiLoading ? (
                              <><div className="w-3 h-3 border-2 border-primary/30 border-t-primary rounded-full animate-spin" /> Generating...</>
                            ) : (
                              <><Wand2 size={14} /> AI Assist</>
                            )}
                          </button>
                        )}
                      </div>

                      {saved[selected._id] ? (
                        <div className="flex-1 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-100 dark:border-emerald-900/50 rounded-2xl p-5 text-emerald-900 dark:text-emerald-400 text-sm leading-relaxed whitespace-pre-wrap mb-6">
                          {saved[selected._id]}
                        </div>
                      ) : (
                        <textarea
                          value={prescription}
                          onChange={e => setPrescription(e.target.value)}
                          placeholder={`e.g. Tab Paracetamol 500mg - twice daily for 3 days\nPlenty of fluids and rest...`}
                          className="flex-1 w-full p-5 rounded-2xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-[#0284c7]/50 transition-all font-medium text-slate-700 dark:text-slate-200 resize-none mb-6 min-h-[150px]"
                        />
                      )}

                      <div className="flex flex-col sm:flex-row gap-3 mt-auto pt-4 border-t border-slate-100 dark:border-slate-800">
                        {!saved[selected._id] && (
                          <button
                            onClick={() => { if (prescription.trim()) setSaved(p => ({ ...p, [selected._id]: prescription })) }}
                            className="flex-1 py-3.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold rounded-xl transition-colors flex items-center justify-center gap-2"
                          >
                            <CheckSquare size={18} /> Save Draft
                          </button>
                        )}

                        <button
                          onClick={handleComplete}
                          disabled={!prescription.trim() && !saved[selected._id]}
                          className={`flex-[2] py-3.5 rounded-xl font-bold flex items-center justify-center gap-2 transition-all ${(!prescription.trim() && !saved[selected._id]) ? 'bg-slate-300 dark:bg-slate-700 text-white dark:text-slate-400 cursor-not-allowed' : 'bg-[#075985] text-white shadow-sm'}`}
                        >
                          <FileText size={18} /> {t('Complete & Generate PDF')}
                        </button>
                      </div>
                    </div>
                  )}

                  {!selected.isBooked && (
                    <div className="flex flex-col items-center justify-center flex-1 text-center">
                      <p className="text-sm font-medium text-slate-500 mb-6 opacity-60">This slot is still open. Patients can book it from their dashboard.</p>
                      <button
                        onClick={handleDeactivate}
                        className="flex items-center gap-2 px-4 py-2 text-sm font-bold text-red-600 bg-red-50 hover:bg-red-100 dark:bg-red-900/20 dark:text-red-400 dark:hover:bg-red-900/40 rounded-lg transition-colors border border-red-200 dark:border-red-900/50"
                      >
                        <AlertCircle size={16} /> Deactivate Slot
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Video Consultation Overlay */}
      {activeVideoRoom && (
        <VideoConsultation 
          roomName={activeVideoRoom} 
          userName={`Dr. ${user?.name}`} 
          onClose={() => setActiveVideoRoom(null)} 
        />
      )}
    </DashboardLayout>
  )
}