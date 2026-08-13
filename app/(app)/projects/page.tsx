'use client'
import { useEffect, useState, useCallback } from 'react'
import Pagination from '@/components/Pagination'
import { supabase, Project, Product, ProjectWithProduct } from '@/lib/supabase'
import Toast from '@/components/Toast'
import { matchesSearch } from '@/lib/search'
import { buildCombinedNote, parseCombinedNote } from '@/lib/format'
import { deductBomMaterials, restoreBomMaterials, recalculateBomMaterials } from '@/lib/bom'
import { logAction } from '@/lib/logger'

const empty = {
  client_name: '',
  product_id: null as number | null,
  quantity: 1,
  manager: '',
  delivery_time: '',
  address: '',
  spec: '',
  status: '제작중' as '제작중' | '완료',
  note: '',
}

export default function ProjectsPage() {
  const [items, setItems] = useState<ProjectWithProduct[]>([])
  const [filtered, setFiltered] = useState<ProjectWithProduct[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [modal, setModal] = useState(false)
  const [editing, setEditing] = useState<Project | null>(null)
  const [form, setForm] = useState(empty)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null)
  const [page, setPage] = useState(1)
  const [selectedIds, setSelectedIds] = useState<number[] >([])
  const PER_PAGE = 20

  const load = useCallback(async () => {
    setLoading(true)
    const [{ data }, { data: pr }] = await Promise.all([
      supabase.from('projects').select('*, product:product_id(*)').order('created_at', { ascending: false }),
      supabase.from('products').select('*').eq('is_active', true).order('code')
    ])
    setItems((data || []) as ProjectWithProduct[])
    setProducts(pr || [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    setFiltered(items.filter(i => {
      const parsed = parseCombinedNote(i.note || '')
      return matchesSearch(search, [
        i.client_name, 
        i.product?.name, 
        i.spec, 
        parsed.manager, 
        parsed.address, 
        parsed.deliveryTime, 
        parsed.note
      ])
    }))
  }, [search, items])

  useEffect(() => {
    setPage(1)
  }, [search])

  const openAdd = () => { setEditing(null); setForm(empty); setModal(true) }
  const openEdit = (i: Project) => { 
    setEditing(i)
    const parsed = parseCombinedNote(i.note || '')
    setForm({ 
      client_name: i.client_name,
      product_id: i.product_id,
      quantity: i.quantity || 1,
      manager: parsed.manager,
      delivery_time: parsed.deliveryTime,
      address: parsed.address,
      spec: i.spec || '',
      status: i.status || '제작중',
      note: parsed.note
    })
    setModal(true) 
  }

  const handleSave = async () => {
    if (!form.client_name || !form.product_id || form.quantity <= 0) return
    setSaving(true)
    try {
      const selectedProduct = products.find(p => p.id === form.product_id)
      const combinedNote = buildCombinedNote(form.manager, form.delivery_time, form.address, form.note)

      const payload = {
        client_name: form.client_name,
        product_id: form.product_id,
        spec: form.spec,
        status: form.status,
        note: combinedNote
      }

      if (editing) {
        const { error } = await supabase.from('projects').update(payload).eq('id', editing.id)
        if (error) throw error
        await logAction({
          category: '제작중',
          actionType: '수정',
          targetName: form.client_name,
          details: `제작/프로젝트 [${form.client_name} - ${selectedProduct?.name || ''}] 정보 수정`,
        })
        setToast({ msg: '제작/프로젝트가 수정되었습니다.', type: 'success' })
      } else {
        const { error } = await supabase.from('projects').insert(payload)
        if (error) throw error

        let deductedCount = 0
        // Auto-deduct materials via BOM helper on '제작중'
        if (form.status === '제작중') {
          deductedCount = await deductBomMaterials({
            productId: form.product_id,
            quantity: form.quantity,
            clientName: form.client_name,
            productName: selectedProduct?.name || ''
          })
        }

        await logAction({
          category: '제작중',
          actionType: '등록',
          targetName: form.client_name,
          details: `신규 제작 등록: [${form.client_name}] - ${selectedProduct?.name || ''} ${form.quantity}개 (BOM 자재 ${deductedCount}종 자동 차감)`,
        })

        setToast({ msg: '제작이 등록되었습니다. BOM 자재 자동 차감 적용.', type: 'success' })
      }
      setModal(false); load()
    } catch (e: any) {
      setToast({ msg: e.message || '저장 실패', type: 'error' })
    } finally { setSaving(false) }
  }

  const handleSyncBom = async (project: ProjectWithProduct) => {
    if (!confirm(`[${project.product?.name}] 품목의 최신 BOM 기준으로 자재 차감 내역을 재계산하시겠습니까?`)) return
    setSaving(true)
    try {
      const count = await recalculateBomMaterials({
        productId: project.product_id,
        quantity: project.quantity || 1,
        clientName: project.client_name,
        productName: project.product?.name || ''
      })
      await logAction({
        category: '제작중',
        actionType: '재계산',
        targetName: project.client_name,
        details: `[${project.client_name} - ${project.product?.name}] BOM 차감 자재 재계산 완료 (자재 ${count}종)`,
      })
      setToast({ msg: `최신 BOM 기준으로 자재 차감이 재계산되었습니다.`, type: 'success' })
      load()
    } catch (e: any) {
      setToast({ msg: e.message, type: 'error' })
    } finally {
      setSaving(false)
    }
  }

  const handleShipmentComplete = async (project: ProjectWithProduct) => {
    if (!confirm(`[${project.client_name}] - [${project.product?.name}] 제작 완료건을 현장 출고 처리하시겠습니까?`)) return
    setSaving(true)
    try {
      const { error: projError } = await supabase
        .from('projects')
        .update({ status: '완료' })
        .eq('id', project.id)
      if (projError) throw projError

      const today = new Date().toISOString().slice(0, 10)
      const { error: shipError } = await supabase
        .from('product_shipments')
        .insert({
          date: today,
          product_id: project.product_id,
          quantity: project.quantity || 1,
          delivery_company: project.client_name,
          note: `현장 출고 완료 (${project.spec || ''}) ${project.note || ''}`
        })
      if (shipError) throw shipError

      await logAction({
        category: '제작중',
        actionType: '출고',
        targetName: project.client_name,
        details: `제작 완료 현장 출고 처리: [${project.client_name}] - ${project.product?.name} ${project.quantity || 1}개`,
      })

      setToast({ msg: '현장 출고 처리가 완료되었습니다. (출고 이력 자동 반영)', type: 'success' })
      load()
    } catch (e: any) {
      setToast({ msg: e.message, type: 'error' })
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (project: ProjectWithProduct) => {
    if (!confirm(`[${project.client_name}] - [${project.product?.name}] 제작 내역을 취소/삭제하시겠습니까?\n\n(※ 자동차감되었던 자재들도 원래대로 재고가 자동 복구됩니다.)`)) return
    setSaving(true)
    try {
      // Restore materials using BOM helper
      await restoreBomMaterials(project.client_name)

      // Delete project
      const { error } = await supabase.from('projects').delete().eq('id', project.id)
      if (error) throw error

      await logAction({
        category: '제작중',
        actionType: '삭제',
        targetName: project.client_name,
        details: `제작 건 취소/삭제: [${project.client_name} - ${project.product?.name}] (차감 자재 원상복구 완료)`,
      })

      setToast({ msg: '제작 건이 취소되고 차감되었던 자재 재고가 원상복구되었습니다.', type: 'success' })
      load()
    } catch (e: any) {
      setToast({ msg: e.message || '삭제 실패', type: 'error' })
    } finally {
      setSaving(false)
    }
  }

  const handleBulkDelete = async () => {
    if (!selectedIds.length) return
    if (!confirm(`선택한 ${selectedIds.length}개의 제작 내역을 취소/삭제하시겠습니까?\n(자동 차감되었던 자재들도 원상복구됩니다.)`)) return
    try {
      const selectedProjects = items.filter(i => selectedIds.includes(i.id))
      for (const p of selectedProjects) {
        await restoreBomMaterials(p.client_name)
      }
      const { error } = await supabase.from('projects').delete().in('id', selectedIds)
      if (error) throw error

      await logAction({
        category: '제작중',
        actionType: '삭제',
        targetName: `${selectedIds.length}개 제작건`,
        details: `제작 건 일괄 취소/삭제 (${selectedIds.length}건) 및 자재 원상복구`,
      })

      setToast({ msg: `${selectedIds.length}개 제작 건이 삭제되고 자재 재고가 원상복구되었습니다.`, type: 'success' })
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

  const paginated = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE)
  const totalPages = Math.ceil(filtered.length / PER_PAGE)

  return (
    <div>
      {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
      <div className="page-header">
        <h2>⚙️ 제작중 / 프로젝트 관리</h2>
        <div className="page-header-right">
          <button className="btn btn-primary" onClick={openAdd}>＋ 제작 등록</button>
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
          💡 <strong>'제작중'</strong>으로 등록 시 해당 품목의 BOM 자재가 <strong>실시간으로 자동 차감</strong>됩니다. 제작이 완료되면 <strong>[🚛 현장 출고]</strong>를 눌러 완제품 출고 이력에 반영하세요.
        </div>

        <div className="toolbar">
          <div className="search-box">
            <span className="search-icon">🔍</span>
            <input placeholder="납품처, 품목, 담당자, 주소, 규격 검색..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            {selectedIds.length > 0 && (
              <button className="btn btn-danger" onClick={handleBulkDelete}>
                🗑️ 선택된 {selectedIds.length}건 삭제
              </button>
            )}
            <span style={{ color: 'var(--text-muted)', fontSize: '13px' }}>총 {filtered.length}건</span>
          </div>
        </div>

        <div className="card" style={{ padding: 0 }}>
          {loading ? <div className="loading-spinner"><div className="spinner" /></div>
            : filtered.length === 0 ? (
              <div className="empty-state">
                <div className="empty-state-icon">📋</div>
                <h3>등록된 제작/프로젝트가 없습니다</h3>
                <p>우측 상단 버튼으로 제작 건을 등록하세요</p>
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
                        <th>납품처 (고객사)</th>
                        <th>제작 품목</th>
                        <th>제작 수량</th>
                        <th>담당자 / 납품시간</th>
                        <th>배송 주소</th>
                        <th>규격 / 상태</th>
                        <th>비고</th>
                        <th>등록일</th>
                        <th>액션</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginated.map(i => {
                        const parsed = parseCombinedNote(i.note || '')
                        return (
                          <tr key={i.id}>
                            <td>
                              <input type="checkbox" checked={selectedIds.includes(i.id)} onChange={() => handleSelect(i.id)} />
                            </td>
                            <td style={{ fontWeight: 600 }}>{i.client_name}</td>
                            <td className="td-muted">{i.product?.code} | {i.product?.name}</td>
                            <td className="font-mono">{i.quantity || 1} {i.product?.unit}</td>
                            <td style={{ fontSize: '13px' }}>
                              <div>👤 {parsed.manager || '-'}</div>
                              <div style={{ color: 'var(--text-muted)', fontSize: '12px', marginTop: '2px' }}>⏰ {parsed.deliveryTime || '-'}</div>
                            </td>
                            <td className="td-muted" style={{ fontSize: '13px', maxWidth: '180px', wordBreak: 'break-all' }}>
                              📍 {parsed.address || '-'}
                            </td>
                            <td>
                              <div style={{ fontSize: '13px', marginBottom: '4px' }}>{i.spec || '-'}</div>
                              <span className={`badge ${i.status === '완료' ? 'badge-active' : 'badge-inactive'}`}>
                                {i.status}
                              </span>
                            </td>
                            <td className="td-muted" style={{ fontSize: '13px' }}>{parsed.note || '-'}</td>
                            <td className="td-muted">{new Date(i.created_at).toLocaleDateString()}</td>
                            <td style={{ whiteSpace: 'nowrap' }}>
                              <div style={{ display: 'flex', gap: '6px' }}>
                                {i.status === '제작중' && (
                                  <>
                                    <button className="btn btn-success btn-sm" onClick={() => handleShipmentComplete(i)}>🚛 현장 출고</button>
                                    <button className="btn btn-secondary btn-sm" onClick={() => handleSyncBom(i)}>🔄 BOM 재계산</button>
                                  </>
                                )}
                                <button className="btn btn-secondary btn-sm" onClick={() => openEdit(i)}>수정</button>
                                <button className="btn btn-danger btn-sm" onClick={() => handleDelete(i)}>삭제</button>
                              </div>
                            </td>
                          </tr>
                        )
                      })}
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
              <span className="modal-title">{editing ? '제작/프로젝트 수정' : '제작/프로젝트 등록'}</span>
              <button className="modal-close" onClick={() => setModal(false)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">납품처 (고객사) <span className="required">*</span></label>
                <input className="form-control" value={form.client_name} onChange={e => setForm(f => ({ ...f, client_name: e.target.value }))} placeholder="예: (주)한국전기" />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">제작 품목 <span className="required">*</span></label>
                  <select className="form-control" value={form.product_id ?? ''} onChange={e => setForm(f => ({ ...f, product_id: e.target.value ? Number(e.target.value) : null }))}>
                    <option value="">-- 품목 선택 --</option>
                    {products.map(p => <option key={p.id} value={p.id}>{p.code} | {p.name}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">제작 수량 <span className="required">*</span></label>
                  <input className="form-control" type="number" min="1" value={form.quantity === 0 ? '' : form.quantity} onChange={e => setForm(f => ({ ...f, quantity: e.target.value === '' ? 0 : Number(e.target.value) }))} />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">담당자</label>
                  <input className="form-control" value={form.manager} onChange={e => setForm(f => ({ ...f, manager: e.target.value }))} placeholder="예: 홍길동 팀장 / 010-1234-5678" />
                </div>
                <div className="form-group">
                  <label className="form-label">납품 (예정) 시간</label>
                  <input className="form-control" value={form.delivery_time} onChange={e => setForm(f => ({ ...f, delivery_time: e.target.value }))} placeholder="예: 8/15(토) 14:00" />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">배송 주소</label>
                <input className="form-control" value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} placeholder="예: 전북 군산시 산단로 123 군산공장 2동" />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">규모 / 규격</label>
                  <input className="form-control" value={form.spec} onChange={e => setForm(f => ({ ...f, spec: e.target.value }))} placeholder="예: 접속함 총 3면" />
                </div>
                <div className="form-group">
                  <label className="form-label">진행 상태</label>
                  <select className="form-control" value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value as any }))}>
                    <option value="제작중">제작중 (자재 차감)</option>
                    <option value="완료">완료 (출고 처리)</option>
                  </select>
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">비고</label>
                <input className="form-control" value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} placeholder="기타 참고사항" />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setModal(false)}>취소</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving || !form.client_name || !form.product_id || form.quantity <= 0}>
                {saving ? '저장 중...' : '저장 및 제작 등록'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
