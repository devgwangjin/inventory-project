'use client'
import { useEffect } from 'react'

interface ToastProps {
  message: string
  type: 'success' | 'error'
  onClose: () => void
}

export default function Toast({ message, type, onClose }: ToastProps) {
  useEffect(() => {
    const t = setTimeout(onClose, 3000)
    return () => clearTimeout(t)
  }, [onClose])

  return (
    <div className="toast-container">
      <div className={`toast toast-${type}`}>
        {type === 'success' ? '✅' : '❌'} {message}
      </div>
    </div>
  )
}
