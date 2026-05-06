'use client'

import { useState, useEffect } from 'react'

export default function NoticePopup() {
  const [isOpen, setIsOpen] = useState(false)

  useEffect(() => {
    const closedUntil = localStorage.getItem('noticePopupClosedUntil')
    if (closedUntil) {
      if (new Date().getTime() < parseInt(closedUntil, 10)) {
        return // Still closed
      }
    }
    setIsOpen(true)
  }, [])

  if (!isOpen) return null

  const handleClose = () => {
    setIsOpen(false)
  }

  const handleCloseForToday = () => {
    const tomorrow = new Date()
    tomorrow.setHours(24, 0, 0, 0)
    localStorage.setItem('noticePopupClosedUntil', tomorrow.getTime().toString())
    setIsOpen(false)
  }

  const handleCloseFor3Days = () => {
    const target = new Date()
    target.setDate(target.getDate() + 3)
    localStorage.setItem('noticePopupClosedUntil', target.getTime().toString())
    setIsOpen(false)
  }

  return (
    <div className="modal-overlay">
      <div className="modal">
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ color: 'var(--yellow)', fontSize: '20px' }}>⚠️</span>
            <h3 className="modal-title">Supabase 데이터베이스 관리 안내</h3>
          </div>
        </div>
        <div className="modal-body">
          <p style={{ color: 'var(--text-secondary)', lineHeight: '1.6', wordBreak: 'keep-all' }}>
            Supabase 정책에 따라, 일주일간 데이터베이스 업데이트가 없을 경우 서비스가 일시 정지될 수 있습니다. 이를 방지하기 위해 <strong style={{ color: 'var(--text-primary)', fontWeight: '600' }}>주 1회 이상 데이터 업로드나 수정 등의 작업을 진행해 주시기 바랍니다.</strong>
          </p>
        </div>
        <div className="modal-footer" style={{ flexWrap: 'wrap' }}>
          <button onClick={handleCloseFor3Days} className="btn btn-secondary">
            3일간 보지 않기
          </button>
          <button onClick={handleCloseForToday} className="btn btn-secondary">
            오늘 하루 보지 않기
          </button>
          <button onClick={handleClose} className="btn btn-primary">
            확인
          </button>
        </div>
      </div>
    </div>
  )
}
