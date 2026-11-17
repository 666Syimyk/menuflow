'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { api } from '@/lib/api'
import { formatDate, getOrderStatusLabel, getOrderStatusColor, timeAgo } from '@/lib/utils'
import { useFormatPrice } from '@/hooks/useCurrency'
import toast from 'react-hot-toast'
import { ShoppingBag } from 'lucide-react'

interface OrderItem {
  id: string
  quantity: number
  itemNameSnapshot: string
  itemPriceSnapshot: number
}

interface Order {
  id: string
  orderNumber: number
  status: string
  totalAmount: number
  createdAt: string
  customerComment?: string | null
  tableNumber?: number | null
  items: OrderItem[]
}

const FILTERS = [
  { value: '', label: 'Все' },
  { value: 'new', label: 'Новые' },
  { value: 'accepted', label: 'Приняты' },
  { value: 'cooking', label: 'Готовятся' },
  { value: 'ready', label: 'Готовы' },
  { value: 'served', label: 'Поданы' },
]

const WAITER_ACTIONS: Record<string, { label: string; status: string; color: string }> = {
  ready: { label: 'Подать', status: 'served', color: 'bg-cyan-500 hover:bg-cyan-600' },
}

export default function WaiterOrdersPage() {
  const queryClient = useQueryClient()
  const fmt = useFormatPrice()
  const [filter, setFilter] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)

  const { data: orders = [], isLoading } = useQuery<Order[]>({
    queryKey: ['waiter', 'orders', filter],
    queryFn: () => api.get(`/waiter/orders${filter ? `?status=${filter}` : ''}`),
    select: (d: unknown) => Array.isArray(d) ? d as Order[] : [],
    refetchInterval: 10_000,
  })

  const changeStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      api.patch(`/orders/${id}/status`, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['waiter', 'orders'] })
      toast.success('Статус обновлён')
    },
    onError: (e: Error) => toast.error(e.message),
  })

  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Мои заказы</h1>
        <p className="text-muted-foreground text-sm mt-0.5">{orders.length} заказов</p>
      </div>

      <div className="flex gap-2 flex-wrap">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            className={`h-8 px-3 rounded-lg text-xs font-medium transition-all ${filter === f.value ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground'}`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <div key={i} className="skeleton h-24 rounded-xl" />)}
        </div>
      ) : orders.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <ShoppingBag size={48} className="mx-auto mb-3 opacity-20" />
          <p className="font-medium">Заказов нет</p>
        </div>
      ) : (
        <div className="space-y-3">
          {orders.map((order, i) => {
            const action = WAITER_ACTIONS[order.status]
            return (
              <motion.div
                key={order.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04 }}
                className="bg-card border border-border rounded-xl overflow-hidden"
              >
                <div
                  className="flex items-center justify-between p-4 cursor-pointer"
                  onClick={() => setExpanded(expanded === order.id ? null : order.id)}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 flex-wrap">
                      <span className="font-bold text-foreground text-lg">
                        {order.tableNumber ? `Стол №${order.tableNumber}` : `Заказ #${order.orderNumber}`}
                      </span>
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-lg ${getOrderStatusColor(order.status)}`}>
                        {getOrderStatusLabel(order.status)}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground">
                      <span>{order.items.length} позиций</span>
                      <span className="font-semibold text-foreground">{fmt(order.totalAmount)}</span>
                      <span>{timeAgo(order.createdAt)}</span>
                    </div>
                  </div>
                  {action && (
                    <button
                      onClick={(e) => { e.stopPropagation(); changeStatus.mutate({ id: order.id, status: action.status }) }}
                      className={`h-8 px-3 rounded-xl text-xs font-medium text-white transition-colors ${action.color} ml-2`}
                    >
                      {action.label}
                    </button>
                  )}
                </div>

                {expanded === order.id && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    className="px-4 pb-4 pt-0 border-t border-border space-y-1.5"
                  >
                    {order.items.map((item) => (
                      <div key={item.id} className="flex items-center justify-between text-sm pt-2">
                        <span className="text-foreground">×{item.quantity} {item.itemNameSnapshot}</span>
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
        </div>
      )}
    </div>
  )
}
