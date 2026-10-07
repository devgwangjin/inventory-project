'use client'
import { useEffect, useState, useCallback, useRef } from 'react'
import { supabase, Product, Material, BomItem } from '@/lib/supabase'
import Toast from '@/components/Toast'
import { matchesSearch } from '@/lib/search'
import { logAction } from '@/lib/logger'

type BomWithMaterial = BomItem & { material: Material }

// 자재코드 자연 정렬 (A1 -> A2 -> A10, ABC 순서 정렬)
function sortBomItems(items: BomWithMaterial[]): BomWithMaterial[] {
  return [...items].sort((a, b) => {
    const codeA = a.material?.code || ''
    const codeB = b.material?.code || ''
    return codeA.localeCompare(codeB, undefined, { numeric: true, sensitivity: 'base' })
  })
}

export default function BomPage() {
  const [products, setProducts] = useState<Product[]>([])
  const [materials, setMaterials] = useState<Material[]>([])
  const [selectedProduct, setSelectedProduct] = useState<number | ''>('')
  const [bomItems, setBomItems] = useState<BomWithMaterial[]>([])
  const [loading, setLoading] = useState(false)
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null)
  const [saving, setSaving] = useState(false)
  
  const [searchKeyword, setSearchKeyword] = useState('')
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // BOM 등록 여부 필터 ('all' | 'unregistered' | 'registered')
  const [filterStatus, setFilterStatus] = useState<'all' | 'unregistered' | 'registered'>('all')

  // BOM 복사/불러오기 모달 관련 상태
  const [copyModal, setCopyModal] = useState(false)
  const [bomCountMap, setBomCountMap] = useState<Record<number, number>>({})
  const [sourceProductId, setSourceProductId] = useState<number | ''>('')
  const [sourceBomPreview, setSourceBomPreview] = useState<BomWithMaterial[]>([])
  const [loadingPreview, setLoadingPreview] = useState(false)
  const [copyMode, setCopyMode] = useState<'replace' | 'append'>('replace')
  const [copying, setCopying] = useState(false)

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
    const [{ data: prods }, { data: mats }, { data: boms }] = await Promise.all([
      supabase.from('products').select('*').eq('is_active', true).order('code'),
      supabase.from('materials').select('*').eq('is_active', true).order('code'),
      supabase.from('bom').select('product_id'),
    ])
    setProducts(prods || [])
    setMaterials(mats || [])

    const countMap: Record<number, number> = {}
    boms?.forEach(b => {
      countMap[b.product_id] = (countMap[b.product_id] || 0) + 1
    })
    setBomCountMap(countMap)
  }, [])

  const loadBom = useCallback(async (productId: number, showSpinner = true) => {
    if (showSpinner) setLoading(true)
    const { data } = await supabase
      .from('bom')
      .select('*, material:material_id(*)')
      .eq('product_id', productId)

    // 자재코드 ABC순 자동 정렬
    const sorted = sortBomItems((data || []) as any)
    setBomItems(sorted)
    setBomCountMap(prev => ({ ...prev, [productId]: sorted.length }))
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
      
      // 추가 후 자재코드 ABC순 자동 정렬
      setBomItems(prev => {
        const next = sortBomItems([...prev, data as any])
        setBomCountMap(old => ({ ...old, [Number(selectedProduct)]: next.length }))
        return next
      })
      await logAction({
        category: 'BOM',
        actionType: '등록',
        targetName: selectedProductObj?.name || '완제품',
        details: `[${selectedProductObj?.name}] BOM에 구성 자재 [${m.name}] (기본 수량 1개) 추가`,
      })
      setToast({ msg: `${m.name} 자재가 추가되었습니다.`, type: 'success' })
    } catch (e: any) {
      setToast({ msg: e.message, type: 'error' })
    } finally { 
      setSaving(false) 
    }
  }

  const filteredMaterials = materials.filter(m => 
    matchesSearch(searchKeyword, [m.name, m.code, m.field_name, m.note])
  )

  const handleUpdateQty = async (bomId: number, qty: number) => {
    const item = bomItems.find(b => b.id === bomId)
    setBomItems(prev => prev.map(b => b.id === bomId ? { ...b, quantity: qty } : b))
    await supabase.from('bom').update({ quantity: qty }).eq('id', bomId)
    if (item) {
      await logAction({
        category: 'BOM',
        actionType: '수정',
        targetName: selectedProductObj?.name || '완제품',
        details: `[${selectedProductObj?.name}] BOM의 자재 [${item.material?.name}] 필요 수량 변경: ${qty}개`,
      })
    }
  }

  const handleDelete = async (bomId: number) => {
    const item = bomItems.find(b => b.id === bomId)
    if (!confirm('이 자재를 BOM에서 제거하시겠습니까?')) return
    setBomItems(prev => {
      const next = prev.filter(b => b.id !== bomId)
      if (selectedProduct) {
        setBomCountMap(old => ({ ...old, [Number(selectedProduct)]: next.length }))
      }
      return next
    })
    await supabase.from('bom').delete().eq('id', bomId)
    await logAction({
      category: 'BOM',
      actionType: '삭제',
      targetName: selectedProductObj?.name || '완제품',
      details: `[${selectedProductObj?.name}] BOM에서 자재 [${item?.material?.name || bomId}] 제거`,
    })
    setToast({ msg: '제거되었습니다.', type: 'success' })
  }

  // 다른 품목 BOM 복사 모달 열기 (특정 품목을 지정하여 열 수도 있음)
  const openCopyModal = async (targetProdId?: number) => {
    const targetId = targetProdId || Number(selectedProduct)
    if (!targetId) return
    setSelectedProduct(targetId)
    setCopyModal(true)
    setSourceProductId('')
    setSourceBomPreview([])
    const currentCount = bomCountMap[targetId] || 0
    setCopyMode(currentCount > 0 ? 'replace' : 'append')

    // 각 품목별 BOM 등록 개수 최신화
    try {
      const { data: boms } = await supabase.from('bom').select('product_id')
      const countMap: Record<number, number> = {}
      boms?.forEach(b => {
        countMap[b.product_id] = (countMap[b.product_id] || 0) + 1
      })
      setBomCountMap(countMap)
    } catch (e) {
      console.warn('BOM 카운트 조회 알림:', e)
    }
  }

  // 복사할 원본 품목 선택 시 미리보기 불러오기
  const handleSelectSourceProduct = async (prodId: number) => {
    setSourceProductId(prodId || '')
    if (!prodId) {
      setSourceBomPreview([])
      return
    }
    setLoadingPreview(true)
    try {
      const { data } = await supabase
        .from('bom')
        .select('*, material:material_id(*)')
        .eq('product_id', prodId)
      setSourceBomPreview(sortBomItems((data || []) as any))
    } catch (err: any) {
      setToast({ msg: 'BOM 미리보기 조회 실패', type: 'error' })
    } finally {
      setLoadingPreview(false)
    }
  }

  // BOM 복사 실행
  const handleExecuteCopy = async () => {
    if (!selectedProduct || !sourceProductId || sourceBomPreview.length === 0) return
    setCopying(true)
    try {
      const targetProductId = Number(selectedProduct)
      const sourceProdObj = products.find(p => p.id === sourceProductId)

      // 1. 덮어쓰기 모드인 경우 기존 품목의 BOM 전체 삭제
      if (copyMode === 'replace' && bomItems.length > 0) {
        const { error: delErr } = await supabase
          .from('bom')
          .delete()
          .eq('product_id', targetProductId)
        if (delErr) throw delErr
      }

      // 2. 추가할 자재 목록 추출
      let itemsToInsert = sourceBomPreview.map(b => ({
        product_id: targetProductId,
        material_id: b.material_id,
        quantity: b.quantity,
      }))

      // 이어붙이기 모드인 경우 이미 존재하는 자재 제외
      if (copyMode === 'append' && bomItems.length > 0) {
        const existingMatIds = new Set(bomItems.map(b => b.material_id))
        itemsToInsert = itemsToInsert.filter(b => !existingMatIds.has(b.material_id))
        if (itemsToInsert.length === 0) {
          setToast({ msg: '이미 모든 자재가 등록되어 있어 추가할 새 자재가 없습니다.', type: 'error' })
          setCopying(false)
          return
        }
      }

      // 3. 신규 자재 일괄 등록
      const { error: insErr } = await supabase.from('bom').insert(itemsToInsert)
      if (insErr) throw insErr

      await logAction({
        category: 'BOM',
        actionType: '등록',
        targetName: selectedProductObj?.name || '완제품',
        details: `[${sourceProdObj?.name || sourceProductId}] 품목의 BOM에서 ${itemsToInsert.length}개 자재 복사 등록 (${copyMode === 'replace' ? '덮어쓰기' : '추가'})`,
      })

      setToast({ 
        msg: `[${sourceProdObj?.name}] 품목의 BOM(${itemsToInsert.length}개 자재)을 성공적으로 복사했습니다.`, 
        type: 'success' 
      })
      setCopyModal(false)
      await loadBom(targetProductId)
    } catch (e: any) {
      setToast({ msg: e.message || 'BOM 복사 실패', type: 'error' })
    } finally {
      setCopying(false)
    }
  }

  const selectedProductObj = products.find(p => p.id === Number(selectedProduct))
  const displayBomItems = sortBomItems(bomItems)

  // 미등록 품목 & 등록완료 품목 계산
  const unregisteredProducts = products.filter(p => !bomCountMap[p.id])
  const registeredProducts = products.filter(p => (bomCountMap[p.id] || 0) > 0)

  // 필터에 따른 드롭다운 품목 목록
  const dropdownProducts = products.filter(p => {
    if (filterStatus === 'unregistered') return !bomCountMap[p.id]
    if (filterStatus === 'registered') return (bomCountMap[p.id] || 0) > 0
    return true
  })

  // 복사 대상 품목 목록 (현재 선택된 품목 제외, BOM이 등록된 품목 우선 정렬)
  const sourceProductList = products
    .filter(p => p.id !== Number(selectedProduct))
    .map(p => ({ ...p, bomCount: bomCountMap[p.id] || 0 }))
    .sort((a, b) => {
      if (a.bomCount > 0 && b.bomCount === 0) return -1
      if (a.bomCount === 0 && b.bomCount > 0) return 1
      return a.code.localeCompare(b.code, undefined, { numeric: true })
    })

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
        {/* Product select & Status filter bar */}
        <div className="card" style={{ marginBottom: '16px' }}>
          {/* Status filter tabs */}
          <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', marginRight: '4px' }}>
              품목 분류:
            </span>
            <button
              type="button"
              className={`btn btn-sm ${filterStatus === 'all' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setFilterStatus('all')}
            >
              전체 품목 ({products.length})
            </button>
            <button
              type="button"
              className={`btn btn-sm ${filterStatus === 'unregistered' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setFilterStatus('unregistered')}
              style={
                filterStatus === 'unregistered'
                  ? { background: 'var(--yellow, #f59e0b)', color: '#000', borderColor: 'var(--yellow, #f59e0b)', fontWeight: 700 }
                  : { color: 'var(--yellow, #f59e0b)', borderColor: 'rgba(245, 158, 11, 0.4)' }
              }
            >
              ⚠️ BOM 미등록 ({unregisteredProducts.length})
            </button>
            <button
              type="button"
              className={`btn btn-sm ${filterStatus === 'registered' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setFilterStatus('registered')}
              style={
                filterStatus === 'registered'
                  ? { background: 'var(--green, #10b981)', color: '#fff', borderColor: 'var(--green, #10b981)', fontWeight: 700 }
                  : { color: 'var(--green, #10b981)', borderColor: 'rgba(16, 185, 129, 0.4)' }
              }
            >
              ✅ 등록 완료 ({registeredProducts.length})
            </button>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: '16px' }}>
            <div className="form-group" style={{ marginBottom: 0, flex: 1, minWidth: '280px', maxWidth: '560px' }}>
              <label className="form-label" style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>품목 선택</span>
                {filterStatus === 'unregistered' && (
                  <span style={{ color: 'var(--yellow)', fontSize: '12px', fontWeight: 600 }}>
                    ⚠️ 미등록 품목만 표시 중 ({dropdownProducts.length}개)
                  </span>
                )}
              </label>
              <select
                className="form-control"
                value={selectedProduct}
                onChange={e => setSelectedProduct(e.target.value ? Number(e.target.value) : '')}
              >
                <option value="">-- 작업할 품목을 선택하세요 --</option>
                {dropdownProducts.map(p => {
                  const count = bomCountMap[p.id] || 0
                  const isUnregistered = count === 0
                  return (
                    <option key={p.id} value={p.id}>
                      {isUnregistered ? '⚠️ [미등록] ' : `✅ [자재 ${count}개] `}
                      {p.code} | {p.name}
                    </option>
                  )
                })}
              </select>
            </div>

            {selectedProduct ? (
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => openCopyModal()}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                title="다른 품목의 구성 자재 목록을 그대로 복사해옵니다."
              >
                <span>📋</span> 다른 품목 BOM 복사해오기
              </button>
            ) : null}
          </div>
        </div>

        {/* Selected Product BOM Editor */}
        {selectedProduct ? (
          <>
            {/* Add material */}
            <div className="card" style={{ marginBottom: '16px' }}>
              <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                <span className="card-title">
                  {selectedProductObj?.name} — 구성 자재 추가
                </span>
                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                  🔤 자재코드(ABC순) 자동 정렬 적용
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
                            <span>
                              {m.code} | {m.name} {(m.field_name || m.note) && <span style={{ color: 'var(--accent, #60a5fa)', fontSize: '12px' }}>({m.field_name || m.note})</span>} ({m.unit})
                            </span>
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
            <div className="card" style={{ padding: 0, marginBottom: '24px' }}>
              {loading ? <div className="loading-spinner"><div className="spinner" /></div>
                : displayBomItems.length === 0 ? (
                  <div className="empty-state">
                    <div className="empty-state-icon">🗂️</div>
                    <h3>구성 자재가 없습니다 (BOM 미등록)</h3>
                    <p style={{ marginBottom: '16px' }}>
                      위에서 자재를 직접 추가하거나, 비슷한 다른 품목의 BOM을 간편하게 불러오세요.
                    </p>
                    <button 
                      type="button" 
                      className="btn btn-primary"
                      onClick={() => openCopyModal()}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                    >
                      <span>📋</span> 다른 품목 BOM 불러오기 (복사)
                    </button>
                  </div>
                ) : (
                  <div className="table-container" style={{ border: 'none' }}>
                    <table>
                      <thead>
                        <tr>
                          <th>순번</th>
                          <th>자재코드 🔤</th>
                          <th>자재명 (다른 이름)</th>
                          <th>단위</th>
                          <th className="text-right">구성수량</th>
                          <th></th>
                        </tr>
                      </thead>
                      <tbody>
                        {displayBomItems.map((b, idx) => (
                          <tr key={b.id}>
                            <td className="td-muted">{idx + 1}</td>
                            <td><span className="td-code">{b.material.code}</span></td>
                            <td>
                              <span style={{ fontWeight: 500 }}>{b.material.name}</span>
                              {(b.material.field_name || b.material.note) && (
                                <span style={{ marginLeft: '6px', color: 'var(--accent, #60a5fa)', fontSize: '12px' }}>
                                  ({b.material.field_name || b.material.note})
                                </span>
                              )}
                            </td>
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
                    <div style={{ padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--border)', flexWrap: 'wrap', gap: '10px' }}>
                      <span style={{ color: 'var(--text-muted)', fontSize: '13px' }}>
                        총 <strong>{displayBomItems.length}</strong>개 자재 구성 (자재코드 ABC순 정렬)
                      </span>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => openCopyModal()}
                        title="다른 품목 BOM으로 교체하거나 추가"
                      >
                        📋 다른 품목 BOM 덮어쓰기 / 추가
                      </button>
                    </div>
                  </div>
                )}
            </div>
          </>
        ) : null}

        {/* 미등록 품목 모아보기 섹션 (품목 미선택 시 또는 '미등록' 필터 선택 시 노출) */}
        {(!selectedProduct || filterStatus === 'unregistered') && (
          <div className="card" style={{ padding: 0 }}>
            <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
              <span className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span>⚠️</span> BOM 미등록 완제품 목록 ({unregisteredProducts.length}개)
              </span>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                아직 BOM(구성 자재)이 한 개도 등록되지 않은 품목들입니다
              </span>
            </div>

            {unregisteredProducts.length === 0 ? (
              <div className="empty-state" style={{ padding: '36px 20px' }}>
                <div className="empty-state-icon">🎉</div>
                <h3>모든 완제품에 BOM이 등록되어 있습니다!</h3>
                <p>미등록된 품목이 없습니다. 언제든 위 드롭다운에서 기존 품목의 BOM을 수정할 수 있습니다.</p>
              </div>
            ) : (
              <div className="table-container" style={{ border: 'none' }}>
                <table>
                  <thead>
                    <tr>
                      <th style={{ width: '60px' }}>순번</th>
                      <th style={{ width: '120px' }}>품목코드</th>
                      <th>품목명</th>
                      <th style={{ width: '90px' }}>단위</th>
                      <th>비고</th>
                      <th style={{ width: '220px', textAlign: 'right' }}>빠른 작업</th>
                    </tr>
                  </thead>
                  <tbody>
                    {unregisteredProducts.map((p, idx) => (
                      <tr key={p.id}>
                        <td className="td-muted">{idx + 1}</td>
                        <td><span className="td-code">{p.code}</span></td>
                        <td>
                          <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{p.name}</span>
                        </td>
                        <td className="td-muted">{p.unit}</td>
                        <td className="td-muted" style={{ fontSize: '13px' }}>{p.note || '-'}</td>
                        <td style={{ textAlign: 'right' }}>
                          <div style={{ display: 'inline-flex', gap: '6px' }}>
                            <button
                              type="button"
                              className="btn btn-primary btn-sm"
                              onClick={() => setSelectedProduct(p.id)}
                              title="이 품목의 자재를 직접 등록합니다"
                            >
                              ➕ 자재 등록
                            </button>
                            <button
                              type="button"
                              className="btn btn-secondary btn-sm"
                              onClick={() => openCopyModal(p.id)}
                              title="다른 품목의 BOM을 그대로 복사해옵니다"
                            >
                              📋 다른 BOM 복사
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border)', color: 'var(--yellow)', fontSize: '12px', fontWeight: 500 }}>
                  * 우측의 [➕ 자재 등록]을 누르면 직접 자재를 추가할 수 있고, [📋 다른 BOM 복사]를 누르면 유사한 다른 제품의 자재 목록을 1초 만에 그대로 가져옵니다.
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* BOM 복사 모달 */}
      {copyModal && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: '640px' }}>
            <div className="modal-header">
              <span className="modal-title">📋 다른 품목 BOM 복사해오기</span>
              <button className="modal-close" onClick={() => setCopyModal(false)}>✕</button>
            </div>
            <div className="modal-body">
              <p style={{ color: 'var(--text-secondary)', fontSize: '13px', marginBottom: '16px' }}>
                유사한 다른 완제품의 구성 자재 목록(BOM)을 <strong>[{selectedProductObj?.name}]</strong> 품목으로 그대로 가져옵니다.
              </p>

              {/* 원본 품목 선택 */}
              <div className="form-group">
                <label className="form-label">복사해올 원본 품목 선택 <span className="required">*</span></label>
                <select 
                  className="form-control"
                  value={sourceProductId}
                  onChange={e => handleSelectSourceProduct(Number(e.target.value))}
                >
                  <option value="">-- 복사할 원본 품목을 선택하세요 --</option>
                  {sourceProductList.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.code} | {p.name} {p.bomCount > 0 ? `(BOM 자재 ${p.bomCount}개)` : '(자재 없음)'}
                    </option>
                  ))}
                </select>
              </div>

              {/* 선택된 원본 품목 미리보기 */}
              {loadingPreview ? (
                <div className="loading-spinner" style={{ padding: '30px' }}><div className="spinner" /></div>
              ) : sourceBomPreview.length > 0 ? (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
                      가져올 자재 목록 (총 {sourceBomPreview.length}개)
                    </span>
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                      * 자재코드(ABC순)로 자동 정렬되어 등록됩니다
                    </span>
                  </div>
                  <div style={{ maxHeight: '240px', overflowY: 'auto', border: '1px solid var(--border)', borderRadius: '8px', background: 'var(--bg-primary)' }}>
                    <table style={{ width: '100%', fontSize: '12px', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ background: 'var(--bg-card)', borderBottom: '1px solid var(--border)', textAlign: 'left' }}>
                          <th style={{ padding: '8px 12px' }}>코드</th>
                          <th style={{ padding: '8px 12px' }}>자재명</th>
                          <th style={{ padding: '8px 12px' }}>단위</th>
                          <th style={{ padding: '8px 12px', textAlign: 'right' }}>수량</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sourceBomPreview.map((b, i) => (
                          <tr key={b.id || i} style={{ borderBottom: '1px solid var(--border-light)' }}>
                            <td style={{ padding: '6px 12px' }}><span className="td-code">{b.material?.code}</span></td>
                            <td style={{ padding: '6px 12px' }}>
                              {b.material?.name}
                              {(b.material?.field_name || b.material?.note) && (
                                <span style={{ color: 'var(--accent, #60a5fa)', marginLeft: '4px', fontSize: '11px' }}>
                                  ({b.material?.field_name || b.material?.note})
                                </span>
                              )}
                            </td>
                            <td style={{ padding: '6px 12px', color: 'var(--text-muted)' }}>{b.material?.unit}</td>
                            <td style={{ padding: '6px 12px', textAlign: 'right', fontFamily: 'monospace', fontWeight: 600 }}>{b.quantity}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* 기존 자재가 이미 있는 경우 모드 선택 */}
                  {bomItems.length > 0 && (
                    <div style={{ marginTop: '16px', padding: '12px 14px', borderRadius: '8px', background: 'rgba(245, 158, 11, 0.08)', border: '1px solid rgba(245, 158, 11, 0.25)' }}>
                      <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--yellow)', marginBottom: '8px' }}>
                        ⚠️ 현재 [{selectedProductObj?.name}] 품목에 이미 {bomItems.length}개의 자재가 등록되어 있습니다.
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '13px' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                          <input 
                            type="radio" 
                            name="copyMode" 
                            value="replace" 
                            checked={copyMode === 'replace'} 
                            onChange={() => setCopyMode('replace')} 
                          />
                          <span><strong>덮어쓰기 (권장)</strong>: 기존 {bomItems.length}개 자재를 모두 지우고 이 BOM으로 새로 대체</span>
                        </label>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                          <input 
                            type="radio" 
                            name="copyMode" 
                            value="append" 
                            checked={copyMode === 'append'} 
                            onChange={() => setCopyMode('append')} 
                          />
                          <span><strong>이어붙이기 (추가)</strong>: 기존 자재는 유지하고, 없는 자재만 추가</span>
                        </label>
                      </div>
                    </div>
                  )}
                </div>
              ) : sourceProductId ? (
                <p style={{ color: 'var(--text-muted)', fontSize: '13px', textAlign: 'center', padding: '24px' }}>
                  선택한 품목에 등록된 BOM 자재가 없습니다.
                </p>
              ) : null}
            </div>

            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setCopyModal(false)}>취소</button>
              <button 
                className="btn btn-primary" 
                onClick={handleExecuteCopy}
                disabled={!sourceProductId || sourceBomPreview.length === 0 || copying}
              >
                {copying ? '복사 중...' : `총 ${sourceBomPreview.length}개 자재 복사하기`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
