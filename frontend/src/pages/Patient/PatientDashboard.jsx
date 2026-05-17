import { useState, useEffect, useMemo, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import DashboardLayout from '../../components/DashboardLayout'
import { useAuth } from '../../context/AuthContext'
import axiosInstance from '../../api/axiosInstance'
import { useQueuePosition } from '../../hooks/useQueuePosition'
import { useTranslation } from 'react-i18next'
import { Calendar, CheckCircle, Hash, Clock, User, AlertCircle, Activity, Download, ChevronRight, Star, X } from 'lucide-react'
import VideoConsultation from '../../components/VideoConsultation'

export default function PatientDashboard() {
  const { user } = useAuth()
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().split('T')[0])
  const [symptom, setSymptom] = useState('')
  const [selectedSlot, setSelectedSlot] = useState(null)
  const [booked, setBooked] = useState(false)
  const [bookedData, setBookedData] = useState(null)
  const [tab, setTab] = useState('book')
  const { t } = useTranslation()

  const [slots, setSlots] = useState([])
  const [bookings, setBookings] = useState([])
  const [loadingSlots, setLoadingSlots] = useState(false)
  const [loadingBook, setLoadingBook] = useState(false)
  const [error, setError] = useState('')
  
  // Review Modal State
  const [reviewBooking, setReviewBooking] = useState(null)
  const [rating, setRating] = useState(5)
  const [comment, setComment] = useState('')
  const [submittingReview, setSubmittingReview] = useState(false)
  const [activeVideoRoom, setActiveVideoRoom] = useState(null)

  const queueInfo = useQueuePosition(
    booked ? bookedData?.booking?.doctorId : null,
    booked ? bookedData?.booking?._id : null
  )

  // ── Fetch available slots on date change ──────────────────────────────
  // useCallback: stabilises the fetch function so it can be safely listed
  // in the useEffect dependency array without causing infinite re-renders.
  const fetchSlots = useCallback((date) => {
    if (!date) return
    setLoadingSlots(true)
    setError('')
    setSelectedSlot(null)
    axiosInstance.get(`/slots?date=${date}`)
      .then(r => setSlots(r.data))
      .catch(() => setSlots([]))
      .finally(() => setLoadingSlots(false))
  }, [])

  // ── Fetch booking history when history tab is opened ──────────────────
  // useCallback: event-handler style — avoids re-subscription when parent
  // re-renders for unrelated state changes.
  const fetchBookings = useCallback(() => {
    if (!user?.id) return
    axiosInstance.get(`/bookings?patientId=${user.id}`)
      .then(r => setBookings(r.data))
      .catch(() => setBookings([]))
  }, [user?.id])

  useEffect(() => { fetchSlots(selectedDate) }, [selectedDate, fetchSlots])

  useEffect(() => {
    if (tab === 'history') fetchBookings()
  }, [tab, fetchBookings])

  // ── useMemo: sort + filter available slots ────────────────────────────
  // This computation runs on every render without memoisation because
  // PatientDashboard has many state variables. useMemo ensures we only
  // re-sort when the raw `slots` array actually changes.
  const sortedSlots = useMemo(() => {
    return [...slots].sort((a, b) => {
      // Sort by startTime (24h format, e.g., "14:00") which sorts correctly lexicographically
      const t1 = a.startTime || a.time || ''
      const t2 = b.startTime || b.time || ''
      return t1.localeCompare(t2)
    })
  }, [slots])

  // ── useMemo: derive stats for the stat cards ──────────────────────────
  // Avoids recounting every render — only recomputes when bookings changes.
  const bookingStats = useMemo(() => ({
    upcoming:  bookings.filter(b => b.status === 'booked').length,
    completed: bookings.filter(b => b.status === 'completed').length,
  }), [bookings])

  // ── Handle booking submission ─────────────────────────────────────────
  // useCallback: this is passed into the onClick of a button — wrapping
  // prevents the button from re-rendering when unrelated state changes.
  const handleBook = useCallback(async () => {
    if (!selectedSlot || !symptom.trim()) return
    setLoadingBook(true)
    setError('')
    try {
      const { data } = await axiosInstance.post('/bookings', {
        slotId: selectedSlot._id,
        patientId: user.id,
        rawSymptoms: symptom,
      })
      setBookedData(data)
      setBooked(true)
    } catch (err) {
      setError(err.response?.data?.error || 'Booking failed. Please try again.')
    } finally {
      setLoadingBook(false)
    }
  }, [selectedSlot, symptom, user?.id])

  // ── Reset back to book form ───────────────────────────────────────────
  // useCallback: handler reference stabilised for the reset button.
  const handleReset = useCallback(() => {
    setBooked(false)
    setSymptom('')
    setSelectedSlot(null)
    setBookedData(null)
  }, [])

  // ── Handle Review Submission ──────────────────────────────────────────
  const handleSubmitReview = async () => {
    if (!reviewBooking) return
    setSubmittingReview(true)
    try {
      await axiosInstance.post('/reviews', {
        bookingId: reviewBooking._id,
        doctorId: reviewBooking.doctorId._id,
        rating,
        comment
      })
      alert('Thank you for your review!')
      setReviewBooking(null)
      setRating(5)
      setComment('')
    } catch (err) {
      alert(err.response?.data?.error || err.response?.data?.message || err.message || 'Failed to submit review')
    } finally {
      setSubmittingReview(false)
    }
  }

  const STATUS_CONFIG = {
    booked:    { label: t('Scheduled'), class: 'bg-sky-50 text-sky-700 border-sky-200' },
    completed: { label: t('Completed'), class: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
    cancelled: { label: t('Cancelled'), class: 'bg-red-50 text-red-700 border-red-200' },
  }

  return (
    <>
    <DashboardLayout
      title={`${t('Welcome, ')} ${user?.name ?? 'Patient'}`}
      subtitle={t('Book a consultation or view your appointment history')}
    >
      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        {[
          { icon: Calendar,     value: bookingStats.upcoming,           label: t('Scheduled Appointments'),   color: 'text-sky-700 bg-sky-50 border-sky-100' },
          { icon: CheckCircle,  value: bookingStats.completed,          label: t('Completed Consultations'),  color: 'text-emerald-700 bg-emerald-50 border-emerald-100' },
          { icon: Hash,         value: queueInfo.position ?? bookedData?.queuePos ?? '—',     label: t('Current Queue Position'),   color: 'text-violet-700 bg-violet-50 border-violet-100' },
        ].map((s, i) => (
          <motion.div key={s.label} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.07 }}
            className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5 flex items-center gap-4 transition-colors">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center border shrink-0 ${s.color} dark:bg-slate-800 dark:border-slate-700`}>
              <s.icon size={18} />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-900 dark:text-white">{s.value}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-medium mt-0.5">{s.label}</p>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Tab bar */}
      <div className="flex border border-slate-200 dark:border-slate-800 rounded-lg p-0.5 w-fit mb-6 bg-white dark:bg-slate-900 transition-colors">
        {[['book', t('Book Consultation')], ['history', t('My Appointments')]].map(([key, label]) => (
          <button key={key}
            className={`px-5 py-2 text-sm font-semibold rounded-md transition-all ${tab === key ? 'bg-[#075985] text-white shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}`}
            onClick={() => setTab(key)}
          >
            {label}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        {tab === 'book' && (
          <motion.div key="book" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Slot Picker */}
            <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 flex flex-col overflow-hidden transition-colors">
              <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50">
                <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                  <Calendar size={16} className="text-slate-400" /> {t('Select Date & Available Slot')}
                </h2>
              </div>
              <div className="p-6 flex flex-col gap-4 flex-1">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">{t('Appointment Date')}</label>
                  <input type="date" value={selectedDate}
                    min={new Date().toISOString().split('T')[0]}
                    onChange={e => setSelectedDate(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-[#0284c7]/40 focus:border-[#0284c7] text-sm font-medium text-slate-700 dark:text-slate-200 transition-all"
                  />
                </div>

                <div className="flex-1">
                  {loadingSlots ? (
                    <div className="flex flex-col items-center justify-center h-40 gap-2">
                      <div className="w-6 h-6 border-2 border-slate-200 border-t-[#0284c7] rounded-full animate-spin" />
                      <p className="text-xs text-slate-400 font-medium">{t('Loading slots...')}</p>
                    </div>
                  ) : sortedSlots.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-40 rounded-lg border border-dashed border-slate-200 bg-slate-50">
                      <Calendar size={24} className="text-slate-300 mb-2" />
                      <p className="text-sm font-medium text-slate-400">{t('No slots available on this date.')}</p>
                    </div>
                  ) : (
                    // sortedSlots is memoised — only re-sorted when slots array changes
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-64 overflow-y-auto pr-1">
                      {sortedSlots.map(slot => (
                        <button key={slot._id} onClick={() => setSelectedSlot(slot)}
                          className={`flex items-start justify-between p-3.5 rounded-lg border text-left transition-all ${selectedSlot?._id === slot._id ? 'border-[#0284c7] bg-sky-50 dark:bg-[#075985]/20 ring-1 ring-[#0284c7]' : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800/50'}`}
                        >
                          <div>
                            <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">{slot.doctorId?.name ?? 'Doctor'}</p>
                            <p className="text-xs text-slate-400 mt-0.5">{slot.doctorId?.specialty ?? 'General'}</p>
                          </div>
                          <span className="flex items-center gap-1 text-xs font-semibold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded-md mt-0.5 shrink-0">
                            <Clock size={11} /> {slot.time}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Symptom form / Success */}
            <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col transition-colors">
              <AnimatePresence mode="wait">
                {booked ? (
                  <motion.div key="success" initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                    className="flex flex-col items-center text-center p-8 h-full justify-center">
                    <div className="w-14 h-14 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-900/50 rounded-full flex items-center justify-center mb-5">
                      <CheckCircle size={28} className="text-emerald-600 dark:text-emerald-400" />
                    </div>
                    <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-1">{t('Appointment Confirmed')}</h3>
                    <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
                      {selectedSlot?.doctorId?.name ?? 'Doctor'} &bull; {selectedSlot?.time}
                    </p>

                    {bookedData?.booking && (
                      <div className="w-full bg-sky-50 dark:bg-[#075985]/10 border border-sky-200 dark:border-[#075985]/30 rounded-xl p-5 mb-6 text-center">
                        <p className="text-xs font-semibold text-sky-600 dark:text-[#38bdf8] uppercase tracking-wider mb-2">{t('Live Queue Position')}</p>
                        <p className="text-4xl font-bold text-[#075985] mb-2">
                          #{queueInfo.connected && queueInfo.position ? queueInfo.position : (bookedData.queuePos ?? '—')}
                        </p>
                        {queueInfo.patientsAhead > 0 && (
                          <p className="text-sm text-slate-500">{queueInfo.patientsAhead} patient(s) ahead of you</p>
                        )}
                        {queueInfo.position === 1 && (
                          <p className="text-sm font-semibold text-emerald-600 mt-2">You are next — please be ready.</p>
                        )}
                      </div>
                    )}

                    <div className="flex flex-col sm:flex-row items-center justify-center gap-3 w-full">
                      {bookedData?.booking?.videoLink && (
                        <button
                          onClick={() => setActiveVideoRoom(bookedData.booking.videoLink.split('/').pop())}
                          className="px-5 py-2.5 rounded-lg border border-blue-200 dark:border-blue-900/50 text-sm font-semibold text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors flex items-center gap-2"
                        >
                          {t('🎥 Join Video Call')}
                        </button>
                      )}
                      <button
                        onClick={handleReset}
                        className="px-5 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 text-sm font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                      >
                        {t('Book Another Consultation')}
                      </button>
                    </div>
                  </motion.div>
                ) : (
                  <motion.div key="form" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col h-full">
                    <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50">
                      <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                        <Activity size={16} className="text-slate-400" /> {t('Describe Your Symptoms')}
                      </h2>
                      <p className="text-xs text-slate-400 mt-0.5">{t('Our AI will structure this into a clinical brief for the doctor.')}</p>
                    </div>
                    <div className="p-6 flex flex-col flex-1 gap-4">
                      {error && (
                        <div className="flex items-center gap-2 p-3 bg-red-50 text-red-700 text-sm rounded-lg border border-red-200">
                          <AlertCircle size={15} className="shrink-0" /> <p>{error}</p>
                        </div>
                      )}

                      <textarea value={symptom} onChange={e => setSymptom(e.target.value)}
                        placeholder={t('Describe your symptoms in plain language, e.g. I have had a fever of 101°F for 3 days with sore throat and body ache...')}
                        className="flex-1 w-full px-4 py-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-[#0284c7]/40 focus:border-[#0284c7] text-sm text-slate-700 dark:text-slate-200 resize-none min-h-[140px] transition-all"
                      />

                      {selectedSlot ? (
                        <div className="flex items-center justify-between p-3.5 rounded-lg bg-sky-50 dark:bg-sky-900/20 border border-sky-200 dark:border-sky-900/50">
                          <div>
                            <p className="text-xs font-semibold text-sky-700 dark:text-sky-400 uppercase tracking-wider mb-0.5">Selected Slot</p>
                            <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">{selectedSlot.doctorId?.name ?? 'Doctor'} — {selectedSlot.time}</p>
                          </div>
                          <CheckCircle size={18} className="text-sky-600 dark:text-sky-500" />
                        </div>
                      ) : (
                        <div className="p-3.5 rounded-lg border border-dashed border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 text-center">
                          <p className="text-sm text-slate-400 font-medium">{t('Select a slot from the panel on the left.')}</p>
                        </div>
                      )}

                      <button onClick={handleBook}
                        disabled={!selectedSlot || !symptom.trim() || loadingBook}
                        className={`w-full py-3 rounded-lg font-semibold text-sm flex items-center justify-center gap-2 transition-all ${(!selectedSlot || !symptom.trim() || loadingBook) ? 'bg-slate-200 dark:bg-slate-800 text-slate-400 dark:text-slate-500 cursor-not-allowed' : 'bg-[#075985] text-white hover:bg-[#0369a1] shadow-sm hover:shadow-md'}`}
                      >
                        {loadingBook ? (
                          <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> {t('Booking...')}</>
                        ) : (
                          <>{t('Confirm Appointment')} <ChevronRight size={16} /></>
                        )}
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        )}

        {tab === 'history' && (
          <motion.div key="history" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden transition-colors">
            <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                <Clock size={16} className="text-slate-400" /> {t('Appointment History')}
              </h2>
              <span className="text-xs text-slate-400 font-medium">{bookings.length} {bookings.length !== 1 ? t('records') : t('record')}</span>
            </div>

            {bookings.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 text-center">
                <Calendar size={28} className="text-slate-300 mb-3" />
                <p className="text-sm font-medium text-slate-400">No appointments on record.</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {bookings.map((b, i) => {
                  const sc = STATUS_CONFIG[b.status] || STATUS_CONFIG.booked
                  return (
                    <motion.div key={b._id ?? i}
                      initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.04 }}
                      className="px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                      <div className="flex items-center gap-4">
                        <div className="w-9 h-9 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0">
                          <User size={16} className="text-slate-500" />
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">Dr. {b.doctorId?.name ?? '—'}</p>
                          <p className="text-xs text-slate-400 mt-0.5 font-medium">
                            {b.slotId?.date ?? '—'} &bull; {b.slotId?.time ?? '—'}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 ml-13 sm:ml-0">
                        {b.prescriptionUrl && (
                          <a href={`${(import.meta.env.VITE_API_URL || import.meta.env.VITE_API_BASE_URL || 'http://localhost:5005/api').replace(/\/api$/, '')}${b.prescriptionUrl}`} target="_blank" rel="noopener noreferrer"
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-900/50 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 transition-colors">
                            <Download size={13} /> {t('Download Prescription')}
                          </a>
                        )}
                        {b.videoLink && b.status === 'booked' && (
                          <button onClick={() => setActiveVideoRoom(b.videoLink.split('/').pop())}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 border border-blue-200 dark:border-blue-900/50 hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors">
                            {t('🎥 Join Video Call')}
                          </button>
                        )}
                        {b.status === 'completed' && (
                          <button onClick={() => setReviewBooking(b)}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100 transition-colors">
                            <Star size={13} /> {t('Rate Doctor')}
                          </button>
                        )}
                        {b.status === 'booked' && b.queuePosition !== undefined && (
                          <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold bg-violet-50 dark:bg-violet-900/20 text-violet-700 dark:text-violet-400 border border-violet-200 dark:border-violet-900/50">
                            <Hash size={11} /> {t('Pos:')} #{b.queuePosition}
                          </span>
                        )}
                        <span className={`px-2.5 py-1 rounded-md text-[11px] font-semibold border ${sc.class}`}>{sc.label}</span>
                      </div>
                    </motion.div>
                  )
                })}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </DashboardLayout>

    {/* Review Modal */}
    <AnimatePresence>
      {reviewBooking && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
            className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl w-full max-w-md overflow-hidden flex flex-col border border-transparent dark:border-slate-800">
            <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-900/50">
              <h3 className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2"><Star size={18} className="text-amber-500 fill-amber-500"/> Rate Your Visit</h3>
              <button onClick={() => setReviewBooking(null)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"><X size={20}/></button>
            </div>
            <div className="p-6 flex flex-col gap-5">
              <div className="text-center">
                <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">Dr. {reviewBooking.doctorId?.name}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">{reviewBooking.slotId?.date}</p>
              </div>
              <div className="flex justify-center gap-2">
                {[1, 2, 3, 4, 5].map(star => (
                  <button key={star} onClick={() => setRating(star)} className="focus:outline-none transition-transform hover:scale-110">
                    <Star size={32} className={star <= rating ? 'text-amber-400 fill-amber-400' : 'text-slate-200'} />
                  </button>
                ))}
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Private Feedback</label>
                <textarea value={comment} onChange={e => setComment(e.target.value)}
                  placeholder="How was your consultation?"
                  className="w-full px-4 py-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 focus:outline-none focus:border-[#0284c7] text-sm text-slate-700 dark:text-slate-200 resize-none h-24"
                />
              </div>
              <button onClick={handleSubmitReview} disabled={submittingReview}
                className="w-full py-3 bg-[#075985] text-white rounded-lg font-semibold text-sm hover:bg-[#0369a1] disabled:opacity-50 transition-colors">
                {submittingReview ? 'Submitting...' : 'Submit Review'}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>

    {/* Video Consultation Overlay */}
    {activeVideoRoom && (
      <VideoConsultation 
        roomName={activeVideoRoom} 
        userName={user?.name || 'Patient'} 
        onClose={() => setActiveVideoRoom(null)} 
      />
    )}
  </>
  )
}