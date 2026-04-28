import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: '재고관리 시스템',
  description: '자재 및 품목 재고 통합 관리 시스템',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  )
}
