'use client'
import { useEffect, useState, useCallback } from 'react'
import Pagination from '@/components/Pagination'
import { supabase, Material } from '@/lib/supabase'
import Toast from '@/components/Toast'
import Papa from 'papaparse'
import { matchesSearch } from '@/lib/search'

const UNITS = ['EA', 'BOX', '캔', 'kg', '포', '봉', 'SET']
const empty: Omit<Material, 'id' | 'created_at'> = {
  code: '', name: '', unit: 'EA', initial_stock: 0, safety_stock: 0, note: '', is_active: true
}

function parseCode(code: string): { prefix: string; number: number; padLength: number } | null {
  const match = code.match(/^([A-Za-z]+)(\d+)$/)
  if (!match) return null
  return { prefix: match[1].toUpperCase(), number: parseInt(match[2], 10), padLength: match[2].length }
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
  const [bulkModal, setBulkModal] = useState(false)
  const [bulkFile, setBulkFile] = useState<File | null>(null)
  const [bulkUploading, setBulkUploading] = useState(false)
  const [selectedIds, setSelectedIds] = useState<number[]>([])
  const [isPrinting, setIsPrinting] = useState(false)
  const [printData, setPrintData] = useState<Material[]>([])
  const [shiftCodes, setShiftCodes] = useState(false)
  const [editingStockId, setEditingStockId] = useState<number | null>(null)
  const [tempStockValue, setTempStockValue] = useState('')
  const [flashingId, setFlashingId] = useState<number | null>(null)
  const [savingStock, setSavingStock] = useState(false)
  const [onlyShortage, setOnlyShortage] = useState(false)
  const [onlyZeroStock, setOnlyZeroStock] = useState(false)
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

  const startEditStock = (item: Material) => {
    if (savingStock) return
    setEditingStockId(item.id)
    setTempStockValue(String(stockMap[item.id] ?? 0))
  }

  const cancelEditStock = () => {
    setEditingStockId(null)
    setTempStockValue('')
  }

  const handleStockUpdate = async (item: Material) => {
    const newStock = Number(tempStockValue)
    if (isNaN(newStock) || tempStockValue.trim() === '') {
      cancelEditStock()
      return
    }
    const currentStock = stockMap[item.id] ?? 0
    const diff = newStock - currentStock
    if (diff === 0) {
      cancelEditStock()
      return
    }
    setSavingStock(true)
    try {
      // Check if this material has any transactions
      const { data: txs } = await supabase
        .from('material_transactions')
        .select('id')
        .eq('material_id', item.id)
        .limit(1)
      const hasTx = txs && txs.length > 0

      if (!hasTx) {
        // No transactions: directly update initial_stock
        const { error } = await supabase
          .from('materials')
          .update({ initial_stock: newStock })
          .eq('id', item.id)
        if (error) throw error
      } else {
        // Has transactions: create adjustment transaction
        const today = new Date().toISOString().split('T')[0]
        const { error } = await supabase
          .from('material_transactions')
          .insert({
            date: today,
            material_id: item.id,
            quantity: Math.abs(diff),
            type: diff > 0 ? 'in' : 'out',
            note: '재고 실사 조정'
          })
        if (error) throw error
      }
      // 로컬 상태 직접 업데이트하여 loading 스피너 깜빡임 및 페이지 리셋 원천 방지
      setStockMap(prev => ({ ...prev, [item.id]: newStock }))
      if (!hasTx) {
        setItems(prev => prev.map(m => m.id === item.id ? { ...m, initial_stock: newStock } : m))
      }

      setEditingStockId(null)
      setTempStockValue('')
      setFlashingId(item.id)
      setTimeout(() => setFlashingId(null), 900)
      setToast({ msg: `${item.name} 재고가 ${newStock.toLocaleString()}개로 수정되었습니다.`, type: 'success' })
    } catch (e: any) {
      setToast({ msg: e.message || '재고 수정 실패', type: 'error' })
    } finally {
      setSavingStock(false)
    }
  }

  useEffect(() => {
    let result = items.filter(i => matchesSearch(search, [i.name, i.code]))
    if (onlyShortage) {
      result = result.filter(i => (stockMap[i.id] ?? 0) <= (i.safety_stock || 0))
    } else if (onlyZeroStock) {
      result = result.filter(i => (stockMap[i.id] ?? 0) <= 0)
    }
    setFiltered(result)
  }, [search, items, onlyShortage, onlyZeroStock, stockMap])

  useEffect(() => {
    setPage(1)
  }, [search, onlyShortage, onlyZeroStock])

  // 부족 자재 수 계산 (뱃지에 표시)
  const shortageCount = items.filter(i => (stockMap[i.id] ?? 0) <= (i.safety_stock || 0)).length
  // 재고 0 이하 자재 수 계산 (뱃지에 표시)
  const zeroStockCount = items.filter(i => (stockMap[i.id] ?? 0) <= 0).length

  const openAdd = () => { setEditing(null); setForm(empty); setShiftCodes(false); setModal(true) }
  const openEdit = (i: Material) => { setEditing(i); setForm({ ...i }); setModal(true) }

  const handleSave = async () => {
    if (!form.code || !form.name) return
    setSaving(true)
    try {
      if (editing) {
        const { error } = await supabase.from('materials').update(form).eq('id', editing.id)
        if (error) throw error
        setToast({ msg: '자재가 수정되었습니다.', type: 'success' })
      } else if (shiftCodes) {
        // 코드 파싱
        const parsed = parseCode(form.code)
        if (!parsed) {
          setToast({ msg: '코드 형식이 올바르지 않습니다. 영문+숫자 형식이어야 합니다. (예: A19)', type: 'error' })
          setSaving(false)
          return
        }
        // 같은 접두사의 기존 자재 중 번호 >= 입력번호인 것 조회
        const { data: allMats } = await supabase.from('materials').select('id, code, name')
        const conflicting = (allMats || [])
          .map((m: any) => ({ ...m, parsed: parseCode(m.code) }))
          .filter((m: any) => m.parsed && m.parsed.prefix === parsed.prefix && m.parsed.number >= parsed.number)
          .sort((a: any, b: any) => a.parsed.number - b.parsed.number)

        if (conflicting.length > 0) {
          const affectedList = conflicting
            .map((m: any) => `  ${m.code} (${m.name}) → ${parsed.prefix}${(m.parsed.number + 1).toString().padStart(parsed.padLength, '0')}`)
            .join('\n')
          if (!confirm(`다음 ${conflicting.length}개의 자재 코드가 변경됩니다:\n\n${affectedList}\n\n계속하시겠습니까?`)) {
            setSaving(false)
            return
          }
          // 높은 번호부터 역순으로 업데이트 (UNIQUE 제약조건 위반 방지)
          const desc = [...conflicting].sort((a: any, b: any) => b.parsed.number - a.parsed.number)
          for (const m of desc) {
            const newCode = parsed.prefix + (m.parsed.number + 1).toString().padStart(parsed.padLength, '0')
            const { error } = await supabase.from('materials').update({ code: newCode }).eq('id', m.id)
            if (error) throw error
          }
        }
        // 새 자재 등록
        const { error } = await supabase.from('materials').insert(form)
        if (error) throw error
        setToast({ msg: `자재가 등록되었습니다.${conflicting.length > 0 ? ` ${conflicting.length}개의 코드가 밀렸습니다.` : ''}`, type: 'success' })
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
    const targetItem = items.find(x => x.id === id)
    if (!targetItem) return

    try {
      // 1. 자재 삭제
      const { error } = await supabase.from('materials').delete().eq('id', id)
      if (error) throw error

      // 2. 파싱 가능하면 뒷번호 코드들 앞으로 당겨 정렬
      const parsed = parseCode(targetItem.code)
      if (parsed) {
        const { data: allMats } = await supabase.from('materials').select('id, code')
        const targets = (allMats || [])
          .map((m: any) => ({ ...m, parsed: parseCode(m.code) }))
          .filter((m: any) => m.parsed && m.parsed.prefix === parsed.prefix && m.parsed.number > parsed.number)
          .sort((a: any, b: any) => a.parsed.number - b.parsed.number)

        for (const m of targets) {
          const newCode = parsed.prefix + (m.parsed.number - 1).toString().padStart(parsed.padLength, '0')
          const { error: updateErr } = await supabase.from('materials').update({ code: newCode }).eq('id', m.id)
          if (updateErr) throw updateErr
        }
      }

      setToast({ msg: '삭제되었습니다.', type: 'success' })
      load()
    } catch (e: any) {
      setToast({ msg: e.message || '삭제 실패', type: 'error' })
    }
  }

  const handleBulkDelete = async () => {
    if (!selectedIds.length) return
    if (!confirm(`선택한 ${selectedIds.length}개의 자재를 삭제하시겠습니까?`)) return
    try {
      // 1. 삭제 예정 자재 정보에서 접두사(prefix) 추출
      const deletedItems = items.filter(i => selectedIds.includes(i.id))
      const affectedPrefixes = new Set<string>()
      let defaultPadLength = 2
      for (const item of deletedItems) {
        const parsed = parseCode(item.code)
        if (parsed) {
          affectedPrefixes.add(parsed.prefix)
          defaultPadLength = parsed.padLength
        }
      }

      // 2. 일괄 삭제
      const { error } = await supabase.from('materials').delete().in('id', selectedIds)
      if (error) throw error

      // 3. 영향받은 각 접두사 그룹의 남은 자재들의 번호 재정렬 (1번부터 빈틈없이)
      if (affectedPrefixes.size > 0) {
        const { data: remaining } = await supabase.from('materials').select('id, code')
        
        for (const prefix of affectedPrefixes) {
          const targets = (remaining || [])
            .map((m: any) => ({ ...m, parsed: parseCode(m.code) }))
            .filter((m: any) => m.parsed && m.parsed.prefix === prefix)
            .sort((a: any, b: any) => a.parsed.number - b.parsed.number)

          let currentNum = 1
          for (const m of targets) {
            const newCode = prefix + currentNum.toString().padStart(m.parsed.padLength || defaultPadLength, '0')
            if (m.code !== newCode) {
              const { error: updateErr } = await supabase.from('materials').update({ code: newCode }).eq('id', m.id)
              if (updateErr) throw updateErr
            }
            currentNum++
          }
        }
      }

      setToast({ msg: `${selectedIds.length}개가 삭제되었습니다.`, type: 'success' })
      setSelectedIds([])
      load()
    } catch (e: any) {
      setToast({ msg: e.message || '삭제 실패', type: 'error' })
    }
  }

  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) setSelectedIds(paginated.map(i => i.id))
    else setSelectedIds([])
  }

  const handleSelect = (id: number) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  const downloadTemplate = () => {
    const csvContent = "\uFEFF, ,▼ 필수입력사항, ,▼ 숫자만 입력,▼ 숫자만 입력, \n검증,자재코드,자재명,단위,기초재고,안전재고,비고\n,M001,테스트자재,EA,100,10,참고사항"
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = '자재대량등록_양식.csv'
    link.click()
  }

  const handleBulkUpload = () => {
    if (!bulkFile) return
    setBulkUploading(true)
    Papa.parse(bulkFile, {
      header: false,
      skipEmptyLines: true,
      complete: async (results) => {
        try {
          const rows = results.data as string[][]
          let dataStartIndex = 0
          if (rows[0] && rows[0].join('').includes('필수입력사항')) {
             dataStartIndex = 2 // Skip 2 header rows
          } else if (rows[0] && rows[0].includes('자재코드')) {
             dataStartIndex = 1 // Skip 1 header row
          }

          const inserts = rows.slice(dataStartIndex).map(row => ({
            code: row[1]?.trim(),
            name: row[2]?.trim(),
            unit: row[3]?.trim() || 'EA',
            initial_stock: Number(row[4]?.replace(/,/g, '')) || 0,
            safety_stock: Number(row[5]?.replace(/,/g, '')) || 0,
            note: row[6]?.trim() || '',
            is_active: true
          })).filter(r => r.code && r.name)

          if (inserts.length === 0) throw new Error('유효한 데이터가 없습니다. 필수입력사항(자재코드, 자재명)을 확인하세요.')

          const { error } = await supabase.from('materials').insert(inserts)
          if (error) throw error

          setToast({ msg: `${inserts.length}건이 일괄 등록되었습니다.`, type: 'success' })
          setBulkModal(false)
          setBulkFile(null)
          load()
        } catch (e: any) {
          setToast({ msg: e.message || '등록 실패. 코드가 중복되었는지 확인하세요.', type: 'error' })
        } finally {
          setBulkUploading(false)
        }
      },
      error: () => {
        setToast({ msg: 'CSV 파일 읽기 오류', type: 'error' })
        setBulkUploading(false)
      }
    })
  }

  const handlePrint = () => {
    // Determine print target: selected items or all filtered items
    const target = selectedIds.length > 0
      ? filtered.filter(i => selectedIds.includes(i.id))
      : filtered
    setPrintData(target)
    setIsPrinting(true)
    // Wait for React to render the full unpaginated list, then trigger print
    setTimeout(() => {
      window.print()
      // Restore normal mode after print dialog closes
      setIsPrinting(false)
      setPrintData([])
    }, 300)
  }

  const paginated = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE)
  const totalPages = Math.ceil(filtered.length / PER_PAGE)

  const getStockClass = (item: Material) => {
    const stock = stockMap[item.id] ?? 0
    if (stock <= 0) return 'stock-danger'
    if (stock <= item.safety_stock) return 'stock-warning'
    return 'stock-ok'
  }

  // Data to render in the table: when printing, show all print targets; otherwise show paginated
  const tableData = isPrinting ? printData : paginated

  return (
    <div>
      {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
      <div className="page-header">
        <h2>자재 관리</h2>
        <div className="page-header-right">
          <button className="btn btn-secondary" onClick={handlePrint} title={selectedIds.length > 0 ? `선택한 ${selectedIds.length}건 인쇄` : '전체 목록 인쇄'}>
            🖨️ {selectedIds.length > 0 ? `선택 인쇄 (${selectedIds.length})` : '인쇄'}
          </button>
          <button className="btn btn-secondary" onClick={() => { setBulkFile(null); setBulkModal(true); }}>📥 일괄 등록</button>
          <button className="btn btn-primary" onClick={openAdd}>＋ 자재 등록</button>
        </div>
      </div>

      {/* Print header - only visible during printing */}
      <div className="print-header">
        <h1>📦 자재 관리 목록</h1>
        <div className="print-meta">
          출력일시: {new Date().toLocaleString('ko-KR')} | 총 {isPrinting ? printData.length : filtered.length}건
          {selectedIds.length > 0 && isPrinting && ' (선택 항목만 출력)'}
        </div>
      </div>

      <div className="page-body">
        <div className="toolbar">
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flex: 1 }}>
            <div className="search-box">
              <span className="search-icon">🔍</span>
              <input placeholder="자재명, 코드 검색..." value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <button
              className={`btn-filter-shortage ${onlyShortage ? 'active' : ''}`}
              onClick={() => { setOnlyShortage(v => !v); setOnlyZeroStock(false) }}
              title="현재고가 안전재고 이하인 부족 자재만 필터링합니다"
            >
              ⚠️ 부족 자재{shortageCount > 0 && <span className="filter-count">{shortageCount}</span>}
            </button>
            <button
              className={`btn-filter-zerostock ${onlyZeroStock ? 'active' : ''}`}
              onClick={() => { setOnlyZeroStock(v => !v); setOnlyShortage(false) }}
              title="현재고가 0개 이하인 품절 자재만 필터링합니다"
            >
              🚫 재고 없음{zeroStockCount > 0 && <span className="filter-count">{zeroStockCount}</span>}
            </button>
          </div>
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            {selectedIds.length > 0 && (
              <button className="btn btn-danger" onClick={handleBulkDelete}>
                🗑️ 선택된 {selectedIds.length}건 삭제
              </button>
            )}
            <span style={{ color: 'var(--text-muted)', fontSize: '13px' }}>총 {filtered.length}개</span>
          </div>
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
                        <th style={{ width: '40px' }}>
                          <input type="checkbox" onChange={handleSelectAll} checked={paginated.length > 0 && selectedIds.length === paginated.length} />
                        </th>
                        <th>코드</th>
                        <th>자재명</th>
                        <th>단위</th>
                        <th className="text-right">현재고</th>
                        <th className="text-right">안전재고</th>
                        <th>비고</th>
                        <th>상태</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {tableData.map(i => (
                        <tr key={i.id}>
                          <td>
                            <input type="checkbox" checked={selectedIds.includes(i.id)} onChange={() => handleSelect(i.id)} />
                          </td>
                          <td><span className="td-code">{i.code}</span></td>
                          <td style={{ fontWeight: 600 }}>{i.name}</td>
                          <td className="td-muted">{i.unit}</td>
                          <td
                            className={`text-right font-mono ${getStockClass(i)} ${editingStockId !== i.id && !isPrinting ? 'stock-cell-editable' : ''} ${flashingId === i.id ? 'stock-cell-flash' : ''}`}
                            onClick={() => !isPrinting && editingStockId !== i.id && startEditStock(i)}
                          >
                            {editingStockId === i.id ? (
                              <input
                                className="stock-input-inline"
                                type="number"
                                value={tempStockValue}
                                onChange={e => setTempStockValue(e.target.value)}
                                onKeyDown={e => {
                                  if (e.key === 'Enter') handleStockUpdate(i)
                                  if (e.key === 'Escape') cancelEditStock()
                                }}
                                onBlur={() => handleStockUpdate(i)}
                                autoFocus
                                onFocus={e => e.target.select()}
                                disabled={savingStock}
                              />
                            ) : (
                              (stockMap[i.id] ?? 0).toLocaleString()
                            )}
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
                {!isPrinting && <Pagination page={page} totalPages={totalPages} totalItems={filtered.length} perPage={PER_PAGE} setPage={setPage} />}
              </>
            )}
        </div>

        {/* Print footer - only visible during printing */}
        <div className="print-footer">
          재고관리 시스템 — 자재 관리 목록 | {new Date().toLocaleDateString('ko-KR')}
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
              {!editing && (
                <div className="form-group" style={{ marginTop: '-4px', marginBottom: '12px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px', color: 'var(--text-secondary)' }}>
                    <input type="checkbox" checked={shiftCodes} onChange={e => setShiftCodes(e.target.checked)} style={{ width: '16px', height: '16px', accentColor: 'var(--primary)' }} />
                    기존 코드 뒤로 밀기
                  </label>
                  {shiftCodes && (
                    <p style={{ fontSize: '12px', color: 'var(--orange, #f59e0b)', marginTop: '6px', marginBottom: 0, padding: '8px 12px', background: 'rgba(245,158,11,0.08)', borderRadius: '6px', lineHeight: '1.5' }}>
                      ⚠️ 입력한 코드와 같은 접두사의 기존 코드가 뒤로 밀립니다.<br/>
                      예: A19 입력 시 → 기존 A19→A20, A20→A21, A21→A22...
                    </p>
                  )}
                </div>
              )}
              <div className="form-group">
                <label className="form-label">자재명 <span className="required">*</span></label>
                <input className="form-control" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">초기 재고</label>
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

      {bulkModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setBulkModal(false)}>
          <div className="modal">
            <div className="modal-header">
              <span className="modal-title">자재 대량 등록 (CSV)</span>
              <button className="modal-close" onClick={() => setBulkModal(false)}>✕</button>
            </div>
            <div className="modal-body">
              <p style={{ color: 'var(--text-secondary)', marginBottom: '16px', fontSize: '13px' }}>
                아래에서 양식을 다운로드하여 데이터를 입력한 후 CSV 형식으로 업로드해주세요.<br/>
                <span style={{ color: 'var(--red)' }}>* 자재코드와 자재명은 필수이며, 코드가 중복되면 실패합니다.</span>
              </p>
              <div style={{ display: 'flex', gap: '10px', marginBottom: '24px' }}>
                <button className="btn btn-secondary" onClick={downloadTemplate}>
                  ⬇️ CSV 양식 다운로드
                </button>
              </div>
              <div className="form-group">
                <label className="form-label">CSV 파일 선택</label>
                <input 
                  type="file" 
                  accept=".csv" 
                  className="form-control" 
                  onChange={e => setBulkFile(e.target.files?.[0] || null)} 
                  style={{ padding: '8px' }}
                />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setBulkModal(false)}>취소</button>
              <button className="btn btn-primary" onClick={handleBulkUpload} disabled={!bulkFile || bulkUploading}>
                {bulkUploading ? '업로드 중...' : '데이터 일괄 등록'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
