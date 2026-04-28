'use client'
import { useEffect, useState, useCallback } from 'react'
import { supabase, Client } from '@/lib/supabase'
import Toast from '@/components/Toast'

const UNITS = ['EA', 'BOX', '캔', 'kg', '포', '봉', 'SET']
const empty: Omit<Client, 'id' | 'created_at'> = {
  code: '', name: '', business_no: '', representative: '',
  business_type: '', business_item: '', manager: '', phone: '',
  email: '', address: '', note: '', is_active: true,
}

export default function ClientsPage() {
  const [clients, setClients] = useState<Client[]>([])
  const [filtered, setFiltered] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [modal, setModal] = useState(false)
  const [editing, setEditing] = useState<Client | null>(null)
  const [form, setForm] = useState(empty)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null)
  const [page, setPage] = useState(1)
  const PER_PAGE = 20

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase.from('clients').select('*').order('code')
    setClients(data || [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    const q = search.toLowerCase()
    setFiltered(clients.filter(c =>
      c.name.toLowerCase().includes(q) ||
      c.code.toLowerCase().includes(q) ||
      (c.manager || '').toLowerCase().includes(q) ||
      (c.business_item || '').toLowerCase().includes(q)
    ))
    setPage(1)
  }, [search, clients])

  const openAdd = () => { setEditing(null); setForm(empty); setModal(true) }
  const openEdit = (c: Client) => { setEditing(c); setForm({ ...c }); setModal(true) }

  const handleSave = async () => {
    if (!form.code || !form.name) return
    setSaving(true)
    try {
      if (editing) {
        const { error } = await supabase.from('clients').update(form).eq('id', editing.id)
        if (error) throw error
        setToast({ msg: '거래처가 수정되었습니다.', type: 'success' })
      } else {
        const { error } = await supabase.from('clients').insert(form)
        if (error) throw error
        setToast({ msg: '거래처가 등록되었습니다.', type: 'success' })
      }
      setModal(false); load()
    } catch (e: any) {
      setToast({ msg: e.message || '저장 실패', type: 'error' })
    } finally { setSaving(false) }
  }

  const handleDelete = async (id: number) => {
    if (!confirm('이 거래처를 삭제하시겠습니까?')) return
    await supabase.from('clients').delete().eq('id', id)
    setToast({ msg: '삭제되었습니다.', type: 'success' })
    load()
  }

  const paginated = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE)
  const totalPages = Math.ceil(filtered.length / PER_PAGE)

  return (
    <div>
      {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}

      <div className="page-header">
        <h2>거래처 관리</h2>
        <div className="page-header-right">
          <button className="btn btn-primary" onClick={openAdd}>＋ 거래처 등록</button>
        </div>
      </div>

      <div className="page-body">
        <div className="toolbar">
          <div className="search-box">
            <span className="search-icon">🔍</span>
            <input placeholder="거래처명, 코드, 담당자 검색..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <span style={{ color: 'var(--text-muted)', fontSize: '13px' }}>총 {filtered.length}개</span>
        </div>

        <div className="card" style={{ padding: 0 }}>
          {loading ? (
            <div className="loading-spinner"><div className="spinner" /></div>
          ) : filtered.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">🏢</div>
              <h3>거래처가 없습니다</h3>
              <p>우측 상단 버튼으로 거래처를 등록하세요</p>
            </div>
          ) : (
            <>
              <div className="table-container" style={{ border: 'none' }}>
                <table>
                  <thead>
                    <tr>
                      <th>코드</th>
                      <th>거래처명</th>
                      <th>사업자번호</th>
                      <th>담당자</th>
                      <th>연락처</th>
                      <th>취급품목</th>
                      <th>상태</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginated.map(c => (
                      <tr key={c.id}>
                        <td><span className="td-code">{c.code}</span></td>
                        <td style={{ fontWeight: 600 }}>{c.name}</td>
                        <td className="td-muted">{c.business_no}</td>
                        <td>{c.manager}</td>
                        <td className="td-muted">{c.phone}</td>
                        <td className="td-muted" style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.business_item}</td>
                        <td><span className={`badge ${c.is_active ? 'badge-active' : 'badge-inactive'}`}>{c.is_active ? '사용' : '미사용'}</span></td>
                        <td>
                          <div style={{ display: 'flex', gap: '6px' }}>
                            <button className="btn btn-secondary btn-sm" onClick={() => openEdit(c)}>수정</button>
                            <button className="btn btn-danger btn-sm" onClick={() => handleDelete(c.id)}>삭제</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {totalPages > 1 && (
                <div className="pagination">
                  <span>{(page - 1) * PER_PAGE + 1}–{Math.min(page * PER_PAGE, filtered.length)} / {filtered.length}개</span>
                  <div className="pagination-buttons">
                    <button className="pagination-btn" disabled={page === 1} onClick={() => setPage(p => p - 1)}>이전</button>
                    <button className="pagination-btn" disabled={page === totalPages} onClick={() => setPage(p => p + 1)}>다음</button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {modal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setModal(false)}>
          <div className="modal modal-lg">
            <div className="modal-header">
              <span className="modal-title">{editing ? '거래처 수정' : '거래처 등록'}</span>
              <button className="modal-close" onClick={() => setModal(false)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">거래처코드 <span className="required">*</span></label>
                  <input className="form-control" value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value }))} placeholder="예: A001" />
                </div>
                <div className="form-group">
                  <label className="form-label">거래처명 <span className="required">*</span></label>
                  <input className="form-control" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="거래처명 입력" />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">사업자등록번호</label>
                  <input className="form-control" value={form.business_no} onChange={e => setForm(f => ({ ...f, business_no: e.target.value }))} placeholder="000-00-00000" />
                </div>
                <div className="form-group">
                  <label className="form-label">대표자명</label>
                  <input className="form-control" value={form.representative} onChange={e => setForm(f => ({ ...f, representative: e.target.value }))} />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">업태</label>
                  <input className="form-control" value={form.business_type} onChange={e => setForm(f => ({ ...f, business_type: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">취급 품목</label>
                  <input className="form-control" value={form.business_item} onChange={e => setForm(f => ({ ...f, business_item: e.target.value }))} placeholder="퓨즈, 케이블그랜드..." />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">담당자</label>
                  <input className="form-control" value={form.manager} onChange={e => setForm(f => ({ ...f, manager: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">연락처</label>
                  <input className="form-control" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="02-0000-0000" />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">이메일</label>
                <input className="form-control" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} type="email" />
              </div>
              <div className="form-group">
                <label className="form-label">주소</label>
                <input className="form-control" value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} />
              </div>
              <div className="form-group">
                <label className="form-label">비고</label>
                <input className="form-control" value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} />
              </div>
              <div className="form-group">
                <label className="form-label">상태</label>
                <select className="form-control" value={form.is_active ? 'true' : 'false'} onChange={e => setForm(f => ({ ...f, is_active: e.target.value === 'true' }))}>
                  <option value="true">사용</option>
                  <option value="false">미사용</option>
                </select>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setModal(false)}>취소</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving || !form.code || !form.name}>
                {saving ? '저장 중...' : '저장'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
