'use client'
import { useEffect, useState } from 'react'
import { supabase, Material } from '@/lib/supabase'

export default function MonthlyReportPage() {
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7))
  const [data, setData] = useState<any[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      const { data: mats } = await supabase.from('materials').select('*').eq('is_active', true).order('code')
      const { data: txs } = await supabase.from('material_transactions').select('material_id, type, quantity, date')

      const result = []
      for (const m of mats || []) {
        let prevStock = m.initial_stock || 0
        let monthIn = 0
        let monthOut = 0

        txs?.forEach((tx: any) => {
          if (tx.material_id !== m.id) return
          if (tx.date < `${month}-01`) {
            // Previous months
            if (tx.type === 'in') prevStock += tx.quantity
            else prevStock -= tx.quantity
          } else if (tx.date.startsWith(month)) {
            // Current month
            if (tx.type === 'in') monthIn += tx.quantity
            else monthOut += tx.quantity
          }
        })

        result.push({
          ...m,
          prevStock,
          monthIn,
          monthOut,
          endingStock: prevStock + monthIn - monthOut
        })
      }
      setData(result)
      setLoading(false)
    }
    load()
  }, [month])

  return (
    <div>
      <div className="page-header">
        <h2>월간 재고 입출 현황</h2>
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
                    <th>자재명</th>
                    <th>단위</th>
                    <th className="text-right">전월 이월</th>
                    <th className="text-right text-blue">당월 입고</th>
                    <th className="text-right text-red">당월 출고</th>
                    <th className="text-right">당월 재고</th>
                  </tr>
                </thead>
                <tbody>
                  {data.map(m => (
                    <tr key={m.id}>
                      <td><span className="td-code">{m.code}</span></td>
                      <td style={{ fontWeight: 600 }}>{m.name}</td>
                      <td className="td-muted">{m.unit}</td>
                      <td className="text-right font-mono td-muted">{m.prevStock.toLocaleString()}</td>
                      <td className="text-right font-mono text-blue">{m.monthIn > 0 ? `+${m.monthIn.toLocaleString()}` : '-'}</td>
                      <td className="text-right font-mono text-red">{m.monthOut > 0 ? `-${m.monthOut.toLocaleString()}` : '-'}</td>
                      <td className="text-right font-mono" style={{ fontWeight: 600 }}>{m.endingStock.toLocaleString()}</td>
                    </tr>
                  ))}
                  <tr style={{ background: 'var(--bg-card-hover)', fontWeight: 'bold' }}>
                    <td colSpan={3} className="text-right">총계</td>
                    <td className="text-right font-mono">{data.reduce((a, b) => a + b.prevStock, 0).toLocaleString()}</td>
                    <td className="text-right font-mono text-blue">{data.reduce((a, b) => a + b.monthIn, 0).toLocaleString()}</td>
                    <td className="text-right font-mono text-red">{data.reduce((a, b) => a + b.monthOut, 0).toLocaleString()}</td>
                    <td className="text-right font-mono">{data.reduce((a, b) => a + b.endingStock, 0).toLocaleString()}</td>
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
