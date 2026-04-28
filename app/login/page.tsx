'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      })

      if (res.ok) {
        router.push('/')
        router.refresh()
      } else {
        const data = await res.json()
        setError(data.error || '비밀번호가 올바르지 않습니다.')
      }
    } catch {
      setError('서버 오류가 발생했습니다.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--bg-primary)',
      padding: '20px',
    }}>
      <div style={{ width: '100%', maxWidth: '380px' }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <div style={{
            width: '60px',
            height: '60px',
            background: 'var(--accent-light)',
            borderRadius: '16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '28px',
            margin: '0 auto 16px',
            border: '1px solid rgba(59,130,246,0.2)',
          }}>
            📦
          </div>
          <h1 style={{
            fontSize: '22px',
            fontWeight: '800',
            color: 'var(--text-primary)',
            letterSpacing: '-0.02em',
            marginBottom: '6px',
          }}>
            재고관리 시스템
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>
            비밀번호를 입력하여 접속하세요
          </p>
        </div>

        {/* Form */}
        <div className="card">
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label className="form-label">비밀번호</label>
              <input
                type="password"
                className="form-control"
                placeholder="비밀번호 입력"
                value={password}
                onChange={e => setPassword(e.target.value)}
                autoFocus
              />
            </div>

            {error && (
              <div style={{
                padding: '10px 14px',
                background: 'var(--red-light)',
                border: '1px solid rgba(239,68,68,0.2)',
                borderRadius: 'var(--radius-sm)',
                color: 'var(--red)',
                fontSize: '13px',
                marginBottom: '16px',
              }}>
                {error}
              </div>
            )}

            <button
              type="submit"
              className="btn btn-primary w-full"
              disabled={loading || !password}
              style={{ width: '100%', justifyContent: 'center', padding: '12px' }}
            >
              {loading ? '확인 중...' : '접속'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
