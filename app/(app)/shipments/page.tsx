'use client'
import { useEffect, useState, useCallback } from 'react'
import Pagination from '@/components/Pagination'
import { supabase, ProductShipment, Client, Product } from '@/lib/supabase'
import Toast from '@/components/Toast'

const empty = {
  date: new Date().toISOString().slice(0, 10),
  client_id: null as number | null,
  delivery_company: '',
  product_id: null as number | null,
  quantity: 1,
  note: '',
}

export default function ShipmentsPage() {
  const [items, setItems] = useState<(ProductShipment & { client: Client; product: Product })[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(false)
  const [form, setForm] = useState(empty)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null)
  const [filterMonth, setFilterMonth] = useState('')
  const [page, setPage] = useState(1)
  const PER_PAGE = 25

  const load = useCallback(async () => {
    setLoading(true)
    const [{ data }, { data: cl }, { data: pr }] = await Promise.all([
      supabase.from('product_shipments')
        .select('*, client:client_id(*), product:product_id(*)')
        .order('date', { ascending: false })
        .order('id', { ascending: false }),
      supabase.from('clients').select('*').eq('is_active', true).order('code'),
      supabase.from('products').select('*').eq('is_active', true).order('code'),
    ])
    setItems((data || []) as any)
    setClients(cl || [])
    setProducts(pr || [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const filtered = items.filter(i => !filterMonth || i.date.startsWith(filterMonth))
  const paginated = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE)
  const totalPages = Math.ceil(filtered.length / PER_PAGE)

  const handleSave = async () => {
    if (!form.product_id || form.quantity <= 0) return
    setSaving(true)
    try {
      // 1. Insert shipment and get ID
      const { data: newShipment, error } = await supabase.from('product_shipments').insert({
        ...form,
        client_id: null, // Ignored in UI now, but keeping for backward schema compatibility
        delivery_company: form.delivery_company || null,
      }).select('id').single()
      if (error) throw error

      // 2. Auto-deduct materials via BOM
      const { data: bom } = await supabase.from('bom')
        .select('material_id, quantity')
        .eq('product_id', form.product_id)

      if (bom && bom.length > 0) {
        const txInserts = bom.map(b => ({
          date: form.date,
          client_id: null,
          material_id: b.material_id,
          product_shipment_id: newShipment.id,
          quantity: b.quantity * form.quantity,
          type: 'out',
          note: `품목출고 자동차감 (${form.delivery_company || form.note || ''})`,
        }))
        await supabase.from('material_transactions').insert(txInserts)
      }

      setToast({ msg: `품목 출고가 등록되었습니다. BOM 자재 ${bom?.length || 0}종 자동 차감.`, type: 'success' })
      setModal(false)
      setForm(empty)
      load()
    } catch (e: any) {
      setToast({ msg: e.message, type: 'error' })
    } finally { setSaving(false) }
  }

  const handleDelete = async (id: number) => {
    if (!confirm('이 출고 내역을 삭제하시겠습니까?\n(자동 차감되었던 자재 내역들도 함께 자동 삭제 및 복구됩니다.)')) return
    await supabase.from('product_shipments').delete().eq('id', id)
    setToast({ msg: '출고 내역 및 연동된 자재 기록이 삭제되었습니다.', type: 'success' })
    load()
  }

  const handleSyncBom = async (shipment: ProductShipment & { product: Product }) => {
    if (!confirm(`[${shipment.product?.name}] 품목의 최신 BOM 기준으로 자재 차감 내역을 재계산하시겠습니까?\n\n이 작업은 기존 차감 기록을 지우고 현재 BOM 기준으로 자재 재고 차감을 다시 수행합니다.`)) return
    setSaving(true)
    try {
      // 1. Delete existing material transactions linked to this shipment
      const { error: delError } = await supabase
        .from('material_transactions')
        .delete()
        .eq('product_shipment_id', shipment.id)
      if (delError) throw delError

      // 2. Fetch current BOM
      const { data: bom, error: bomError } = await supabase
        .from('bom')
        .select('material_id, quantity')
        .eq('product_id', shipment.product_id)
      if (bomError) throw bomError

      if (bom && bom.length > 0) {
        const txInserts = bom.map(b => ({
          date: shipment.date,
          client_id: null,
          material_id: b.material_id,
          product_shipment_id: shipment.id,
          quantity: b.quantity * shipment.quantity,
          type: 'out',
          note: `품목출고 자동차감 재계산 (${shipment.delivery_company || shipment.note || ''})`,
        }))
        const { error: insError } = await supabase
          .from('material_transactions')
          .insert(txInserts)
        if (insError) throw insError
      }

      setToast({ msg: `최신 BOM 기준으로 자재 차감 내역이 재계산되었습니다. (자재 ${bom?.length || 0}종)`, type: 'success' })
      load()
    } catch (e: any) {
      setToast({ msg: e.message, type: 'error' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
      <div className="page-header">
        <h2>품목 출고 등록</h2>
        <div className="page-header-right">
          <button className="btn btn-primary" onClick={() => { setForm(empty); setModal(true) }}>＋ 출고 등록</button>
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
          💡 품목 출고 시 BOM에 등록된 구성 자재가 <strong>자동으로 출고 차감</strong>됩니다. BOM 수정 시에는 개별 출고 건의 <strong>[🔄 BOM 재계산]</strong>을 클릭하여 동기화할 수 있습니다.
        </div>

        <div className="toolbar">
          <input type="month" className="form-control" style={{ width: 'auto' }} value={filterMonth} onChange={e => { setFilterMonth(e.target.value); setPage(1) }} />
          <span style={{ color: 'var(--text-muted)', fontSize: '13px' }}>총 {filtered.length}건</span>
        </div>

        <div className="card" style={{ padding: 0 }}>
          {loading ? <div className="loading-spinner"><div className="spinner" /></div>
            : filtered.length === 0 ? (
              <div className="empty-state">
                <div className="empty-state-icon">🚚</div>
                <h3>출고 내역이 없습니다</h3>
              </div>
            ) : (
              <>
                <div className="table-container" style={{ border: 'none' }}>
                  <table>
                    <thead>
                      <tr>
                        <th>날짜</th>
                        <th>품목코드</th>
                        <th>품목명</th>
                        <th>납품업체</th>
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
                          <td><span className="td-code">{i.product?.code}</span></td>
                          <td style={{ fontWeight: 500 }}>{i.product?.name}</td>
                          <td className="td-muted">{i.delivery_company || i.client?.name || '-'}</td>
                          <td className="text-right font-mono text-red">-{i.quantity.toLocaleString()}</td>
                          <td className="td-muted">{i.product?.unit}</td>
                          <td className="td-muted">{i.note}</td>
                          <td style={{ whiteSpace: 'nowrap' }}>
                            <button className="btn btn-secondary btn-sm" style={{ marginRight: '6px' }} onClick={() => handleSyncBom(i)}>🔄 BOM 재계산</button>
                            <button className="btn btn-danger btn-sm" onClick={() => handleDelete(i.id)}>삭제</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <Pagination page={page} totalPages={totalPages} totalItems={filtered.length} perPage={PER_PAGE} setPage={setPage} />
              </>
            )}
        </div>
      </div>

      {modal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setModal(false)}>
          <div className="modal">
            <div className="modal-header">
              <span className="modal-title">🚚 품목 출고 등록</span>
              <button className="modal-close" onClick={() => setModal(false)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">날짜 <span className="required">*</span></label>
                  <input className="form-control" type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">수량 <span className="required">*</span></label>
                  <input className="form-control" type="number" min="1" value={form.quantity === 0 ? '' : form.quantity} onChange={e => setForm(f => ({ ...f, quantity: e.target.value === '' ? 0 : Number(e.target.value) }))} />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">품목 <span className="required">*</span></label>
                <select className="form-control" value={form.product_id ?? ''} onChange={e => setForm(f => ({ ...f, product_id: e.target.value ? Number(e.target.value) : null }))}>
                  <option value="">-- 품목 선택 --</option>
                  {products.map(p => <option key={p.id} value={p.id}>{p.code} | {p.name} ({p.unit})</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">납품업체</label>
                <input className="form-control" value={form.delivery_company} onChange={e => setForm(f => ({ ...f, delivery_company: e.target.value }))} placeholder="예: (주)한국제일전기" />
              </div>
              <div className="form-group">
                <label className="form-label">비고</label>
                <input className="form-control" value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setModal(false)}>취소</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving || !form.product_id}>
                {saving ? '처리 중...' : '출고 등록'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
