'use client'
import { useEffect, useState, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend
} from 'recharts'

export default function ProductsYearlyReportPage() {
  const [year, setYear] = useState(new Date().getFullYear().toString())
  const [data, setData] = useState<any[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      const { data: prods } = await supabase.from('products').select('*').eq('is_active', true).order('code')
      const { data: txs } = await supabase.from('product_shipments').select('product_id, quantity, date').like('date', `${year}-%`)

      const result = []
      for (const p of prods || []) {
        const months = new Array(12).fill(0)
        let totalOut = 0

        txs?.forEach((tx: any) => {
          if (tx.product_id !== p.id) return
          const m = parseInt(tx.date.split('-')[1], 10) - 1
          months[m] += tx.quantity
          totalOut += tx.quantity
        })

        if (totalOut > 0 || p.is_active) {
          result.push({
            ...p,
            months,
            totalOut
          })
        }
      }
      
      // 출고량이 있는 항목을 위로
      result.sort((a, b) => b.totalOut - a.totalOut || a.code.localeCompare(b.code))
      
      setData(result)
      setLoading(false)
    }
    load()
  }, [year])

  return (
    <div>
      <div className="page-header">
        <h2>년간 품목 출고 현황</h2>
        <div className="page-header-right no-print">
          <input type="number" className="form-control" value={year} onChange={e => setYear(e.target.value)} style={{ width: '100px' }} />
          <button className="btn btn-secondary" onClick={() => window.print()}>🖨️ 인쇄</button>
        </div>
      </div>
      <div className="page-body">
        {/* 차트 영역 */}
        <div className="card no-print" style={{ marginBottom: '24px' }}>
          <div className="card-header">
            <span className="card-title">월별 총 출고량 추이</span>
          </div>
          <div className="chart-container" style={{ height: 280 }}>
            {loading ? <div className="loading-spinner"><div className="spinner" /></div> : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={
                  [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(m => ({
                    month: `${m}월`,
                    출고량: data.reduce((a, b) => a + b.months[m - 1], 0)
                  }))
                } margin={{ top: 10, right: 10, left: -10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="month" tick={{ fill: 'var(--text-muted)', fontSize: 12 }} />
                  <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 12 }} />
                  <Tooltip
                    contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '8px' }}
                    labelStyle={{ color: 'var(--text-primary)', fontWeight: 'bold', marginBottom: '4px' }}
                    cursor={{ fill: 'var(--bg-card-hover)' }}
                  />
                  <Legend wrapperStyle={{ fontSize: '13px' }} />
                  <Bar dataKey="출고량" name="총 출고량" fill="#ef4444" radius={[4, 4, 0, 0]} maxBarSize={60} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* 표 영역 */}
        <div className="card" style={{ padding: 0 }}>
          {loading ? <div className="loading-spinner"><div className="spinner" /></div> : (
            <div className="table-container" style={{ border: 'none', overflowX: 'auto' }}>
              <table style={{ minWidth: '1000px' }}>
                <thead>
                  <tr>
                    <th>코드</th>
                    <th>품목명</th>
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(m => <th key={m} className="text-right">{m}월</th>)}
                    <th className="text-right text-red">합계</th>
                  </tr>
                </thead>
                <tbody>
                  {data.map(p => (
                    <tr key={p.id}>
                      <td><span className="td-code">{p.code}</span></td>
                      <td style={{ fontWeight: 600 }}>{p.name}</td>
                      {p.months.map((m: number, idx: number) => (
                        <td key={idx} className="text-right font-mono" style={{ color: m > 0 ? 'var(--red)' : 'var(--text-muted)', fontWeight: m > 0 ? 500 : 'normal' }}>
                          {m > 0 ? m.toLocaleString() : '-'}
                        </td>
                      ))}
                      <td className="text-right font-mono text-red" style={{ fontWeight: 'bold' }}>
                        {p.totalOut.toLocaleString()}
                      </td>
                    </tr>
                  ))}
                  <tr style={{ background: 'var(--bg-card-hover)', fontWeight: 'bold' }}>
                    <td colSpan={2} className="text-right">총계</td>
                    {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map(mIdx => {
                      const sum = data.reduce((a, b) => a + b.months[mIdx], 0)
                      return (
                        <td key={mIdx} className="text-right font-mono" style={{ color: sum > 0 ? 'var(--red)' : 'var(--text-muted)' }}>
                          {sum > 0 ? sum.toLocaleString() : '-'}
                        </td>
                      )
                    })}
                    <td className="text-right font-mono text-red">
                      {data.reduce((a, b) => a + b.totalOut, 0).toLocaleString()}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
