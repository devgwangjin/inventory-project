import { supabase } from '@/lib/supabase'

export type LogCategory = '거래처' | '품목' | '자재' | 'BOM' | '자재입출고' | '제작중' | '품목출고'
export type LogActionType = '등록' | '수정' | '삭제' | '출고' | '재계산'

export interface LogActionParams {
  category: LogCategory
  actionType: LogActionType
  targetName: string
  details: string
  userName?: string
}

/**
 * Log a system action to database system_logs table safely
 */
export async function logAction({
  category,
  actionType,
  targetName,
  details,
  userName = '관리자',
}: LogActionParams) {
  try {
    const { error } = await supabase.from('system_logs').insert({
      category,
      action_type: actionType,
      target_name: targetName,
      details,
      user_name: userName,
    })
    if (error) {
      console.warn('System log insert notice:', error.message)
    }
  } catch (err) {
    // Fail safe to prevent interrupting primary app operations
    console.warn('System log recording error:', err)
  }
}
