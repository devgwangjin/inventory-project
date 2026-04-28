'use client'
import { useEffect, useState, useCallback } from 'react'
import { supabase, MaterialTransaction, Client, Material } from '@/lib/supabase'
import Toast from '@/components/Toast'

const empty = {
  date: new Date().toISOString().slice(0, 10),
  client_id: null as number | null,
  material_id: null as number | null,
  quantity: 1,
  type: 'in' as 'in' | 'out',
  note: '',
}

export default function TransactionsPage() {
  const [items, setItems] = useState<(MaterialTransaction & { client: Client; material: Material })[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [materials, setMaterials] = useState<Material[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(false)
  const [form, setForm] = useState(empty)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null)
  const [filterType, setFilterType] = useState<'all' | 'in' | 'out'>('all')
  const [filterMonth, setFilterMonth] = useState('')
  const [page, setPage] = useState(1)
  const PER_PAGE = 25

  const load = useCallback(async () => {
    setLoading(true)
    const [{ data }, { data: cl }, { data: mat }] = await Promise.all([
      supabase.from('material_transactions')
        .select('*, client:client_id(*), material:material_id(*)')
        .order('date', { ascending: false })
        .order('id', { ascending: false }),
      supabase.from('clients').select('*').eq('is_active', true).order('code'),
      supabase.from('materials').select('*').eq('is_active', true).order('code'),
    ])
    setItems((data || []) as any)
    setClients(cl || [])
    setMaterials(mat || [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const filtered = items.filter(i => {
    if (filterType !== 'all' && i.type !== filterType) return false
    if (filterMonth && !i.date.startsWith(filterMonth)) return false
    return true
  })

  const paginated = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE)
  const totalPages = Math.ceil(filtered.length / PER_PAGE)

  const handleSave = async () => {
    if (!form.material_id || form.quantity <= 0) return
    setSaving(true)
    try {
      const { error } = await supabase.from('material_transactions').insert({
        ...form,
        client_id: form.client_id || null,
      })
      if (error) throw error
      setToast({ msg: `${form.type === 'in' ? '입고' : '출고'}가 등록되었습니다.`, type: 'success' })
      setModal(false)
      setForm(empty)
      load()
    } catch (e: any) {
      setToast({ msg: e.message, type: 'error' })
    } finally { setSaving(false) }
  }

  const handleDelete = async (id: number) => {
    if (!confirm('이 내역을 삭제하시겠습니까?')) return
    await supabase.from('material_transactions').delete().eq('id', id)
    setToast({ msg: '삭제되었습니다.', type: 'success' })
    load()
  }

  return (
    <div>
      {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
      <div className="page-header">
        <h2>자재 입출고 등록</h2>
        <div className="page-header-right">
          <button className="btn btn-success" onClick={() => { setForm({ ...empty, type: 'in' }); setModal(true) }}>＋ 입고 등록</button>
          <button className="btn btn-danger" style={{ marginLeft: '8px' }} onClick={() => { setForm({ ...empty, type: 'out' }); setModal(true) }}>＋ 출고 등록</button>
        </div>
      </div>
      <div className="page-body">
        <div className="toolbar">
          <select className="form-control" style={{ width: 'auto' }} value={filterType} onChange={e => { setFilterType(e.target.value as any); setPage(1) }}>
            <option value="all">전체</option>
            <option value="in">입고만</option>
            <option value="out">출고만</option>
          </select>
          <input type="month" className="form-control" style={{ width: 'auto' }} value={filterMonth} onChange={e => { setFilterMonth(e.target.value); setPage(1) }} />
          <span style={{ color: 'var(--text-muted)', fontSize: '13px' }}>총 {filtered.length}건</span>
        </div>

        <div className="card" style={{ padding: 0 }}>
          {loading ? <div className="loading-spinner"><div className="spinner" /></div>
            : filtered.length === 0 ? (
              <div className="empty-state">
                <div className="empty-state-icon">↕️</div>
                <h3>입출고 내역이 없습니다</h3>
              </div>
            ) : (
              <>
                <div className="table-container" style={{ border: 'none' }}>
                  <table>
                    <thead>
                      <tr>
                        <th>날짜</th>
                        <th>구분</th>
                        <th>자재코드</th>
                        <th>자재명</th>
                        <th>거래처</th>
                        <th className="text-right">수량</th>
                        <th>단위</th>
                        <th>비고</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginated.map(i => (
                        <tr key={i.id}>
                          <td className="td-muted">{i.date}</td>
                          <td><span className={`badge ${i.type === 'in' ? 'badge-in' : 'badge-out'}`}>{i.type === 'in' ? '입고' : '출고'}</span></td>
                          <td><span className="td-code">{i.material?.code}</span></td>
                          <td style={{ fontWeight: 500 }}>{i.material?.name}</td>
                          <td className="td-muted">{i.client?.name || '-'}</td>
                          <td className={`text-right font-mono ${i.type === 'in' ? 'text-green' : 'text-red'}`}>
                            {i.type === 'in' ? '+' : '-'}{i.quantity.toLocaleString()}
                          </td>
                          <td className="td-muted">{i.material?.unit}</td>
                          <td className="td-muted">{i.note}</td>
                          <td>
                            <button className="btn btn-danger btn-sm" onClick={() => handleDelete(i.id)}>삭제</button>
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
              <span className="modal-title">{form.type === 'in' ? '✅ 자재 입고 등록' : '📤 자재 출고 등록'}</span>
              <button className="modal-close" onClick={() => setModal(false)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">구분</label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  {(['in', 'out'] as const).map(t => (
                    <button key={t} className={`btn ${form.type === t ? 'btn-primary' : 'btn-secondary'}`}
                      onClick={() => setForm(f => ({ ...f, type: t }))}>
                      {t === 'in' ? '입고' : '출고'}
                    </button>
                  ))}
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">날짜 <span className="required">*</span></label>
                  <input className="form-control" type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">수량 <span className="required">*</span></label>
                  <input className="form-control" type="number" min="1" value={form.quantity} onChange={e => setForm(f => ({ ...f, quantity: Number(e.target.value) }))} />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">자재 <span className="required">*</span></label>
                <select className="form-control" value={form.material_id ?? ''} onChange={e => setForm(f => ({ ...f, material_id: e.target.value ? Number(e.target.value) : null }))}>
                  <option value="">-- 자재 선택 --</option>
                  {materials.map(m => <option key={m.id} value={m.id}>{m.code} | {m.name} ({m.unit})</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">거래처</label>
                <select className="form-control" value={form.client_id ?? ''} onChange={e => setForm(f => ({ ...f, client_id: e.target.value ? Number(e.target.value) : null }))}>
                  <option value="">-- 선택 안 함 --</option>
                  {clients.map(c => <option key={c.id} value={c.id}>{c.code} | {c.name}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">비고</label>
                <input className="form-control" value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setModal(false)}>취소</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving || !form.material_id || form.quantity <= 0}>
                {saving ? '저장 중...' : '등록'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
