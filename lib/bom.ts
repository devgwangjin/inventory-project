import { supabase } from '@/lib/supabase'

export interface DeductBomParams {
  productId: number
  quantity: number
  clientName: string
  productName: string
  date?: string
  projectId?: number
}

/**
 * Deduct raw materials for a given product and quantity based on its BOM
 */
export async function deductBomMaterials({ productId, quantity, clientName, productName, date, projectId }: DeductBomParams) {
  const { data: bom, error: bomError } = await supabase
    .from('bom')
    .select('material_id, quantity')
    .eq('product_id', productId)

  if (bomError) throw bomError

  if (bom && bom.length > 0) {
    const today = date || new Date().toISOString().slice(0, 10)
    const txInserts = bom.map(b => ({
      date: today,
      client_id: null,
      project_id: projectId || null,
      material_id: b.material_id,
      quantity: b.quantity * quantity,
      type: 'out',
      note: `제작 투입 자동차감 (${clientName} - ${productName} ${quantity}개)`,
    }))
    const { error: txError } = await supabase.from('material_transactions').insert(txInserts)
    if (txError) throw txError
  }

  return bom?.length || 0
}

/**
 * Restore materials by deleting BOM transaction records for a project
 * Prioritizes exact projectId match, and falls back to clientName for older records
 */
export async function restoreBomMaterials(projectId?: number, clientName?: string) {
  if (projectId) {
    const { error } = await supabase
      .from('material_transactions')
      .delete()
      .eq('project_id', projectId)

    if (!error) return
  }

  if (clientName) {
    const { error } = await supabase
      .from('material_transactions')
      .delete()
      .ilike('note', `%제작 투입%${clientName}%`)

    if (error) throw error
  }
}

/**
 * Recalculate BOM materials for a project (deletes old records and re-inserts latest BOM)
 */
export async function recalculateBomMaterials(params: DeductBomParams) {
  await restoreBomMaterials(params.projectId, params.clientName)
  return await deductBomMaterials(params)
}
