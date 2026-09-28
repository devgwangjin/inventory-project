'use client'
import { useEffect, useState, useCallback } from 'react'
import Pagination from '@/components/Pagination'
import { supabase, MaterialTransaction, Client, Material } from '@/lib/supabase'
import Toast from '@/components/Toast'
import SearchableSelect from '@/components/SearchableSelect'
import { logAction } from '@/lib/logger'

interface MultiMaterialRow {
  rowId: string
  material_id: number | null
  quantity: number
  note: string
}

interface ParsedItem {
  id: string
  rawText: string
  itemName: string
  quantity: number
  note: string
  materialId: number | null
}

function parseKakaoText(text: string, materials: Material[], clients: Client[]) {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean)
  if (lines.length === 0) return null

  let clientName = ''
  let type: 'in' | 'out' = 'in'
  let clientId: number | null = null
  const items: ParsedItem[] = []

  // 1. Parse header (first line)
  const firstLine = lines[0]
  if (firstLine.includes('->')) {
    const parts = firstLine.split('->').map(p => p.trim())
    const targetKeywords = ['공장', '군산', '창고', '본사']
    const leftIsTarget = targetKeywords.some(k => parts[0].includes(k))
    const rightIsTarget = targetKeywords.some(k => parts[1].includes(k))

    if (leftIsTarget && !rightIsTarget) {
      type = 'out'
      clientName = parts[1]
    } else {
      type = 'in'
      clientName = parts[0]
    }

    const matchedClient = clients.find(c =>
      c.name.toLowerCase().replace(/\s+/g, '') === clientName.toLowerCase().replace(/\s+/g, '') ||
      c.name.toLowerCase().replace(/\s+/g, '').includes(clientName.toLowerCase().replace(/\s+/g, '')) ||
      clientName.toLowerCase().replace(/\s+/g, '').includes(c.name.toLowerCase().replace(/\s+/g, ''))
    )
    if (matchedClient) {
      clientId = matchedClient.id
    }
  } else {
    clientName = firstLine
    const matchedClient = clients.find(c =>
      c.name.toLowerCase().replace(/\s+/g, '') === clientName.toLowerCase().replace(/\s+/g, '') ||
      c.name.toLowerCase().replace(/\s+/g, '').includes(clientName.toLowerCase().replace(/\s+/g, '')) ||
      clientName.toLowerCase().replace(/\s+/g, '').includes(c.name.toLowerCase().replace(/\s+/g, ''))
    )
    if (matchedClient) {
      clientId = matchedClient.id
    }
  }

  // 2. Parse item lines
  let currentNote = ''
  const itemLines = lines.slice(1)
  const lineRegex = /^(.*?)\s+([\d,]+)\s*(EA|ea|개|BOX|box|캔|kg|포|봉|SET|set)?$/i

  for (const line of itemLines) {
    const match = line.match(lineRegex)
    if (match) {
      const itemName = match[1].trim()
      const quantity = Number(match[2].replace(/,/g, ''))

      const matchedMaterial = materials.find(m =>
        m.name.toLowerCase().replace(/\s+/g, '') === itemName.toLowerCase().replace(/\s+/g, '') ||
        m.code.toLowerCase().replace(/\s+/g, '') === itemName.toLowerCase().replace(/\s+/g, '') ||
        (m.field_name && m.field_name.toLowerCase().replace(/\s+/g, '') === itemName.toLowerCase().replace(/\s+/g, '')) ||
        (m.note && m.note.toLowerCase().replace(/\s+/g, '') === itemName.toLowerCase().replace(/\s+/g, '')) ||
        m.name.toLowerCase().replace(/\s+/g, '').includes(itemName.toLowerCase().replace(/\s+/g, '')) ||
        itemName.toLowerCase().replace(/\s+/g, '').includes(m.name.toLowerCase().replace(/\s+/g, '')) ||
        (m.field_name && m.field_name.toLowerCase().replace(/\s+/g, '').includes(itemName.toLowerCase().replace(/\s+/g, ''))) ||
        (m.note && m.note.toLowerCase().replace(/\s+/g, '').includes(itemName.toLowerCase().replace(/\s+/g, '')))
      )

      items.push({
        id: Math.random().toString(36).substring(2, 9),
        rawText: line,
        itemName,
        quantity,
        note: currentNote,
        materialId: matchedMaterial ? matchedMaterial.id : null
      })
      currentNote = ''
    } else {
      currentNote = currentNote ? `${currentNote} ${line}` : line
    }
  }

  return {
    clientName,
    clientId,
    type,
    items
  }
}

export default function TransactionsPage() {
  const [items, setItems] = useState<(MaterialTransaction & { client: Client; material: Material })[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [materials, setMaterials] = useState<Material[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null)
  const [filterType, setFilterType] = useState<'all' | 'in' | 'out'>('all')
  const [filterMonth, setFilterMonth] = useState('')
  const [page, setPage] = useState(1)
  const PER_PAGE = 25

  // Multi-material modal state
  const [formDate, setFormDate] = useState(new Date().toISOString().slice(0, 10))
  const [formType, setFormType] = useState<'in' | 'out'>('in')
  const [formClientId, setFormClientId] = useState<number | null>(null)
  const [formCommonNote, setFormCommonNote] = useState('')
  const [materialRows, setMaterialRows] = useState<MultiMaterialRow[]>([
    { rowId: '1', material_id: null, quantity: 1, note: '' }
  ])

  // Bulk paste states
  const [bulkModal, setBulkModal] = useState(false)
  const [pasteText, setPasteText] = useState('')
  const [bulkDate, setBulkDate] = useState(new Date().toISOString().slice(0, 10))
  const [bulkType, setBulkType] = useState<'in' | 'out'>('in')
  const [bulkClientId, setBulkClientId] = useState<number | null>(null)
  const [bulkItems, setBulkItems] = useState<ParsedItem[]>([])

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

  // Parse Kakao Text dynamically when pasteText changes
  useEffect(() => {
    if (!pasteText.trim()) {
      setBulkClientId(null)
      setBulkType('in')
      setBulkItems([])
      return
    }
    const parsed = parseKakaoText(pasteText, materials, clients)
    if (parsed) {
      setBulkClientId(parsed.clientId)
      setBulkType(parsed.type)
      setBulkItems(parsed.items)
    }
  }, [pasteText, materials, clients])

  const openAddModal = (type: 'in' | 'out' = 'in') => {
    setFormDate(new Date().toISOString().slice(0, 10))
    setFormType(type)
    setFormClientId(null)
    setFormCommonNote('')
    setMaterialRows([
      { rowId: Math.random().toString(36).substring(2, 9), material_id: null, quantity: 1, note: '' }
    ])
    setModal(true)
  }

  const handleAddRow = () => {
    setMaterialRows(prev => [
      ...prev,
      { rowId: Math.random().toString(36).substring(2, 9), material_id: null, quantity: 1, note: '' }
    ])
  }

  const handleRemoveRow = (rowId: string) => {
    if (materialRows.length <= 1) return
    setMaterialRows(prev => prev.filter(r => r.rowId !== rowId))
  }

  const handleRowChange = (rowId: string, field: keyof MultiMaterialRow, val: any) => {
    setMaterialRows(prev => prev.map(r => r.rowId === rowId ? { ...r, [field]: val } : r))
  }

  const filtered = items.filter(i => {
    if (filterType !== 'all' && i.type !== filterType) return false
    if (filterMonth && !i.date.startsWith(filterMonth)) return false
    return true
  })

  const paginated = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE)
  const totalPages = Math.ceil(filtered.length / PER_PAGE)

  const handleSave = async () => {
    if (materialRows.length === 0) return
    if (materialRows.some(r => !r.material_id || r.quantity <= 0)) {
      setToast({ msg: '선택하지 않은 자재가 있거나 수량이 0 이하인 항목이 있습니다.', type: 'error' })
      return
    }
    setSaving(true)
    try {
      const selectedCli = clients.find(c => c.id === formClientId)
      const insertRows = materialRows.map(r => ({
        date: formDate,
        type: formType,
        client_id: formClientId || null,
        material_id: r.material_id!,
        quantity: r.quantity,
        note: r.note ? (formCommonNote ? `${r.note} (${formCommonNote})` : r.note) : formCommonNote,
      }))

      const { error } = await supabase.from('material_transactions').insert(insertRows)
      if (error) throw error

      const summaryStr = materialRows.map(r => {
        const m = materials.find(x => x.id === r.material_id)
        return `${m?.name || '자재'} ${r.quantity}${m?.unit || '개'}`
      }).join(', ')

      await logAction({
        category: '자재입출고',
        actionType: '등록',
        targetName: selectedCli?.name || '자재일괄등록',
        details: `자재 수기 ${formType === 'in' ? '입고' : '출고'} (${insertRows.length}종): ${summaryStr} (거래처: ${selectedCli?.name || '미지정'})`,
      })

      setToast({ msg: `자재 ${insertRows.length}종 ${formType === 'in' ? '입고' : '출고'}가 성공적으로 등록되었습니다.`, type: 'success' })
      setModal(false)
      load()
    } catch (e: any) {
      setToast({ msg: e.message || '저장 실패', type: 'error' })
    } finally { setSaving(false) }
  }

  const handleBulkSave = async () => {
    if (bulkItems.length === 0) return
    if (bulkItems.some(i => !i.materialId || i.quantity <= 0)) {
      setToast({ msg: '선택하지 않은 자재가 있거나 수량이 0인 항목이 있습니다.', type: 'error' })
      return
    }
    setSaving(true)
    try {
      const selectedCli = clients.find(c => c.id === bulkClientId)
      const rows = bulkItems.map(item => ({
        date: bulkDate,
        client_id: bulkClientId,
        material_id: item.materialId,
        quantity: item.quantity,
        type: bulkType,
        note: item.note ? `${item.note} (카톡자동등록)` : '카톡자동등록',
      }))

      const { error } = await supabase.from('material_transactions').insert(rows)
      if (error) throw error

      const summaryStr = bulkItems.map(i => {
        const m = materials.find(x => x.id === i.materialId)
        return `${m?.name || '자재'} ${i.quantity}개`
      }).join(', ')

      await logAction({
        category: '자재입출고',
        actionType: '등록',
        targetName: selectedCli?.name || '카톡붙여넣기',
        details: `카카오톡 텍스트 일괄 ${bulkType === 'in' ? '입고' : '출고'} (${rows.length}건): ${summaryStr}`,
      })

      setToast({ msg: `카톡 복사 내용 ${rows.length}건이 성공적으로 일괄 등록되었습니다.`, type: 'success' })
      setBulkModal(false)
      setPasteText('')
      load()
    } catch (e: any) {
      setToast({ msg: e.message || '일괄 저장 실패', type: 'error' })
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: number) => {
    const targetTx = items.find(i => i.id === id)
    if (!confirm('이 내역을 삭제하시겠습니까?')) return
    await supabase.from('material_transactions').delete().eq('id', id)
    await logAction({
      category: '자재입출고',
      actionType: '삭제',
      targetName: targetTx?.material?.name || `자재내역 ID:${id}`,
      details: `자재 입출고 내역 삭제: [${targetTx?.material?.name || id}] ${targetTx?.type === 'in' ? '입고' : '출고'} ${targetTx?.quantity || 0}개`,
    })
    setToast({ msg: '삭제되었습니다.', type: 'success' })
    load()
  }

  return (
    <div>
      {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
      <div className="page-header">
        <h2>자재 입출고 등록</h2>
        <div className="page-header-right" style={{ display: 'flex', gap: '8px' }}>
          <button className="btn btn-primary" onClick={() => openAddModal('in')}>＋ 입고/출고 등록</button>
          <button className="btn btn-secondary" onClick={() => { setPasteText(''); setBulkModal(true) }}>💬 카톡 붙여넣기</button>
        </div>
      </div>
      <div className="page-body">
        <div className="toolbar">
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <button className={`btn btn-sm ${filterType === 'all' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => { setFilterType('all'); setPage(1) }}>전체</button>
            <button className={`btn btn-sm ${filterType === 'in' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => { setFilterType('in'); setPage(1) }}>입고</button>
            <button className={`btn btn-sm ${filterType === 'out' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => { setFilterType('out'); setPage(1) }}>출고</button>
          </div>
          <input type="month" className="form-control" style={{ width: 'auto' }} value={filterMonth} onChange={e => { setFilterMonth(e.target.value); setPage(1) }} />
          <span style={{ color: 'var(--text-muted)', fontSize: '13px' }}>총 {filtered.length}건</span>
        </div>

        <div className="card" style={{ padding: 0 }}>
          {loading ? <div className="loading-spinner"><div className="spinner" /></div>
            : filtered.length === 0 ? (
              <div className="empty-state">
                <div className="empty-state-icon">↕️</div>
                <h3>입출고 내역이 없습니다</h3>
                <p>상단 버튼으로 자재 입고/출고를 등록하세요</p>
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
                <Pagination page={page} totalPages={totalPages} totalItems={filtered.length} perPage={PER_PAGE} setPage={setPage} />
              </>
            )}
        </div>
      </div>

      {modal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setModal(false)}>
          <div className="modal" style={{ maxWidth: '840px', width: '92%' }}>
            <div className="modal-header">
              <span className="modal-title">
                {formType === 'in' ? '✅ 자재 입고 등록 (다중 자재 동시 등록)' : '📤 자재 출고 등록 (다중 자재 동시 등록)'}
              </span>
              <button className="modal-close" onClick={() => setModal(false)}>✕</button>
            </div>
            <div className="modal-body" style={{ maxHeight: 'calc(100vh - 180px)', overflowY: 'auto' }}>
              {/* 상단 공통 설정 카드 */}
              <div style={{
                padding: '16px',
                background: 'var(--bg-primary)',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border)',
                marginBottom: '20px'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                  <span style={{ fontSize: '13.5px', fontWeight: 600, color: 'var(--text-primary)' }}>1. 기본 설정 (공통 적용)</span>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    {(['in', 'out'] as const).map(t => (
                      <button key={t} type="button" className={`btn btn-sm ${formType === t ? 'btn-primary' : 'btn-secondary'}`}
                        onClick={() => setFormType(t)}>
                        {t === 'in' ? '입고 등록' : '출고 등록'}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="form-row" style={{ marginBottom: '12px' }}>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">날짜 <span className="required">*</span></label>
                    <input className="form-control" type="date" value={formDate} onChange={e => setFormDate(e.target.value)} />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">거래처</label>
                    <SearchableSelect
                      options={clients.map(c => ({ id: c.id, code: c.code, name: c.name }))}
                      value={formClientId}
                      onChange={(id) => setFormClientId(id)}
                      placeholder="거래처를 선택하세요..."
                    />
                  </div>
                </div>

                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">공통 비고 / 메모</label>
                  <input className="form-control" placeholder="예: 3공장 정기 입고건, 불량품 출고 등" value={formCommonNote} onChange={e => setFormCommonNote(e.target.value)} />
                </div>
              </div>

              {/* 자재 선택 다중 행 목록 */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                  <span style={{ fontSize: '13.5px', fontWeight: 600, color: 'var(--text-primary)' }}>
                    2. 등록할 자재 목록 ({materialRows.length}종)
                  </span>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={handleAddRow}>
                    ＋ 자재 행 추가
                  </button>
                </div>

                <div className="table-container" style={{ marginBottom: '12px' }}>
                  <table>
                    <thead>
                      <tr>
                        <th style={{ width: '45%' }}>자재 선택 <span className="required">*</span></th>
                        <th style={{ width: '20%' }}>수량 <span className="required">*</span></th>
                        <th style={{ width: '25%' }}>개별 메모</th>
                        <th style={{ width: '10%', textAlign: 'center' }}>삭제</th>
                      </tr>
                    </thead>
                    <tbody>
                      {materialRows.map((row, idx) => {
                        const selectedMat = materials.find(m => m.id === row.material_id)
                        return (
                          <tr key={row.rowId}>
                            <td>
                              <SearchableSelect
                                options={materials.map(m => ({
                                  id: m.id,
                                  code: m.code,
                                  name: m.name,
                                  unit: m.unit,
                                  subtext: m.field_name ? `${m.field_name}${m.note ? ' · ' + m.note : ''}` : m.note
                                }))}
                                value={row.material_id}
                                onChange={(id) => handleRowChange(row.rowId, 'material_id', id)}
                                placeholder={`#${idx + 1} 자재를 선택하세요...`}
                              />
                            </td>
                            <td>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <input
                                  className="form-control"
                                  type="number"
                                  min="1"
                                  value={row.quantity === 0 ? '' : row.quantity}
                                  onChange={e => handleRowChange(row.rowId, 'quantity', e.target.value === '' ? 0 : Number(e.target.value))}
                                />
                                <span style={{ fontSize: '12px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                                  {selectedMat?.unit || 'EA'}
                                </span>
                              </div>
                            </td>
                            <td>
                              <input
                                className="form-control"
                                placeholder="특이사항 메모"
                                value={row.note}
                                onChange={e => handleRowChange(row.rowId, 'note', e.target.value)}
                              />
                            </td>
                            <td style={{ textAlign: 'center' }}>
                              <button
                                type="button"
                                className="btn btn-danger btn-sm"
                                onClick={() => handleRemoveRow(row.rowId)}
                                disabled={materialRows.length <= 1}
                                title="이 행 삭제"
                              >
                                🗑️
                              </button>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>

                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ width: '100%', padding: '10px', borderStyle: 'dashed' }}
                  onClick={handleAddRow}
                >
                  ＋ 자재 행 추가하기 ({materialRows.length + 1}번째 자재)
                </button>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setModal(false)}>취소</button>
              <button
                className="btn btn-primary"
                onClick={handleSave}
                disabled={saving || materialRows.length === 0 || materialRows.some(r => !r.material_id || r.quantity <= 0)}
              >
                {saving ? '저장 중...' : `자재 ${materialRows.length}종 ${formType === 'in' ? '입고' : '출고'} 일괄 등록`}
              </button>
            </div>
          </div>
        </div>
      )}

      {bulkModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setBulkModal(false)}>
          <div className="modal" style={{ maxWidth: '960px', width: '90%' }}>
            <div className="modal-header">
              <span className="modal-title">💬 카카오톡 텍스트 일괄 등록</span>
              <button className="modal-close" onClick={() => setBulkModal(false)}>✕</button>
            </div>
            <div className="modal-body" style={{ maxHeight: 'calc(100vh - 200px)', overflowY: 'auto' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label" style={{ fontWeight: 600 }}>카톡 복사 내용 붙여넣기</label>
                  <textarea
                    className="form-control"
                    style={{ height: '180px', fontFamily: 'monospace', fontSize: '13px', resize: 'none' }}
                    placeholder={`여기에 카톡 메시지를 붙여넣으세요.\n\n예:\n에버넷전자 -> 군산공장\nLRS-200-24 30EA\nㄱ자 브라켓 120EA\nLRS 커버 30EA`}
                    value={pasteText}
                    onChange={e => setPasteText(e.target.value)}
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>기본 정보 설정</span>
                  <div className="form-row">
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label">날짜</label>
                      <input className="form-control" type="date" value={bulkDate} onChange={e => setBulkDate(e.target.value)} />
                    </div>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label">구분</label>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        {(['in', 'out'] as const).map(t => (
                          <button key={t} type="button" className={`btn btn-sm ${bulkType === t ? 'btn-primary' : 'btn-secondary'}`}
                            onClick={() => setBulkType(t)} style={{ flex: 1 }}>
                            {t === 'in' ? '입고' : '출고'}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">거래처</label>
                    <SearchableSelect
                      options={clients.map(c => ({ id: c.id, code: c.code, name: c.name }))}
                      value={bulkClientId}
                      onChange={id => setBulkClientId(id)}
                      placeholder="거래처를 검색하여 매칭..."
                    />
                  </div>
                </div>
              </div>

              {bulkItems.length > 0 && (
                <div>
                  <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', display: 'block', marginBottom: '8px' }}>
                    감지된 자재 목록 ({bulkItems.length}건)
                  </span>
                  <div className="table-container" style={{ maxHeight: '240px', overflowY: 'auto' }}>
                    <table>
                      <thead>
                        <tr>
                          <th>원문 텍스트</th>
                          <th>자재 선택 <span className="required">*</span></th>
                          <th style={{ width: '100px' }}>수량</th>
                          <th>개별 비고</th>
                          <th style={{ width: '50px' }}></th>
                        </tr>
                      </thead>
                      <tbody>
                        {bulkItems.map(item => (
                          <tr key={item.id}>
                            <td className="td-muted" style={{ fontSize: '12px', fontFamily: 'monospace' }}>{item.rawText}</td>
                            <td>
                              <SearchableSelect
                                options={materials.map(m => ({
                                  id: m.id,
                                  code: m.code,
                                  name: m.name,
                                  unit: m.unit,
                                  subtext: m.field_name ? `${m.field_name}${m.note ? ' · ' + m.note : ''}` : m.note
                                }))}
                                value={item.materialId}
                                onChange={id => setBulkItems(prev => prev.map(x => x.id === item.id ? { ...x, materialId: id } : x))}
                                placeholder="자재 검색..."
                              />
                            </td>
                            <td>
                              <input
                                className="form-control"
                                type="number"
                                min="1"
                                value={item.quantity === 0 ? '' : item.quantity}
                                onChange={e => setBulkItems(prev => prev.map(x => x.id === item.id ? { ...x, quantity: e.target.value === '' ? 0 : Number(e.target.value) } : x))}
                              />
                            </td>
                            <td>
                              <input
                                className="form-control"
                                value={item.note}
                                onChange={e => setBulkItems(prev => prev.map(x => x.id === item.id ? { ...x, note: e.target.value } : x))}
                              />
                            </td>
                            <td>
                              <button className="btn btn-danger btn-sm" onClick={() => setBulkItems(prev => prev.filter(x => x.id !== item.id))}>✕</button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setBulkModal(false)}>취소</button>
              <button
                className="btn btn-primary"
                onClick={handleBulkSave}
                disabled={saving || bulkItems.length === 0 || bulkItems.some(i => !i.materialId || i.quantity <= 0)}
              >
                {saving ? '등록 중...' : `자재 ${bulkItems.length}건 일괄 등록`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
