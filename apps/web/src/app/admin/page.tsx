'use client'

import Link from 'next/link'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ArrowUpRight,
  Bell,
  ChefHat,
  CheckCircle2,
  CircleDollarSign,
  Clock3,
  QrCode,
  ShieldAlert,
  ShoppingBag,
  Sparkles,
  Table2,
  Users,
} from 'lucide-react'
import { api } from '@/lib/api'
import { timeAgo } from '@/lib/utils'
import { useFormatPrice } from '@/hooks/useCurrency'
import { useT } from '@/hooks/useT'
import { useSocket } from '@/hooks/useSocket'
import { useEffect } from 'react'
import toast from 'react-hot-toast'

interface DashboardStats {
  todayOrders: number
  activeOrders: number
  totalRevenue: number
  activeTables: number
  hourlyActivity: number[]
}

interface AdminCall {
  id: string
  tableId: string | null
  tableNumber: number | null
  callType: string
  status: string
  createdAt: string
}

export default function AdminDashboard() {
  const queryClient = useQueryClient()
  const { on } = useSocket()
  const fmt = useFormatPrice()

  const { data: stats, isLoading } = useQuery<DashboardStats>({
    queryKey: ['admin', 'dashboard'],
    queryFn: () => api.get('/admin/dashboard') as unknown as Promise<DashboardStats>,
    refetchInterval: 30_000,
  })

  const { data: callsRaw } = useQuery({
    queryKey: ['admin', 'calls'],
    queryFn: () => api.get('/admin/calls'),
    select: (d: unknown) => Array.isArray(d) ? d as AdminCall[] : [],
    refetchInterval: 15_000,
  })
  const calls: AdminCall[] = callsRaw ?? []

  const resolveCall = useMutation({
    mutationFn: (id: string) => api.patch(`/admin/calls/${id}`, { status: 'completed' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin', 'calls'] }),
  })

  const t = useT()

  useEffect(() => {
    const offCall = on('admin_call_created', () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'calls'] })
      toast(t.admin_call_toast, { duration: 6000 })
    })
    const offNew = on('new_order', () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'dashboard'] })
      queryClient.invalidateQueries({ queryKey: ['admin', 'calls'] })
    })
    const offPaid = on('order_paid', () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'dashboard'] })
    })
    const offCancelled = on('order_cancelled', () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'dashboard'] })
    })
    const offReady = on('order_ready', () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'dashboard'] })
    })
    return () => { offCall(); offNew(); offPaid(); offCancelled(); offReady() }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [on, queryClient, t])

  const cards = [
    {
      label: t.admin_stat_orders,
      value: stats?.todayOrders ?? 0,
      icon: ShoppingBag,
      note: t.admin_note_orders,
      tone: 'bg-blue-500/10 text-blue-600',
      href: '/admin/orders',
    },
    {
      label: t.admin_stat_revenue,
      value: fmt(stats?.totalRevenue ?? 0),
      icon: CircleDollarSign,
      note: t.admin_note_revenue,
      tone: 'bg-emerald-500/10 text-emerald-600',
      href: '/admin/reports',
    },
    {
      label: t.admin_stat_tables,
      value: stats?.activeTables ?? 0,
      icon: Table2,
      note: t.admin_note_tables,
      tone: 'bg-amber-500/10 text-amber-600',
      href: '/admin/tables',
    },
    {
      label: t.admin_stat_attention,
      value: stats?.activeOrders ?? 0,
      icon: Clock3,
      note: t.admin_note_attention,
      tone: 'bg-primary/10 text-primary',
      href: '/admin/orders',
    },
  ]

  return (
    <div className="space-y-7 p-4 sm:p-7 lg:p-9">
      <header className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="eyebrow">{t.admin_eyebrow}</p>
          <h1 className="mt-2 text-3xl font-extrabold text-foreground sm:text-4xl">
            {t.admin_greeting}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {t.admin_subtitle}
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/admin/tables"
            className="flex h-11 items-center gap-2 rounded-2xl border border-border bg-card px-4 text-sm font-semibold text-foreground shadow-sm hover:border-primary/30 hover:text-primary"
          >
            <QrCode size={17} />
            {t.admin_btn_qr}
          </Link>
          <Link
            href="/admin/orders"
            className="flex h-11 items-center gap-2 rounded-2xl bg-primary px-4 text-sm font-bold text-white shadow-lg shadow-primary/20 hover:-translate-y-0.5"
          >
            {t.admin_btn_orders}
            <ArrowUpRight size={17} />
          </Link>
        </div>
      </header>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((card, index) => {
          const Icon = card.icon
          return (
            <Link key={card.label} href={card.href}>
              <motion.article
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.06 }}
                className="card-hover cursor-pointer rounded-3xl border border-border bg-card p-5 hover:border-primary/30 hover:shadow-md transition-shadow"
              >
                <div className="flex items-start justify-between">
                  <div className={`flex h-11 w-11 items-center justify-center rounded-2xl ${card.tone}`}>
                    <Icon size={20} />
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="rounded-full bg-emerald-500/10 px-2 py-1 text-[10px] font-bold text-emerald-600">
                      LIVE
                    </span>
                    <ArrowUpRight size={14} className="text-muted-foreground/50" />
                  </div>
                </div>
                <p className="mt-6 text-sm font-medium text-muted-foreground">{card.label}</p>
                {isLoading ? (
                  <div className="skeleton mt-2 h-10 w-28" />
                ) : (
                  <p className="mt-1 text-3xl font-extrabold tracking-tight text-foreground">{card.value}</p>
                )}
                <p className="mt-2 text-xs text-muted-foreground">{card.note}</p>
              </motion.article>
            </Link>
          )
        })}
      </section>

      {/* Admin calls panel — only visible when there are pending calls */}
      <AnimatePresence>
        {calls.length > 0 && (
          <motion.section
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="rounded-3xl border border-amber-500/30 bg-amber-500/[0.06] p-5"
          >
            <div className="mb-4 flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-500/15 text-amber-600">
                <ShieldAlert size={18} className="animate-pulse" />
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-amber-600">{t.admin_calls_eyebrow}</p>
                <p className="text-sm font-extrabold text-foreground">{calls.length} {t.admin_calls_title}</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {calls.map((call) => (
                <div
                  key={call.id}
                  className="flex items-center gap-2 rounded-2xl border border-amber-500/25 bg-white/70 px-3 py-2 text-xs font-semibold text-amber-800 shadow-sm dark:bg-card/60"
                >
                  {call.tableId ? (
                    <>
                      <Bell size={12} className="text-amber-500" />
                      <span>{t.admin_calls_from_guest} · {call.tableNumber ? `Стол №${call.tableNumber}` : `#${call.tableId.slice(-4)}`}</span>
                    </>
                  ) : (
                    <>
                      <Users size={12} className="text-amber-500" />
                      <span>{t.admin_calls_from_waiter}</span>
                    </>
                  )}
                  <span className="text-amber-400">·</span>
                  <span className="font-normal text-amber-600">{timeAgo(call.createdAt)}</span>
                  <button
                    onClick={() => resolveCall.mutate(call.id)}
                    disabled={resolveCall.isPending}
                    className="ml-1 flex items-center gap-1 rounded-lg bg-amber-500/20 px-2 py-0.5 text-[10px] font-bold text-amber-700 hover:bg-amber-500/35 disabled:opacity-50"
                  >
                    <CheckCircle2 size={10} />
                    {t.admin_call_resolve}
                  </button>
                </div>
              ))}
            </div>
          </motion.section>
        )}
      </AnimatePresence>

      <section className="grid gap-5 xl:grid-cols-[1.6fr_0.9fr]">
        <article className="premium-panel overflow-hidden p-5 sm:p-7">
          <div className="flex items-start justify-between">
            <div>
              <p className="eyebrow">{t.admin_chart_eyebrow}</p>
              <h2 className="mt-2 text-xl font-bold text-foreground">{t.admin_chart_title}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{t.admin_chart_sub}</p>
            </div>
            <div className="rounded-2xl bg-emerald-500/10 px-3 py-2 text-right">
              <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-600">{t.admin_chart_tempo}</p>
              <p className="text-sm font-extrabold text-emerald-700">{t.admin_chart_stable}</p>
            </div>
          </div>

          {(() => {
            const raw: number[] = stats?.hourlyActivity ?? Array(24).fill(0)
            // Show hours 8–23 (restaurant hours)
            const hours = Array.from({ length: 16 }, (_, i) => i + 8)
            const values = hours.map((h) => raw[h] ?? 0)
            const maxVal = Math.max(...values, 1)
            const labelHours = [8, 11, 14, 17, 20, 23]
            return (
              <>
                <div className="mt-8 flex h-52 items-end gap-1 sm:gap-1.5">
                  {hours.map((h, i) => {
                    const pct = Math.max((values[i] / maxVal) * 100, values[i] > 0 ? 6 : 0)
                    return (
                      <div key={h} className="group relative flex h-full flex-1 items-end">
                        <motion.div
                          initial={{ height: 0 }}
                          animate={{ height: `${pct}%` }}
                          transition={{ delay: 0.1 + i * 0.03, duration: 0.4 }}
                          className="w-full rounded-t-xl bg-gradient-to-t from-primary to-brand-300 opacity-75 transition-opacity group-hover:opacity-100"
                        />
                        {values[i] > 0 && (
                          <span className="pointer-events-none absolute -top-5 left-1/2 -translate-x-1/2 text-[9px] font-bold text-primary opacity-0 group-hover:opacity-100 transition-opacity">
                            {values[i]}
                          </span>
                        )}
                      </div>
                    )
                  })}
                </div>
                <div className="mt-3 flex justify-between text-[10px] font-semibold text-muted-foreground">
                  {labelHours.map((h) => (
                    <span key={h}>{String(h).padStart(2, '0')}:00</span>
                  ))}
                </div>
              </>
            )
          })()}
        </article>

        <article className="premium-panel p-5 sm:p-7">
          <div className="flex items-center justify-between">
            <div>
              <p className="eyebrow">{t.admin_team_eyebrow}</p>
              <h2 className="mt-2 text-xl font-bold text-foreground">{t.admin_team_title}</h2>
            </div>
            <Sparkles size={20} className="text-primary" />
          </div>

          <div className="mt-6 space-y-3">
            {[
              { icon: ChefHat, title: t.admin_team_kitchen, text: t.admin_team_orders_sync, color: 'text-amber-600 bg-amber-500/10' },
              { icon: Users, title: t.admin_team_hall, text: t.admin_team_notif, color: 'text-blue-600 bg-blue-500/10' },
              { icon: Table2, title: t.admin_team_tables, text: `${stats?.activeTables ?? 0} ${t.admin_team_active}`, color: 'text-emerald-600 bg-emerald-500/10' },
            ].map(({ icon: Icon, title, text, color }) => (
              <div key={title} className="flex items-center gap-3 rounded-2xl border border-border/70 bg-background/60 p-3">
                <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${color}`}>
                  <Icon size={18} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-foreground">{title}</p>
                  <p className="truncate text-xs text-muted-foreground">{text}</p>
                </div>
                <span className="status-dot" />
              </div>
            ))}
          </div>
        </article>
      </section>
    </div>
  )
}
