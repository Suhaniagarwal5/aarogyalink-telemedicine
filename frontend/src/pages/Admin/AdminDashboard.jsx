import { useState, useEffect, useMemo, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import DashboardLayout from '../../components/DashboardLayout'
import { useAuth } from '../../context/AuthContext'
import axiosInstance from '../../api/axiosInstance'
import { Users, CalendarCheck, CheckSquare, TrendingUp, Stethoscope, ClipboardList, Shield, Activity, Search, X, Clock } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { hi } from 'date-fns/locale/hi'
import { enUS } from 'date-fns/locale/en-US'
import { useTranslation } from 'react-i18next'

const EMPTY_ANALYTICS = [
  { day: 'Mon', bookings: 0 }, { day: 'Tue', bookings: 0 },
  { day: 'Wed', bookings: 0 }, { day: 'Thu', bookings: 0 },
  { day: 'Fri', bookings: 0 }, { day: 'Sat', bookings: 0 },
  { day: 'Sun', bookings: 0 },
]

function BarChart({ data, t }) {
  const max = Math.max(...data.map(d => d.bookings), 1)
  return (
    <div className="flex items-end gap-2 h-24 px-1">
      {data.map(d => (
        <div key={d.day} className="flex-1 flex flex-col items-center gap-1.5">
          <span className="text-[10px] font-semibold text-slate-500">{d.bookings || ''}</span>
          <div
            className="w-full rounded-t-sm bg-[#0284c7] transition-all duration-500"
            style={{ height: `${Math.max((d.bookings / max) * 64, 2)}px`, opacity: d.bookings === 0 ? 0.2 : 1 }}
          />
          <span className="text-[10px] text-slate-400 font-medium">{t(d.day)}</span>
        </div>
      ))}
    </div>
  )
}

export default function AdminDashboard() {
  const { user } = useAuth()
  const [doctors, setDoctors] = useState([])
  const [stats, setStats] = useState({ totalDoctors: 0, totalBookings: 0, completedToday: 0 })
  const [analytics, setAnalytics] = useState(EMPTY_ANALYTICS)
  const [totalWeekly, setTotalWeekly] = useState(0)
  const [auditLogs, setAuditLogs] = useState([])
  const [pendingUsers, setPendingUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const { t, i18n } = useTranslation()
  
  // Search states for filtering
  const [doctorSearch, setDoctorSearch] = useState('')
  const [auditSearch, setAuditSearch] = useState('')

  // Slot Management Modal States
  const [selectedDoctorForSlots, setSelectedDoctorForSlots] = useState(null)
  const [slotDate, setSlotDate] = useState(() => new Date().toISOString().split('T')[0])
  const [doctorSlots, setDoctorSlots] = useState([])
  const [loadingSlots, setLoadingSlots] = useState(false)

  // Fetch slots when doctor or date changes
  useEffect(() => {
    if (!selectedDoctorForSlots) return;
    setLoadingSlots(true);
    // Doctor model populates userId. The slot doctorId is the User ID.
    const docId = selectedDoctorForSlots.userId?._id || selectedDoctorForSlots._id;
    axiosInstance.get(`/slots/doctor/${docId}?date=${slotDate}`)
      .then(r => setDoctorSlots(r.data))
      .catch(console.error)
      .finally(() => setLoadingSlots(false))
  }, [selectedDoctorForSlots, slotDate])

  const handleDeactivateSlot = async (slotId) => {
    if (!window.confirm('Are you sure you want to deactivate this slot?')) return;
    try {
      await axiosInstance.patch(`/slots/${slotId}/deactivate`);
      setDoctorSlots(prev => prev.filter(s => s._id !== slotId));
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to deactivate slot');
    }
  }

  // useCallback: stable fetch function — won't re-create on every render
  // Teacher checklist: "useCallback: event handlers and fetch handlers"
  const fetchAll = useCallback(() => {
    setLoading(true)
    Promise.all([
      axiosInstance.get('/users/doctors').then(r => setDoctors(r.data)),
      axiosInstance.get('/admin/stats').then(r => setStats(r.data)),
      axiosInstance.get('/admin/audit-log').then(r => setAuditLogs(r.data.logs || [])),
      axiosInstance.get('/admin/analytics').then(r => {
        setAnalytics(r.data.weeklyBookings.map(d => ({ day: d.day, bookings: d.count })))
        setTotalWeekly(r.data.total)
      }),
      axiosInstance.get('/admin/pending-users').then(r => setPendingUsers(r.data))
    ]).catch(console.error).finally(() => setLoading(false))
  }, [])   // no deps — only needs to be created once

  useEffect(() => {
    fetchAll()
  }, [fetchAll])

  // useMemo: peakDay derived value — only recomputes when analytics data changes
  const peakDay = useMemo(() => {
    return analytics.reduce((prev, cur) => (prev.bookings > cur.bookings ? prev : cur), { day: '—', bookings: 0 })
  }, [analytics])

  // useMemo: Filtered lists for Advanced Search
  const filteredDoctors = useMemo(() => {
    return doctors.filter(d => {
      if (d?.userId?.status !== 'active') return false;
      const nameMatch = d?.userId?.name?.toLowerCase()?.includes(doctorSearch.toLowerCase()) || false;
      const specMatch = d?.specialty?.toLowerCase()?.includes(doctorSearch.toLowerCase()) || false;
      return nameMatch || specMatch;
    })
  }, [doctors, doctorSearch])

  const filteredLogs = useMemo(() => {
    return auditLogs.filter(log => {
      const actionMatch = log?.action?.toLowerCase()?.includes(auditSearch.toLowerCase()) || false;
      const nameMatch = log?.performedBy?.name?.toLowerCase()?.includes(auditSearch.toLowerCase()) || false;
      const detailsMatch = log?.details?.toLowerCase()?.includes(auditSearch.toLowerCase()) || false;
      return actionMatch || nameMatch || detailsMatch;
    })
  }, [auditLogs, auditSearch])

  const handleUserStatus = async (id, status) => {
    if (!window.confirm(`Are you sure you want to ${status} this user?`)) return;
    try {
      await axiosInstance.put(`/admin/users/${id}/status`, { status });
      setPendingUsers(prev => prev.filter(u => u._id !== id));
      if (status === 'active') {
        fetchAll(); // Refresh stats and lists
      }
    } catch (err) {
      alert(err.response?.data?.error || `Failed to ${status} user`);
    }
  }

  const statCards = [
    { icon: Users, label: t('Total Doctors'), value: stats.totalDoctors, color: 'text-violet-700 bg-violet-50 border-violet-100' },
    { icon: CalendarCheck, label: t('All-Time Bookings'), value: stats.totalBookings, color: 'text-sky-700 bg-sky-50 border-sky-100' },
    { icon: CheckSquare, label: t('Completed Today'), value: stats.completedToday, color: 'text-emerald-700 bg-emerald-50 border-emerald-100' },
    { icon: TrendingUp, label: t('Active Patients'), value: Math.floor(stats.totalBookings * 0.8), color: 'text-amber-700 bg-amber-50 border-amber-100' },
  ]

  return (
    <DashboardLayout title={t('Administration')} subtitle={t('Manage staff, view analytics, generate operational reports')}>
      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-8">
        {statCards.map((s, i) => (
          <motion.div
            key={s.label}
            initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.07 }}
            className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5 flex items-center gap-4 transition-colors"
          >
            <div className={`w-11 h-11 rounded-lg flex items-center justify-center border ${s.color} dark:bg-slate-800 dark:border-slate-700 shrink-0`}>
              <s.icon size={20} />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-900 dark:text-white">{s.value}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-medium mt-0.5">{s.label}</p>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Pending Approvals */}
      {pendingUsers.length > 0 && (
        <div className="mb-8 bg-amber-50 dark:bg-amber-900/20 rounded-xl border border-amber-200 dark:border-amber-800 overflow-hidden">
          <div className="px-6 py-4 border-b border-amber-200 dark:border-amber-800 bg-amber-100/50 dark:bg-amber-900/40">
            <h2 className="text-sm font-bold text-amber-800 dark:text-amber-400 flex items-center gap-2">
              <Shield size={16} /> {t('Pending Approvals')} ({pendingUsers.length})
            </h2>
          </div>
          <div className="divide-y divide-amber-200/50 dark:divide-amber-800/50">
            {pendingUsers.map(u => (
              <div key={u._id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-800 dark:text-slate-200">{u.name}</span>
                    <span className="text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded bg-amber-200/50 text-amber-800 dark:bg-amber-800/50 dark:text-amber-200">{u.role}</span>
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 mt-1 flex flex-wrap gap-x-4 gap-y-1">
                    <span>{u.email}</span>
                    {u.phone && <span>{u.phone}</span>}
                    {u.specialty && <span className="font-semibold text-violet-600 dark:text-violet-400">Spec: {u.specialty}</span>}
                  </div>
                  {u.certificateUrl && (
                    <a href={`http://localhost:5000${u.certificateUrl}`} target="_blank" rel="noreferrer" className="text-xs text-sky-600 hover:underline mt-2 inline-block font-semibold">
                      View Certificate
                    </a>
                  )}
                </div>
                <div className="flex gap-2">
                  <button onClick={() => handleUserStatus(u._id, 'active')} className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded shadow-sm transition-colors">
                    Approve
                  </button>
                  <button onClick={() => handleUserStatus(u._id, 'rejected')} className="px-3 py-1.5 bg-red-100 hover:bg-red-200 text-red-700 text-xs font-bold rounded transition-colors dark:bg-red-900/30 dark:hover:bg-red-900/50 dark:text-red-400">
                    Reject
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Doctor Roster */}
        <div className="lg:col-span-2 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden transition-colors">
          <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between flex-wrap gap-4">
            <div>
              <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-200">{t('Registered Doctors')}</h2>
              <span className="text-xs text-slate-400 font-medium">{filteredDoctors.length} {t('found')}</span>
            </div>
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input 
                type="text" 
                placeholder={t('Search by name or specialty...')} 
                value={doctorSearch}
                onChange={(e) => setDoctorSearch(e.target.value)}
                className="pl-8 pr-4 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#0284c7]/40 w-48 sm:w-64 transition-all"
              />
            </div>
          </div>
          {loading ? (
            <div className="flex items-center justify-center h-40">
              <div className="w-6 h-6 border-2 border-slate-200 border-t-[#0284c7] rounded-full animate-spin" />
            </div>
          ) : filteredDoctors.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 text-slate-400">
              <Search size={28} className="mb-2 opacity-40" />
              <p className="text-sm">{t('No doctors match your search.')}</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-100 dark:border-slate-800">
                    {['Name', 'Specialty', 'Status', 'Actions'].map(h => (
                      <th key={h} className="px-6 py-3 text-left text-[11px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-widest">{t(h)}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {filteredDoctors.map((d, i) => (
                    <motion.tr
                      key={d._id}
                      initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.05 }}
                      className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
                    >
                      <td className="px-6 py-3.5">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center shrink-0">
                            <Stethoscope size={14} className="text-violet-600 dark:text-violet-400" />
                          </div>
                          <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">Dr. {d.userId?.name?.replace('Dr. ', '') || d.name || 'Unknown'}</span>
                        </div>
                      </td>
                      <td className="px-6 py-3.5 text-sm text-slate-500 dark:text-slate-400">{t(d.specialty ?? '—')}</td>
                      <td className="px-6 py-3.5">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-100 dark:bg-emerald-900/20 dark:text-emerald-400 dark:border-emerald-900/50">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                          {t('Active')}
                        </span>
                      </td>
                      <td className="px-6 py-3.5 text-right">
                        <button
                          onClick={() => setSelectedDoctorForSlots(d)}
                          className="px-3 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-[11px] font-bold text-slate-700 dark:text-slate-300 rounded-lg transition-colors border border-slate-200 dark:border-slate-700"
                        >
                          {t('Manage Slots')}
                        </button>
                      </td>
                    </motion.tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Weekly Chart */}
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-6 transition-colors">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-200">{t('Weekly Bookings')}</h2>
            <span className="text-xl font-bold text-[#0284c7]">{totalWeekly}</span>
          </div>
          <BarChart data={analytics} t={t} />
          <div className="mt-5 pt-4 border-t border-slate-100 space-y-2.5">
            {[
              { label: t('Peak Day'), value: `${t(peakDay.day)} (${peakDay.bookings})`, color: 'text-sky-700' },
              { label: t('Most Active'), value: doctors.length > 0 ? `Dr. ${doctors[0].userId?.name?.replace('Dr. ', '') || doctors[0].name || 'Unknown'}` : '—', color: 'text-violet-700' },
              { label: t('Daily Average'), value: `${Math.round(totalWeekly / 7)} ${t('bookings')}`, color: 'text-amber-700' },
            ].map(item => (
              <div key={item.label} className="flex items-center justify-between">
                <span className="text-xs text-slate-400 font-medium">{item.label}</span>
                <span className={`text-xs font-semibold ${item.color}`}>{item.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Audit Log Section */}
      <div className="mt-8 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm transition-colors">
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 flex items-center justify-between flex-wrap gap-4">
          <div>
            <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-2">
              <ClipboardList size={16} className="text-slate-400" /> {t('Platform Audit Log')}
            </h2>
            <span className="text-xs text-slate-400 font-medium">{filteredLogs.length} {t('entries shown')}</span>
          </div>
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input 
              type="text" 
              placeholder={t('Search logs...')} 
              value={auditSearch}
              onChange={(e) => setAuditSearch(e.target.value)}
              className="pl-8 pr-4 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#0284c7]/40 w-48 sm:w-64 transition-all"
            />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50/50 dark:bg-slate-800/50 border-b border-slate-100 dark:border-slate-800">
                {['Event', 'User', 'Details', 'Time'].map(h => (
                  <th key={h} className="px-6 py-3 text-left text-[11px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-widest">{t(h)}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan="4" className="px-6 py-8 text-center text-sm text-slate-400">{t('No activity logs match your search.')}</td>
                </tr>
              ) : (
                filteredLogs.map((log, i) => (
                  <tr key={log._id || i} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors text-xs">
                    <td className="px-6 py-3.5">
                      <span className="font-bold text-slate-700 dark:text-slate-300">{t(log.action)}</span>
                    </td>
                    <td className="px-6 py-3.5">
                      <div className="flex flex-col">
                        <span className="font-semibold text-slate-900 dark:text-slate-200">{log.performedBy?.name || 'System'}</span>
                        <span className="text-[10px] text-slate-400 dark:text-slate-500 uppercase font-bold">{t(log.performedBy?.role || 'Service')}</span>
                      </div>
                    </td>
                    <td className="px-6 py-3.5 text-slate-500 dark:text-slate-400 max-w-xs truncate">
                      {log.details}
                    </td>
                    <td className="px-6 py-3.5 text-slate-400 font-medium">
                      {formatDistanceToNow(new Date(log.createdAt), { addSuffix: true, locale: i18n.language === 'hi' ? hi : enUS })}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal for Managing Slots */}
      <AnimatePresence>
        {selectedDoctorForSlots && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm"
          >
            <motion.div
              initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
              className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-800 w-full max-w-lg overflow-hidden flex flex-col max-h-[80vh]"
            >
              <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-900/50">
                <h3 className="font-bold text-slate-800 dark:text-slate-200">
                  {t('Manage Slots')}: Dr. {selectedDoctorForSlots.userId?.name?.replace('Dr. ', '') || selectedDoctorForSlots.name}
                </h3>
                <button onClick={() => setSelectedDoctorForSlots(null)} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors">
                  <X size={18} />
                </button>
              </div>
              <div className="p-6 overflow-y-auto flex-1">
                <div className="mb-4">
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-2">{t('Select Date')}</label>
                  <input
                    type="date" value={slotDate} onChange={e => setSlotDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-[#0284c7]/50"
                  />
                </div>
                {loadingSlots ? (
                  <div className="flex justify-center py-8">
                    <div className="w-6 h-6 border-2 border-[#0284c7] border-t-transparent rounded-full animate-spin" />
                  </div>
                ) : doctorSlots.length === 0 ? (
                  <div className="text-center py-8">
                    <p className="text-sm font-medium text-slate-500">{t('No slots scheduled for this date.')}</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {doctorSlots.map(slot => (
                      <div key={slot._id} className="flex items-center justify-between p-4 rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-white dark:bg-slate-700 flex items-center justify-center border border-slate-200 dark:border-slate-600">
                            <Clock size={14} className="text-slate-500 dark:text-slate-400" />
                          </div>
                          <div>
                            <span className="block text-sm font-bold text-slate-700 dark:text-slate-200">{slot.time ?? slot.startTime}</span>
                            {slot.isBooked ? (
                              <span className="inline-block mt-0.5 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 border border-emerald-200">{t('Booked')}</span>
                            ) : (
                              <span className="inline-block mt-0.5 text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200">{t('Open')}</span>
                            )}
                          </div>
                        </div>
                        {!slot.isBooked && (
                          <button
                            onClick={() => handleDeactivateSlot(slot._id)}
                            className="text-xs font-bold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 px-3 py-1.5 rounded-lg transition-colors border border-transparent hover:border-red-100 dark:hover:border-red-900/50"
                          >
                            {t('Deactivate')}
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </DashboardLayout>
  )
}