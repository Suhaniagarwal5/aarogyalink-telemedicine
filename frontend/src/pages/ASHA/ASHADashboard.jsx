import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import DashboardLayout from '../../components/DashboardLayout'
import { useAuth } from '../../context/AuthContext'
import axiosInstance from '../../api/axiosInstance'
import { 
  Users, AlertTriangle, ClipboardCheck, Calendar, Clock, User, 
  ChevronRight, CheckCircle, AlertCircle, RefreshCw, FileText, Activity 
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import VideoConsultation from '../../components/VideoConsultation'

export default function ASHADashboard() {
  const { user } = useAuth()
  const [tab, setTab] = useState('booking') // 'booking' | 'history'
  
  // New Patient Form State
  const [patientForm, setPatientForm] = useState({
    name: '',
    age: '',
    gender: 'Male',
    village: '',
    symptoms: ''
  })
  
  // Booking State
  const [selectedSlot, setSelectedSlot] = useState(null)
  const [booked, setBooked] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [slots, setSlots] = useState([])
  
  // History State
  const [history, setHistory] = useState([])
  const [loadingHistory, setLoadingHistory] = useState(true)
  const [activeVideoRoom, setActiveVideoRoom] = useState(null)
  
  const { t } = useTranslation()
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().split('T')[0])

  // ── Fetch available slots ──────────────────────────────────────────────
  const fetchSlots = useCallback((date) => {
    axiosInstance.get(`/slots?date=${date}`)
      .then(r => setSlots(r.data))
      .catch(() => setSlots([]))
  }, [])

  // ── Fetch booking history for this ASHA worker ─────────────────────────
  const fetchHistory = useCallback(() => {
    if (!user?.id) return
    setLoadingHistory(true)
    axiosInstance.get(`/bookings?patientId=${user.id}`)
      .then(r => setHistory(r.data))
      .catch(() => setHistory([]))
      .finally(() => setLoadingHistory(false))
  }, [user?.id])

  useEffect(() => { fetchSlots(selectedDate) }, [selectedDate, fetchSlots])
  useEffect(() => { fetchHistory() }, [fetchHistory])

  // ── Book on behalf of an unregistered patient ──────────────────────────
  const handleBook = useCallback(async () => {
    if (!selectedSlot || !patientForm.name || !patientForm.age || !patientForm.symptoms) {
      setError(t('Please fill in all required patient details and select a slot.'))
      return
    }
    
    setLoading(true)
    setError('')
    try {
      const symptomBrief = `Age: ${patientForm.age}, Gender: ${patientForm.gender}, Village: ${patientForm.village || 'N/A'}. Symptoms: ${patientForm.symptoms}`
      
      await axiosInstance.post('/bookings', {
        slotId: selectedSlot._id,
        patientId: user.id, // ASHA worker is the technical patient
        proxyPatientName: patientForm.name, // The actual patient's name
        symptomBrief: symptomBrief,
      })
      setBooked(true)
      fetchHistory() // Refresh history after booking
    } catch (err) {
      setError(err.response?.data?.error || t('Booking failed. Please check slot availability.'))
    } finally {
      setLoading(false)
    }
  }, [selectedSlot, patientForm, user?.id, fetchHistory, t])

  // ── Reset booking state ────────────────────────────────────────────────
  const handleReset = useCallback(() => {
    setBooked(false)
    setSelectedSlot(null)
    setPatientForm({ name: '', age: '', gender: 'Male', village: '', symptoms: '' })
    setError('')
  }, [])

  // ── Derived Stats ──────────────────────────────────────────────────────
  const totalBookings = history.length
  const pendingBookings = history.filter(b => b.status === 'booked').length
  const completedBookings = history.filter(b => b.status === 'completed').length

  const isFormValid = patientForm.name.trim() && patientForm.age.trim() && patientForm.symptoms.trim()

  return (
    <DashboardLayout
      title={t('ASHA Worker')}
      subtitle={`${t('Community Health Worker')}: ${user?.name} · ${t('Book on behalf of unregistered rural patients')}`}
    >
      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        {[
          { icon: Users,         label: t('Total Consultations Booked'), value: totalBookings,     color: 'text-[#0284c7] bg-sky-50 border-sky-100' },
          { icon: Clock,         label: t('Pending Consultations'),      value: pendingBookings,   color: 'text-amber-700 bg-amber-50 border-amber-100' },
          { icon: CheckCircle,   label: t('Completed Consultations'),    value: completedBookings, color: 'text-emerald-700 bg-emerald-50 border-emerald-100' },
        ].map((s, i) => (
          <motion.div key={s.label} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.07 }}
            className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5 flex items-center gap-4 shadow-sm transition-colors">
            <div className={`w-11 h-11 rounded-lg flex items-center justify-center border shrink-0 ${s.color} dark:bg-slate-800 dark:border-slate-700`}>
              <s.icon size={20} />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-900 dark:text-white">{s.value}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-medium mt-0.5">{s.label}</p>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex bg-slate-200/50 dark:bg-slate-800 p-1.5 rounded-xl mb-8 w-fit transition-colors">
        {[['booking', t('Book Appointment')], ['history', t('Booking History')]].map(([key, label]) => (
          <button
            key={key}
            className={`px-6 py-2.5 text-sm font-bold rounded-lg transition-all flex items-center gap-2 ${tab === key ? 'bg-white dark:bg-slate-700 text-slate-800 dark:text-white shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}`}
            onClick={() => setTab(key)}
          >
            {key === 'booking' && <Calendar size={16} />}
            {key === 'history' && <FileText size={16} />}
            {label}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        {tab === 'booking' ? (
          <motion.div key="booking" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }} className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            
            {/* Left Panel: Patient Details Form */}
            <div className="lg:col-span-5 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col shadow-sm transition-colors">
              <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50">
                <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-200">{t('New Patient Details')}</h2>
                <p className="text-xs text-slate-500 mt-1">{t('Enter details for the patient who requires a consultation.')}</p>
              </div>
              <div className="p-6 space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1.5">{t('Patient Name')} *</label>
                  <input type="text" placeholder={t('Enter full name')} value={patientForm.name} onChange={e => setPatientForm({...patientForm, name: e.target.value})}
                    className="w-full px-4 py-2.5 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-[#0284c7]/50 text-slate-700 dark:text-slate-200 text-sm" />
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1.5">{t('Age')} *</label>
                    <input type="number" placeholder={t('Age')} value={patientForm.age} onChange={e => setPatientForm({...patientForm, age: e.target.value})}
                      className="w-full px-4 py-2.5 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-[#0284c7]/50 text-slate-700 dark:text-slate-200 text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1.5">{t('Gender')} *</label>
                    <select value={patientForm.gender} onChange={e => setPatientForm({...patientForm, gender: e.target.value})}
                      className="w-full px-4 py-2.5 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-[#0284c7]/50 text-slate-700 dark:text-slate-200 text-sm">
                      <option value="Male">{t('Male')}</option>
                      <option value="Female">{t('Female')}</option>
                      <option value="Other">{t('Other')}</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1.5">{t('Village / Location')}</label>
                  <input type="text" placeholder={t('Village name')} value={patientForm.village} onChange={e => setPatientForm({...patientForm, village: e.target.value})}
                    className="w-full px-4 py-2.5 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-[#0284c7]/50 text-slate-700 dark:text-slate-200 text-sm" />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1.5">{t('Symptoms')} *</label>
                  <textarea placeholder={t('Describe the medical issue...')} value={patientForm.symptoms} onChange={e => setPatientForm({...patientForm, symptoms: e.target.value})}
                    className="w-full px-4 py-2.5 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-[#0284c7]/50 text-slate-700 dark:text-slate-200 text-sm min-h-[100px] resize-none" />
                </div>
              </div>
            </div>

            {/* Right Panel: Booking Panel */}
            <div className="lg:col-span-7 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col shadow-sm transition-colors">
              <AnimatePresence mode="wait">
                {booked ? (
                  <motion.div key="success" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
                    className="flex flex-col items-center justify-center h-[500px] p-8 text-center">
                    <div className="w-16 h-16 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-900/50 rounded-full flex items-center justify-center mb-6">
                      <CheckCircle size={32} className="text-emerald-600 dark:text-emerald-400" />
                    </div>
                    <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">{t('Booking Confirmed')}</h3>
                    <p className="text-sm text-slate-500 dark:text-slate-400 max-w-sm mb-8">
                      {t('Successfully booked a consultation for')} <strong className="dark:text-slate-300">{patientForm.name}</strong> {t('with')}{' '}
                      <strong className="dark:text-slate-300">{selectedSlot?.doctorId?.name || t('Doctor')}</strong> {t('at')}{' '}
                      <strong className="dark:text-slate-300">{selectedSlot?.time}</strong>.
                    </p>
                    <button onClick={handleReset} className="px-6 py-2.5 bg-[#075985] text-white font-semibold rounded-lg hover:bg-[#0369a1] transition-colors shadow-sm">
                      {t('Book Another Patient')}
                    </button>
                  </motion.div>
                ) : (
                  <motion.div key="form" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col h-full">
                    <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 flex items-center justify-between">
                      <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-200">{t('Available District Hospital Slots')}</h2>
                      <input type="date" value={selectedDate}
                        min={new Date().toISOString().split('T')[0]}
                        onChange={e => setSelectedDate(e.target.value)}
                        className="px-2.5 py-1 rounded-md bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-600 dark:text-slate-300 focus:outline-none focus:ring-1 focus:ring-[#0284c7]"
                      />
                    </div>

                    <div className="p-6 flex flex-col flex-1">
                      {error && (
                        <div className="flex items-center gap-2 p-3 bg-red-50 text-red-700 text-sm rounded-lg border border-red-200 mb-4">
                          <AlertCircle size={16} /> <span>{error}</span>
                        </div>
                      )}

                      <div className="flex-1 overflow-y-auto grid grid-cols-1 md:grid-cols-2 gap-3 mb-6 pr-1 max-h-[350px]">
                        {slots.length === 0 ? (
                          <div className="col-span-full flex flex-col items-center justify-center py-12 border border-dashed border-slate-200 dark:border-slate-800 rounded-xl bg-slate-50 dark:bg-slate-900/50">
                            <Calendar size={24} className="text-slate-300 mb-2" />
                            <p className="text-sm text-slate-400">{t('No availability from doctors on this date')}</p>
                          </div>
                        ) : (
                          slots.map(slot => {
                            const isSelected = selectedSlot?._id === slot._id
                            return (
                              <button
                                key={slot._id}
                                onClick={() => setSelectedSlot(slot)}
                                className={`p-4 rounded-xl border text-left transition-all ${isSelected ? 'border-[#0284c7] bg-sky-50 dark:bg-[#075985]/20 ring-1 ring-[#0284c7]' : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800/50'}`}
                              >
                                <div className="flex items-start justify-between">
                                  <div>
                                    <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">{slot.doctorId?.name}</p>
                                    <p className="text-[11px] text-slate-500 font-medium mt-0.5">{slot.doctorId?.specialty}</p>
                                  </div>
                                  <span className="flex items-center gap-1 text-[11px] font-bold text-[#075985] dark:text-[#38bdf8] bg-sky-100/50 dark:bg-[#075985]/30 px-2 py-1 rounded">
                                    <Clock size={11} /> {slot.time}
                                  </span>
                                </div>
                              </button>
                            )
                          })
                        )}
                      </div>

                      <button
                        onClick={handleBook}
                        disabled={!selectedSlot || loading || !isFormValid}
                        className={`w-full py-3.5 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all ${(!selectedSlot || loading || !isFormValid) ? 'bg-slate-200 dark:bg-slate-800 text-slate-400 dark:text-slate-500 cursor-not-allowed' : 'bg-[#075985] text-white hover:bg-[#0369a1] shadow-md hover:shadow-lg'}`}
                      >
                        {loading ? (
                          <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> {t('Confirming')}...</>
                        ) : (
                          <>{t('Confirm Appointment')} <ChevronRight size={18} /></>
                        )}
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        ) : (
          <motion.div key="history" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }} 
            className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm transition-colors">
            <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-200">{t('Your Booking History')}</h2>
              <button onClick={fetchHistory} className="p-1.5 rounded-lg hover:bg-slate-200 text-slate-400 transition-colors"><RefreshCw size={14} /></button>
            </div>
            
            <div className="p-0">
              {loadingHistory ? (
                <div className="flex flex-col items-center justify-center py-20">
                  <div className="w-8 h-8 border-4 border-[#0284c7]/30 border-t-[#0284c7] rounded-full animate-spin mb-4" />
                  <p className="text-sm font-medium text-slate-500">{t('Loading history')}...</p>
                </div>
              ) : history.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-center">
                  <Activity size={32} className="text-slate-300 mb-3" />
                  <p className="text-sm font-medium text-slate-500">{t('No appointments booked yet.')}</p>
                </div>
              ) : (
                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                  {history.map(booking => (
                    <div key={booking._id} className="p-5 flex flex-col sm:flex-row sm:items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                      <div className="flex items-start gap-4 mb-4 sm:mb-0">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
                          booking.status === 'completed' ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400' :
                          booking.status === 'cancelled' ? 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400' :
                          'bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400'
                        }`}>
                          <User size={18} />
                        </div>
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <h3 className="font-bold text-sm text-slate-800 dark:text-slate-200">{booking.proxyPatientName || t('Patient')}</h3>
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider ${
                               booking.status === 'completed' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' :
                               booking.status === 'cancelled' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' :
                               'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                            }`}>{t(booking.status)}</span>
                          </div>
                          <p className="text-xs text-slate-500 font-medium">
                            {t('Dr.')} {booking.doctorId?.name || t('Doctor')} · {booking.slotId?.date} {t('at')} {booking.slotId?.time}
                          </p>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-3">
                        {booking.videoLink && booking.status === 'booked' && (
                          <button onClick={() => setActiveVideoRoom(booking.videoLink.split('/').pop())}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 border border-blue-200 dark:border-blue-900/50 hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors">
                            {t('🎥 Join Video Call')}
                          </button>
                        )}
                        {booking.status === 'completed' && booking.prescription && (
                          <button onClick={() => alert(booking.prescription)} className="text-xs font-bold text-[#0284c7] bg-sky-50 dark:bg-[#075985]/30 dark:text-[#38bdf8] px-3 py-1.5 rounded-lg hover:bg-sky-100 transition-colors">
                            {t('View Prescription')}
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
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
          userName={user?.name || 'ASHA Worker'} 
          onClose={() => setActiveVideoRoom(null)} 
        />
      )}
    </DashboardLayout>
  )
}