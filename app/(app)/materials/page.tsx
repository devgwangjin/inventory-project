'use client'
import { useEffect, useState, useCallback } from 'react'
import Pagination from '@/components/Pagination'
import { supabase, Material } from '@/lib/supabase'
import Toast from '@/components/Toast'
import Papa from 'papaparse'

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
  const [bulkModal, setBulkModal] = useState(false)
  const [bulkFile, setBulkFile] = useState<File | null>(null)
  const [bulkUploading, setBulkUploading] = useState(false)
  const [selectedIds, setSelectedIds] = useState<number[]>([])
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

  const handleBulkDelete = async () => {
    if (!selectedIds.length) return
    if (!confirm(`선택한 ${selectedIds.length}개의 자재를 삭제하시겠습니까?`)) return
    try {
      const { error } = await supabase.from('materials').delete().in('id', selectedIds)
      if (error) throw error
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
          <button className="btn btn-secondary" onClick={() => { setBulkFile(null); setBulkModal(true); }}>📥 일괄 등록</button>
          <button className="btn btn-primary" onClick={openAdd}>＋ 자재 등록</button>
        </div>
      </div>
      <div className="page-body">
        <div className="toolbar">
          <div className="search-box">
            <span className="search-icon">🔍</span>
            <input placeholder="자재명, 코드 검색..." value={search} onChange={e => setSearch(e.target.value)} />
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
                          <td>
                            <input type="checkbox" checked={selectedIds.includes(i.id)} onChange={() => handleSelect(i.id)} />
                          </td>
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
                <Pagination page={page} totalPages={totalPages} totalItems={filtered.length} perPage={PER_PAGE} setPage={setPage} />
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
