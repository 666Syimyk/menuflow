'use client'

import { useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import { Check, ChefHat, Clock3, Flame, Minus, TimerReset, Utensils, X } from 'lucide-react'
import { api } from '@/lib/api'
import { useSocket } from '@/hooks/useSocket'
import { timeAgo } from '@/lib/utils'
import { useT } from '@/hooks/useT'
import toast from 'react-hot-toast'

interface OrderItem {
  id: string
  quantity: number
  itemNameSnapshot: string
  comment?: string | null
  isCancelled?: boolean
}

interface Order {
  id: string
  orderNumber: number
  tableNumber: number | null
  status: string
  createdAt: string
  customerComment?: string | null
  items: OrderItem[]
}

export default function KitchenPage() {
  const queryClient = useQueryClient()
  const { on, connected } = useSocket()
  const t = useT()

  const { data: orders = [], isLoading } = useQuery<Order[]>({
    queryKey: ['kitchen', 'orders'],
    queryFn: () => api.get('/kitchen/orders'),
    select: (d: unknown) => Array.isArray(d) ? d as Order[] : [],
    refetchInterval: 15_000,
  })

  useEffect(() => {
    const offNew = on('new_order', () => {
      queryClient.invalidateQueries({ queryKey: ['kitchen', 'orders'] })
      try { new Audio('/sounds/new-order.mp3').play() } catch {}
      toast(t.kitchen_new_order_toast, { duration: 3000 })
    })
    const offCancelled = on('order_cancelled', () => {
      queryClient.invalidateQueries({ queryKey: ['kitchen', 'orders'] })
    })
    const offItemCancelled = on('order_item_cancelled', () => {
      queryClient.invalidateQueries({ queryKey: ['kitchen', 'orders'] })
    })
    return () => { offNew(); offCancelled(); offItemCancelled() }
  }, [on, queryClient, t])

  async function updateStatus(orderId: string, status: string) {
    await api.patch(`/kitchen/orders/${orderId}/status`, { status })
    queryClient.invalidateQueries({ queryKey: ['kitchen', 'orders'] })
  }

  async function cancelItem(orderId: string, itemId: string) {
    await api.patch(`/kitchen/orders/${orderId}/items/${itemId}/cancel`, {})
    queryClient.invalidateQueries({ queryKey: ['kitchen', 'orders'] })
  }

  const acceptedOrders = orders.filter((o) => o.status === 'accepted' || o.status === 'ACCEPTED')
  const cookingOrders = orders.filter((o) => o.status === 'cooking' || o.status === 'COOKING')
  const readyOrders = orders.filter((o) => o.status === 'ready' || o.status === 'READY')

  return (
    <div className="flex min-h-screen flex-col p-4 sm:p-6">
      <header className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-white shadow-lg shadow-primary/20">
            <ChefHat size={26} />
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-primary">{t.kitchen_eyebrow}</p>
            <h1 className="mt-1 text-2xl font-extrabold text-foreground">{t.kitchen_title}</h1>
            <p className="text-sm text-muted-foreground">{orders.length} {t.kitchen_active_orders}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3">
          <span className={`h-2.5 w-2.5 rounded-full ${connected ? 'bg-emerald-500 shadow-[0_0_6px_2px_rgba(16,185,129,0.45)] animate-pulse' : 'bg-red-500'}`} />
          <div>
            <p className="text-xs font-bold text-foreground">{connected ? t.kitchen_sync_on : 'Нет соединения'}</p>
            <p className="text-[10px] text-muted-foreground">{connected ? t.kitchen_auto_update : 'Переподключение...'}</p>
          </div>
        </div>
      </header>

      <div className="grid flex-1 gap-4 lg:grid-cols-3">
        <KitchenColumn
          title={t.kitchen_col_new}
          subtitle={t.kitchen_col_new_sub}
          count={acceptedOrders.length}
          icon={TimerReset}
          tone="blue"
          orders={acceptedOrders}
          isLoading={isLoading}
          action={{ label: t.kitchen_btn_accept, fn: (id) => updateStatus(id, 'cooking') }}
          onCancel={(id) => updateStatus(id, 'cancelled')}
          onCancelItem={cancelItem}
          cancelLabel={t.kitchen_btn_cancel}
          emptyLabel={t.kitchen_empty}
          emptySub={t.kitchen_empty_sub}
          tableLabel={t.table}
          orderLabel={t.order}
          commentLabel={t.comment}
        />
        <KitchenColumn
          title={t.kitchen_col_cooking}
          subtitle={t.kitchen_col_cooking_sub}
          count={cookingOrders.length}
          icon={Flame}
          tone="amber"
          orders={cookingOrders}
          isLoading={isLoading}
          action={{ label: t.kitchen_btn_ready, fn: (id) => updateStatus(id, 'ready') }}
          onCancel={(id) => updateStatus(id, 'cancelled')}
          onCancelItem={cancelItem}
          cancelLabel={t.kitchen_btn_cancel}
          emptyLabel={t.kitchen_empty}
          emptySub={t.kitchen_empty_sub}
          tableLabel={t.table}
          orderLabel={t.order}
          commentLabel={t.comment}
        />
        <KitchenColumn
          title={t.kitchen_col_ready}
          subtitle={t.kitchen_col_ready_sub}
          count={readyOrders.length}
          icon={Check}
          tone="emerald"
          orders={readyOrders}
          isLoading={isLoading}
          emptyLabel={t.kitchen_empty}
          emptySub={t.kitchen_empty_sub}
          tableLabel={t.table}
          orderLabel={t.order}
          commentLabel={t.comment}
        />
      </div>
    </div>
  )
}

const columnStyles = {
  blue: {
    shell: 'border-blue-500/20 bg-blue-500/[0.035]',
    icon: 'bg-blue-500/10 text-blue-400',
    count: 'bg-blue-500 text-white',
    button: 'bg-blue-500 hover:bg-blue-400',
  },
  amber: {
    shell: 'border-amber-500/20 bg-amber-500/[0.035]',
    icon: 'bg-amber-500/10 text-amber-400',
    count: 'bg-amber-500 text-white',
    button: 'bg-emerald-500 hover:bg-emerald-400',
  },
  emerald: {
    shell: 'border-emerald-500/20 bg-emerald-500/[0.035]',
    icon: 'bg-emerald-500/10 text-emerald-400',
    count: 'bg-emerald-500 text-white',
    button: '',
  },
}

function KitchenColumn({
  title, subtitle, count, icon: Icon, tone, orders, isLoading, action, onCancel, onCancelItem, cancelLabel,
  emptyLabel, emptySub, tableLabel, orderLabel, commentLabel,
}: {
  title: string
  subtitle: string
  count: number
  icon: typeof Clock3
  tone: keyof typeof columnStyles
  orders: Order[]
  isLoading: boolean
  action?: { label: string; fn: (id: string) => void }
  onCancel?: (id: string) => void
  onCancelItem?: (orderId: string, itemId: string) => void
  cancelLabel?: string
  emptyLabel: string
  emptySub: string
  tableLabel: string
  orderLabel: string
  commentLabel: string
}) {
  const styles = columnStyles[tone]

  return (
    <section className={`flex min-h-[420px] flex-col overflow-hidden rounded-3xl border ${styles.shell}`}>
      <header className="flex items-center gap-3 border-b border-border/60 p-4">
        <div className={`flex h-11 w-11 items-center justify-center rounded-2xl ${styles.icon}`}>
          <Icon size={21} />
        </div>
        <div className="flex-1">
          <h2 className="text-base font-extrabold text-foreground">{title}</h2>
          <p className="text-xs text-muted-foreground">{subtitle}</p>
        </div>
        <span className={`flex h-8 min-w-8 items-center justify-center rounded-xl px-2 text-sm font-extrabold ${styles.count}`}>
          {count}
        </span>
      </header>

      <div className="flex-1 space-y-3 overflow-y-auto p-3">
        <AnimatePresence>
          {isLoading
            ? [1, 2].map((item) => <div key={item} className="skeleton h-48 rounded-2xl" />)
            : orders.map((order) => (
                <motion.article
                  key={order.id}
                  layout
                  initial={{ opacity: 0, scale: 0.97 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.97 }}
                  className="overflow-hidden rounded-2xl border border-border bg-card"
                >
                  <div className="flex items-center justify-between border-b border-border/70 px-4 py-3">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                        {order.tableNumber ? tableLabel : orderLabel}
                      </p>
                      <p className="text-2xl font-black text-foreground">
                        {order.tableNumber ? `№ ${order.tableNumber}` : `#${order.orderNumber}`}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 rounded-xl bg-muted px-2.5 py-1.5 text-xs font-semibold text-muted-foreground">
                      <Clock3 size={13} />
                      {timeAgo(order.createdAt)}
                    </div>
                  </div>

                  <div className="space-y-3 p-4">
                    {order.items.map((item) => (
                      <div key={item.id} className={`flex items-start gap-3 ${item.isCancelled ? 'opacity-40' : ''}`}>
                        <span className={`flex h-7 min-w-7 items-center justify-center rounded-lg px-1 text-sm font-black ${item.isCancelled ? 'bg-red-500/10 text-red-400 line-through' : 'bg-primary/10 text-primary'}`}>
                          {item.quantity}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className={`text-base font-bold leading-6 ${item.isCancelled ? 'text-muted-foreground line-through' : 'text-foreground'}`}>
                            {item.itemNameSnapshot}
                          </p>
                          {item.comment && (
                            <p className="mt-1 rounded-lg bg-amber-500/10 px-2 py-1 text-xs font-semibold text-amber-400">
                              {item.comment}
                            </p>
                          )}
                        </div>
                        {onCancelItem && !item.isCancelled && (
                          <button
                            onClick={() => onCancelItem(order.id, item.id)}
                            className="mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg border border-red-500/30 bg-red-500/10 text-red-500 hover:bg-red-500/20 active:scale-90"
                            title="Убрать одну порцию"
                          >
                            <Minus size={13} />
                          </button>
                        )}
                      </div>
                    ))}

                    {order.customerComment && (
                      <div className="rounded-xl border border-border bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
                        {commentLabel}: {order.customerComment}
                      </div>
                    )}

                    {action && (
                      <button
                        onClick={() => action.fn(order.id)}
                        className={`mt-1 flex h-12 w-full items-center justify-center gap-2 rounded-xl text-sm font-extrabold text-white active:scale-[0.98] ${styles.button}`}
                      >
                        <Utensils size={17} />
                        {action.label}
                      </button>
                    )}
                    {onCancel && (
                      <button
                        onClick={() => onCancel(order.id)}
                        className="mt-1 flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 text-sm font-semibold text-red-500 active:scale-[0.98] hover:bg-red-500/20"
                      >
                        <X size={15} />
                        {cancelLabel}
                      </button>
                    )}
                  </div>
                </motion.article>
              ))}
        </AnimatePresence>

        {!isLoading && orders.length === 0 && (
          <div className="flex min-h-52 flex-col items-center justify-center text-center">
            <div className={`flex h-14 w-14 items-center justify-center rounded-2xl ${styles.icon}`}>
              <Check size={24} />
            </div>
            <p className="mt-3 text-sm font-bold text-foreground">{emptyLabel}</p>
            <p className="mt-1 text-xs text-muted-foreground">{emptySub}</p>
          </div>
        )}
      </div>
    </section>
  )
}
