'use client'
import { useEffect, useState } from 'react'
import { supabase, Material, Product } from '@/lib/supabase'
import { matchesSearch } from '@/lib/search'

export default function InventoryPage() {
  const [tab, setTab] = useState<'material' | 'product'>('material')
  const [materials, setMaterials] = useState<(Material & { current_stock: number })[]>([])
  const [products, setProducts] = useState<(Product & { current_stock: number })[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      const [{ data: mats }, { data: prods }, { data: matTx }, { data: prodTx }] = await Promise.all([
        supabase.from('materials').select('*').eq('is_active', true).order('code'),
        supabase.from('products').select('*').eq('is_active', true).order('code'),
        supabase.from('material_transactions').select('material_id, type, quantity').limit(50000),
        supabase.from('product_shipments').select('product_id, quantity').limit(50000)
      ])

      const matStock: Record<number, number> = {}
      mats?.forEach((m: any) => matStock[m.id] = m.initial_stock || 0)
      matTx?.forEach((tx: any) => {
        if (matStock[tx.material_id] === undefined) matStock[tx.material_id] = 0
        if (tx.type === 'in') matStock[tx.material_id] += tx.quantity
        else matStock[tx.material_id] -= tx.quantity
      })

      const prodStock: Record<number, number> = {}
      prods?.forEach((p: any) => prodStock[p.id] = p.initial_stock || 0)
      prodTx?.forEach((tx: any) => {
        if (prodStock[tx.product_id] === undefined) prodStock[tx.product_id] = 0
        prodStock[tx.product_id] -= tx.quantity // Products only have out shipments in this system
      })

      setMaterials((mats || []).map((m: any) => ({ ...m, current_stock: matStock[m.id] || 0 })))
      setProducts((prods || []).map((p: any) => ({ ...p, current_stock: prodStock[p.id] || 0 })))
      setLoading(false)
    }
    load()
  }, [])

  const filteredMaterials = materials.filter(m => 
    matchesSearch(search, [m.code, m.name, m.field_name, m.note, m.unit])
  )

  const filteredProducts = products.filter(p => 
    matchesSearch(search, [p.code, p.name, p.unit])
  )

  return (
    <div>
      <div className="page-header">
        <h2>현재 재고 현황</h2>
        <div className="page-header-right">
          <button className="btn btn-secondary" onClick={() => window.print()}>🖨️ 인쇄</button>
        </div>
      </div>
      <div className="page-body">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }} className="no-print">
          <div style={{ display: 'flex', gap: '8px' }}>
            <button className={`btn ${tab === 'material' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setTab('material')}>자재 재고</button>
            <button className={`btn ${tab === 'product' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setTab('product')}>품목 재고</button>
          </div>
          <div className="search-box" style={{ maxWidth: '320px', minWidth: '240px' }}>
            <span className="search-icon">🔍</span>
            <input 
              placeholder={tab === 'material' ? "자재명, 다른 이름, 비고, 코드 검색..." : "품목명, 코드 검색..."} 
              value={search} 
              onChange={e => setSearch(e.target.value)} 
            />
          </div>
        </div>

        <div className="card" style={{ padding: 0 }}>
          {loading ? <div className="loading-spinner"><div className="spinner" /></div> : (
            <div className="table-container" style={{ border: 'none' }}>
              <table>
                <thead>
                  {tab === 'material' ? (
                    <tr>
                      <th>코드</th>
                      <th>자재명</th>
                      <th>다른 이름</th>
                      <th>비고</th>
                      <th>단위</th>
                      <th className="text-right">현재고</th>
                      <th className="text-right">안전재고</th>
                      <th>상태</th>
                    </tr>
                  ) : (
                    <tr>
                      <th>코드</th>
                      <th>품목명</th>
                      <th>단위</th>
                      <th className="text-right">현재고</th>
                    </tr>
                  )}
                </thead>
                <tbody>
                  {tab === 'material' ? (
                    filteredMaterials.length === 0 ? (
                      <tr><td colSpan={8} style={{ textAlign: 'center', padding: '30px' }} className="td-muted">일치하는 자재가 없습니다.</td></tr>
                    ) : filteredMaterials.map(m => (
                      <tr key={m.id}>
                        <td><span className="td-code">{m.code}</span></td>
                        <td style={{ fontWeight: 600 }}>{m.name}</td>
                        <td>
                          {m.field_name ? (
                            <span style={{ color: 'var(--accent, #60a5fa)', fontWeight: 500, fontSize: '13px' }}>
                              🏷️ {m.field_name}
                            </span>
                          ) : (
                            <span className="td-muted" style={{ fontSize: '12px' }}>-</span>
                          )}
                        </td>
                        <td className="td-muted" style={{ fontSize: '13px' }}>{m.note || '-'}</td>
                        <td className="td-muted">{m.unit}</td>
                        <td className={`text-right font-mono ${m.current_stock <= m.safety_stock ? 'stock-danger' : 'stock-ok'}`}>
                          {m.current_stock.toLocaleString()}
                        </td>
                        <td className="text-right font-mono td-muted">{m.safety_stock.toLocaleString()}</td>
                        <td>
                          {m.current_stock <= m.safety_stock && <span className="badge badge-out">부족</span>}
                        </td>
                      </tr>
                    ))
                  ) : (
                    filteredProducts.length === 0 ? (
                      <tr><td colSpan={4} style={{ textAlign: 'center', padding: '30px' }} className="td-muted">일치하는 품목이 없습니다.</td></tr>
                    ) : filteredProducts.map(p => (
                      <tr key={p.id}>
                        <td><span className="td-code">{p.code}</span></td>
                        <td style={{ fontWeight: 600 }}>{p.name}</td>
                        <td className="td-muted">{p.unit}</td>
                        <td className="text-right font-mono stock-ok">{p.current_stock.toLocaleString()}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
