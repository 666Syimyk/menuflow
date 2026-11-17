'use client'

import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { api } from '@/lib/api'
import { formatDate, getOrderStatusLabel, getOrderStatusColor } from '@/lib/utils'
import { useFormatPrice } from '@/hooks/useCurrency'
import { useSocket } from '@/hooks/useSocket'
import toast from 'react-hot-toast'
import { ShoppingBag, User, X } from 'lucide-react'

interface OrderItem {
  id: string
  quantity: number
  itemNameSnapshot: string
  itemPriceSnapshot: number
  comment?: string | null
}

interface Order {
  id: string
  orderNumber: number
  status: string
  totalAmount: number
  createdAt: string
  customerComment?: string | null
  tableNumber?: number | null
  tableZone?: string | null
  waiterName?: string | null
  items: OrderItem[]
}

const STATUS_OPTIONS = [
  { value: '', label: 'Все статусы' },
  { value: 'new', label: 'Новые' },
  { value: 'accepted', label: 'Приняты' },
  { value: 'cooking', label: 'Готовятся' },
  { value: 'ready', label: 'Готовы' },
  { value: 'served', label: 'Поданы' },
  { value: 'paid', label: 'Оплачены' },
  { value: 'cancelled', label: 'Отменены' },
]

const NEXT_STATUS: Record<string, { label: string; status: string; color: string }> = {
  new: { label: 'Принять', status: 'accepted', color: 'bg-violet-500' },
  accepted: { label: 'Готовится', status: 'cooking', color: 'bg-amber-500' },
  cooking: { label: 'Готово', status: 'ready', color: 'bg-emerald-500' },
  ready: { label: 'Подан', status: 'served', color: 'bg-cyan-500' },
  served: { label: 'Оплатить', status: '__PAY__', color: 'bg-green-500' },
}

function PaymentModal({
  order,
  onPay,
  onClose,
}: {
  order: Order
  onPay: (method: string) => void
  onClose: () => void
}) {
  const [method, setMethod] = useState('cash')
  const fmt = useFormatPrice()
  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        onClick={(e) => e.stopPropagation()}
        className="bg-card border border-border rounded-2xl p-6 w-full max-w-sm space-y-4"
      >
        <h2 className="text-lg font-bold text-foreground">Оплата заказа</h2>
        <div>
          <p className="text-sm text-muted-foreground">
            {order.tableNumber ? `Стол №${order.tableNumber}` : `Заказ #${order.orderNumber}`}
          </p>
          <p className="text-2xl font-bold text-foreground mt-1">{fmt(order.totalAmount)}</p>
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-2 block">Способ оплаты</label>
          <div className="grid grid-cols-3 gap-2">
            {[
              { value: 'cash', label: 'Наличные' },
              { value: 'card', label: 'Карта' },
              { value: 'qr', label: 'QR' },
            ].map((m) => (
              <button
                key={m.value}
                onClick={() => setMethod(m.value)}
                className={`h-10 rounded-xl text-sm font-medium border transition-all ${method === m.value ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:border-primary/50'}`}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex gap-2 pt-2">
          <button
            onClick={() => onPay(method)}
            className="flex-1 h-10 bg-emerald-500 text-white text-sm font-semibold rounded-xl hover:bg-emerald-600"
          >
            Принять оплату
          </button>
          <button onClick={onClose} className="h-10 px-4 border border-border text-sm text-muted-foreground rounded-xl hover:bg-muted">
            Отмена
          </button>
        </div>
      </motion.div>
    </div>
  )
}

const PAGE_SIZE = 50

export default function OrdersPage() {
  const queryClient = useQueryClient()
  const fmt = useFormatPrice()
  const { on } = useSocket()
  const [statusFilter, setStatusFilter] = useState('')
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null)
  const [payModal, setPayModal] = useState<Order | null>(null)
  const [limit, setLimit] = useState(PAGE_SIZE)

  const { data: orders = [], isLoading, isFetching } = useQuery<Order[]>({
    queryKey: ['admin', 'orders', statusFilter, limit],
    queryFn: () => {
      const params = new URLSearchParams({ limit: String(limit) })
      if (statusFilter) params.set('status', statusFilter)
      return api.get(`/orders?${params}`)
    },
    select: (d: unknown) => Array.isArray(d) ? d as Order[] : [],
    refetchInterval: 30_000,
  })

  useEffect(() => {
    const invalidate = () => queryClient.invalidateQueries({ queryKey: ['admin', 'orders'] })
    const unsubs = [
      on('new_order', invalidate),
      on('order_ready', invalidate),
      on('order_paid', invalidate),
      on('order_cancelled', invalidate),
      on('order_item_cancelled', invalidate),
    ]
    return () => unsubs.forEach((off) => off())
  }, [on, queryClient])

  function resetPagination() {
    setLimit(PAGE_SIZE)
  }

  const changeStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      api.patch(`/orders/${id}/status`, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'orders'] })
      toast.success('Статус обновлён')
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const createPayment = useMutation({
    mutationFn: ({ orderId, method, amount }: { orderId: string; method: string; amount: number }) =>
      api.post('/payments', { orderId, method, amount }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'orders'] })
      setPayModal(null)
      toast.success('Оплата зафиксирована')
    },
    onError: (e: Error) => toast.error(e.message),
  })

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Заказы</h1>
          <p className="text-muted-foreground text-sm mt-0.5">{orders.length} всего</p>
        </div>
      </div>

      <div className="flex gap-2 flex-wrap">
        {STATUS_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            onClick={() => { setStatusFilter(opt.value); resetPagination() }}
            className={`h-8 px-3 rounded-lg text-xs font-medium transition-all ${statusFilter === opt.value ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground'}`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => <div key={i} className="skeleton h-24 rounded-xl" />)}
        </div>
      ) : orders.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <ShoppingBag size={48} className="mx-auto mb-3 opacity-20" />
          <p className="font-medium">Заказов нет</p>
        </div>
      ) : (
        <div className="space-y-3">
          {orders.map((order, i) => {
            const nextAction = NEXT_STATUS[order.status]
            return (
              <motion.div
                key={order.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.03 }}
                className="bg-card border border-border rounded-xl p-4"
              >
                <div className="flex items-start justify-between gap-4">
                  <div
                    className="flex-1 cursor-pointer"
                    onClick={() => setSelectedOrder(selectedOrder?.id === order.id ? null : order)}
                  >
                    <div className="flex items-center gap-3 flex-wrap">
                      <span className="font-bold text-foreground text-lg">
                        {order.tableNumber ? `Стол №${order.tableNumber}` : `Заказ #${order.orderNumber}`}
                        {order.tableZone && (
                          <span className="ml-1.5 text-sm font-normal text-muted-foreground">· {order.tableZone}</span>
                        )}
                      </span>
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-lg ${getOrderStatusColor(order.status)}`}>
                        {getOrderStatusLabel(order.status)}
                      </span>
                      <span className="text-xs text-muted-foreground">{formatDate(order.createdAt, 'long')}</span>
                    </div>
                    <div className="flex items-center gap-4 mt-1.5 text-sm text-muted-foreground">
                      <span>{order.items.length} позиций</span>
                      <span className="font-semibold text-foreground">{fmt(order.totalAmount)}</span>
                      {order.waiterName && (
                        <span className="flex items-center gap-1 text-xs text-blue-500">
                          <User size={11} /> {order.waiterName}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex gap-2 flex-shrink-0">
                    {nextAction && (
                      <button
                        onClick={() => {
                          if (nextAction.status === '__PAY__') {
                            setPayModal(order)
                          } else {
                            changeStatus.mutate({ id: order.id, status: nextAction.status })
                          }
                        }}
                        className={`h-8 px-3 rounded-xl text-xs font-medium text-white transition-colors ${nextAction.color} hover:opacity-90`}
                      >
                        {nextAction.label}
                      </button>
                    )}
                    {!['cancelled', 'paid'].includes(order.status) && (
                      <button
                        onClick={() => changeStatus.mutate({ id: order.id, status: 'cancelled' })}
                        className="h-8 w-8 rounded-xl border border-border text-muted-foreground hover:text-destructive hover:border-destructive/50 transition-colors flex items-center justify-center"
                      >
                        <X size={14} />
                      </button>
                    )}
                  </div>
                </div>

                {selectedOrder?.id === order.id && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    className="mt-3 pt-3 border-t border-border space-y-1.5"
                  >
                    {order.items.map((item) => (
                      <div key={item.id} className="flex items-center justify-between text-sm">
                        <span className="text-foreground">
                          ×{item.quantity} {item.itemNameSnapshot}
                        </span>
                        <span className="text-muted-foreground">{fmt(item.itemPriceSnapshot * item.quantity)}</span>
                      </div>
                    ))}
                    {order.customerComment && (
                      <p className="text-xs text-amber-400 mt-2">💬 {order.customerComment}</p>
                    )}
                  </motion.div>
                )}
              </motion.div>
            )
          })}
          {orders.length === limit && (
            <div className="flex justify-center pt-2">
              <button
                onClick={() => setLimit((l) => l + PAGE_SIZE)}
                disabled={isFetching}
                className="h-9 px-6 rounded-xl border border-border text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-50 transition-all"
              >
                {isFetching ? 'Загрузка...' : 'Загрузить ещё'}
              </button>
            </div>
          )}
        </div>
      )}

      {payModal && (
        <PaymentModal
          order={payModal}
          onPay={(method) =>
            createPayment.mutate({
              orderId: payModal.id,
              method,
              amount: payModal.totalAmount,
            })
          }
          onClose={() => setPayModal(null)}
        />
      )}
    </div>
  )
}
