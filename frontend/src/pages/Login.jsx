import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useAuth } from '../context/AuthContext'
import { useTranslation } from 'react-i18next'
import { UserCircle, Stethoscope, Activity, ShieldCheck, ArrowRight, ArrowLeft, AlertCircle, Cross, CheckSquare } from 'lucide-react'

const ROLES = [
  {
    key: 'patient', icon: UserCircle, title: 'Patient',
    desc: 'Book consultations, track queue position, download prescriptions',
    border: 'border-sky-200 dark:border-sky-900', accent: 'bg-sky-600 dark:bg-sky-500', badge: 'bg-sky-50 dark:bg-sky-900/20 text-sky-700 dark:text-sky-400 border-sky-200 dark:border-sky-900/50',
    route: '/patient'
  },
  {
    key: 'doctor', icon: Stethoscope, title: 'Doctor',
    desc: 'Manage schedule, review clinical briefs, issue prescriptions',
    border: 'border-violet-200 dark:border-violet-900', accent: 'bg-violet-700 dark:bg-violet-600', badge: 'bg-violet-50 dark:bg-violet-900/20 text-violet-700 dark:text-violet-400 border-violet-200 dark:border-violet-900/50',
    route: '/doctor'
  },
  {
    key: 'asha', icon: Activity, title: 'ASHA Worker',
    desc: 'Book on behalf of patients, manage local community caseload',
    border: 'border-amber-200 dark:border-amber-900', accent: 'bg-amber-600 dark:bg-amber-500', badge: 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-900/50',
    route: '/asha'
  },
  {
    key: 'admin', icon: ShieldCheck, title: 'Administrator',
    desc: 'Manage staff, view analytics, generate operational reports',
    border: 'border-red-200 dark:border-red-900', accent: 'bg-red-700 dark:bg-red-600', badge: 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 border-red-200 dark:border-red-900/50',
    route: '/admin'
  },
]

export default function Login() {
  const { user, login, register } = useAuth()
  const navigate = useNavigate()
  const [mode, setMode] = useState('select')
  const [selectedRole, setSelectedRole] = useState(null)
  const [isRegister, setIsRegister] = useState(false)
  const [form, setForm] = useState({ name: '', email: '', password: '', specialty: '', phone: '' })
  const [certificateFile, setCertificateFile] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [successMsg, setSuccessMsg] = useState('')
  const { t, i18n } = useTranslation()

  useEffect(() => {
    if (user) {
      const role = ROLES.find(r => r.key === user.role)
      navigate(role?.route || '/patient', { replace: true })
    }
  }, [user, navigate])

  const handleRoleSelect = (role) => {
    setSelectedRole(role)
    setMode('form')
    setError('')
    setSuccessMsg('')
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    setSuccessMsg('')
    try {
      if (isRegister) {
        if ((selectedRole.key === 'doctor' || selectedRole.key === 'asha') && certificateFile) {
          // send as form data if doctor or asha
          const formData = new FormData()
          formData.append('name', form.name)
          formData.append('email', form.email)
          formData.append('password', form.password)
          formData.append('role', selectedRole.key)
          formData.append('specialty', form.specialty)
          formData.append('phone', form.phone)
          formData.append('certificate', certificateFile)
          const res = await register(formData)
          if (!res.user) {
            setSuccessMsg('Account created successfully! Please wait for Admin approval to log in.')
            setForm({ name: '', email: '', password: '', specialty: '', phone: '' })
            setCertificateFile(null)
          }
        } else {
          const res = await register({ ...form, role: selectedRole.key })
          if (!res.user) {
            setSuccessMsg('Account created successfully! Please wait for Admin approval to log in.')
            setForm({ name: '', email: '', password: '', specialty: '', phone: '' })
            setCertificateFile(null)
          }
        }
      } else {
        await login(form.email, form.password, selectedRole.key)
      }
    } catch (err) {
      setError(err.response?.data?.message || err.response?.data?.error || 'Authentication failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen w-full flex font-sans bg-[#f0f4f8] dark:bg-[#0f172a] transition-colors">
      {/* Left panel — branding */}
      <div className="hidden lg:flex flex-col justify-between w-[420px] shrink-0 bg-[#075985] p-12 text-white relative overflow-hidden">
        {/* Subtle pattern overlay */}
        <div className="absolute inset-0 opacity-5"
          style={{ backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 40px, rgba(255,255,255,0.5) 40px, rgba(255,255,255,0.5) 41px), repeating-linear-gradient(90deg, transparent, transparent 40px, rgba(255,255,255,0.5) 40px, rgba(255,255,255,0.5) 41px)' }}
        />

        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-16">
            <div className="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center">
              <Cross size={20} className="text-white" strokeWidth={2.5} />
            </div>
            <span className="text-xl font-semibold tracking-tight">{t('AarogyaLink')}</span>
          </div>
          <h2 className="text-4xl font-bold leading-snug mb-4">
            {t('Rural Telemedicine')}<br />{t('at Scale')}
          </h2>
          <p className="text-sky-200 text-sm leading-relaxed">
            {t('Connecting patients in remote villages with certified district hospital doctors through AI-assisted consultations and real-time queue management.')}
          </p>
        </div>

        <div className="relative z-10 space-y-4">
          {[
            { label: 'AI Symptom Triage', desc: 'Structured clinical briefs before every consult' },
            { label: 'Live Queue Tracking', desc: 'Real-time position via Server-Sent Events' },
            { label: 'Prescription PDFs', desc: 'Asynchronous generation via worker threads' },
          ].map(f => (
            <div key={f.label} className="flex items-start gap-3">
              <div className="w-1.5 h-1.5 rounded-full bg-sky-400 mt-1.5 shrink-0" />
              <div>
                <p className="text-sm font-semibold text-white">{t(f.label)}</p>
                <p className="text-xs text-sky-300">{t(f.desc)}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Right panel — auth form */}
      <div className="flex-1 flex items-center justify-center p-8">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-lg overflow-hidden transition-colors"
        >
          {/* Card header */}
          <div className="px-8 pt-8 pb-6 border-b border-slate-100 dark:border-slate-800 relative">
            <button
              onClick={() => i18n.changeLanguage(i18n.language === 'en' ? 'hi' : 'en')}
              className="absolute top-6 right-6 flex items-center gap-2 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-sm font-medium text-slate-600 dark:text-slate-300 transition-colors"
            >
              <span className={i18n.language === 'en' ? 'text-[#0284c7] font-bold' : ''}>A</span>
              <span className="text-slate-300 dark:text-slate-600">/</span>
              <span className={i18n.language === 'hi' ? 'text-[#0284c7] font-bold' : ''}>अ</span>
            </button>
            <div className="flex items-center gap-3 mb-1 lg:hidden">
              <div className="w-8 h-8 bg-[#075985] rounded-lg flex items-center justify-center">
                <Cross size={14} className="text-white" strokeWidth={2.5} />
              </div>
              <span className="font-bold text-slate-800 dark:text-slate-200">{t('AarogyaLink')}</span>
            </div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white mt-2">
              {mode === 'select' ? t('Select your role') : (isRegister ? t('Create account') : t('Sign In'))}
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              {mode === 'select' ? t('Choose your role to continue') : `${t('Continuing as')} ${t(selectedRole?.title)}`}
            </p>
          </div>

          <div className="px-8 py-6">
            <AnimatePresence mode="wait">
              {mode === 'select' ? (
                <motion.div key="select" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {ROLES.map(role => {
                      const Icon = role.icon
                      return (
                        <button
                          key={role.key}
                          onClick={() => handleRoleSelect(role)}
                          className={`group flex flex-col items-start p-4 bg-white dark:bg-slate-800/50 border-2 ${role.border} rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 transition-all text-left`}
                        >
                          <div className={`w-8 h-8 ${role.accent} rounded-lg flex items-center justify-center mb-3`}>
                            <Icon size={16} className="text-white" />
                          </div>
                          <h3 className="font-semibold text-slate-800 dark:text-slate-200 text-sm mb-1">{t(role.title)}</h3>
                          <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">{t(role.desc)}</p>
                        </button>
                      )
                    })}
                  </div>
                </motion.div>
              ) : (
                <motion.div key="form" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  {/* Back + role badge */}
                  <div className="flex items-center justify-between mb-5">
                    <button
                      onClick={() => { setMode('select'); setError(''); setSuccessMsg(''); setForm({ name: '', email: '', password: '', specialty: '', phone: '' }); setCertificateFile(null); setIsRegister(false) }}
                      className="flex items-center gap-1 text-sm text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 transition-colors font-medium"
                    >
                      <ArrowLeft size={15} /> {t('Back')}
                    </button>
                    <span className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold border ${selectedRole.badge}`}>
                      <selectedRole.icon size={12} /> {t(selectedRole.title)}
                    </span>
                  </div>

                  {/* Sign In / Register tabs */}
                  {selectedRole?.key !== 'admin' && (
                    <div className="flex border border-slate-200 dark:border-slate-800 rounded-lg p-0.5 mb-6">
                      {[[t('Sign In'), false], [t('Register'), true]].map(([label, val]) => (
                        <button
                          key={label}
                          onClick={() => { setIsRegister(val); setError(''); setSuccessMsg('') }}
                          className={`flex-1 py-2 text-sm font-semibold rounded-md transition-all ${isRegister === val ? 'bg-[#075985] text-white shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/50'}`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  )}

                  <form onSubmit={handleSubmit} className="space-y-4">
                    <AnimatePresence>
                      {isRegister && (
                        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden space-y-4">
                          <div>
                            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide mb-1.5">{t('Full Name')}</label>
                            <input
                              type="text" required value={form.name}
                              onChange={e => setForm({ ...form, name: e.target.value })}
                              className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#0284c7]/40 focus:border-[#0284c7] text-sm transition-all"
                              placeholder={t('Full Name')}
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide mb-1.5">{t('Phone Number')}</label>
                            <input
                              type="text" required value={form.phone}
                              onChange={e => setForm({ ...form, phone: e.target.value })}
                              className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#0284c7]/40 focus:border-[#0284c7] text-sm transition-all"
                              placeholder="+91 9876543210"
                            />
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    <div>
                      <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide mb-1.5">{t('Email Address')}</label>
                      <input
                        type="email" required value={form.email}
                        onChange={e => setForm({ ...form, email: e.target.value })}
                        className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#0284c7]/40 focus:border-[#0284c7] text-sm transition-all"
                        placeholder="you@hospital.in"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide mb-1.5">{t('Password')}</label>
                      <input
                        type="password" required value={form.password}
                        onChange={e => setForm({ ...form, password: e.target.value })}
                        className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#0284c7]/40 focus:border-[#0284c7] text-sm transition-all"
                        placeholder="••••••••"
                      />
                    </div>

                    <AnimatePresence>
                      {isRegister && (selectedRole?.key === 'doctor' || selectedRole?.key === 'asha') && (
                        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden space-y-4">
                          {selectedRole?.key === 'doctor' && (
                            <div>
                              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide mb-1.5">{t('Medical Specialty')}</label>
                              <input
                                type="text" required value={form.specialty}
                                onChange={e => setForm({ ...form, specialty: e.target.value })}
                                className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#0284c7]/40 focus:border-[#0284c7] text-sm transition-all"
                                placeholder="e.g. General Medicine"
                              />
                            </div>
                          )}
                          <div>
                            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide mb-1.5">{t('Upload Document/Certificate')}</label>
                            <input
                              type="file" required onChange={e => setCertificateFile(e.target.files[0])}
                              accept=".pdf,.jpg,.jpeg,.png"
                              className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#0284c7]/40 focus:border-[#0284c7] text-sm transition-all"
                            />
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    {successMsg && (
                      <div className="flex items-center gap-2 p-3 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 text-sm rounded-lg border border-emerald-200 dark:border-emerald-900/50">
                        <CheckSquare size={15} className="shrink-0" /> <span>{successMsg}</span>
                      </div>
                    )}

                    {error && (
                      <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 text-sm rounded-lg border border-red-200 dark:border-red-900/50">
                        <AlertCircle size={15} className="shrink-0" /> <span>{error}</span>
                      </div>
                    )}

                    <button
                      type="submit" disabled={loading}
                      className={`w-full py-3 mt-2 rounded-lg font-semibold text-white flex items-center justify-center gap-2 transition-all ${loading ? 'bg-slate-400 dark:bg-slate-700 cursor-not-allowed' : 'bg-[#075985] hover:bg-[#0369a1] shadow-sm hover:shadow-md'}`}
                    >
                      {loading ? (
                        <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> {t('Processing...')}</>
                      ) : (
                        <>{isRegister ? t('Create Account') : t('Sign In')} <ArrowRight size={16} /></>
                      )}
                    </button>
                  </form>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>
      </div>
    </div>
  )
}