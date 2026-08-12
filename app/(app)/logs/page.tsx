'use client'
import { useEffect, useState, useCallback } from 'react'
import Pagination from '@/components/Pagination'
import { supabase, SystemLog } from '@/lib/supabase'
import Toast from '@/components/Toast'
import { matchesSearch } from '@/lib/search'

export default function LogsPage() {
  const [logs, setLogs] = useState<SystemLog[]>([])
  const [filtered, setFiltered] = useState<SystemLog[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<string>('전체')
  const [actionFilter, setActionFilter] = useState<string>('전체')
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null)
  const [page, setPage] = useState(1)
  const PER_PAGE = 25

  const load = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('system_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(500)

    if (error) {
      console.warn('System log fetch notice:', error.message)
      setLogs([])
    } else {
      setLogs(data || [])
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    let result = logs

    if (categoryFilter !== '전체') {
      result = result.filter(l => l.category === categoryFilter)
    }

    if (actionFilter !== '전체') {
      result = result.filter(l => l.action_type === actionFilter)
    }

    if (search.trim()) {
      result = result.filter(l =>
        matchesSearch(search, [l.target_name, l.details, l.user_name, l.category, l.action_type])
      )
    }

    setFiltered(result)
    setPage(1)
  }, [logs, categoryFilter, actionFilter, search])

  const handleClearLogs = async () => {
    if (!confirm('저장된 전체 작업 로그를 초기화하시겠습니까? (이 작업은 되돌릴 수 없습니다.)')) return
    try {
      const { error } = await supabase.from('system_logs').delete().neq('id', 0)
      if (error) throw error
      setToast({ msg: '작업 로그가 초기화되었습니다.', type: 'success' })
      load()
    } catch (e: any) {
      setToast({ msg: e.message || '초기화 실패', type: 'error' })
    }
  }

  const getActionBadgeClass = (actionType: string) => {
    switch (actionType) {
      case '등록':
        return 'badge-active' // Green
      case '수정':
        return 'badge-info'   // Blue
      case '삭제':
        return 'badge-inactive' // Red
      case '출고':
        return 'badge-purple' // Purple
      case '재계산':
        return 'badge-warning' // Yellow
      default:
        return ''
    }
  }

  const paginated = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE)
  const totalPages = Math.ceil(filtered.length / PER_PAGE)

  return (
    <div>
      {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}

      <div className="page-header">
        <h2>📜 시스템 작업 로그 (Audit Log)</h2>
        <div className="page-header-right">
          <button className="btn btn-secondary btn-sm" onClick={load}>🔄 새로고침</button>
          {logs.length > 0 && (
            <button className="btn btn-danger btn-sm" onClick={handleClearLogs}>🗑️ 로그 전체 삭제</button>
          )}
        </div>
      </div>

      <div className="page-body">
        <div style={{
          padding: '12px 16px',
          background: 'var(--yellow-light)',
          border: '1px solid rgba(245,158,11,0.2)',
          borderRadius: 'var(--radius-sm)',
          color: 'var(--yellow)',
          fontSize: '13px',
          marginBottom: '16px',
        }}>
          💡 거래처, 품목, 자재, BOM, 자재입출고, 제작중, 현장출고 등 <strong>모든 시스템 작업 내역이 일시 및 수행자와 함께 기록</strong>됩니다.
        </div>

        <div className="toolbar" style={{ flexWrap: 'wrap', gap: '12px' }}>
          <div className="search-box" style={{ flex: '1 1 240px' }}>
            <span className="search-icon">🔍</span>
            <input
              placeholder="수행자, 대상명, 상세 내용 검색..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>

          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <select
              className="form-control"
              style={{ width: 'auto' }}
              value={categoryFilter}
              onChange={e => setCategoryFilter(e.target.value)}
            >
              <option value="전체">전체 카테고리</option>
              <option value="거래처">🏢 거래처</option>
              <option value="품목">📦 품목</option>
              <option value="자재">🔩 자재</option>
              <option value="BOM">📁 BOM</option>
              <option value="자재입출고">⬆️ 자재입출고</option>
              <option value="제작중">⚙️ 제작중</option>
              <option value="품목출고">🚚 품목출고</option>
            </select>

            <select
              className="form-control"
              style={{ width: 'auto' }}
              value={actionFilter}
              onChange={e => setActionFilter(e.target.value)}
            >
              <option value="전체">전체 작업</option>
              <option value="등록">🟢 등록</option>
              <option value="수정">🔵 수정</option>
              <option value="삭제">🔴 삭제</option>
              <option value="출고">🟣 출고</option>
              <option value="재계산">🟡 재계산</option>
            </select>
          </div>

          <span style={{ color: 'var(--text-muted)', fontSize: '13px', marginLeft: 'auto' }}>
            총 {filtered.length}건 / 전체 {logs.length}건
          </span>
        </div>

        <div className="card" style={{ padding: 0 }}>
          {loading ? (
            <div className="loading-spinner"><div className="spinner" /></div>
          ) : filtered.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">📜</div>
              <h3>기록된 작업 로그가 없습니다</h3>
              <p>시스템에서 등록, 수정, 삭제 등의 작업을 진행하면 기록이 표시됩니다.</p>
            </div>
          ) : (
            <>
              <div className="table-container" style={{ border: 'none' }}>
                <table>
                  <thead>
                    <tr>
                      <th style={{ width: '160px' }}>작업 일시</th>
                      <th style={{ width: '110px' }}>카테고리</th>
                      <th style={{ width: '90px' }}>작업 유형</th>
                      <th style={{ width: '180px' }}>작업 대상</th>
                      <th>상세 내용</th>
                      <th style={{ width: '100px' }}>수행자</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginated.map(l => (
                      <tr key={l.id}>
                        <td className="td-muted" style={{ fontSize: '12px' }}>
                          {new Date(l.created_at).toLocaleString('ko-KR', {
                            year: 'numeric',
                            month: '2-digit',
                            day: '2-digit',
                            hour: '2-digit',
                            minute: '2-digit',
                            second: '2-digit',
                          })}
                        </td>
                        <td>
                          <span style={{ fontWeight: 600, fontSize: '13px' }}>{l.category}</span>
                        </td>
                        <td>
                          <span className={`badge ${getActionBadgeClass(l.action_type)}`}>
                            {l.action_type}
                          </span>
                        </td>
                        <td style={{ fontWeight: 600, color: 'var(--text-heading)' }}>
                          {l.target_name || '-'}
                        </td>
                        <td style={{ fontSize: '13px', wordBreak: 'break-all' }}>
                          {l.details}
                        </td>
                        <td className="td-muted" style={{ fontSize: '13px' }}>
                          👤 {l.user_name || '관리자'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pagination
                page={page}
                totalPages={totalPages}
                totalItems={filtered.length}
                perPage={PER_PAGE}
                setPage={setPage}
              />
            </>
          )}
        </div>
      </div>
    </div>
  )
}
