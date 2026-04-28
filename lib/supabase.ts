import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''

const isValidUrl = (url: string) => {
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

export const isSupabaseConnected = isValidUrl(supabaseUrl)

// DB 미연결 시 빈 결과를 반환하는 목업 클라이언트 — 페이지 코드 수정 불필요
const mockResult = { data: [], count: 0, error: null }
const mockChain: any = new Proxy({}, {
  get: (_t, prop) => {
    if (prop === 'then') return undefined // Promise처럼 사용될 경우 처리
    if (prop === Symbol.toPrimitive || prop === Symbol.toStringTag) return undefined
    // data, count, error 필드 직접 접근
    if (prop === 'data') return []
    if (prop === 'count') return 0
    if (prop === 'error') return null
    // 체이닝 메서드는 계속 자기 자신을 반환
    return () => mockChain
  }
})

// await 가능한 목업 체인: Promise.resolve(mockResult) 를 반환
function makeMockChain(): any {
  const chain: any = {}
  const methods = ['select','insert','update','delete','upsert','eq','neq','gt','gte','lt','lte',
    'in','is','like','ilike','or','and','not','filter','match','contains','containedBy',
    'order','limit','range','single','maybeSingle','textSearch','returns']
  methods.forEach(m => {
    chain[m] = (..._args: any[]) => makeMockChain()
  })
  // await 하면 빈 결과 반환
  chain.then = (resolve: any) => Promise.resolve(mockResult).then(resolve)
  chain.catch = (reject: any) => Promise.resolve(mockResult).catch(reject)
  chain.finally = (fn: any) => Promise.resolve(mockResult).finally(fn)
  return chain
}

const mockSupabase = {
  from: (_table: string) => makeMockChain(),
  rpc: (_fn: string, _args?: any) => makeMockChain(),
  auth: { getSession: async () => ({ data: null, error: null }) },
}

export const supabase = isSupabaseConnected
  ? createClient(supabaseUrl, supabaseAnonKey)
  : mockSupabase as any


export type Client = {
  id: number
  code: string
  name: string
  business_no: string
  representative: string
  business_type: string
  business_item: string
  manager: string
  phone: string
  email: string
  address: string
  note: string
  is_active: boolean
  created_at: string
}

export type Product = {
  id: number
  code: string
  name: string
  unit: string
  initial_stock: number
  note: string
  is_active: boolean
  created_at: string
}

export type Material = {
  id: number
  code: string
  name: string
  unit: string
  initial_stock: number
  safety_stock: number
  note: string
  is_active: boolean
  created_at: string
}

export type BomItem = {
  id: number
  product_id: number
  material_id: number
  quantity: number
  product?: Product
  material?: Material
}

export type MaterialTransaction = {
  id: number
  date: string
  client_id: number | null
  material_id: number
  quantity: number
  type: 'in' | 'out'
  note: string
  created_at: string
  client?: Client
  material?: Material
}

export type ProductShipment = {
  id: number
  date: string
  client_id: number | null
  product_id: number
  quantity: number
  note: string
  created_at: string
  client?: Client
  product?: Product
}
