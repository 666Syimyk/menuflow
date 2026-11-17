'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { Bell, ClipboardList, LayoutDashboard, Table2 } from 'lucide-react'
import { Sidebar } from '@/components/layout/sidebar'
import { useAuthStore } from '@/stores/auth.store'
import { useSocket } from '@/hooks/useSocket'
import { useT } from '@/hooks/useT'

export default function WaiterLayout({ children }: { children: React.ReactNode }) {
  const { user, isAuthenticated } = useAuthStore()
  const router = useRouter()
  const pathname = usePathname()
  const { connected } = useSocket()
  const t = useT()

  const navItems = [
    { href: '/waiter', label: t.nav_home, icon: LayoutDashboard },
    { href: '/waiter/orders', label: t.nav_orders, icon: ClipboardList },
    { href: '/waiter/calls', label: t.nav_calls, icon: Bell },
    { href: '/waiter/tables', label: t.nav_tables, icon: Table2 },
  ]

  useEffect(() => {
    if (!isAuthenticated || user?.role !== 'WAITER') {
      router.replace('/login')
    }
  }, [isAuthenticated, user, router])

  if (!isAuthenticated || user?.role !== 'WAITER') return null

  return (
    <div className="app-shell dark flex min-h-screen bg-background">
      <Sidebar items={navItems} title={t.role_waiter} showMobileTrigger={false} />
      <main className="flex-1 overflow-auto pb-20 md:pb-0">
        {!connected && (
          <div className="border-b border-destructive/20 bg-destructive/10 px-6 py-2 text-center text-xs text-destructive">
            {t.banner_no_realtime}
          </div>
        )}
        {children}
      </main>

      <nav className="fixed inset-x-3 bottom-3 z-40 grid grid-cols-4 rounded-2xl border border-border bg-card/95 px-2 py-2 shadow-2xl backdrop-blur-xl md:hidden">
        {navItems.map((item) => {
          const Icon = item.icon
          const active = pathname === item.href
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-col items-center gap-1 rounded-xl py-2 text-[11px] font-semibold ${
                active ? 'bg-primary/10 text-primary' : 'text-muted-foreground'
              }`}
            >
              <Icon size={19} />
              <span>{item.label}</span>
            </Link>
          )
        })}
      </nav>
    </div>
  )
}
