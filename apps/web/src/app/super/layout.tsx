'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import {
  CalendarClock,
  CreditCard,
  LayoutDashboard,
  Store,
  Users,
} from 'lucide-react'
import { Sidebar } from '@/components/layout/sidebar'
import { useAuthStore } from '@/stores/auth.store'
import { useT } from '@/hooks/useT'

export default function SuperLayout({ children }: { children: React.ReactNode }) {
  const { user, isAuthenticated } = useAuthStore()
  const router = useRouter()
  const t = useT()

  const navItems = [
    { href: '/super', label: t.nav_home, icon: LayoutDashboard },
    { href: '/super/restaurants', label: t.nav_restaurants, icon: Store },
    { href: '/super/plans', label: t.nav_tariffs, icon: CreditCard },
    { href: '/super/subscriptions', label: t.nav_subscriptions, icon: CalendarClock },
    { href: '/super/users', label: t.nav_users, icon: Users },
  ]

  useEffect(() => {
    if (!isAuthenticated || user?.role !== 'SUPER_ADMIN') {
      router.replace('/login')
    }
  }, [isAuthenticated, user, router])

  if (!isAuthenticated || user?.role !== 'SUPER_ADMIN') return null

  return (
    <div className="app-shell flex min-h-screen bg-background">
      <Sidebar items={navItems} title={t.role_super} />
      <main className="flex-1 overflow-auto pt-14 md:pt-0">{children}</main>
    </div>
  )
}
