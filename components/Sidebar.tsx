'use client'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState } from 'react'
import { useOnlineUsers } from '@/hooks/useOnlineUsers'

const navItems = [
  {
    section: '대시보드',
    items: [
      { href: '/', icon: '📊', label: '대시보드' },
      { href: '/projects', icon: '📋', label: '프로젝트 관리' },
    ],
  },
  {
    section: '기준정보',
    items: [
      { href: '/clients', icon: '🏢', label: '거래처 관리' },
      { href: '/products', icon: '📦', label: '품목 관리' },
      { href: '/materials', icon: '🔩', label: '자재 관리' },
      { href: '/bom', icon: '🗂️', label: 'BOM 등록' },
    ],
  },
  {
    section: '입출고',
    items: [
      { href: '/transactions', icon: '↕️', label: '자재 입출고' },
      { href: '/shipments', icon: '🚚', label: '품목 출고' },
    ],
  },
  {
    section: '현황 / 보고서',
    items: [
      { href: '/inventory', icon: '📋', label: '자재 재고 현황' },
      { href: '/reports/monthly', icon: '📅', label: '월간 자재 입출고' },
      { href: '/reports/yearly', icon: '📆', label: '년간 자재 입출고' },
      { href: '/reports/products-monthly', icon: '📊', label: '월간 품목 출고' },
      { href: '/reports/products-yearly', icon: '📈', label: '년간 품목 출고' },
    ],
  },
]

export default function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const { users, myIdentity, editingName, setEditingName, updateName } = useOnlineUsers()
  const [tempName, setTempName] = useState('')

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/login')
    router.refresh()
  }

  const startEditName = () => {
    setTempName(myIdentity.name)
    setEditingName(true)
  }

  const handleNameSubmit = () => {
    if (tempName.trim()) {
      updateName(tempName)
    } else {
      setEditingName(false)
    }
  }

  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
          <span style={{ fontSize: '22px' }}>📦</span>
          <h1>재고관리<br />시스템</h1>
        </div>
        <span>Inventory Management</span>
      </div>

      <div style={{ flex: 1 }}>
        {navItems.map((section) => (
          <div key={section.section} className="sidebar-section">
            <div className="sidebar-section-label">{section.section}</div>
            <nav className="sidebar-nav">
              {section.items.map((item) => {
                const isActive = pathname === item.href ||
                  (item.href !== '/' && pathname.startsWith(item.href))
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={isActive ? 'active' : ''}
                  >
                    <span className="nav-icon">{item.icon}</span>
                    {item.label}
                  </Link>
                )
              })}
            </nav>
          </div>
        ))}
      </div>

      {/* Online Users Section */}
      {users.length > 0 && (
        <div className="online-users-section">
          <div className="online-users-header">
            <span className="online-dot" />
            <span>접속 중</span>
            <span className="online-count">{users.length}</span>
          </div>
          <div className="online-users-list">
            {users.map(u => (
              <div key={u.id} className={`online-user-item ${u.isMe ? 'is-me' : ''}`}>
                <span className="online-user-icon">{u.icon}</span>
                {u.isMe && editingName ? (
                  <input
                    className="online-user-edit-input"
                    value={tempName}
                    onChange={e => setTempName(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') handleNameSubmit()
                      if (e.key === 'Escape') setEditingName(false)
                    }}
                    onBlur={handleNameSubmit}
                    autoFocus
                    maxLength={12}
                  />
                ) : (
                  <span className="online-user-name">
                    {u.name}
                    {u.isMe && <span className="online-me-tag">나</span>}
                  </span>
                )}
                {u.isMe && !editingName && (
                  <button className="online-edit-btn" onClick={startEditName} title="별명 변경">✏️</button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ padding: '12px' }}>
        <button
          onClick={handleLogout}
          style={{
            width: '100%',
            padding: '9px 12px',
            background: 'transparent',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-sm)',
            color: 'var(--text-muted)',
            cursor: 'pointer',
            fontSize: '13px',
            fontFamily: 'inherit',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            transition: 'all 0.15s',
          }}
          onMouseEnter={e => {
            (e.currentTarget as HTMLElement).style.color = 'var(--red)'
            ;(e.currentTarget as HTMLElement).style.borderColor = 'rgba(239,68,68,0.3)'
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)'
            ;(e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'
          }}
        >
          🚪 로그아웃
        </button>
      </div>
    </aside>
  )
}
