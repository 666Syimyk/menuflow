'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Activity,
  ArrowLeft,
  Ban,
  CalendarClock,
  CheckCircle2,
  ChefHat,
  Clock3,
  Copy,
  CreditCard,
  ExternalLink,
  KeyRound,
  LayoutDashboard,
  Loader2,
  LogIn,
  MessageSquareText,
  ReceiptText,
  RefreshCw,
  Settings,
  ShieldCheck,
  Store,
  Table2,
  UserRoundCog,
  Users,
  WalletCards,
  X,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import toast from 'react-hot-toast'
import { api } from '@/lib/api'
import { formatPrice } from '@/lib/utils'

type Session = {
  id: string
  sessionId: string
  isActive: boolean
  ipAddress?: string
  userAgent?: string
  createdAt: string
  lastSeenAt: string
  logoutAt?: string
  revokedAt?: string
  expiresAt: string
  endReason?: string
  status?: string
  role?: string
  user?: RestaurantUser
}

type RestaurantUser = {
  id: string
  name: string
  login: string
  email?: string
  phone?: string
  role: string
  isActive: boolean
  createdAt: string
  lastLogin?: Session | null
  activeSessionCount: number
  loginCountLast14Days: number
}

type Restaurant = {
  id: string
  name: string
  slug: string
  phone?: string
  address?: string
  city?: string
  currency: string
  language: string
  status: string
  adminLimit: number
  adminSessionPolicy: string
  subscriptionEndsAt?: string
  allowOrders: boolean
  allowWaiterCalls: boolean
  allowBillRequests: boolean
  createdAt: string
  tariff?: { id: string; name: string; limits?: Record<string, number> }
  subscriptions?: Array<{ id: string; startsAt: string; endsAt: string; status: string; plan: { name: string } }>
}

type Detail = {
  restaurant: Restaurant
  lastActivity: {
    lastOrder?: { id: string; createdAt: string; status: string }
    lastCall?: { id: string; createdAt: string; type: string }
    lastFeedback?: { id: string; createdAt: string; rating: number }
    lastAdminLogin?: Session
    lastStaffLogin?: Session
  }
}

type Summary = {
  adminsCount: number
  adminLimit: number
  staffCount: number
  waitersCount: number
  cooksCount: number
  cashiersCount: number
  tablesCount: number
  activeTablesCount: number
  inactiveTablesCount: number
  ordersTotal: number
  ordersToday: number
  ordersLast14Days: number
  paymentsToday: number
  paymentsLast14Days: number
  unpaidOrders: number
  lastAdminLogin?: Session
  lastStaffLogin?: Session
  loginsLast14Days: number
}

type RestaurantTable = {
  id: string
  number: number
  isActive: boolean
  createdAt: string
  hall?: { name: string }
  qrCodes: Array<{ token: string }>
  _count: { orders: number }
  orders: Array<{ id: string; createdAt: string; status: string }>
}

type RestaurantOrder = {
  id: string
  status: string
  total: string | number
  createdAt: string
  updatedAt: string
  table: { number: number }
  waiter?: { name: string }
  payments: Array<{ status: string; amount: string | number; method: string }>
  statusHistory: Array<{ createdAt: string }>
}

type Payment = {
  id: string
  amount: string | number
  method: string
  status: string
  createdAt: string
  createdById?: string
  createdBy?: { name: string; login: string }
  order: { id: string; table: { number: number } }
}

type PaymentsResponse = {
  items: Payment[]
  stats: { total: number; today: number; last14Days: number; unpaidOrders: number; paidOrders: number }
}

type Feedback = {
  id: string
  rating: number
  comment?: string
  isReviewed: boolean
  createdAt: string
  order?: { id: string; table: { number: number } }
}

type ActivityLog = {
  id: string
  action: string
  entity: string
  entityId?: string
  ipAddress?: string
  userAgent?: string
  createdAt: string
  user?: { name: string; login: string; role: string }
}

type SubscriptionResponse = {
  restaurantStatus: string
  adminLimit: number
  daysRemaining: number
  current?: { startsAt: string; endsAt: string; status: string; plan: { name: string; limits?: Record<string, number> } }
  history: Array<{ id: string; startsAt: string; endsAt: string; status: string; plan: { name: string } }>
}

const tabs = [
  ['overview', 'Обзор', LayoutDashboard],
  ['admins', 'Администраторы', UserRoundCog],
  ['staff', 'Сотрудники', Users],
  ['tables', 'Столики', Table2],
  ['orders', 'Заказы', ReceiptText],
  ['payments', 'Оплаты', WalletCards],
  ['feedback', 'Отзывы', MessageSquareText],
  ['login-history', 'История входов', LogIn],
  ['activity-logs', 'Activity Logs', Activity],
  ['subscription', 'Подписка и тариф', CalendarClock],
  ['settings', 'Настройки', Settings],
] as const

type TabId = (typeof tabs)[number][0]

const statusLabels: Record<string, string> = {
  ACTIVE: 'Активен', TRIAL: 'Пробный', BLOCKED: 'Заблокирован', EXPIRED: 'Истёк',
  INACTIVE: 'Неактивен', NEW: 'Новый', COOKING: 'Готовится', READY: 'Готов',
  SERVED: 'Подан', PAID: 'Оплачен', CANCELLED: 'Отменён', COMPLETED: 'Завершён',
}

const roleLabels: Record<string, string> = {
  ADMIN: 'Администратор', WAITER: 'Официант', COOK: 'Повар', CASHIER: 'Кассир',
}

function dt(value?: string | Date | null) {
  if (!value) return 'Нет данных'
  return new Intl.DateTimeFormat('ru-RU', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}

function Badge({ value }: { value: string }) {
  const danger = ['BLOCKED', 'EXPIRED', 'CANCELLED', 'revoked', 'expired'].includes(value)
  const success = ['ACTIVE', 'COMPLETED', 'PAID', 'active'].includes(value)
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${danger ? 'bg-red-500/10 text-red-600' : success ? 'bg-emerald-500/10 text-emerald-600' : 'bg-primary/10 text-primary'}`}>{statusLabels[value] ?? value}</span>
}

function Empty({ text }: { text: string }) {
  return <div className="rounded-2xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">{text}</div>
}

function StatCard({ icon: Icon, label, value, note }: { icon: LucideIcon; label: string; value: string; note: string }) {
  return (
    <article className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary"><Icon size={18} /></span><p className="text-sm font-semibold text-muted-foreground">{label}</p></div>
      <p className="mt-4 text-2xl font-extrabold text-foreground">{value}</p><p className="mt-1 text-xs text-muted-foreground">{note}</p>
    </article>
  )
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="rounded-2xl border border-border bg-card p-4 sm:p-5"><h3 className="mb-4 text-base font-bold text-foreground">{title}</h3>{children}</section>
}

export default function SuperRestaurantDetailsPage() {
  const { restaurantId } = useParams<{ restaurantId: string }>()
  const router = useRouter()
  const queryClient = useQueryClient()
  const [activeTab, setActiveTab] = useState<TabId>('overview')
  const [period, setPeriod] = useState('14d')
  const [filter, setFilter] = useState('ALL')
  const [oneTimePassword, setOneTimePassword] = useState<string | null>(null)

  const detail = useQuery<Detail>({ queryKey: ['super', 'restaurant', restaurantId], queryFn: () => api.get(`/super/restaurants/${restaurantId}`) as unknown as Promise<Detail> })
  const summary = useQuery<Summary>({ queryKey: ['super', 'restaurant', restaurantId, 'summary'], queryFn: () => api.get(`/super/restaurants/${restaurantId}/summary`) as unknown as Promise<Summary> })

  const endpoint = useMemo(() => {
    if (['overview', 'settings'].includes(activeTab)) return null
    const params = new URLSearchParams()
    if (['orders', 'payments', 'feedback', 'login-history', 'activity-logs'].includes(activeTab)) params.set('period', period)
    if (filter !== 'ALL' && ['staff', 'orders', 'feedback', 'login-history'].includes(activeTab)) {
      if (activeTab === 'staff') params.set(['ACTIVE', 'BLOCKED'].includes(filter) ? 'status' : 'role', filter)
      else if (activeTab === 'login-history') params.set(filter === 'active' ? 'status' : 'role', filter)
      else params.set('status', filter)
    }
    return `/super/restaurants/${restaurantId}/${activeTab}${params.size ? `?${params}` : ''}`
  }, [activeTab, filter, period, restaurantId])

  const tabData = useQuery<unknown>({ queryKey: ['super', 'restaurant-tab', endpoint], queryFn: () => api.get(endpoint!) as Promise<unknown>, enabled: Boolean(endpoint) })

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['super', 'restaurant', restaurantId] })
    queryClient.invalidateQueries({ queryKey: ['super', 'restaurant-tab'] })
    queryClient.invalidateQueries({ queryKey: ['super', 'restaurants'] })
  }

  const statusMutation = useMutation({
    mutationFn: (action: 'activate' | 'block') => api.post(`/super/restaurants/${restaurantId}/${action}`, {}),
    onSuccess: () => { invalidate(); toast.success('Статус ресторана обновлён') },
    onError: (error: Error) => toast.error(error.message),
  })
  const userAction = useMutation({
    mutationFn: ({ userId, action }: { userId: string; action: 'activate' | 'deactivate' | 'revoke-sessions' | 'reset-password' }) =>
      action === 'activate' || action === 'deactivate'
        ? api.patch(`/super/users/${userId}/${action}`, {})
        : api.post(`/super/users/${userId}/${action}`, {}),
    onSuccess: (result: unknown, variables) => {
      if (variables.action === 'reset-password') setOneTimePassword((result as { password: string }).password)
      else toast.success('Действие выполнено')
      invalidate()
    },
    onError: (error: Error) => toast.error(error.message),
  })
  const tableMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) => api.patch(`/super/restaurants/${restaurantId}/tables/${id}`, { isActive }),
    onSuccess: () => { invalidate(); toast.success('Статус столика обновлён') },
  })

  if (detail.isLoading || summary.isLoading) return <div className="space-y-4 p-6">{[1, 2, 3, 4].map((item) => <div key={item} className="skeleton h-24 rounded-2xl" />)}</div>
  if (detail.isError || !detail.data || !summary.data) return <div className="p-8"><Empty text="Не удалось загрузить ресторан." /></div>

  const restaurant = detail.data.restaurant
  const stats = summary.data
  const lastAdmin = stats.lastAdminLogin
  const lastStaff = stats.lastStaffLogin

  const renderUsers = (users: RestaurantUser[], adminsOnly: boolean) => users.length ? (
    <div className="overflow-x-auto"><table className="w-full min-w-[900px] text-left text-sm"><thead className="text-xs text-muted-foreground"><tr>{['Пользователь', 'Роль', 'Контакты', 'Статус', 'Последний вход', 'Сессии / 14 дней', 'Действия'].map((item) => <th key={item} className="border-b border-border px-3 py-3">{item}</th>)}</tr></thead><tbody>{users.map((user) => <tr key={user.id} className="border-b border-border/70 last:border-0"><td className="px-3 py-3"><p className="font-semibold">{user.name}</p><p className="text-xs text-muted-foreground">@{user.login}</p></td><td className="px-3 py-3">{roleLabels[user.role] ?? user.role}</td><td className="px-3 py-3 text-xs"><p>{user.email ?? '—'}</p><p>{user.phone ?? '—'}</p></td><td className="px-3 py-3"><Badge value={user.isActive ? 'ACTIVE' : 'BLOCKED'} /></td><td className="px-3 py-3 text-xs"><p>{dt(user.lastLogin?.createdAt)}</p><p className="text-muted-foreground">{user.lastLogin?.ipAddress ?? 'IP неизвестен'}</p></td><td className="px-3 py-3">{user.activeSessionCount} / {user.loginCountLast14Days}</td><td className="px-3 py-3"><div className="flex gap-1"><button title={user.isActive ? 'Деактивировать' : 'Активировать'} onClick={() => userAction.mutate({ userId: user.id, action: user.isActive ? 'deactivate' : 'activate' })} className="rounded-lg border border-border p-2">{user.isActive ? <Ban size={14} /> : <CheckCircle2 size={14} />}</button>{adminsOnly && <><button title="Завершить сессии" onClick={() => userAction.mutate({ userId: user.id, action: 'revoke-sessions' })} className="rounded-lg border border-border p-2"><X size={14} /></button><button title="Сбросить пароль" onClick={() => userAction.mutate({ userId: user.id, action: 'reset-password' })} className="rounded-lg border border-border p-2"><KeyRound size={14} /></button></>}</div></td></tr>)}</tbody></table></div>
  ) : <Empty text="Пользователи не найдены." />

  function renderTab() {
    if (activeTab === 'overview') return <Overview detail={detail.data!} summary={stats} />
    if (activeTab === 'settings') return <SettingsTab restaurant={restaurant} onSaved={invalidate} />
    if (tabData.isLoading) return <div className="skeleton h-64 rounded-2xl" />
    if (tabData.isError) return <Empty text="Не удалось загрузить данные этого раздела." />
    if (activeTab === 'admins') return renderUsers((tabData.data ?? []) as RestaurantUser[], true)
    if (activeTab === 'staff') return renderUsers((tabData.data ?? []) as RestaurantUser[], false)
    if (activeTab === 'tables') {
      const rows = (tabData.data ?? []) as RestaurantTable[]
      return rows.length ? <div className="grid gap-3 lg:grid-cols-2">{rows.map((table) => { const token = table.qrCodes[0]?.token; return <article key={table.id} className="rounded-2xl border border-border bg-card p-4"><div className="flex items-center justify-between"><div><p className="font-bold">Стол №{table.number}</p><p className="text-xs text-muted-foreground">{table.hall?.name ?? 'Без зала'} · {table._count.orders} заказов</p></div><Badge value={table.isActive ? 'ACTIVE' : 'INACTIVE'} /></div><p className="mt-3 text-xs text-muted-foreground">Последний заказ: {dt(table.orders[0]?.createdAt)}</p><div className="mt-3 flex gap-2">{token && <a href={`/m/${token}`} target="_blank" className="flex items-center gap-1 rounded-lg border border-border px-3 py-2 text-xs"><ExternalLink size={13} /> Открыть QR</a>}<button onClick={() => tableMutation.mutate({ id: table.id, isActive: !table.isActive })} className="rounded-lg border border-border px-3 py-2 text-xs">{table.isActive ? 'Отключить' : 'Активировать'}</button></div></article> })}</div> : <Empty text="Столиков пока нет." />
    }
    if (activeTab === 'orders') {
      const rows = (tabData.data ?? []) as RestaurantOrder[]
      return rows.length ? <SimpleTable headers={['Заказ', 'Стол', 'Статус', 'Оплата', 'Сумма', 'Обработал', 'Создан / обновлён']} rows={rows.map((order) => [order.id.slice(-8), `№${order.table.number}`, <Badge key="s" value={order.status} />, order.payments.some((payment) => payment.status === 'COMPLETED') ? 'Оплачен' : 'Не оплачен', formatPrice(Number(order.total), restaurant.currency), order.waiter?.name ?? '—', <span key="d">{dt(order.createdAt)}<br />{dt(order.statusHistory[0]?.createdAt ?? order.updatedAt)}</span>])} /> : <Empty text="Заказов по выбранному фильтру нет." />
    }
    if (activeTab === 'payments') {
      const response = tabData.data as PaymentsResponse
      return <div className="space-y-4"><div className="grid gap-3 sm:grid-cols-5"><MiniStat label="Сегодня" value={formatPrice(response.stats.today, restaurant.currency)} /><MiniStat label="14 дней" value={formatPrice(response.stats.last14Days, restaurant.currency)} /><MiniStat label="Всего" value={formatPrice(response.stats.total, restaurant.currency)} /><MiniStat label="Оплачено" value={String(response.stats.paidOrders)} /><MiniStat label="Не оплачено" value={String(response.stats.unpaidOrders)} /></div>{response.items.length ? <SimpleTable headers={['Заказ', 'Стол', 'Сумма', 'Метод', 'Статус', 'Кто отметил', 'Дата']} rows={response.items.map((payment) => [payment.order.id.slice(-8), `№${payment.order.table.number}`, formatPrice(Number(payment.amount), restaurant.currency), payment.method, <Badge key="s" value={payment.status} />, payment.createdBy?.name ?? '—', dt(payment.createdAt)])} /> : <Empty text="Оплат пока нет." />}</div>
    }
    if (activeTab === 'feedback') {
      const rows = (tabData.data ?? []) as Feedback[]
      return rows.length ? <SimpleTable headers={['Оценка', 'Комментарий', 'Стол', 'Заказ', 'Дата', 'Обработка']} rows={rows.map((item) => [`${item.rating} ★`, item.comment ?? 'Без комментария', item.order ? `№${item.order.table.number}` : '—', item.order?.id.slice(-8) ?? '—', dt(item.createdAt), item.isReviewed ? 'Обработан' : 'Новый'])} /> : <Empty text="Отзывов нет." />
    }
    if (activeTab === 'login-history') {
      const rows = (tabData.data ?? []) as Session[]
      return rows.length ? <SimpleTable headers={['Пользователь', 'Роль / логин', 'Вход', 'Выход', 'Статус', 'IP / User Agent', 'Session ID', 'Причина']} rows={rows.map((session) => [session.user?.name ?? '—', `${roleLabels[session.role ?? session.user?.role ?? ''] ?? session.role} / @${session.user?.login ?? '—'}`, dt(session.createdAt), dt(session.logoutAt ?? session.revokedAt), <Badge key="s" value={session.status ?? 'expired'} />, <span key="ua">{session.ipAddress ?? '—'}<br /><span className="text-xs text-muted-foreground">{session.userAgent ?? '—'}</span></span>, <span key="sid" className="font-mono text-xs">{session.sessionId}</span>, session.endReason ?? '—'])} /> : <Empty text="Истории входов за выбранный период нет." />
    }
    if (activeTab === 'activity-logs') {
      const rows = (tabData.data ?? []) as ActivityLog[]
      return rows.length ? <SimpleTable headers={['Дата', 'Пользователь', 'Роль', 'Действие', 'Entity', 'IP', 'User Agent']} rows={rows.map((log) => [dt(log.createdAt), log.user?.name ?? 'Система', log.user ? roleLabels[log.user.role] ?? log.user.role : '—', log.action, `${log.entity}${log.entityId ? ` / ${log.entityId.slice(-8)}` : ''}`, log.ipAddress ?? '—', log.userAgent ?? '—'])} /> : <Empty text="Activity logs за выбранный период отсутствуют." />
    }
    if (activeTab === 'subscription') return <SubscriptionTab data={tabData.data as SubscriptionResponse} restaurantId={restaurantId} />
    return null
  }

  const showPeriod = ['orders', 'payments', 'feedback', 'login-history', 'activity-logs'].includes(activeTab)
  const filters = activeTab === 'staff' ? [['ALL', 'Все'], ['ADMIN', 'Администраторы'], ['WAITER', 'Официанты'], ['COOK', 'Повара'], ['ACTIVE', 'Активные'], ['BLOCKED', 'Заблокированные']] : activeTab === 'orders' ? [['ALL', 'Все'], ['NEW', 'Новые'], ['COOKING', 'Готовятся'], ['READY', 'Готовы'], ['SERVED', 'Поданы'], ['PAID', 'Оплачены'], ['CANCELLED', 'Отменены']] : activeTab === 'feedback' ? [['ALL', 'Все'], ['5', '5 звёзд'], ['4', '4 звезды'], ['LOW', '3 и ниже']] : activeTab === 'login-history' ? [['ALL', 'Все'], ['active', 'Активные'], ['ADMIN', 'Администраторы'], ['WAITER', 'Официанты'], ['COOK', 'Повара']] : []

  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8">
      <nav className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground"><Link href="/super">Супер-админ</Link><span>/</span><Link href="/super/restaurants">Рестораны</Link><span>/</span><span className="text-foreground">{restaurant.name}</span></nav>
      <header className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between"><div><button onClick={() => router.push('/super/restaurants')} className="mb-3 flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-primary"><ArrowLeft size={16} /> Назад к ресторанам</button><div className="flex flex-wrap items-center gap-3"><h1 className="text-3xl font-extrabold text-foreground">{restaurant.name}</h1><Badge value={restaurant.status} />{restaurant.tariff && <span className="rounded-full bg-violet-500/10 px-2.5 py-1 text-xs font-bold text-violet-600">{restaurant.tariff.name}</span>}</div><p className="mt-2 text-sm text-muted-foreground">/{restaurant.slug} · создан {dt(restaurant.createdAt)}</p></div><div className="flex flex-wrap gap-2"><button onClick={() => statusMutation.mutate('activate')} disabled={restaurant.status === 'ACTIVE'} className="flex h-10 items-center gap-2 rounded-xl border border-emerald-500/30 px-4 text-sm font-semibold text-emerald-600 disabled:opacity-40"><CheckCircle2 size={15} /> Активировать</button><button onClick={() => statusMutation.mutate('block')} disabled={restaurant.status === 'BLOCKED'} className="flex h-10 items-center gap-2 rounded-xl border border-red-500/30 px-4 text-sm font-semibold text-red-600 disabled:opacity-40"><Ban size={15} /> Заблокировать</button><button onClick={() => setActiveTab('settings')} className="flex h-10 items-center gap-2 rounded-xl border border-border px-4 text-sm font-semibold"><Settings size={15} /> Редактировать</button><Link href="/super/subscriptions" className="flex h-10 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground"><CreditCard size={15} /> Управлять тарифом</Link></div></header>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6"><StatCard icon={UserRoundCog} label="Администраторы" value={`${stats.adminsCount} / ${stats.adminLimit}`} note="создано / лимит" /><StatCard icon={Users} label="Сотрудники" value={String(stats.staffCount)} note={`${stats.waitersCount} официантов · ${stats.cooksCount} поваров · ${stats.cashiersCount} кассиров`} /><StatCard icon={Table2} label="Столики" value={String(stats.tablesCount)} note={`${stats.activeTablesCount} активных · ${stats.inactiveTablesCount} отключено`} /><StatCard icon={ReceiptText} label="Заказы" value={String(stats.ordersTotal)} note={`${stats.ordersToday} сегодня · ${stats.ordersLast14Days} за 14 дней`} /><StatCard icon={WalletCards} label="Оплаты" value={formatPrice(stats.paymentsToday, restaurant.currency)} note={`${formatPrice(stats.paymentsLast14Days, restaurant.currency)} за 14 дней · ${stats.unpaidOrders} не оплачено`} /><StatCard icon={Activity} label="Активность" value={String(stats.loginsLast14Days)} note={`Последний вход: ${lastAdmin?.user?.name ?? lastStaff?.user?.name ?? 'нет данных'}`} /></section>

      <div className="overflow-x-auto border-b border-border"><div className="flex min-w-max gap-1">{tabs.map(([id, label, Icon]) => <button key={id} onClick={() => { setActiveTab(id); setFilter('ALL'); setPeriod('14d') }} className={`flex items-center gap-2 border-b-2 px-3 py-3 text-sm font-semibold transition ${activeTab === id ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}><Icon size={15} />{label}</button>)}</div></div>
      {(showPeriod || filters.length > 0) && <div className="flex flex-wrap gap-2">{showPeriod && <select className="h-9 rounded-xl border border-border bg-card px-3 text-sm" value={period} onChange={(event) => setPeriod(event.target.value)}><option value="today">Сегодня</option><option value="14d">Последние 14 дней</option><option value="all">Всё время</option></select>}{filters.map(([value, label]) => <button key={value} onClick={() => setFilter(value)} className={`rounded-xl px-3 py-2 text-xs font-semibold ${filter === value ? 'bg-primary text-primary-foreground' : 'border border-border bg-card text-muted-foreground'}`}>{label}</button>)}</div>}
      {renderTab()}

      {oneTimePassword && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4"><div className="w-full max-w-md rounded-3xl bg-card p-6 shadow-2xl"><KeyRound className="text-primary" /><h2 className="mt-3 text-xl font-bold">Новый пароль</h2><p className="mt-1 text-sm text-muted-foreground">Он показывается только один раз.</p><div className="mt-4 flex items-center gap-2 rounded-xl border border-border p-3"><code className="flex-1 font-bold">{oneTimePassword}</code><button onClick={() => { navigator.clipboard.writeText(oneTimePassword); toast.success('Пароль скопирован') }}><Copy size={17} /></button></div><button onClick={() => setOneTimePassword(null)} className="mt-4 h-10 w-full rounded-xl bg-primary font-semibold text-primary-foreground">Закрыть</button></div></div>}
    </div>
  )
}

function Overview({ detail, summary }: { detail: Detail; summary: Summary }) {
  const r = detail.restaurant
  const rows = [['Телефон', r.phone ?? '—'], ['Адрес', [r.city, r.address].filter(Boolean).join(', ') || '—'], ['Slug', r.slug], ['Публичное меню', `/m/${r.slug}`], ['Создан', dt(r.createdAt)], ['Статус', statusLabels[r.status] ?? r.status], ['Тариф', r.tariff?.name ?? 'Не назначен'], ['Подписка до', dt(r.subscriptionEndsAt)], ['Валюта / язык', `${r.currency} / ${r.language}`], ['Администраторы', `${summary.adminsCount} / ${r.adminLimit}`], ['Политика входа', r.adminSessionPolicy]]
  const activity = [['Последний вход администратора', dt(detail.lastActivity.lastAdminLogin?.createdAt)], ['Последний вход сотрудника', dt(detail.lastActivity.lastStaffLogin?.createdAt)], ['Последний заказ', dt(detail.lastActivity.lastOrder?.createdAt)], ['Последний вызов официанта', dt(detail.lastActivity.lastCall?.createdAt)], ['Последний отзыв', dt(detail.lastActivity.lastFeedback?.createdAt)]]
  return <div className="grid gap-4 lg:grid-cols-2"><Panel title="Основные данные"><dl className="grid gap-3 sm:grid-cols-2">{rows.map(([label, value]) => <div key={label} className="rounded-xl bg-muted/45 p-3"><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-1 break-all text-sm font-semibold">{value}</dd></div>)}</dl></Panel><Panel title="Последняя активность"><div className="space-y-2">{activity.map(([label, value]) => <div key={label} className="flex items-center justify-between gap-3 rounded-xl bg-muted/45 p-3 text-sm"><span className="text-muted-foreground">{label}</span><strong className="text-right">{value}</strong></div>)}</div></Panel></div>
}

function SettingsTab({ restaurant, onSaved }: { restaurant: Restaurant; onSaved: () => void }) {
  const [form, setForm] = useState(restaurant)
  useEffect(() => setForm(restaurant), [restaurant])
  const mutation = useMutation({ mutationFn: () => api.patch(`/super/restaurants/${restaurant.id}/settings`, { name: form.name, phone: form.phone, address: form.address, city: form.city, slug: form.slug, currency: form.currency, language: form.language, status: form.status, adminLimit: Number(form.adminLimit), adminSessionPolicy: form.adminSessionPolicy, allowOrders: form.allowOrders, allowWaiterCalls: form.allowWaiterCalls, allowBillRequests: form.allowBillRequests }), onSuccess: () => { toast.success('Настройки сохранены'); onSaved() }, onError: (error: Error) => toast.error(error.message) })
  const set = (key: keyof Restaurant, value: string | number | boolean) => setForm((current) => ({ ...current, [key]: value }))
  return <Panel title="Настройки ресторана"><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{[['name', 'Название'], ['phone', 'Телефон'], ['address', 'Адрес'], ['city', 'Город'], ['slug', 'Slug']].map(([key, label]) => <label key={key} className="text-xs font-semibold">{label}<input value={String(form[key as keyof Restaurant] ?? '')} onChange={(event) => set(key as keyof Restaurant, event.target.value)} className="mt-1 h-10 w-full rounded-xl border border-border bg-input px-3 text-sm" /></label>)}<label className="text-xs font-semibold">Валюта<select value={form.currency} onChange={(event) => set('currency', event.target.value)} className="mt-1 h-10 w-full rounded-xl border border-border bg-input px-3 text-sm"><option>KGS</option><option>KZT</option><option>RUB</option><option>USD</option></select></label><label className="text-xs font-semibold">Язык<select value={form.language} onChange={(event) => set('language', event.target.value)} className="mt-1 h-10 w-full rounded-xl border border-border bg-input px-3 text-sm"><option value="ru">Русский</option><option value="ky">Кыргызский</option><option value="en">English</option></select></label><label className="text-xs font-semibold">Статус<select value={form.status} onChange={(event) => set('status', event.target.value)} className="mt-1 h-10 w-full rounded-xl border border-border bg-input px-3 text-sm">{['ACTIVE', 'TRIAL', 'BLOCKED', 'EXPIRED'].map((value) => <option key={value}>{value}</option>)}</select></label><label className="text-xs font-semibold">Лимит администраторов<input type="number" min={1} value={form.adminLimit} onChange={(event) => set('adminLimit', Number(event.target.value))} className="mt-1 h-10 w-full rounded-xl border border-border bg-input px-3 text-sm" /></label><label className="text-xs font-semibold sm:col-span-2">Политика входа<select value={form.adminSessionPolicy} onChange={(event) => set('adminSessionPolicy', event.target.value)} className="mt-1 h-10 w-full rounded-xl border border-border bg-input px-3 text-sm"><option value="deny_second_login">Запретить второй вход</option><option value="kick_previous_session">Завершать предыдущую сессию</option></select></label></div><div className="mt-5 grid gap-2 sm:grid-cols-3">{[['allowOrders', 'Разрешить заказы'], ['allowWaiterCalls', 'Разрешить вызов официанта'], ['allowBillRequests', 'Разрешить просьбу счёта']].map(([key, label]) => <label key={key} className="flex items-center gap-2 rounded-xl border border-border p-3 text-sm"><input type="checkbox" checked={Boolean(form[key as keyof Restaurant])} onChange={(event) => set(key as keyof Restaurant, event.target.checked)} />{label}</label>)}</div><button onClick={() => mutation.mutate()} disabled={mutation.isPending} className="mt-5 flex h-10 items-center gap-2 rounded-xl bg-primary px-5 text-sm font-bold text-primary-foreground">{mutation.isPending && <Loader2 className="animate-spin" size={15} />}Сохранить настройки</button></Panel>
}

function SubscriptionTab({ data, restaurantId }: { data: SubscriptionResponse; restaurantId: string }) {
  const current = data.current
  const limits = current?.plan.limits ?? {}
  return <div className="grid gap-4 lg:grid-cols-[0.8fr_1.2fr]"><Panel title="Текущая подписка">{current ? <div className="space-y-3"><div className="flex items-center justify-between"><strong className="text-xl">{current.plan.name}</strong><Badge value={current.status} /></div><p className="text-sm text-muted-foreground">{dt(current.startsAt)} — {dt(current.endsAt)}</p><p className="text-3xl font-extrabold text-primary">{data.daysRemaining} дней</p><div className="grid grid-cols-2 gap-2 text-sm"><MiniStat label="Столы" value={String(limits.tables ?? '—')} /><MiniStat label="Сотрудники" value={String(limits.staff ?? limits.users ?? '—')} /><MiniStat label="Администраторы" value={String(data.adminLimit)} /><MiniStat label="Блюда" value={String(limits.dishes ?? '—')} /></div><Link href={`/super/subscriptions?restaurantId=${restaurantId}`} className="flex h-10 items-center justify-center gap-2 rounded-xl bg-primary font-semibold text-primary-foreground"><RefreshCw size={15} /> Изменить или продлить</Link></div> : <Empty text="Подписка не назначена." />}</Panel><Panel title="История тарифов">{data.history.length ? <SimpleTable headers={['Тариф', 'Начало', 'Окончание', 'Статус']} rows={data.history.map((item) => [item.plan.name, dt(item.startsAt), dt(item.endsAt), <Badge key="s" value={item.status} />])} /> : <Empty text="История пуста." />}</Panel></div>
}

function MiniStat({ label, value }: { label: string; value: string }) { return <div className="rounded-xl bg-muted/50 p-3"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 font-bold">{value}</p></div> }

function SimpleTable({ headers, rows }: { headers: string[]; rows: React.ReactNode[][] }) {
  return <div className="overflow-x-auto rounded-2xl border border-border bg-card"><table className="w-full min-w-[850px] text-left text-sm"><thead><tr>{headers.map((header) => <th key={header} className="border-b border-border px-3 py-3 text-xs text-muted-foreground">{header}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={index} className="border-b border-border/70 last:border-0">{row.map((cell, cellIndex) => <td key={cellIndex} className="px-3 py-3 align-top">{cell}</td>)}</tr>)}</tbody></table></div>
}
