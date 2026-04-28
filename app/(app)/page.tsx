'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend
} from 'recharts'

interface DashStats {
  totalMaterials: number
  totalProducts: number
  totalClients: number
  lowStockCount: number
  recentTransactions: Array<{
    id: number; date: string; type: 'in' | 'out'
    material_name: string; quantity: number; unit: string
  }>
  monthlyData: Array<{ month: string; in: number; out: number }>
}

export default function DashboardPage() {
  const [stats, setStats] = useState<DashStats>({
    totalMaterials: 0,
    totalProducts: 0,
    totalClients: 0,
    lowStockCount: 0,
    recentTransactions: [],
    monthlyData: [],
  })
  const [loading, setLoading] = useState(true)
  const today = new Date()
  const year = today.getFullYear()

  useEffect(() => {
    const load = async () => {
      try {
        const [matRes, prodRes, clientRes, txRes] = await Promise.all([
          supabase.from('materials').select('id, safety_stock, initial_stock', { count: 'exact' }).eq('is_active', true),
          supabase.from('products').select('id', { count: 'exact' }).eq('is_active', true),
          supabase.from('clients').select('id', { count: 'exact' }).eq('is_active', true),
          supabase.from('material_transactions')
            .select('id, date, type, quantity, materials(name, unit)')
            .order('date', { ascending: false })
            .limit(8),
        ])

        // Monthly data for current year
        const months = Array.from({ length: 12 }, (_, i) => {
          const m = String(i + 1).padStart(2, '0')
          return { month: `${i + 1}월`, in: 0, out: 0, key: `${year}-${m}` }
        })

        const { data: monthlyTx } = await supabase
          .from('material_transactions')
          .select('date, type, quantity')
          .gte('date', `${year}-01-01`)
          .lte('date', `${year}-12-31`)

        if (monthlyTx) {
          for (const tx of monthlyTx) {
            const monthIdx = parseInt(tx.date.slice(5, 7)) - 1
            if (tx.type === 'in') months[monthIdx].in += tx.quantity
            else months[monthIdx].out += tx.quantity
          }
        }

        // Low stock: materials where current stock <= safety_stock
        const { data: txAll } = await supabase
          .from('material_transactions')
          .select('material_id, type, quantity')

        const stockMap: Record<number, number> = {}
        if (matRes.data) {
          for (const m of matRes.data) {
            stockMap[m.id] = m.initial_stock || 0
          }
        }
        if (txAll) {
          for (const tx of txAll) {
            if (!stockMap[tx.material_id]) stockMap[tx.material_id] = 0
            if (tx.type === 'in') stockMap[tx.material_id] += tx.quantity
            else stockMap[tx.material_id] -= tx.quantity
          }
        }
        const lowStock = matRes.data?.filter(m => (stockMap[m.id] || 0) <= (m.safety_stock || 0)).length || 0

        const recentTx = (txRes.data || []).map((t: any) => ({
          id: t.id,
          date: t.date,
          type: t.type,
          material_name: t.materials?.name || '-',
          quantity: t.quantity,
          unit: t.materials?.unit || '',
        }))

        setStats({
          totalMaterials: matRes.count || 0,
          totalProducts: prodRes.count || 0,
          totalClients: clientRes.count || 0,
          lowStockCount: lowStock,
          recentTransactions: recentTx,
          monthlyData: months,
        })
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  if (loading) return (
    <div>
      <div className="page-header"><h2>대시보드</h2></div>
      <div className="loading-spinner"><div className="spinner" /></div>
    </div>
  )

  return (
    <div>
      <div className="page-header">
        <h2>대시보드</h2>
        <div className="page-header-right">
          <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
            {today.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' })}
          </span>
        </div>
      </div>

      <div className="page-body">
        {/* Stat cards */}
        <div className="stat-grid">
          <div className="stat-card blue">
            <div className="stat-icon blue">🔩</div>
            <div className="stat-label">총 자재</div>
            <div className="stat-value">{stats.totalMaterials}</div>
            <div className="stat-sub">등록된 자재 수</div>
          </div>
          <div className="stat-card green">
            <div className="stat-icon green">📦</div>
            <div className="stat-label">총 품목</div>
            <div className="stat-value">{stats.totalProducts}</div>
            <div className="stat-sub">등록된 품목 수</div>
          </div>
          <div className="stat-card purple">
            <div className="stat-icon purple">🏢</div>
            <div className="stat-label">거래처</div>
            <div className="stat-value">{stats.totalClients}</div>
            <div className="stat-sub">활성 거래처 수</div>
          </div>
          <div className="stat-card red">
            <div className="stat-icon red">⚠️</div>
            <div className="stat-label">재고 부족</div>
            <div className="stat-value">{stats.lowStockCount}</div>
            <div className="stat-sub">안전재고 이하 자재</div>
          </div>
        </div>

        {/* Charts */}
        <div className="grid-2" style={{ marginBottom: '24px' }}>
          <div className="card">
            <div className="card-header">
              <span className="card-title">{year}년 월별 입출고 현황</span>
            </div>
            <div className="chart-container" style={{ height: 240 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stats.monthlyData} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="month" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} />
                  <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 11 }} />
                  <Tooltip
                    contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '8px' }}
                    labelStyle={{ color: 'var(--text-primary)' }}
                  />
                  <Legend wrapperStyle={{ fontSize: '12px' }} />
                  <Bar dataKey="in" name="입고" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="out" name="출고" fill="#ef4444" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <span className="card-title">월별 추이</span>
            </div>
            <div className="chart-container" style={{ height: 240 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={stats.monthlyData} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="month" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} />
                  <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 11 }} />
                  <Tooltip
                    contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '8px' }}
                    labelStyle={{ color: 'var(--text-primary)' }}
                  />
                  <Legend wrapperStyle={{ fontSize: '12px' }} />
                  <Line type="monotone" dataKey="in" name="입고" stroke="#3b82f6" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="out" name="출고" stroke="#ef4444" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Recent transactions */}
        <div className="card">
          <div className="card-header">
            <span className="card-title">최근 입출고 내역</span>
          </div>
          {stats.recentTransactions.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">📋</div>
              <h3>입출고 내역이 없습니다</h3>
            </div>
          ) : (
            <div className="table-container" style={{ border: 'none' }}>
              <table>
                <thead>
                  <tr>
                    <th>날짜</th>
                    <th>구분</th>
                    <th>자재명</th>
                    <th className="text-right">수량</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.recentTransactions.map(tx => (
                    <tr key={tx.id}>
                      <td className="td-muted">{tx.date}</td>
                      <td>
                        <span className={`badge ${tx.type === 'in' ? 'badge-in' : 'badge-out'}`}>
                          {tx.type === 'in' ? '입고' : '출고'}
                        </span>
                      </td>
                      <td>{tx.material_name}</td>
                      <td className="text-right font-mono">
                        <span className={tx.type === 'in' ? 'text-green' : 'text-red'}>
                          {tx.type === 'in' ? '+' : '-'}{tx.quantity.toLocaleString()} {tx.unit}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
