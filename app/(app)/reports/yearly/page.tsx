'use client'
import { useEffect, useState } from 'react'
import { supabase, Material } from '@/lib/supabase'

export default function YearlyReportPage() {
  const [year, setYear] = useState(new Date().getFullYear().toString())
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
        let yearIn = 0
        let yearOut = 0

        txs?.forEach((tx: any) => {
          if (tx.material_id !== m.id) return
          if (tx.date.startsWith(year)) {
            // Current year
            if (tx.type === 'in') yearIn += tx.quantity
            else yearOut += tx.quantity
          } else if (tx.date < `${year}-01-01`) {
            // Previous years
            if (tx.type === 'in') prevStock += tx.quantity
            else prevStock -= tx.quantity
          }
        })

        result.push({
          ...m,
          prevStock,
          yearIn,
          yearOut,
          endingStock: prevStock + yearIn - yearOut
        })
      }
      setData(result)
      setLoading(false)
    }
    load()
  }, [year])

  return (
    <div>
      <div className="page-header">
        <h2>년간 재고 입출 현황</h2>
        <div className="page-header-right no-print">
          <input type="number" className="form-control" value={year} onChange={e => setYear(e.target.value)} style={{ width: 100 }} />
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
                    <th className="text-right">전년 이월</th>
                    <th className="text-right text-blue">당해 입고</th>
                    <th className="text-right text-red">당해 출고</th>
                    <th className="text-right">현재고</th>
                  </tr>
                </thead>
                <tbody>
                  {data.map(m => (
                    <tr key={m.id}>
                      <td><span className="td-code">{m.code}</span></td>
                      <td style={{ fontWeight: 600 }}>{m.name}</td>
                      <td className="td-muted">{m.unit}</td>
                      <td className="text-right font-mono td-muted">{m.prevStock.toLocaleString()}</td>
                      <td className="text-right font-mono text-blue">{m.yearIn > 0 ? `+${m.yearIn.toLocaleString()}` : '-'}</td>
                      <td className="text-right font-mono text-red">{m.yearOut > 0 ? `-${m.yearOut.toLocaleString()}` : '-'}</td>
                      <td className="text-right font-mono" style={{ fontWeight: 600 }}>{m.endingStock.toLocaleString()}</td>
                    </tr>
                  ))}
                  <tr style={{ background: 'var(--bg-card-hover)', fontWeight: 'bold' }}>
                    <td colSpan={3} className="text-right">총계</td>
                    <td className="text-right font-mono">{data.reduce((a, b) => a + b.prevStock, 0).toLocaleString()}</td>
                    <td className="text-right font-mono text-blue">{data.reduce((a, b) => a + b.yearIn, 0).toLocaleString()}</td>
                    <td className="text-right font-mono text-red">{data.reduce((a, b) => a + b.yearOut, 0).toLocaleString()}</td>
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
