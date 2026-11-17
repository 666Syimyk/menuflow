'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { ChevronRight, LogOut, Menu, UtensilsCrossed, X } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/stores/auth.store'
import { LanguageSwitcher } from '@/components/LanguageSwitcher'
import { useT } from '@/hooks/useT'

interface NavItem {
  href: string
  label: string
  icon: LucideIcon
  badge?: number
}

interface SidebarProps {
  items: NavItem[]
  title: string
  showMobileTrigger?: boolean
}

export function Sidebar({
  items,
  title,
  showMobileTrigger = true,
}: SidebarProps) {
  const pathname = usePathname()
  const { user, logout } = useAuthStore()
  const [open, setOpen] = useState(false)
  const t = useT()

  useEffect(() => setOpen(false), [pathname])

  return (
    <>
      {showMobileTrigger && (
        <button
          onClick={() => setOpen((value) => !value)}
          className="fixed left-4 top-3 z-50 flex h-11 w-11 items-center justify-center rounded-2xl border border-border bg-card/95 text-foreground shadow-xl backdrop-blur md:hidden"
          aria-label={open ? t.sidebar_close : t.sidebar_open}
        >
          {open ? <X size={18} /> : <Menu size={18} />}
        </button>
      )}

      {open && (
        <button
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={() => setOpen(false)}
          aria-label={t.sidebar_close}
        />
      )}

      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-40 flex min-h-screen w-[280px] flex-col border-r border-border/80 bg-card/95 shadow-[12px_0_40px_rgba(46,28,12,0.04)] backdrop-blur-xl transition-transform md:sticky md:top-0 md:translate-x-0',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="flex h-20 items-center border-b border-border/70 px-5">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-400 to-brand-600 text-primary-foreground shadow-lg shadow-primary/20">
              <UtensilsCrossed size={20} strokeWidth={2.2} />
            </div>
            <div>
              <p className="text-[17px] font-extrabold tracking-tight text-foreground">MenuFlow</p>
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{title}</p>
            </div>
          </div>
        </div>

        <div className="mx-4 mt-4 flex items-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/[0.07] px-3 py-2 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
          <span className="status-dot" />
          {t.sidebar_stable}
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-5">
          <p className="mb-2 px-3 text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground/70">
            {t.sidebar_workspace}
          </p>
          {items.map((item) => {
            const active =
              pathname === item.href || pathname.startsWith(`${item.href}/`)
            const Icon = item.icon
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'group flex items-center gap-3 rounded-2xl px-3 py-3 text-sm font-semibold transition-all',
                  active
                    ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/20'
                    : 'text-muted-foreground hover:bg-muted/80 hover:text-foreground',
                )}
              >
                <span className={cn(
                  'flex h-8 w-8 items-center justify-center rounded-xl transition-colors',
                  active ? 'bg-white/20' : 'bg-muted group-hover:bg-card',
                )}>
                  <Icon size={16} />
                </span>
                <span className="flex-1">{item.label}</span>
                {item.badge !== undefined && item.badge > 0 && (
                  <motion.span
                    key={item.badge}
                    initial={{ scale: 0.8 }}
                    animate={{ scale: 1 }}
                    className="min-w-[20px] rounded-full bg-primary px-1.5 py-0.5 text-center text-xs font-bold text-primary-foreground"
                  >
                    {item.badge > 99 ? '99+' : item.badge}
                  </motion.span>
                )}
                {active && <ChevronRight size={14} className="opacity-70" />}
              </Link>
            )
          })}
        </nav>

        <div className="border-t border-border/70 p-3 space-y-2">
          <div className="px-1">
            <LanguageSwitcher />
          </div>
          <div className="group flex items-center gap-3 rounded-2xl border border-transparent px-3 py-3 transition-all hover:border-border hover:bg-muted/60">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-foreground text-sm font-bold text-background">
              {user?.name?.[0]?.toUpperCase() ?? 'U'}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-foreground">
                {user?.name}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {user?.username}
              </p>
            </div>
            <button
              onClick={() => logout()}
              className="rounded-xl p-2 text-muted-foreground hover:bg-background hover:text-destructive"
              title={t.logout}
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>
    </>
  )
}
