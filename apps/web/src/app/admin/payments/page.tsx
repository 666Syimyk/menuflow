'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { api } from '@/lib/api'
import { formatDate } from '@/lib/utils'
import { useFormatPrice } from '@/hooks/useCurrency'
import { CreditCard } from 'lucide-react'

interface Payment {
  id: string
  amount: number
  method: string
  status: string
  createdAt: string
}

interface DailyReport {
  total: number
  count: number
  byMethod: Record<string, number>
  payments: Payment[]
}

const METHOD_LABELS: Record<string, string> = {
  cash: 'Наличные',
  card: 'Карта',
  qr: 'QR-код',
  other: 'Другое',
}

const STATUS_LABELS: Record<string, string> = {
  paid: 'Оплачено',
  pending: 'В ожидании',
  cancelled: 'Отменена',
}

const STATUS_COLORS: Record<string, string> = {
  paid: 'text-emerald-500 bg-emerald-500/10',
  pending: 'text-amber-500 bg-amber-500/10',
  cancelled: 'text-red-500 bg-red-500/10',
}

export default function PaymentsPage() {
  const today = new Date().toISOString().split('T')[0]
  const [date, setDate] = useState(today)
  const fmt = useFormatPrice()

  const { data, isLoading } = useQuery<DailyReport>({
    queryKey: ['admin', 'payments', 'daily', date],
    queryFn: () => api.get(`/payments/daily?date=${date}`) as unknown as Promise<DailyReport>,
  })

  const payments = data?.payments ?? []

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Оплаты</h1>
          <p className="text-muted-foreground text-sm mt-0.5">История платежей по дням</p>
        </div>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="h-9 px-3 bg-input border border-border rounded-xl text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-card border border-border rounded-2xl p-5">
          <p className="text-sm text-muted-foreground">Выручка за день</p>
          <p className="text-3xl font-bold text-emerald-500 mt-1">
            {isLoading ? '—' : fmt(data?.total ?? 0)}
          </p>
        </div>
        <div className="bg-card border border-border rounded-2xl p-5">
          <p className="text-sm text-muted-foreground">Оплат принято</p>
          <p className="text-3xl font-bold text-foreground mt-1">{isLoading ? '—' : data?.count ?? 0}</p>
        </div>
        <div className="bg-card border border-border rounded-2xl p-5">
          <p className="text-sm text-muted-foreground mb-2">По методам</p>
          {isLoading ? (
            <div className="skeleton h-8 w-32" />
          ) : (
            <div className="space-y-1">
              {Object.entries(data?.byMethod ?? {}).map(([method, amount]) => (
                <div key={method} className="flex justify-between text-sm">
                  <span className="text-muted-foreground">{METHOD_LABELS[method] ?? method}</span>
                  <span className="font-medium text-foreground">{fmt(amount)}</span>
                </div>
              ))}
              {Object.keys(data?.byMethod ?? {}).length === 0 && (
                <p className="text-sm text-muted-foreground">Нет данных</p>
              )}
            </div>
          )}
        </div>
      </div>

      <div>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
          Транзакции
        </h2>
        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => <div key={i} className="skeleton h-14 rounded-xl" />)}
          </div>
        ) : payments.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <CreditCard size={40} className="mx-auto mb-3 opacity-20" />
            <p>Оплат за этот день нет</p>
          </div>
        ) : (
          <div className="space-y-2">
            {payments.map((payment, i) => (
              <motion.div
                key={payment.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.03 }}
                className="flex items-center gap-4 p-4 bg-card border border-border rounded-xl"
              >
                <div className="w-10 h-10 rounded-full bg-emerald-500/10 flex items-center justify-center flex-shrink-0">
                  <CreditCard size={18} className="text-emerald-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs text-muted-foreground">{METHOD_LABELS[payment.method] ?? payment.method}</span>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-md ${STATUS_COLORS[payment.status] ?? 'bg-muted text-muted-foreground'}`}>
                      {STATUS_LABELS[payment.status] ?? payment.status}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">{formatDate(payment.createdAt, 'long')}</p>
                </div>
                <span className="font-bold text-foreground text-lg">{fmt(payment.amount)}</span>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
