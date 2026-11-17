'use client'

import { use, useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { CheckCircle2, ChefHat, Clock3, Package, Utensils } from 'lucide-react'
import { useSocket } from '@/hooks/useSocket'
import { formatPrice } from '@/lib/utils'

const guestApi = {
  async get(path: string) {
    const base = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000').replace(/\/$/, '')
    const res = await fetch(`${base}/api/v1${path}`)
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
    return res.json()
  },
}

interface OrderItem {
  id: string
  itemNameSnapshot: string
  quantity: number
  itemPriceSnapshot: number
  comment?: string | null
}

interface OrderStatus {
  id: string
  orderNumber: number
  status: string
  totalAmount: number
  customerComment?: string | null
  items: OrderItem[]
  createdAt: string
  updatedAt?: string | null
}

const STATUS_STEPS: { status: string; label: string; icon: typeof Clock3 }[] = [
  { status: 'new', label: 'Принят', icon: Clock3 },
  { status: 'accepted', label: 'Готовится', icon: ChefHat },
  { status: 'cooking', label: 'На кухне', icon: Utensils },
  { status: 'ready', label: 'Готов', icon: Package },
  { status: 'served', label: 'Подан', icon: CheckCircle2 },
]

const STATUS_INDEX: Record<string, number> = {
  new: 0, accepted: 1, cooking: 2, ready: 3, served: 4, paid: 4,
}

const STATUS_MESSAGES: Record<string, string> = {
  new: 'Ваш заказ принят и ожидает подтверждения',
  accepted: 'Заказ передан на кухню',
  cooking: 'Повара готовят ваш заказ',
  ready: 'Заказ готов! Официант уже несёт его к вам',
  served: 'Приятного аппетита!',
  paid: 'Оплата получена. Спасибо!',
  cancelled: 'Заказ был отменён',
}

export default function OrderTrackingPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params)
  const [status, setStatus] = useState<string | null>(null)
  const { on } = useSocket({ orderToken: token })

  const { data: order, isLoading, isError } = useQuery<OrderStatus>({
    queryKey: ['order', token],
    queryFn: () => guestApi.get(`/public/orders/${token}/status`),
    refetchInterval: status === 'served' || status === 'paid' || status === 'cancelled' ? false : 15_000,
  })

  useEffect(() => {
    if (order) setStatus(order.status)
  }, [order])

  useEffect(() => {
    const offAccepted = on('order_accepted', () => setStatus('accepted'))
    const offCooking = on('order_cooking', () => setStatus('cooking'))
    const offReady = on('order_ready', () => setStatus('ready'))
    const offServed = on('order_served', () => setStatus('served'))
    const offPaid = on('order_paid', () => setStatus('paid'))
    return () => { offAccepted(); offCooking(); offReady(); offServed(); offPaid() }
  }, [on])

  const currentStatus = status ?? order?.status ?? 'new'
  const currentIndex = STATUS_INDEX[currentStatus] ?? 0

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="space-y-3 w-full max-w-sm px-4">
          <div className="skeleton h-8 w-48 mx-auto rounded-xl" />
          <div className="skeleton h-32 rounded-2xl" />
          <div className="skeleton h-48 rounded-2xl" />
        </div>
      </div>
    )
  }

  if (isError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="text-center space-y-3 max-w-xs">
          <div className="text-4xl">😕</div>
          <h1 className="text-xl font-bold text-foreground">Заказ не найден</h1>
          <p className="text-muted-foreground text-sm">Проверьте ссылку или отсканируйте QR-код заново</p>
        </div>
      </div>
    )
  }

  if (currentStatus === 'cancelled') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="text-center space-y-3 max-w-xs">
          <div className="text-4xl">❌</div>
          <h1 className="text-xl font-bold text-foreground">Заказ отменён</h1>
          <p className="text-muted-foreground text-sm">Обратитесь к официанту за помощью</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background pb-10">
      <header className="bg-card border-b border-border px-4 py-4 sticky top-0 z-10">
        <div className="max-w-md mx-auto flex items-center justify-between">
          <div>
            <p className="text-xs text-muted-foreground">Заказ #{order?.orderNumber}</p>
            <h1 className="text-lg font-extrabold text-foreground">Отслеживание заказа</h1>
          </div>
          <div className="text-right">
            <p className="text-xs text-muted-foreground">Сумма</p>
            <p className="text-lg font-bold text-primary">{formatPrice(order?.totalAmount ?? 0)}</p>
          </div>
        </div>
      </header>

      <div className="max-w-md mx-auto px-4 space-y-5 pt-5">
        {/* Status message */}
        <motion.div
          key={currentStatus}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          className={`rounded-2xl p-5 text-center ${
            currentStatus === 'served' || currentStatus === 'paid'
              ? 'bg-emerald-500/10 border border-emerald-500/20'
              : 'bg-primary/5 border border-primary/15'
          }`}
        >
          <p className="text-base font-semibold text-foreground">
            {STATUS_MESSAGES[currentStatus] ?? 'Обрабатываем заказ...'}
          </p>
        </motion.div>

        {/* Progress steps */}
        {currentStatus !== 'paid' && (
          <div className="bg-card border border-border rounded-2xl p-5">
            <div className="flex items-center justify-between relative">
              <div className="absolute left-0 right-0 top-5 h-0.5 bg-border mx-10" />
              <div
                className="absolute left-0 top-5 h-0.5 bg-primary mx-10 transition-all duration-500"
                style={{ width: `${(currentIndex / (STATUS_STEPS.length - 1)) * 100}%` }}
              />
              {STATUS_STEPS.map((step, idx) => {
                const Icon = step.icon
                const done = idx <= currentIndex
                return (
                  <div key={step.status} className="flex flex-col items-center gap-2 z-10">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center border-2 transition-all ${
                      done ? 'bg-primary border-primary text-white' : 'bg-background border-border text-muted-foreground'
                    }`}>
                      <Icon size={18} />
                    </div>
                    <span className={`text-[10px] font-semibold text-center leading-tight ${done ? 'text-primary' : 'text-muted-foreground'}`}>
                      {step.label}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Order items */}
        <div className="bg-card border border-border rounded-2xl overflow-hidden">
          <div className="px-4 py-3 border-b border-border">
            <h2 className="text-sm font-bold text-foreground">Состав заказа</h2>
          </div>
          <div className="divide-y divide-border">
            {order?.items.map((item) => (
              <div key={item.id} className="px-4 py-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="flex h-6 min-w-6 items-center justify-center rounded-md bg-primary/10 text-xs font-bold text-primary px-1">
                    {item.quantity}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{item.itemNameSnapshot}</p>
                    {item.comment && (
                      <p className="text-xs text-amber-500 mt-0.5">{item.comment}</p>
                    )}
                  </div>
                </div>
                <span className="text-sm font-semibold text-foreground whitespace-nowrap">
                  {formatPrice(item.itemPriceSnapshot * item.quantity)}
                </span>
              </div>
            ))}
          </div>
          {order?.customerComment && (
            <div className="px-4 py-3 border-t border-border bg-muted/40">
              <p className="text-xs text-muted-foreground">Комментарий: {order.customerComment}</p>
            </div>
          )}
          <div className="px-4 py-3 border-t border-border flex items-center justify-between">
            <span className="text-sm font-medium text-muted-foreground">Итого</span>
            <span className="text-base font-bold text-foreground">{formatPrice(order?.totalAmount ?? 0)}</span>
          </div>
        </div>
      </div>
    </div>
  )
}
