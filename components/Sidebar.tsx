'use client'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'

const navItems = [
  {
    section: '대시보드',
    items: [{ href: '/', icon: '📊', label: '대시보드' }],
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
      { href: '/inventory', icon: '📋', label: '재고 현황' },
      { href: '/reports/monthly', icon: '📅', label: '월간 현황' },
      { href: '/reports/yearly', icon: '📆', label: '년간 현황' },
    ],
  },
]

export default function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/login')
    router.refresh()
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
