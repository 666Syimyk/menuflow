'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { api } from '@/lib/api'
import { timeAgo } from '@/lib/utils'
import { useFormatPrice } from '@/hooks/useCurrency'
import toast from 'react-hot-toast'
import { useState } from 'react'
import { Banknote, CreditCard, LogOut, ReceiptText, WalletCards } from 'lucide-react'
import { useAuthStore } from '@/stores/auth.store'
import { useT } from '@/hooks/useT'

interface OrderItem {
  id: string
  quantity: number
  itemNameSnapshot: string
}

interface Order {
  id: string
  orderNumber: number
  tableNumber: number | null
  status: string
  paymentStatus: string
  totalAmount: number
  createdAt: string
  items: OrderItem[]
}

export default function CashierPage() {
  const { user } = useAuthStore()
  const queryClient = useQueryClient()
  const fmt = useFormatPrice()
  const [payingOrder, setPayingOrder] = useState<Order | null>(null)
  const [method, setMethod] = useState('cash')
  const t = useT()

  const { data: unpaidRaw, isLoading } = useQuery({
    queryKey: ['cashier', 'unpaid'],
    queryFn: () => api.get('/orders?status=served'),
    refetchInterval: 10_000,
  })
  const unpaid: Order[] = Array.isArray(unpaidRaw) ? (unpaidRaw as Order[]) : []

  const createPayment = useMutation({
    mutationFn: ({ orderId, method, amount }: { orderId: string; method: string; amount: number }) =>
      api.post('/payments', { orderId, method, amount }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cashier'] })
      setPayingOrder(null)
      toast.success(t.cashier_success)
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const methods = [
    { key: 'cash', label: t.cashier_method_cash },
    { key: 'card', label: t.cashier_method_card },
    { key: 'qr', label: t.cashier_method_qr },
  ] as const

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 sm:p-7 lg:p-9">
      <div className="flex items-end justify-between">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-primary">{t.cashier_eyebrow}</p>
          <h1 className="mt-1 text-3xl font-extrabold text-foreground">{t.cashier_title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{unpaid.length} {t.cashier_waiting}</p>
        </div>
        <button
          onClick={() => useAuthStore.getState().logout()}
          className="flex h-11 items-center gap-2 rounded-2xl border border-border bg-card px-4 text-sm font-semibold text-muted-foreground hover:text-foreground"
        >
          <LogOut size={16} />
          <span className="hidden sm:inline">{t.logout}</span>
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-3xl border border-border bg-card p-5">
          <ReceiptText size={20} className="text-primary" />
          <p className="mt-4 text-3xl font-black text-foreground">{unpaid.length}</p>
          <p className="text-xs font-semibold text-muted-foreground">{t.cashier_stat_waiting}</p>
        </div>
        <div className="rounded-3xl border border-border bg-card p-5">
          <WalletCards size={20} className="text-emerald-400" />
          <p className="mt-4 text-3xl font-black text-foreground">
            {fmt(unpaid.reduce((sum, order) => sum + Number(order.totalAmount), 0))}
          </p>
          <p className="text-xs font-semibold text-muted-foreground">{t.cashier_stat_total}</p>
        </div>
        <div className="rounded-3xl border border-emerald-500/20 bg-emerald-500/[0.06] p-5">
          <span className="status-dot" />
          <p className="mt-4 text-sm font-extrabold text-emerald-400">{t.cashier_online}</p>
          <p className="mt-1 text-xs text-muted-foreground">{t.cashier_syncing}</p>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2].map((i) => <div key={i} className="skeleton h-28 rounded-xl" />)}
        </div>
      ) : unpaid.length === 0 ? (
        <div className="text-center py-20 text-muted-foreground">
          <CreditCard size={48} className="mx-auto mb-3 opacity-20" />
          <p className="font-medium text-lg">{t.cashier_empty_title}</p>
          <p className="text-sm mt-1">{t.cashier_empty_sub}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {unpaid.map((order, i) => (
            <motion.div
              key={order.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              className="card-hover rounded-3xl border border-border bg-card p-5 sm:p-6"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-2xl font-black text-foreground">
                      {order.tableNumber ? `${t.table} №${order.tableNumber}` : `${t.order} #${order.orderNumber}`}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">
                    {order.items.length} {t.positions} · {timeAgo(order.createdAt)} {t.ago}
                  </p>
                  <div className="mt-2 space-y-0.5">
                    {order.items.slice(0, 3).map((item) => (
                      <p key={item.id} className="text-xs text-muted-foreground">
                        ×{item.quantity} {item.itemNameSnapshot}
                      </p>
                    ))}
                    {order.items.length > 3 && (
                      <p className="text-xs text-muted-foreground">...{t.andMore} {order.items.length - 3}</p>
                    )}
                  </div>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-3xl font-black text-foreground">{fmt(Number(order.totalAmount))}</p>
                  <button
                    onClick={() => { setPayingOrder(order); setMethod('cash') }}
                    className="mt-3 flex h-11 items-center gap-2 rounded-xl bg-emerald-500 px-5 text-sm font-extrabold text-white shadow-lg shadow-emerald-500/20 hover:bg-emerald-400"
                  >
                    <CreditCard size={16} />
                    {t.cashier_pay_btn}
                  </button>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {payingOrder && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={() => setPayingOrder(null)}>
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm space-y-5 rounded-3xl border border-border bg-card p-6 shadow-2xl"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-400">
              <Banknote size={22} />
            </div>
            <h2 className="text-xl font-extrabold text-foreground">{t.cashier_modal_title}</h2>
            <div>
              <p className="text-sm text-muted-foreground">
                {payingOrder.tableNumber ? `${t.table} №${payingOrder.tableNumber}` : `${t.order} #${payingOrder.orderNumber}`}
              </p>
              <p className="text-3xl font-bold text-foreground mt-1">{fmt(Number(payingOrder.totalAmount))}</p>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-2 block">{t.cashier_method_label}</label>
              <div className="grid grid-cols-3 gap-2">
                {methods.map((m) => (
                  <button
                    key={m.key}
                    onClick={() => setMethod(m.key)}
                    className={`h-10 rounded-xl text-sm font-medium border transition-all ${method === m.key ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:border-primary/50'}`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => createPayment.mutate({ orderId: payingOrder.id, method, amount: Number(payingOrder.totalAmount) })}
                disabled={createPayment.isPending}
                className="flex-1 h-11 bg-emerald-500 text-white font-semibold rounded-xl hover:bg-emerald-600 disabled:opacity-50"
              >
                {createPayment.isPending ? t.saving : t.cashier_btn_accept}
              </button>
              <button onClick={() => setPayingOrder(null)} className="h-11 px-4 border border-border text-sm text-muted-foreground rounded-xl hover:bg-muted">
                {t.cancel}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  )
}
