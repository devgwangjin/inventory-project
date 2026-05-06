import Sidebar from '@/components/Sidebar'
import NoticePopup from '@/components/NoticePopup'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="app-layout">
      <Sidebar />
      <NoticePopup />
      <main className="main-content">
        {children}
      </main>
    </div>
  )
}
