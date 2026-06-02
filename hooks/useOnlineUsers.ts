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
  const channelRef = useRef<any>(null)

  useEffect(() => {
    if (!isSupabaseConnected) return

    const identity = getOrCreateIdentity()
    setMyIdentity(identity)

    const channel = supabase.channel('online-users', {
      config: { presence: { key: identity.id } }
    })

    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState()
        const onlineUsers: OnlineUser[] = []
        const seenIds = new Set<string>()

        for (const key of Object.keys(state)) {
          const presences = state[key] as any[]
          for (const p of presences) {
            if (!seenIds.has(p.user_id)) {
              seenIds.add(p.user_id)
              onlineUsers.push({
                id: p.user_id,
                name: p.name,
                icon: p.icon,
                isMe: p.user_id === identity.id,
              })
            }
          }
        }

        // Sort: me first, then alphabetical
        onlineUsers.sort((a, b) => {
          if (a.isMe) return -1
          if (b.isMe) return 1
          return a.name.localeCompare(b.name)
        })

        setUsers(onlineUsers)
      })
      .subscribe(async (status: string) => {
        if (status === 'SUBSCRIBED') {
          await channel.track({
            user_id: identity.id,
            name: identity.name,
            icon: identity.icon,
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
    if (!trimmed || !isSupabaseConnected) return

    const updated = { ...myIdentity, name: trimmed }
    setMyIdentity(updated)
    localStorage.setItem('inventory_user_identity', JSON.stringify(updated))

    if (channelRef.current) {
      channelRef.current.track({
        user_id: updated.id,
        name: updated.name,
        icon: updated.icon,
        online_at: new Date().toISOString(),
      })
    }

    setEditingName(false)
  }, [myIdentity])

  return { users, myIdentity, editingName, setEditingName, updateName }
}
