'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { ClipboardList } from 'lucide-react'
import { Sidebar } from '@/components/layout/sidebar'
import { useAuthStore } from '@/stores/auth.store'
import { useSocket } from '@/hooks/useSocket'
import { useT } from '@/hooks/useT'

export default function KitchenLayout({ children }: { children: React.ReactNode }) {
  const { user, isAuthenticated } = useAuthStore()
  const router = useRouter()
  const { connected } = useSocket()
  const t = useT()

  const navItems = [
    { href: '/kitchen', label: t.nav_kitchen_queue, icon: ClipboardList },
  ]

  useEffect(() => {
    if (!isAuthenticated || user?.role !== 'COOK') router.replace('/login')
  }, [isAuthenticated, user, router])

  if (!isAuthenticated || user?.role !== 'COOK') return null

  return (
    <div className="app-shell dark flex min-h-screen bg-background">
      <Sidebar items={navItems} title={t.role_kitchen} />
      <main className="flex-1 overflow-auto pt-14 md:pt-0">
        {!connected && (
          <div className="bg-destructive/10 border-b border-destructive/20 px-6 py-2 text-xs text-destructive text-center">
            {t.banner_no_connection_refresh}
          </div>
        )}
        {children}
      </main>
    </div>
  )
}
