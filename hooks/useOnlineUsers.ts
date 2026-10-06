'use client'
import { useEffect, useState, useCallback, useRef } from 'react'
import { supabase, isSupabaseConnected } from '@/lib/supabase'

// 자재/공구 테마 랜덤 닉네임 생성기
const ADJECTIVES = ['빠른', '든든한', '정밀한', '강철의', '용감한', '민첩한', '묵직한', '날카로운', '화끈한', '튼튼한', '반짝이는', '거침없는']
const NOUNS = ['볼트', '너트', '스패너', '기어', '드릴', '톱날', '해머', '렌치', '바이스', '리벳', '앵글', '파이프', '베어링', '용접봉']
const ICONS = ['🔩', '🔧', '⚙️', '🛠️', '📦', '🔨', '⛓️', '🪛', '🗜️', '🪚']

function generateNickname(): { name: string; icon: string } {
  const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)]
  const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)]
  const icon = ICONS[Math.floor(Math.random() * ICONS.length)]
  return { name: `${adj} ${noun}`, icon }
}

function getOrCreateIdentity(): { id: string; name: string; icon: string } {
  if (typeof window === 'undefined') {
    return { id: 'ssr', name: '접속자', icon: '🔩' }
  }
  const stored = localStorage.getItem('inventory_user_identity')
  if (stored) {
    try {
      return JSON.parse(stored)
    } catch { /* fall through */ }
  }
  const { name, icon } = generateNickname()
  const id = `user_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  const identity = { id, name, icon }
  localStorage.setItem('inventory_user_identity', JSON.stringify(identity))
  return identity
}

export interface OnlineUser {
  id: string
  name: string
  icon: string
  isMe: boolean
}

export function useOnlineUsers() {
  const [users, setUsers] = useState<OnlineUser[]>([])
  const [myIdentity, setMyIdentity] = useState<{ id: string; name: string; icon: string }>({ id: '', name: '', icon: '🔩' })
  const [editingName, setEditingName] = useState(false)
  const identityRef = useRef<{ id: string; name: string; icon: string }>({ id: '', name: '', icon: '🔩' })
  const channelRef = useRef<any>(null)

  useEffect(() => {
    const identity = getOrCreateIdentity()
    identityRef.current = identity
    setMyIdentity(identity)

    // 즉시 로컬 사용자 표시 (네트워크 지연 없이 바로 '나' 표시)
    setUsers([{
      id: identity.id,
      name: identity.name,
      icon: identity.icon,
      isMe: true,
    }])

    if (!isSupabaseConnected) return

    const channel = supabase.channel('online-users', {
      config: { presence: { key: identity.id } }
    })

    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState()
        const userMap = new Map<string, OnlineUser>()

        for (const key of Object.keys(state)) {
          const presences = state[key] as any[]
          if (!presences || presences.length === 0) continue

          // Supabase Presence는 갱신 시 최신 항목(마지막) 선택
          const latest = presences[presences.length - 1]
          if (latest && latest.user_id) {
            const isMe = latest.user_id === identity.id
            const currentName = isMe ? (identityRef.current?.name || latest.name) : latest.name
            userMap.set(latest.user_id, {
              id: latest.user_id,
              name: currentName,
              icon: latest.icon || '🔩',
              isMe,
            })
          }
        }

        // '나'는 항상 접속 목록에 확실히 유지
        if (identityRef.current && identityRef.current.id) {
          userMap.set(identityRef.current.id, {
            id: identityRef.current.id,
            name: identityRef.current.name,
            icon: identityRef.current.icon,
            isMe: true,
          })
        }

        const onlineUsers = Array.from(userMap.values())

        // 정렬: 내가 가장 위, 그 다음 가나다순
        onlineUsers.sort((a, b) => {
          if (a.isMe) return -1
          if (b.isMe) return 1
          return a.name.localeCompare(b.name)
        })

        setUsers(onlineUsers)
      })
      .subscribe(async (status: string) => {
        if (status === 'SUBSCRIBED') {
          const current = identityRef.current || identity
          await channel.track({
            user_id: current.id,
            name: current.name,
            icon: current.icon,
            online_at: new Date().toISOString(),
          })
        }
      })

    channelRef.current = channel

    return () => {
      channel.unsubscribe()
    }
  }, [])

  const updateName = useCallback((newName: string) => {
    const trimmed = newName.trim()
    if (!trimmed) {
      setEditingName(false)
      return
    }

    const current = identityRef.current && identityRef.current.id ? identityRef.current : myIdentity
    const updated = { ...current, name: trimmed }

    // 1. 최신 참조 및 상태 즉각 반영 (낙관적 UI 업데이트)
    identityRef.current = updated
    setMyIdentity(updated)
    setUsers(prev => {
      const hasMe = prev.some(u => u.isMe)
      if (hasMe) {
        return prev.map(u => u.isMe ? { ...u, name: trimmed } : u)
      }
      return [{ id: updated.id, name: trimmed, icon: updated.icon, isMe: true }, ...prev]
    })

    // 2. localStorage에 영구 저장
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('inventory_user_identity', JSON.stringify(updated))
      } catch (e) {
        console.warn('localStorage 저장 실패:', e)
      }
    }

    // 3. Supabase Realtime 채널에 변경된 이름 즉시 브로드캐스트
    if (channelRef.current && isSupabaseConnected) {
      channelRef.current.track({
        user_id: updated.id,
        name: updated.name,
        icon: updated.icon,
        online_at: new Date().toISOString(),
      }).catch((err: any) => {
        console.warn('Presence track broadcast failed:', err)
      })
    }

    setEditingName(false)
  }, [myIdentity])

  return { users, myIdentity, editingName, setEditingName, updateName }
}
