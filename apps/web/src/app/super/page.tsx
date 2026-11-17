'use client'

import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import {
  ArrowUpRight,
  Building2,
  CircleDollarSign,
  CreditCard,
  Layers3,
  ShoppingBag,
  Sparkles,
  TrendingUp,
  Users,
} from 'lucide-react'
import { api } from '@/lib/api'
import { formatPrice } from '@/lib/utils'

interface PlatformStats {
  totalRestaurants: number
  activeRestaurants: number
  blockedRestaurants: number
  expiredRestaurants: number
  totalOrders: number
  totalRevenue: number
}

export default function SuperDashboard() {
  const { data: stats, isLoading } = useQuery<PlatformStats>({
    queryKey: ['super', 'dashboard'],
    queryFn: () => api.get('/super/dashboard') as unknown as Promise<PlatformStats>,
  })

  const activeShare = stats?.totalRestaurants
    ? Math.round((stats.activeRestaurants / stats.totalRestaurants) * 100)
    : 0

  const cards = [
    { label: 'Рестораны', value: stats?.totalRestaurants ?? 0, icon: Building2, tone: 'bg-blue-500/10 text-blue-600' },
    { label: 'Активные клиенты', value: stats?.activeRestaurants ?? 0, icon: Users, tone: 'bg-emerald-500/10 text-emerald-600' },
    { label: 'Заказы платформы', value: stats?.totalOrders ?? 0, icon: ShoppingBag, tone: 'bg-amber-500/10 text-amber-600' },
    { label: 'Оборот платформы', value: formatPrice(stats?.totalRevenue ?? 0), icon: CircleDollarSign, tone: 'bg-primary/10 text-primary' },
  ]

  return (
    <div className="space-y-7 p-4 sm:p-7 lg:p-9">
      <header className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="eyebrow">MenuFlow Cloud</p>
          <h1 className="mt-2 text-3xl font-extrabold text-foreground sm:text-4xl">
            Пульс платформы
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Коммерческие показатели, клиенты и состояние подписок.
          </p>
        </div>
        <Link
          href="/super/restaurants"
          className="flex h-11 w-fit items-center gap-2 rounded-2xl bg-primary px-5 text-sm font-bold text-white shadow-lg shadow-primary/20 hover:-translate-y-0.5"
        >
          Управление клиентами
          <ArrowUpRight size={17} />
        </Link>
      </header>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((card, index) => {
          const Icon = card.icon
          return (
            <motion.article
              key={card.label}
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.06 }}
              className="card-hover rounded-3xl border border-border bg-card p-5"
            >
              <div className={`flex h-11 w-11 items-center justify-center rounded-2xl ${card.tone}`}>
                <Icon size={20} />
              </div>
              <p className="mt-6 text-sm font-medium text-muted-foreground">{card.label}</p>
              {isLoading ? (
                <div className="skeleton mt-2 h-10 w-28" />
              ) : (
                <p className="mt-1 text-3xl font-extrabold tracking-tight text-foreground">{card.value}</p>
              )}
            </motion.article>
          )
        })}
      </section>

      <section className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
        <article className="premium-panel p-6 sm:p-8">
          <div className="flex items-start justify-between">
            <div>
              <p className="eyebrow">Коммерческая эффективность</p>
              <h2 className="mt-2 text-xl font-bold text-foreground">Здоровье клиентской базы</h2>
            </div>
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-600">
              <TrendingUp size={20} />
            </div>
          </div>

          <div className="mt-8 grid gap-6 sm:grid-cols-[180px_1fr] sm:items-center">
            <div
              className="mx-auto flex h-40 w-40 items-center justify-center rounded-full"
              style={{
                background: `conic-gradient(hsl(var(--primary)) ${activeShare}%, hsl(var(--muted)) 0)`,
              }}
            >
              <div className="flex h-28 w-28 flex-col items-center justify-center rounded-full bg-card">
                <span className="text-3xl font-extrabold text-foreground">{activeShare}%</span>
                <span className="text-xs text-muted-foreground">активны</span>
              </div>
            </div>
            <div className="space-y-3">
              {[
                { label: 'Активные рестораны', value: stats?.activeRestaurants ?? 0, color: 'bg-primary' },
                { label: 'Всего подключено', value: stats?.totalRestaurants ?? 0, color: 'bg-foreground' },
                { label: 'Заказов обработано', value: stats?.totalOrders ?? 0, color: 'bg-emerald-500' },
              ].map((item) => (
                <div key={item.label} className="flex items-center gap-3 rounded-2xl bg-background/70 p-3">
                  <span className={`h-3 w-3 rounded-full ${item.color}`} />
                  <span className="flex-1 text-sm text-muted-foreground">{item.label}</span>
                  <span className="text-sm font-extrabold text-foreground">{item.value}</span>
                </div>
              ))}
            </div>
          </div>
        </article>

        <article className="overflow-hidden rounded-3xl bg-[#211914] p-6 text-white shadow-2xl sm:p-8">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-brand-300">Быстрый доступ</p>
              <h2 className="mt-2 text-xl font-bold">Управление платформой</h2>
            </div>
            <Sparkles className="text-brand-300" size={20} />
          </div>
          <div className="mt-7 space-y-3">
            {[
              { href: '/super/restaurants', icon: Building2, label: 'Рестораны', text: 'Клиенты и статусы' },
              { href: '/super/subscriptions', icon: CreditCard, label: 'Подписки', text: 'Доступ и продления' },
              { href: '/super/plans', icon: Layers3, label: 'Тарифы', text: 'Планы и возможности' },
            ].map(({ href, icon: Icon, label, text }) => (
              <Link
                key={href}
                href={href}
                className="group flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.06] p-3 hover:border-brand-400/40 hover:bg-white/[0.1]"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10 text-brand-300">
                  <Icon size={18} />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-bold">{label}</p>
                  <p className="text-xs text-white/50">{text}</p>
                </div>
                <ArrowUpRight size={16} className="text-white/40 group-hover:text-brand-300" />
              </Link>
            ))}
          </div>
        </article>
      </section>
    </div>
  )
}
