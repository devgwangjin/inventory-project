import { supabase } from '@/lib/supabase'

export interface DeductBomParams {
  productId: number
  quantity: number
  clientName: string
  productName: string
  date?: string
}

/**
 * Deduct raw materials for a given product and quantity based on its BOM
 */
export async function deductBomMaterials({ productId, quantity, clientName, productName, date }: DeductBomParams) {
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
 * Restore materials by deleting existing BOM transaction records for a client/project
 */
export async function restoreBomMaterials(clientName: string) {
  const { error } = await supabase
    .from('material_transactions')
    .delete()
    .ilike('note', `%제작 투입%${clientName}%`)

  if (error) throw error
}

/**
 * Recalculate BOM materials for a project (deletes old records and re-inserts latest BOM)
 */
export async function recalculateBomMaterials(params: DeductBomParams) {
  await restoreBomMaterials(params.clientName)
  return await deductBomMaterials(params)
}
