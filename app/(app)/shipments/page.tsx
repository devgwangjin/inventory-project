'use client'
import { useEffect, useState, useCallback } from 'react'
import Pagination from '@/components/Pagination'
import { supabase, ProductShipment, Client, Product } from '@/lib/supabase'
import Toast from '@/components/Toast'
import { logAction } from '@/lib/logger'

const SHIPMENT_TYPES = [
  { key: 'normal', label: '정상 납품', icon: '🚚', badgeClass: 'badge-normal' },
  { key: 'as', label: 'A/S 수리', icon: '🛠️', badgeClass: 'badge-as' },
  { key: 'internal', label: '사내 불출', icon: '👤', badgeClass: 'badge-internal' },
  { key: 'sample', label: '샘플/테스트', icon: '🧪', badgeClass: 'badge-sample' },
  { key: 'scrap', label: '불량/폐기', icon: '🗑️', badgeClass: 'badge-scrap' },
]

function getShipmentBadge(type?: string | null, recipient?: string | null) {
  const t = SHIPMENT_TYPES.find(x => x.key === type) || SHIPMENT_TYPES[0]
  return (
    <span className={`badge ${t.badgeClass}`} title={recipient ? `수령/담당: ${recipient}` : undefined}>
      {t.icon} {t.label}
    </span>
  )
}

const empty = {
  date: new Date().toISOString().slice(0, 10),
  client_id: null as number | null,
  delivery_company: '',
  shipment_type: 'normal',
  recipient: '',
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
  const [filterType, setFilterType] = useState('all')
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

  const filtered = items.filter(i => {
    if (filterMonth && !i.date.startsWith(filterMonth)) return false
    if (filterType !== 'all') {
      const itemType = i.shipment_type || 'normal'
      if (itemType !== filterType) return false
    }
    return true
  })
  const paginated = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE)
  const totalPages = Math.ceil(filtered.length / PER_PAGE)

  const handleSave = async () => {
    if (!form.product_id || form.quantity <= 0) return
    setSaving(true)
    try {
      const selectedProd = products.find(p => p.id === form.product_id)
      const typeObj = SHIPMENT_TYPES.find(t => t.key === form.shipment_type) || SHIPMENT_TYPES[0]
      const typeTag = form.shipment_type !== 'normal' ? `[${typeObj.label}${form.recipient ? ': ' + form.recipient : ''}]` : ''

      // 1. Insert shipment and get ID
      const { data: newShipment, error } = await supabase.from('product_shipments').insert({
        date: form.date,
        client_id: null, // Ignored in UI now, but keeping for backward schema compatibility
        delivery_company: form.delivery_company || null,
        shipment_type: form.shipment_type || 'normal',
        recipient: form.recipient || null,
        product_id: form.product_id,
        quantity: form.quantity,
        note: form.note || null,
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
          transaction_type: form.shipment_type || 'normal',
          recipient: form.recipient || null,
          note: `품목출고 자동차감 ${typeTag} (${form.delivery_company || form.note || ''})`.trim(),
        }))
        await supabase.from('material_transactions').insert(txInserts)
      }

      await logAction({
        category: '품목출고',
        actionType: '등록',
        targetName: form.delivery_company || form.recipient || selectedProd?.name || '완제품',
        details: `수기 품목 출고 [${typeObj.label}]: [${selectedProd?.name}] ${form.quantity}${selectedProd?.unit || '개'} (수령/납품: ${form.recipient || form.delivery_company || '미지정'})`,
      })

      setToast({ msg: `[${typeObj.label}] 품목 출고가 등록되었습니다. BOM 자재 ${bom?.length || 0}종 자동 차감.`, type: 'success' })
      setModal(false)
      setForm(empty)
      load()
    } catch (e: any) {
      setToast({ msg: e.message, type: 'error' })
    } finally { setSaving(false) }
  }

  const handleDelete = async (id: number) => {
    const targetShipment = items.find(s => s.id === id)
    if (!confirm('이 출고 내역을 삭제하시겠습니까?\n(자동 차감되었던 자재 내역들도 함께 자동 삭제 및 복구됩니다.)')) return
    await supabase.from('product_shipments').delete().eq('id', id)

    await logAction({
      category: '품목출고',
      actionType: '삭제',
      targetName: targetShipment?.delivery_company || targetShipment?.product?.name || `출고 ID:${id}`,
      details: `품목 출고 내역 삭제: [${targetShipment?.product?.name}] ${targetShipment?.quantity || 0}개 (납품처: ${targetShipment?.delivery_company || '미지정'})`,
    })

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
        <h2>🚚 품목 출고 이력 관리</h2>
        <div className="page-header-right">
          <button className="btn btn-primary" onClick={() => { setForm(empty); setModal(true) }}>＋ 수기 출고 등록</button>
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
          💡 <strong>'제작중 (프로젝트)'</strong> 메뉴에서 제작 완료 후 [🚛 현장 출고]를 누르면 완제품 출고 이력이 이곳에 자동으로 기록됩니다. (필요 시 우측 버튼으로 수기 출고 등록도 가능합니다.)
        </div>

        <div className="toolbar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
            <input type="month" className="form-control" style={{ width: 'auto' }} value={filterMonth} onChange={e => { setFilterMonth(e.target.value); setPage(1) }} />
            <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
              <button
                className={`btn btn-sm ${filterType === 'all' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => { setFilterType('all'); setPage(1) }}
              >
                전체
              </button>
              {SHIPMENT_TYPES.map(t => (
                <button
                  key={t.key}
                  className={`btn btn-sm ${filterType === t.key ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => { setFilterType(t.key); setPage(1) }}
                >
                  {t.icon} {t.label}
                </button>
              ))}
            </div>
          </div>
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
                        <th>출고 구분</th>
                        <th>품목코드</th>
                        <th>품목명</th>
                        <th>납품처 / 수령인</th>
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
                          <td>{getShipmentBadge(i.shipment_type, i.recipient)}</td>
                          <td><span className="td-code">{i.product?.code}</span></td>
                          <td style={{ fontWeight: 500 }}>{i.product?.name}</td>
                          <td>
                            {i.delivery_company ? (
                              <span>{i.delivery_company}</span>
                            ) : i.recipient ? (
                              <span style={{ color: 'var(--accent, #60a5fa)', fontWeight: 500 }}>👤 {i.recipient}</span>
                            ) : i.client?.name ? (
                              <span>{i.client?.name}</span>
                            ) : (
                              <span className="td-muted">-</span>
                            )}
                            {i.delivery_company && i.recipient && (
                              <div style={{ fontSize: '11.5px', color: 'var(--text-muted)', marginTop: '2px' }}>
                                수령: {i.recipient}
                              </div>
                            )}
                          </td>
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
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-header">
              <span className="modal-title">🚚 품목 출고 등록</span>
              <button className="modal-close" onClick={() => setModal(false)}>✕</button>
            </div>
            <div className="modal-body">
              {/* 출고 구분 선택 */}
              <div className="form-group">
                <label className="form-label">출고 구분 <span className="required">*</span></label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))', gap: '6px' }}>
                  {SHIPMENT_TYPES.map(t => (
                    <button
                      key={t.key}
                      type="button"
                      className={`btn btn-sm ${form.shipment_type === t.key ? 'btn-primary' : 'btn-secondary'}`}
                      style={{ padding: '7px 4px', fontSize: '12.5px', justifyContent: 'center' }}
                      onClick={() => setForm(f => ({ ...f, shipment_type: t.key }))}
                    >
                      {t.icon} {t.label}
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
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">
                    {form.shipment_type === 'internal' ? '사용처 / 납품처' : '납품업체'}
                  </label>
                  <input
                    className="form-control"
                    value={form.delivery_company}
                    onChange={e => setForm(f => ({ ...f, delivery_company: e.target.value }))}
                    placeholder={form.shipment_type === 'internal' ? '예: 사내 테스트실, 공장' : '예: (주)한국제일전기'}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">
                    {form.shipment_type === 'internal' ? '수령 직원 / 부서' : form.shipment_type === 'as' ? 'A/S 담당 직원' : '수령자 / 담당자'}
                  </label>
                  <input
                    className="form-control"
                    value={form.recipient}
                    onChange={e => setForm(f => ({ ...f, recipient: e.target.value }))}
                    placeholder={form.shipment_type === 'internal' ? '예: 김대리 (생산1팀)' : '예: 홍길동 과장'}
                  />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">비고 / 사유</label>
                <input className="form-control" value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} placeholder="상세 출고 사유나 특이사항을 적어주세요" />
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
