'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

export default function ProductsMonthlyReportPage() {
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7))
  const [data, setData] = useState<any[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      const { data: prods } = await supabase.from('products').select('*').eq('is_active', true).order('code')
      const { data: txs } = await supabase.from('product_shipments').select('product_id, quantity, date')

      const result = []
      for (const p of prods || []) {
        let monthOut = 0

        txs?.forEach((tx: any) => {
          if (tx.product_id !== p.id) return
          if (tx.date.startsWith(month)) {
            monthOut += tx.quantity
          }
        })

        if (monthOut > 0 || p.is_active) {
          result.push({
            ...p,
            monthOut
          })
        }
      }
      
      // 출고량이 있는 항목을 위로, 그 다음 코드로 정렬
      result.sort((a, b) => b.monthOut - a.monthOut || a.code.localeCompare(b.code))
      
      setData(result)
      setLoading(false)
    }
    load()
  }, [month])

  return (
    <div>
      <div className="page-header">
        <h2>월간 품목 출고 현황</h2>
        <div className="page-header-right no-print">
          <input type="month" className="form-control" value={month} onChange={e => setMonth(e.target.value)} />
          <button className="btn btn-secondary" onClick={() => window.print()}>🖨️ 인쇄</button>
        </div>
      </div>
      <div className="page-body">
        <div className="card" style={{ padding: 0 }}>
          {loading ? <div className="loading-spinner"><div className="spinner" /></div> : (
            <div className="table-container" style={{ border: 'none' }}>
              <table>
                <thead>
                  <tr>
                    <th>코드</th>
                    <th>품목명 (접속함 등)</th>
                    <th>단위</th>
                    <th className="text-right text-red">당월 총 출고량</th>
                  </tr>
                </thead>
                <tbody>
                  {data.map(p => (
                    <tr key={p.id}>
                      <td><span className="td-code">{p.code}</span></td>
                      <td style={{ fontWeight: 600 }}>{p.name}</td>
                      <td className="td-muted">{p.unit}</td>
                      <td className="text-right font-mono text-red" style={{ fontWeight: p.monthOut > 0 ? 'bold' : 'normal' }}>
                        {p.monthOut > 0 ? `${p.monthOut.toLocaleString()}` : '-'}
                      </td>
                    </tr>
                  ))}
                  <tr style={{ background: 'var(--bg-card-hover)', fontWeight: 'bold' }}>
                    <td colSpan={3} className="text-right">총계</td>
                    <td className="text-right font-mono text-red">{data.reduce((a, b) => a + b.monthOut, 0).toLocaleString()}</td>
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
