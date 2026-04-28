'use client'
import { useEffect, useState, useCallback } from 'react'
import { supabase, Product, Material, BomItem } from '@/lib/supabase'
import Toast from '@/components/Toast'

export default function BomPage() {
  const [products, setProducts] = useState<Product[]>([])
  const [materials, setMaterials] = useState<Material[]>([])
  const [selectedProduct, setSelectedProduct] = useState<number | ''>('')
  const [bomItems, setBomItems] = useState<(BomItem & { material: Material })[]>([])
  const [loading, setLoading] = useState(false)
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null)
  const [addMaterialId, setAddMaterialId] = useState<number | ''>('')
  const [addQty, setAddQty] = useState<number>(1)
  const [saving, setSaving] = useState(false)

  const loadBase = useCallback(async () => {
    const [{ data: prods }, { data: mats }] = await Promise.all([
      supabase.from('products').select('*').eq('is_active', true).order('code'),
      supabase.from('materials').select('*').eq('is_active', true).order('code'),
    ])
    setProducts(prods || [])
    setMaterials(mats || [])
  }, [])

  const loadBom = useCallback(async (productId: number) => {
    setLoading(true)
    const { data } = await supabase
      .from('bom')
      .select('*, material:material_id(*)')
      .eq('product_id', productId)
      .order('id')
    setBomItems((data || []) as any)
    setLoading(false)
  }, [])

  useEffect(() => { loadBase() }, [loadBase])

  useEffect(() => {
    if (selectedProduct) loadBom(Number(selectedProduct))
    else setBomItems([])
  }, [selectedProduct, loadBom])

  const handleAdd = async () => {
    if (!selectedProduct || !addMaterialId || addQty <= 0) return
    setSaving(true)
    try {
      // Check duplicate
      if (bomItems.some(b => b.material_id === addMaterialId)) {
        setToast({ msg: '이미 추가된 자재입니다.', type: 'error' })
        return
      }
      const { error } = await supabase.from('bom').insert({
        product_id: Number(selectedProduct),
        material_id: Number(addMaterialId),
        quantity: addQty,
      })
      if (error) throw error
      setToast({ msg: '자재가 추가되었습니다.', type: 'success' })
      setAddMaterialId('')
      setAddQty(1)
      loadBom(Number(selectedProduct))
    } catch (e: any) {
      setToast({ msg: e.message, type: 'error' })
    } finally { setSaving(false) }
  }

  const handleUpdateQty = async (bomId: number, qty: number) => {
    await supabase.from('bom').update({ quantity: qty }).eq('id', bomId)
    loadBom(Number(selectedProduct))
  }

  const handleDelete = async (bomId: number) => {
    if (!confirm('이 자재를 BOM에서 제거하시겠습니까?')) return
    await supabase.from('bom').delete().eq('id', bomId)
    setToast({ msg: '제거되었습니다.', type: 'success' })
    loadBom(Number(selectedProduct))
  }

  const selectedProductObj = products.find(p => p.id === Number(selectedProduct))

  return (
    <div>
      {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
      <div className="page-header">
        <h2>BOM 등록</h2>
        <div className="page-header-right">
          <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
            품목별 구성 자재(BOM) 관리
          </span>
        </div>
      </div>
      <div className="page-body">
        {/* Product select */}
        <div className="card" style={{ marginBottom: '16px' }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">품목 선택</label>
            <select
              className="form-control"
              value={selectedProduct}
              onChange={e => setSelectedProduct(e.target.value ? Number(e.target.value) : '')}
              style={{ maxWidth: '480px' }}
            >
              <option value="">-- 품목을 선택하세요 --</option>
              {products.map(p => (
                <option key={p.id} value={p.id}>{p.code} | {p.name}</option>
              ))}
            </select>
          </div>
        </div>

        {selectedProduct && (
          <>
            {/* Add material */}
            <div className="card" style={{ marginBottom: '16px' }}>
              <div className="card-header">
                <span className="card-title">
                  {selectedProductObj?.name} — 구성 자재 추가
                </span>
              </div>
              <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
                <div className="form-group" style={{ flex: '1', minWidth: '240px', marginBottom: 0 }}>
                  <label className="form-label">자재 선택</label>
                  <select className="form-control" value={addMaterialId} onChange={e => setAddMaterialId(e.target.value ? Number(e.target.value) : '')}>
                    <option value="">-- 자재 선택 --</option>
                    {materials.map(m => (
                      <option key={m.id} value={m.id}>{m.code} | {m.name} ({m.unit})</option>
                    ))}
                  </select>
                </div>
                <div className="form-group" style={{ width: '120px', marginBottom: 0 }}>
                  <label className="form-label">구성수량</label>
                  <input className="form-control" type="number" min="0" step="any" value={addQty} onChange={e => setAddQty(Number(e.target.value))} />
                </div>
                <button className="btn btn-primary" onClick={handleAdd} disabled={saving || !addMaterialId}>
                  추가
                </button>
              </div>
            </div>

            {/* BOM list */}
            <div className="card" style={{ padding: 0 }}>
              {loading ? <div className="loading-spinner"><div className="spinner" /></div>
                : bomItems.length === 0 ? (
                  <div className="empty-state">
                    <div className="empty-state-icon">🗂️</div>
                    <h3>구성 자재가 없습니다</h3>
                    <p>위에서 자재를 추가하세요</p>
                  </div>
                ) : (
                  <div className="table-container" style={{ border: 'none' }}>
                    <table>
                      <thead>
                        <tr>
                          <th>순번</th>
                          <th>자재코드</th>
                          <th>자재명</th>
                          <th>단위</th>
                          <th className="text-right">구성수량</th>
                          <th></th>
                        </tr>
                      </thead>
                      <tbody>
                        {bomItems.map((b, idx) => (
                          <tr key={b.id}>
                            <td className="td-muted">{idx + 1}</td>
                            <td><span className="td-code">{b.material.code}</span></td>
                            <td>{b.material.name}</td>
                            <td className="td-muted">{b.material.unit}</td>
                            <td className="text-right">
                              <input
                                type="number"
                                min="0"
                                step="any"
                                defaultValue={b.quantity}
                                onBlur={e => {
                                  const val = Number(e.target.value)
                                  if (val !== b.quantity && val > 0) handleUpdateQty(b.id, val)
                                }}
                                style={{
                                  width: '90px',
                                  padding: '4px 8px',
                                  background: 'var(--bg-primary)',
                                  border: '1px solid var(--border)',
                                  borderRadius: '6px',
                                  color: 'var(--text-primary)',
                                  fontFamily: 'monospace',
                                  textAlign: 'right',
                                  fontSize: '13px',
                                }}
                              />
                            </td>
                            <td>
                              <button className="btn btn-danger btn-sm" onClick={() => handleDelete(b.id)}>제거</button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border)', color: 'var(--text-muted)', fontSize: '13px' }}>
                      총 {bomItems.length}개 자재 구성
                    </div>
                  </div>
                )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
