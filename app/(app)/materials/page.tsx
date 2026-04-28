'use client'
import { useEffect, useState, useCallback } from 'react'
import { supabase, Material } from '@/lib/supabase'
import Toast from '@/components/Toast'

const UNITS = ['EA', 'BOX', '캔', 'kg', '포', '봉', 'SET']
const empty: Omit<Material, 'id' | 'created_at'> = {
  code: '', name: '', unit: 'EA', initial_stock: 0, safety_stock: 0, note: '', is_active: true
}

export default function MaterialsPage() {
  const [items, setItems] = useState<Material[]>([])
  const [filtered, setFiltered] = useState<Material[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [modal, setModal] = useState(false)
  const [editing, setEditing] = useState<Material | null>(null)
  const [form, setForm] = useState(empty)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null)
  const [page, setPage] = useState(1)
  const [stockMap, setStockMap] = useState<Record<number, number>>({})
  const PER_PAGE = 20

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase.from('materials').select('*').order('code')
    setItems(data || [])

    // Calculate current stock
    if (data && data.length > 0) {
      const { data: txs } = await supabase.from('material_transactions').select('material_id, type, quantity')
      const map: Record<number, number> = {}
      for (const m of data) map[m.id] = m.initial_stock || 0
      if (txs) {
        for (const tx of txs) {
          if (map[tx.material_id] === undefined) map[tx.material_id] = 0
          if (tx.type === 'in') map[tx.material_id] += tx.quantity
          else map[tx.material_id] -= tx.quantity
        }
      }
      setStockMap(map)
    }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    const q = search.toLowerCase()
    setFiltered(items.filter(i => i.name.toLowerCase().includes(q) || i.code.toLowerCase().includes(q)))
    setPage(1)
  }, [search, items])

  const openAdd = () => { setEditing(null); setForm(empty); setModal(true) }
  const openEdit = (i: Material) => { setEditing(i); setForm({ ...i }); setModal(true) }

  const handleSave = async () => {
    if (!form.code || !form.name) return
    setSaving(true)
    try {
      if (editing) {
        const { error } = await supabase.from('materials').update(form).eq('id', editing.id)
        if (error) throw error
        setToast({ msg: '자재가 수정되었습니다.', type: 'success' })
      } else {
        const { error } = await supabase.from('materials').insert(form)
        if (error) throw error
        setToast({ msg: '자재가 등록되었습니다.', type: 'success' })
      }
      setModal(false); load()
    } catch (e: any) {
      setToast({ msg: e.message || '저장 실패', type: 'error' })
    } finally { setSaving(false) }
  }

  const handleDelete = async (id: number) => {
    if (!confirm('이 자재를 삭제하시겠습니까?')) return
    await supabase.from('materials').delete().eq('id', id)
    setToast({ msg: '삭제되었습니다.', type: 'success' })
    load()
  }

  const paginated = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE)
  const totalPages = Math.ceil(filtered.length / PER_PAGE)

  const getStockClass = (item: Material) => {
    const stock = stockMap[item.id] ?? 0
    if (stock <= 0) return 'stock-danger'
    if (stock <= item.safety_stock) return 'stock-warning'
    return 'stock-ok'
  }

  return (
    <div>
      {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
      <div className="page-header">
        <h2>자재 관리</h2>
        <div className="page-header-right">
          <button className="btn btn-primary" onClick={openAdd}>＋ 자재 등록</button>
        </div>
      </div>
      <div className="page-body">
        <div className="toolbar">
          <div className="search-box">
            <span className="search-icon">🔍</span>
            <input placeholder="자재명, 코드 검색..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <span style={{ color: 'var(--text-muted)', fontSize: '13px' }}>총 {filtered.length}개</span>
        </div>
        <div className="card" style={{ padding: 0 }}>
          {loading ? <div className="loading-spinner"><div className="spinner" /></div>
            : filtered.length === 0 ? (
              <div className="empty-state">
                <div className="empty-state-icon">🔩</div>
                <h3>자재가 없습니다</h3>
              </div>
            ) : (
              <>
                <div className="table-container" style={{ border: 'none' }}>
                  <table>
                    <thead>
                      <tr>
                        <th>코드</th>
                        <th>자재명</th>
                        <th>단위</th>
                        <th className="text-right">기초재고</th>
                        <th className="text-right">현재고</th>
                        <th className="text-right">안전재고</th>
                        <th>비고</th>
                        <th>상태</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginated.map(i => (
                        <tr key={i.id}>
                          <td><span className="td-code">{i.code}</span></td>
                          <td style={{ fontWeight: 600 }}>{i.name}</td>
                          <td className="td-muted">{i.unit}</td>
                          <td className="text-right font-mono td-muted">{i.initial_stock?.toLocaleString()}</td>
                          <td className={`text-right font-mono ${getStockClass(i)}`}>
                            {(stockMap[i.id] ?? 0).toLocaleString()}
                          </td>
                          <td className="text-right font-mono td-muted">{i.safety_stock?.toLocaleString()}</td>
                          <td className="td-muted">{i.note}</td>
                          <td><span className={`badge ${i.is_active ? 'badge-active' : 'badge-inactive'}`}>{i.is_active ? '사용' : '미사용'}</span></td>
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
          <div className="modal">
            <div className="modal-header">
              <span className="modal-title">{editing ? '자재 수정' : '자재 등록'}</span>
              <button className="modal-close" onClick={() => setModal(false)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">자재코드 <span className="required">*</span></label>
                  <input className="form-control" value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value }))} placeholder="예: A01" />
                </div>
                <div className="form-group">
                  <label className="form-label">단위</label>
                  <select className="form-control" value={form.unit} onChange={e => setForm(f => ({ ...f, unit: e.target.value }))}>
                    {UNITS.map(u => <option key={u}>{u}</option>)}
                  </select>
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">자재명 <span className="required">*</span></label>
                <input className="form-control" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">기초재고</label>
                  <input className="form-control" type="number" value={form.initial_stock} onChange={e => setForm(f => ({ ...f, initial_stock: Number(e.target.value) }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">안전재고</label>
                  <input className="form-control" type="number" value={form.safety_stock} onChange={e => setForm(f => ({ ...f, safety_stock: Number(e.target.value) }))} />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">비고</label>
                <input className="form-control" value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} placeholder="발주 기준 등" />
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
