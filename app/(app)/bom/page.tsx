'use client'
import { useEffect, useState, useCallback, useRef } from 'react'
import { supabase, Product, Material, BomItem } from '@/lib/supabase'
import Toast from '@/components/Toast'
import { matchesSearch } from '@/lib/search'

export default function BomPage() {
  const [products, setProducts] = useState<Product[]>([])
  const [materials, setMaterials] = useState<Material[]>([])
  const [selectedProduct, setSelectedProduct] = useState<number | ''>('')
  const [bomItems, setBomItems] = useState<(BomItem & { material: Material })[]>([])
  const [loading, setLoading] = useState(false)
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null)
  const [saving, setSaving] = useState(false)
  
  const [searchKeyword, setSearchKeyword] = useState('')
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const loadBase = useCallback(async () => {
    const [{ data: prods }, { data: mats }] = await Promise.all([
      supabase.from('products').select('*').eq('is_active', true).order('code'),
      supabase.from('materials').select('*').eq('is_active', true).order('code'),
    ])
    setProducts(prods || [])
    setMaterials(mats || [])
  }, [])

  const loadBom = useCallback(async (productId: number, showSpinner = true) => {
    if (showSpinner) setLoading(true)
    const { data } = await supabase
      .from('bom')
      .select('*, material:material_id(*)')
      .eq('product_id', productId)
      .order('id')
    setBomItems((data || []) as any)
    if (showSpinner) setLoading(false)
  }, [])

  useEffect(() => { loadBase() }, [loadBase])

  useEffect(() => {
    if (selectedProduct) loadBom(Number(selectedProduct))
    else setBomItems([])
  }, [selectedProduct, loadBom])

  const handleSelectMaterial = async (m: Material) => {
    if (!selectedProduct) return
    if (bomItems.some(b => b.material_id === m.id)) return // Already added
    
    setSaving(true)
    try {
      const { data, error } = await supabase.from('bom').insert({
        product_id: Number(selectedProduct),
        material_id: m.id,
        quantity: 1, // Default to 1
      }).select('*, material:material_id(*)').single()
      if (error) throw error
      
      setBomItems(prev => [...prev, data as any])
      setToast({ msg: `${m.name} 자재가 추가되었습니다.`, type: 'success' })
    } catch (e: any) {
      setToast({ msg: e.message, type: 'error' })
    } finally { 
      setSaving(false) 
    }
  }

  const filteredMaterials = materials.filter(m => 
    matchesSearch(searchKeyword, [m.name, m.code])
  )

  const handleUpdateQty = async (bomId: number, qty: number) => {
    setBomItems(prev => prev.map(b => b.id === bomId ? { ...b, quantity: qty } : b))
    await supabase.from('bom').update({ quantity: qty }).eq('id', bomId)
  }

  const handleDelete = async (bomId: number) => {
    if (!confirm('이 자재를 BOM에서 제거하시겠습니까?')) return
    setBomItems(prev => prev.filter(b => b.id !== bomId))
    await supabase.from('bom').delete().eq('id', bomId)
    setToast({ msg: '제거되었습니다.', type: 'success' })
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
                  {selectedProductObj?.name} — 구성 자재 일괄 추가
                </span>
              </div>
              <div className="form-group" style={{ marginBottom: 0, position: 'relative' }} ref={dropdownRef}>
                <label className="form-label">자재 검색 및 다중 선택</label>
                <input 
                  type="text" 
                  className="form-control" 
                  placeholder="🔍 자재명 또는 코드를 입력하세요... (클릭 시 전체 목록 열림)"
                  value={searchKeyword}
                  onChange={e => {
                    setSearchKeyword(e.target.value);
                    setDropdownOpen(true);
                  }}
                  onFocus={() => setDropdownOpen(true)}
                  disabled={saving}
                />
                
                {dropdownOpen && (
                  <ul style={{
                    position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 10,
                    background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '8px',
                    marginTop: '4px', maxHeight: '300px', overflowY: 'auto', padding: 0, listStyle: 'none',
                    boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'
                  }}>
                    {filteredMaterials.length === 0 ? (
                      <li style={{ padding: '12px', color: 'var(--text-muted)', textAlign: 'center' }}>검색 결과가 없습니다.</li>
                    ) : (
                      filteredMaterials.map(m => {
                        const isAdded = bomItems.some(b => b.material_id === m.id);
                        return (
                          <li 
                            key={m.id}
                            onClick={() => { if (!isAdded && !saving) handleSelectMaterial(m); }}
                            style={{
                              padding: '10px 12px', cursor: isAdded ? 'default' : 'pointer',
                              borderBottom: '1px solid var(--border)',
                              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                              background: isAdded ? 'var(--bg-card-hover)' : 'transparent',
                              color: isAdded ? 'var(--text-muted)' : 'var(--text-primary)'
                            }}
                            onMouseEnter={e => { if (!isAdded) e.currentTarget.style.background = 'var(--bg-card-hover)' }}
                            onMouseLeave={e => { if (!isAdded) e.currentTarget.style.background = 'transparent' }}
                          >
                            <span>{m.code} | {m.name} ({m.unit})</span>
                            {isAdded && <span className="badge badge-active">✓ 추가됨</span>}
                          </li>
                        )
                      })
                    )}
                  </ul>
                )}
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
