'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import {
  LayoutDashboard, UtensilsCrossed, Users, Table2,
  ShoppingBag, CreditCard, BarChart3, MessageSquare, Settings,
} from 'lucide-react'
import { Sidebar } from '@/components/layout/sidebar'
import { NavigationProgress } from '@/components/NavigationProgress'
import { useAuthStore } from '@/stores/auth.store'
import { useSocket } from '@/hooks/useSocket'
import { useT } from '@/hooks/useT'

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, isAuthenticated } = useAuthStore()
  const router = useRouter()
  const { connected } = useSocket()
  const t = useT()

  const navItems = [
    { href: '/admin', label: t.nav_dashboard, icon: LayoutDashboard },
    { href: '/admin/menu', label: t.nav_menu, icon: UtensilsCrossed },
    { href: '/admin/tables', label: t.nav_tables, icon: Table2 },
    { href: '/admin/orders', label: t.nav_orders, icon: ShoppingBag },
    { href: '/admin/staff', label: t.nav_staff, icon: Users },
    { href: '/admin/payments', label: t.nav_payments, icon: CreditCard },
    { href: '/admin/reports', label: t.nav_reports, icon: BarChart3 },
    { href: '/admin/feedback', label: t.nav_feedback, icon: MessageSquare },
    { href: '/admin/settings', label: t.nav_settings, icon: Settings },
  ]

  useEffect(() => {
    if (!isAuthenticated) {
      router.replace('/login')
      return
    }
    if (user?.role !== 'RESTAURANT_ADMIN') {
      router.replace('/login')
    }
  }, [isAuthenticated, user, router])

  if (!isAuthenticated || user?.role !== 'RESTAURANT_ADMIN') return null

  return (
    <div className="app-shell flex min-h-screen bg-background">
      <NavigationProgress />
      <Sidebar items={navItems} title={t.role_admin} />
      <main className="flex-1 overflow-auto pt-14 md:pt-0">
        {!connected && (
          <div className="bg-destructive/10 border-b border-destructive/20 px-6 py-2 text-xs text-destructive text-center">
            {t.banner_no_connection}
          </div>
        )}
        {children}
      </main>
    </div>
  )
}
