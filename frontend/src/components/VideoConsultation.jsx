import React from 'react'
import { JitsiMeeting } from '@jitsi/react-sdk'
import { motion } from 'framer-motion'
import { X } from 'lucide-react'
import { useTranslation } from 'react-i18next'

export default function VideoConsultation({ roomName, userName, onClose }) {
  const { t } = useTranslation()

  return (
    <div className="fixed inset-0 z-[100] bg-slate-900/95 backdrop-blur-md flex flex-col animate-in fade-in duration-300">
      {/* Header Bar */}
      <div className="flex items-center justify-between px-6 py-4 bg-slate-900 border-b border-slate-800 shadow-lg">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-blue-600/20 flex items-center justify-center">
            <span className="text-xl">🎥</span>
          </div>
          <div>
            <h2 className="text-white font-bold text-lg leading-tight">AarogyaLink Secure Telemedicine</h2>
            <p className="text-slate-400 text-xs font-medium">End-to-End Encrypted Consultation</p>
          </div>
        </div>
        
        <button
          onClick={onClose}
          className="flex items-center gap-2 px-5 py-2.5 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl transition-all shadow-md hover:shadow-lg active:scale-95"
        >
          <X size={18} /> {t('Leave Consultation')}
        </button>
      </div>

      {/* Video Container */}
      <div className="flex-1 w-full bg-black relative">
        <JitsiMeeting
          domain="meet.jit.si"
          roomName={roomName}
          configOverwrite={{
            startWithAudioMuted: false,
            startWithVideoMuted: false,
            disableModeratorIndicator: true,
            startScreenSharing: false,
            enableEmailInStats: false,
            prejoinPageEnabled: false, // Skip the "join" landing page and go straight to meeting
          }}
          interfaceConfigOverwrite={{
            DISABLE_JOIN_LEAVE_NOTIFICATIONS: true,
            SHOW_CHROME_EXTENSION_BANNER: false,
            SHOW_WATERMARK_FOR_GUESTS: false,
          }}
          userInfo={{
            displayName: userName || 'AarogyaLink User',
          }}
          onApiReady={(externalApi) => {
            // Optional: Handle events like when the user clicks hang up inside Jitsi
            externalApi.addListener('videoConferenceLeft', () => {
              onClose()
            })
          }}
          getIFrameRef={(iframeRef) => {
            iframeRef.style.height = '100%'
            iframeRef.style.width = '100%'
            iframeRef.style.border = 'none'
          }}
        />
      </div>
    </div>
  )
}
