'use client'
import { useEffect, useState, useCallback } from 'react'
import { supabase, Project, Product } from '@/lib/supabase'
import Toast from '@/components/Toast'

const empty = {
  client_name: '',
  product_id: null as number | null,
  spec: '',
  status: '제작중' as '제작중' | '완료',
  note: '',
}

export default function ProjectsPage() {
  const [items, setItems] = useState<(Project & { product: Product })[]>([])
  const [filtered, setFiltered] = useState<(Project & { product: Product })[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [modal, setModal] = useState(false)
  const [editing, setEditing] = useState<Project | null>(null)
  const [form, setForm] = useState(empty)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null)
  const [page, setPage] = useState(1)
  const PER_PAGE = 20

  const load = useCallback(async () => {
    setLoading(true)
    const [{ data }, { data: pr }] = await Promise.all([
      supabase.from('projects').select('*, product:product_id(*)').order('created_at', { ascending: false }),
      supabase.from('products').select('*').eq('is_active', true).order('code')
    ])
    setItems((data || []) as any)
    setProducts(pr || [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    const q = search.toLowerCase()
    setFiltered(items.filter(i => 
      i.client_name.toLowerCase().includes(q) || 
      i.product?.name.toLowerCase().includes(q) ||
      i.spec?.toLowerCase().includes(q)
    ))
    setPage(1)
  }, [search, items])

  const openAdd = () => { setEditing(null); setForm(empty); setModal(true) }
  const openEdit = (i: Project) => { setEditing(i); setForm({ ...i }); setModal(true) }

  const handleSave = async () => {
    if (!form.client_name || !form.product_id) return
    setSaving(true)
    try {
      const payload = {
        client_name: form.client_name,
        product_id: form.product_id,
        spec: form.spec,
        status: form.status,
        note: form.note
      }
      
      if (editing) {
        const { error } = await supabase.from('projects').update(payload).eq('id', editing.id)
        if (error) throw error
        setToast({ msg: '프로젝트가 수정되었습니다.', type: 'success' })
      } else {
        const { error } = await supabase.from('projects').insert(payload)
        if (error) throw error
        setToast({ msg: '프로젝트가 등록되었습니다.', type: 'success' })
      }
      setModal(false); load()
    } catch (e: any) {
      setToast({ msg: e.message || '저장 실패', type: 'error' })
    } finally { setSaving(false) }
  }

  const handleDelete = async (id: number) => {
    if (!confirm('이 프로젝트를 삭제하시겠습니까?')) return
    await supabase.from('projects').delete().eq('id', id)
    setToast({ msg: '삭제되었습니다.', type: 'success' })
    load()
  }

  const paginated = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE)
  const totalPages = Math.ceil(filtered.length / PER_PAGE)

  return (
    <div>
      {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
      <div className="page-header">
        <h2>프로젝트 관리</h2>
        <div className="page-header-right">
          <button className="btn btn-primary" onClick={openAdd}>＋ 프로젝트 등록</button>
        </div>
      </div>
      <div className="page-body">
        <div className="toolbar">
          <div className="search-box">
            <span className="search-icon">🔍</span>
            <input placeholder="납품처, 품목, 규격 검색..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <span style={{ color: 'var(--text-muted)', fontSize: '13px' }}>총 {filtered.length}건</span>
        </div>
        <div className="card" style={{ padding: 0 }}>
          {loading ? <div className="loading-spinner"><div className="spinner" /></div>
            : filtered.length === 0 ? (
              <div className="empty-state">
                <div className="empty-state-icon">📋</div>
                <h3>등록된 프로젝트가 없습니다</h3>
                <p>우측 상단 버튼으로 프로젝트를 등록하세요</p>
              </div>
            ) : (
              <>
                <div className="table-container" style={{ border: 'none' }}>
                  <table>
                    <thead>
                      <tr>
                        <th>납품처 (고객사)</th>
                        <th>납품 품목</th>
                        <th>규모 / 규격</th>
                        <th>진행 상태</th>
                        <th>비고</th>
                        <th>등록일</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginated.map(i => (
                        <tr key={i.id}>
                          <td style={{ fontWeight: 600 }}>{i.client_name}</td>
                          <td className="td-muted">{i.product?.code} | {i.product?.name}</td>
                          <td>{i.spec || '-'}</td>
                          <td>
                            <span className={`badge ${i.status === '완료' ? 'badge-active' : 'badge-inactive'}`}>
                              {i.status}
                            </span>
                          </td>
                          <td className="td-muted">{i.note}</td>
                          <td className="td-muted">{new Date(i.created_at).toLocaleDateString()}</td>
                          <td>
                            <div style={{ display: 'flex', gap: '6px' }}>
                              <button className="btn btn-secondary btn-sm" onClick={() => openEdit(i)}>수정</button>
                              <button className="btn btn-danger btn-sm" onClick={() => handleDelete(i.id)}>삭제</button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {totalPages > 1 && (
                  <div className="pagination">
                    <span>{(page - 1) * PER_PAGE + 1}–{Math.min(page * PER_PAGE, filtered.length)} / {filtered.length}건</span>
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
          <div className="modal">
            <div className="modal-header">
              <span className="modal-title">{editing ? '프로젝트 수정' : '프로젝트 등록'}</span>
              <button className="modal-close" onClick={() => setModal(false)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">납품처 (고객사) <span className="required">*</span></label>
                <input className="form-control" value={form.client_name} onChange={e => setForm(f => ({ ...f, client_name: e.target.value }))} placeholder="예: (주)한국전기" />
              </div>
              <div className="form-group">
                <label className="form-label">납품 품목 <span className="required">*</span></label>
                <select className="form-control" value={form.product_id ?? ''} onChange={e => setForm(f => ({ ...f, product_id: e.target.value ? Number(e.target.value) : null }))}>
                  <option value="">-- 품목 선택 --</option>
                  {products.map(p => <option key={p.id} value={p.id}>{p.code} | {p.name}</option>)}
                </select>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">규모 / 규격</label>
                  <input className="form-control" value={form.spec} onChange={e => setForm(f => ({ ...f, spec: e.target.value }))} placeholder="예: 접속함 총 3면" />
                </div>
                <div className="form-group">
                  <label className="form-label">진행 상태</label>
                  <select className="form-control" value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value as any }))}>
                    <option value="제작중">제작중</option>
                    <option value="완료">완료</option>
                  </select>
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">비고</label>
                <input className="form-control" value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setModal(false)}>취소</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving || !form.client_name || !form.product_id}>
                {saving ? '저장 중...' : '저장'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
