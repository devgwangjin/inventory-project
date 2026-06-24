'use client'
import { useEffect, useState, useCallback } from 'react'
import Pagination from '@/components/Pagination'
import { supabase, MaterialTransaction, Client, Material } from '@/lib/supabase'
import Toast from '@/components/Toast'
import SearchableSelect from '@/components/SearchableSelect'

const empty = {
  date: new Date().toISOString().slice(0, 10),
  client_id: null as number | null,
  material_id: null as number | null,
  quantity: 1,
  type: 'in' as 'in' | 'out',
  note: '',
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
  // Match string that ends with a number and an optional unit suffix
  const lineRegex = /^(.*?)\s+(\d+)\s*(EA|ea|개|BOX|box|캔|kg|포|봉|SET|set)?$/i

  for (const line of itemLines) {
    const match = line.match(lineRegex)
    if (match) {
      const itemName = match[1].trim()
      const quantity = Number(match[2])

      // Match material (fuzzy space-insensitive match)
      const matchedMaterial = materials.find(m =>
        m.name.toLowerCase().replace(/\s+/g, '') === itemName.toLowerCase().replace(/\s+/g, '') ||
        m.code.toLowerCase().replace(/\s+/g, '') === itemName.toLowerCase().replace(/\s+/g, '') ||
        m.name.toLowerCase().replace(/\s+/g, '').includes(itemName.toLowerCase().replace(/\s+/g, '')) ||
        itemName.toLowerCase().replace(/\s+/g, '').includes(m.name.toLowerCase().replace(/\s+/g, ''))
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
  const [form, setForm] = useState(empty)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null)
  const [filterType, setFilterType] = useState<'all' | 'in' | 'out'>('all')
  const [filterMonth, setFilterMonth] = useState('')
  const [page, setPage] = useState(1)
  const PER_PAGE = 25

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

  const handleBulkSave = async () => {
    if (bulkItems.length === 0) return
    if (bulkItems.some(i => !i.materialId || i.quantity <= 0)) {
      setToast({ msg: '선택하지 않은 자재가 있거나 수량이 0인 항목이 있습니다.', type: 'error' })
      return
    }
    setSaving(true)
    try {
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
        <div className="page-header-right" style={{ display: 'flex', gap: '8px' }}>
          <button className="btn btn-primary" onClick={() => { setPasteText(''); setBulkModal(true) }}>💬 카톡 붙여넣기</button>
          <button className="btn btn-success" onClick={() => { setForm({ ...empty, type: 'in' }); setModal(true) }}>＋ 입고 등록</button>
          <button className="btn btn-danger" onClick={() => { setForm({ ...empty, type: 'out' }); setModal(true) }}>＋ 출고 등록</button>
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
                <Pagination page={page} totalPages={totalPages} totalItems={filtered.length} perPage={PER_PAGE} setPage={setPage} />
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
                  <input className="form-control" type="number" min="1" value={form.quantity === 0 ? '' : form.quantity} onChange={e => setForm(f => ({ ...f, quantity: e.target.value === '' ? 0 : Number(e.target.value) }))} />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">자재 <span className="required">*</span></label>
                <SearchableSelect
                  options={materials.map(m => ({ id: m.id, code: m.code, name: m.name, unit: m.unit }))}
                  value={form.material_id}
                  onChange={(id) => setForm(f => ({ ...f, material_id: id }))}
                  placeholder="자재코드 또는 자재명을 입력하세요..."
                />
              </div>
              <div className="form-group">
                <label className="form-label">거래처</label>
                <SearchableSelect
                  options={clients.map(c => ({ id: c.id, code: c.code, name: c.name }))}
                  value={form.client_id}
                  onChange={(id) => setForm(f => ({ ...f, client_id: id }))}
                  placeholder="거래처를 검색하세요..."
                />
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
                    자재 분석 결과 ({bulkItems.length}건)
                  </span>
                  <div className="table-container" style={{ border: '1px solid var(--border)', borderRadius: '8px' }}>
                    <table style={{ minWidth: '100%' }}>
                      <thead>
                        <tr>
                          <th style={{ width: '30%' }}>원문 텍스트</th>
                          <th style={{ width: '40%' }}>매칭 자재</th>
                          <th style={{ width: '15%' }} className="text-right">수량</th>
                          <th style={{ width: '20%' }}>비고</th>
                          <th style={{ width: '5%' }}></th>
                        </tr>
                      </thead>
                      <tbody>
                        {bulkItems.map(item => (
                          <tr key={item.id}>
                            <td className="td-muted" style={{ fontSize: '13px' }}>{item.rawText}</td>
                            <td>
                              <SearchableSelect
                                options={materials.map(m => ({ id: m.id, code: m.code, name: m.name, unit: m.unit }))}
                                value={item.materialId}
                                onChange={id => {
                                  setBulkItems(prev => prev.map(x => x.id === item.id ? { ...x, materialId: id } : x))
                                }}
                                placeholder="자재 매칭 선택..."
                              />
                            </td>
                            <td className="text-right">
                              <input
                                type="number"
                                className="form-control text-right"
                                style={{ width: '90px', display: 'inline-block' }}
                                value={item.quantity === 0 ? '' : item.quantity}
                                onChange={e => {
                                  const val = e.target.value === '' ? 0 : Number(e.target.value)
                                  setBulkItems(prev => prev.map(x => x.id === item.id ? { ...x, quantity: val } : x))
                                }}
                              />
                            </td>
                            <td>
                              <input
                                type="text"
                                className="form-control"
                                placeholder="용도 등 비고 입력"
                                value={item.note}
                                onChange={e => {
                                  const val = e.target.value
                                  setBulkItems(prev => prev.map(x => x.id === item.id ? { ...x, note: val } : x))
                                }}
                              />
                            </td>
                            <td>
                              <button type="button" className="btn btn-danger btn-sm"
                                onClick={() => setBulkItems(prev => prev.filter(x => x.id !== item.id))}>
                                삭제
                              </button>
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
              <button className="btn btn-primary" onClick={handleBulkSave}
                disabled={saving || bulkItems.length === 0 || bulkItems.some(i => !i.materialId || i.quantity <= 0)}>
                {saving ? '저장 중...' : `일괄 등록 (${bulkItems.length}건)`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
