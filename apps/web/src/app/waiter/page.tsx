'use client'

import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Bell, CheckCircle2, ChevronRight, Clock3, Table2, X,
  UtensilsCrossed, ReceiptText, Sparkles, UserCheck, ShieldAlert,
  Plus, Minus, ShoppingCart, BookOpen, CreditCard,
} from 'lucide-react'
import { api } from '@/lib/api'
import { getOrderStatusLabel, getOrderStatusColor, timeAgo } from '@/lib/utils'
import { useFormatPrice } from '@/hooks/useCurrency'
import { useSocket } from '@/hooks/useSocket'
import { useT } from '@/hooks/useT'
import toast from 'react-hot-toast'

interface OrderItem {
  id: string
  quantity: number
  itemNameSnapshot: string
  itemPriceSnapshot: number
  comment?: string | null
  isCancelled?: boolean
}

interface Order {
  id: string
  orderNumber: number
  tableId: string
  tableNumber: number | null
  status: string
  totalAmount: number
  createdAt: string
  customerComment?: string | null
  items: OrderItem[]
}

interface MenuItem {
  id: string
  categoryId: string | null
  name: string
  description: string | null
  price: number
  imageUrl: string | null
  weight: string | null
  isAvailable: boolean
  isPopular: boolean
}

interface MenuCategory {
  id: string
  name: string
  sortOrder: number
  isActive: boolean
}

interface TableRow {
  id: string
  number: number
  zone: string | null
  isActive: boolean
  waiterId: string | null
}

interface WaiterCall {
  id: string
  tableId: string
  tableNumber: number | null
  status: string
  createdAt: string
}

interface BillRequest {
  id: string
  tableId: string
  tableNumber?: number | null
  orderId: string | null
  status: string
  createdAt: string
}

const STATUS_ORDER: Record<string, number> = {
  ready: 0, new: 1, accepted: 2, cooking: 3, served: 4, paid: 5, cancelled: 6,
}

const ACTIVE_STATUSES = new Set(['new', 'accepted', 'cooking', 'ready', 'served'])
const HISTORY_STATUSES = new Set(['paid', 'cancelled'])

export default function WaiterDashboard() {
  const queryClient = useQueryClient()
  const { on, connected } = useSocket()
  const t = useT()
  const fmt = useFormatPrice()
  const [selectedTableId, setSelectedTableId] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'orders' | 'menu'>('orders')
  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null)
  const [cart, setCart] = useState<Record<string, number>>({})
  const [payOrder, setPayOrder] = useState<Order | null>(null)

  const { data: myTablesRaw } = useQuery({
    queryKey: ['waiter', 'my-tables'],
    queryFn: () => api.get('/waiter/my-tables'),
    refetchInterval: 15_000,
  })
  const myTables: TableRow[] = Array.isArray(myTablesRaw) ? myTablesRaw as TableRow[] : []

  const { data: ordersRaw, isLoading: ordersLoading } = useQuery({
    queryKey: ['waiter', 'orders', 'all'],
    queryFn: () => api.get('/waiter/orders'),
    select: (d: unknown) => Array.isArray(d) ? d as Order[] : [],
    refetchInterval: 10_000,
  })
  const allOrders: Order[] = ordersRaw ?? []

  const { data: callsRaw } = useQuery({
    queryKey: ['waiter', 'calls'],
    queryFn: () => api.get('/waiter/calls'),
    select: (d: unknown) => Array.isArray(d) ? d as WaiterCall[] : [],
    refetchInterval: 10_000,
  })
  const calls: WaiterCall[] = callsRaw ?? []

  const { data: callHistoryRaw } = useQuery({
    queryKey: ['waiter', 'calls-history'],
    queryFn: () => api.get('/waiter/calls?history=true'),
    select: (d: unknown) => Array.isArray(d) ? d as WaiterCall[] : [],
    refetchInterval: 30_000,
  })
  const callHistory: WaiterCall[] = callHistoryRaw ?? []

  const { data: billsRaw } = useQuery({
    queryKey: ['waiter', 'bill-requests'],
    queryFn: () => api.get('/waiter/bill-requests'),
    select: (d: unknown) => Array.isArray(d) ? d as BillRequest[] : [],
    refetchInterval: 10_000,
  })
  const bills: BillRequest[] = billsRaw ?? []

  const { data: categoriesRaw } = useQuery({
    queryKey: ['waiter', 'menu-categories'],
    queryFn: () => api.get('/menu/categories'),
    select: (d: unknown) => Array.isArray(d) ? d as MenuCategory[] : [],
  })
  const categories: MenuCategory[] = (categoriesRaw ?? []).filter((c) => c.isActive)

  const { data: menuItemsRaw } = useQuery({
    queryKey: ['waiter', 'menu-items'],
    queryFn: () => api.get('/menu/items'),
    select: (d: unknown) => Array.isArray(d) ? d as MenuItem[] : [],
  })
  const menuItems: MenuItem[] = (menuItemsRaw ?? []).filter((i) => i.isAvailable)

  const resolveCall = useMutation({
    mutationFn: (id: string) => api.patch(`/waiter/calls/${id}`, { status: 'completed' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['waiter', 'calls'] })
      queryClient.invalidateQueries({ queryKey: ['waiter', 'calls-history'] })
    },
  })
  const resolveBill = useMutation({
    mutationFn: (id: string) => api.patch(`/waiter/bill-requests/${id}`, { status: 'completed' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['waiter', 'bill-requests'] }),
  })

  const callAdmin = useMutation({
    mutationFn: () => api.post('/waiter/call-admin', {}),
    onSuccess: () => toast.success(t.waiter_call_admin_sent),
    onError: () => toast.error('Не удалось отправить вызов'),
  })

  const acceptOrder = useMutation({
    mutationFn: (orderId: string) => api.patch(`/orders/${orderId}/status`, { status: 'accepted' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['waiter'] })
      toast.success(t.waiter_accept_order_toast)
    },
    onError: () => toast.error('Не удалось принять заказ'),
  })

  const markServed = useMutation({
    mutationFn: (orderId: string) => api.patch(`/orders/${orderId}/status`, { status: 'served' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['waiter'] }),
    onError: () => toast.error('Ошибка'),
  })

  const cancelOrder = useMutation({
    mutationFn: (orderId: string) => api.patch(`/orders/${orderId}/status`, { status: 'cancelled' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['waiter'] })
      toast.success(t.waiter_cancel_order_toast)
    },
    onError: () => toast.error('Не удалось отменить заказ'),
  })

  const cancelItem = useMutation({
    mutationFn: ({ orderId, itemId }: { orderId: string; itemId: string }) =>
      api.patch(`/orders/${orderId}/items/${itemId}/cancel`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['waiter'] })
      toast.success('Позиция отменена')
    },
    onError: () => toast.error('Не удалось отменить позицию'),
  })

  const createOrder = useMutation({
    mutationFn: (payload: { tableId: string; items: { menuItemId: string; quantity: number }[] }) =>
      api.post('/waiter/orders', payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['waiter'] })
      setCart({})
      setActiveTab('orders')
      toast.success('Заказ оформлен')
    },
    onError: () => toast.error('Не удалось оформить заказ'),
  })

  const createPayment = useMutation({
    mutationFn: ({ orderId, method, amount }: { orderId: string; method: string; amount: number }) =>
      api.post('/payments', { orderId, method, amount }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['waiter'] })
      setPayOrder(null)
      toast.success('Оплата принята')
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const cartTotal = Object.entries(cart).reduce((sum, [id, qty]) => {
    const item = menuItems.find((i) => i.id === id)
    return sum + (item ? item.price * qty : 0)
  }, 0)
  const cartCount = Object.values(cart).reduce((s, q) => s + q, 0)

  const addToCart = (itemId: string) =>
    setCart((prev) => ({ ...prev, [itemId]: (prev[itemId] ?? 0) + 1 }))
  const removeFromCart = (itemId: string) =>
    setCart((prev) => {
      const next = { ...prev }
      if ((next[itemId] ?? 0) <= 1) delete next[itemId]
      else next[itemId]--
      return next
    })

  const handleTableSelect = (tableId: string | null) => {
    setSelectedTableId(tableId)
    setActiveTab('orders')
    setCart({})
    setActiveCategoryId(null)
  }

  const filteredItems = activeCategoryId
    ? menuItems.filter((i) => i.categoryId === activeCategoryId)
    : menuItems

  useEffect(() => {
    const offNew = on('new_order', () => {
      queryClient.invalidateQueries({ queryKey: ['waiter'] })
      try { new Audio('/sounds/new-order.mp3').play() } catch {}
      toast(t.waiter_new_order_toast, { duration: 4000 })
    })
    const offReady = on('order_ready', () => {
      queryClient.invalidateQueries({ queryKey: ['waiter'] })
      toast.success(t.waiter_order_ready_toast)
    })
    const offPaid = on('order_paid', () => {
      queryClient.invalidateQueries({ queryKey: ['waiter'] })
    })
    const offServed = on('order_served', () => {
      queryClient.invalidateQueries({ queryKey: ['waiter'] })
    })
    const offCall = on('waiter_call_created', (data: { tableNumber?: number | null }) => {
      queryClient.invalidateQueries({ queryKey: ['waiter', 'calls'] })
      queryClient.invalidateQueries({ queryKey: ['waiter', 'calls-history'] })
      const tableLabel = data?.tableNumber ? ` — Стол №${data.tableNumber}` : ''
      toast(`${t.waiter_call_toast}${tableLabel}`, { duration: 5000 })
    })
    const offBill = on('bill_requested', () => {
      queryClient.invalidateQueries({ queryKey: ['waiter', 'bill-requests'] })
      toast(t.waiter_bill_toast, { duration: 5000 })
    })
    const offCancelled = on('order_cancelled', () => {
      queryClient.invalidateQueries({ queryKey: ['waiter'] })
      toast.error(t.waiter_order_cancelled_toast, { duration: 5000 })
    })
    const offKitchenCancelled = on('order_cancelled_by_kitchen', (data: { orderNumber?: number; tableNumber?: number | null; tableZone?: string | null }) => {
      queryClient.invalidateQueries({ queryKey: ['waiter'] })
      const tableLabel = data?.tableNumber ? `Стол №${data.tableNumber}` : 'столе'
      const zoneLabel = data?.tableZone ? ` (${data.tableZone})` : ''
      toast.error(
        `⚠️ Заказ #${data?.orderNumber ?? '?'} — ${tableLabel}${zoneLabel} отменён кухней. Объясните гостю.`,
        { duration: 10000 }
      )
    })
    const offItemCancelled = on('order_item_cancelled', (data: { itemName?: string }) => {
      queryClient.invalidateQueries({ queryKey: ['waiter'] })
      toast.error(`${t.waiter_item_cancelled_toast}: ${data?.itemName ?? ''}`, { duration: 5000 })
    })
    return () => { offNew(); offReady(); offPaid(); offServed(); offCall(); offBill(); offCancelled(); offKitchenCancelled(); offItemCancelled() }
  }, [on, queryClient, t])

  // Group orders by tableId
  const ordersByTable = allOrders.reduce<Record<string, Order[]>>((acc, o) => {
    if (!acc[o.tableId]) acc[o.tableId] = []
    acc[o.tableId].push(o)
    return acc
  }, {})

  // Group calls/bills by tableId for quick lookup
  const callsByTable = calls.reduce<Record<string, number>>((acc, c) => {
    acc[c.tableId] = (acc[c.tableId] ?? 0) + 1
    return acc
  }, {})
  const billsByTable = bills.reduce<Record<string, number>>((acc, b) => {
    acc[b.tableId] = (acc[b.tableId] ?? 0) + 1
    return acc
  }, {})

  const selectedTable = myTables.find((t) => t.id === selectedTableId) ?? null
  const selectedOrders = selectedTableId
    ? (ordersByTable[selectedTableId] ?? []).sort(
        (a, b) => (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9),
      )
    : []
  const selectedActiveOrders = selectedOrders.filter((o) => ACTIVE_STATUSES.has(o.status))
  const selectedHistoryOrders = selectedOrders.filter((o) => HISTORY_STATUSES.has(o.status))

  const urgentCount = calls.length + bills.length

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      {/* Header */}
      <header className="flex-shrink-0 border-b border-border/60 px-4 py-4 sm:px-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-primary">{t.waiter_eyebrow}</p>
            <h1 className="mt-0.5 text-2xl font-extrabold text-foreground">{t.waiter_title}</h1>
          </div>
          <div className="flex items-center gap-2">
            {urgentCount > 0 && (
              <motion.div
                initial={{ scale: 0.8 }}
                animate={{ scale: 1 }}
                className="flex items-center gap-1.5 rounded-2xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs font-bold text-rose-500"
              >
                <Bell size={13} className="animate-pulse" />
                {urgentCount} срочных
              </motion.div>
            )}
            <div className={`hidden items-center gap-2 rounded-2xl border border-border bg-card px-3 py-2 text-xs font-semibold sm:flex ${connected ? 'text-emerald-400' : 'text-red-400'}`}>
              <span className={`h-2 w-2 rounded-full ${connected ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`} />
              {connected ? t.online : 'Переподключение...'}
            </div>
          </div>
        </div>

        {/* Call admin button — full width, always visible */}
        <button
          onClick={() => callAdmin.mutate()}
          disabled={callAdmin.isPending}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl border border-amber-500/40 bg-amber-500/10 py-2.5 text-sm font-bold text-amber-700 hover:bg-amber-500/20 active:scale-[0.98] disabled:opacity-60 transition-all"
        >
          <ShieldAlert size={15} />
          {t.waiter_call_admin_btn}
        </button>

        {/* Alerts strip */}
        <AnimatePresence>
          {(calls.length > 0 || bills.length > 0) && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mt-3 flex flex-wrap gap-2"
            >
              {calls.map((call) => (
                <div key={call.id} className="flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs font-semibold text-amber-600">
                  <Bell size={11} className="animate-pulse" />
                  Вызов — Стол №{call.tableNumber ?? '?'}
                  <button
                    onClick={() => resolveCall.mutate(call.id)}
                    className="ml-1 rounded-lg bg-amber-500/20 px-2 py-0.5 text-[10px] font-bold hover:bg-amber-500/30"
                  >
                    ✓
                  </button>
                </div>
              ))}
              {bills.map((bill) => (
                <div key={bill.id} className="flex items-center gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-1.5 text-xs font-semibold text-rose-600">
                  <ReceiptText size={11} className="animate-pulse" />
                  Счёт — {bill.tableNumber ? `Стол №${bill.tableNumber}` : `Стол (${bill.tableId.slice(-4)})`}
                  <button
                    onClick={() => resolveBill.mutate(bill.id)}
                    className="ml-1 rounded-lg bg-rose-500/20 px-2 py-0.5 text-[10px] font-bold hover:bg-rose-500/30"
                  >
                    ✓
                  </button>
                </div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </header>

      {/* Body */}
      <div className="flex flex-1 overflow-hidden">
        {/* Tables grid */}
        <div className={`flex flex-col overflow-y-auto p-4 sm:p-6 transition-all duration-300 ${selectedTableId ? 'w-full md:w-1/2 lg:w-2/5' : 'w-full'}`}>
          {myTables.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-4">
              <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-muted">
                <UserCheck size={32} className="opacity-30" />
              </div>
              <div className="text-center">
                <p className="font-semibold text-foreground">Нет закреплённых столов</p>
                <p className="text-sm mt-1 max-w-xs">Обратитесь к администратору</p>
              </div>
            </div>
          ) : (
            <>
              <p className="mb-3 text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">
                {myTables.length} {myTables.length === 1 ? 'стол' : 'столов'} · нажмите для просмотра заказов
              </p>
              <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
                {myTables.map((table) => {
                  const tableOrders = ordersByTable[table.id] ?? []
                  const activeOrders = tableOrders.filter((o) => ACTIVE_STATUSES.has(o.status)).length
                  const hasReady = tableOrders.some((o) => o.status === 'ready')
                  const hasCall = (callsByTable[table.id] ?? 0) > 0
                  const hasBill = (billsByTable[table.id] ?? 0) > 0
                  const isSelected = selectedTableId === table.id

                  let borderColor = 'border-border'
                  let bg = 'bg-card'
                  if (isSelected) { borderColor = 'border-primary'; bg = 'bg-primary/[0.07]' }
                  else if (hasCall || hasBill) { borderColor = 'border-rose-500/40'; bg = 'bg-rose-500/[0.05]' }
                  else if (hasReady) { borderColor = 'border-emerald-500/40'; bg = 'bg-emerald-500/[0.05]' }
                  else if (activeOrders > 0) { borderColor = 'border-amber-500/40'; bg = 'bg-amber-500/[0.05]' }

                  return (
                    <motion.button
                      key={table.id}
                      layout
                      whileTap={{ scale: 0.97 }}
                      onClick={() => handleTableSelect(isSelected ? null : table.id)}
                      className={`relative flex flex-col items-center justify-center gap-1.5 rounded-2xl border p-3 text-center aspect-square transition-colors ${borderColor} ${bg}`}
                    >
                      <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${isSelected ? 'bg-primary/20 text-primary' : activeOrders > 0 ? 'bg-amber-500/10 text-amber-500' : 'bg-muted text-muted-foreground'}`}>
                        <Table2 size={18} />
                      </div>
                      <p className="text-lg font-black text-foreground leading-none">№{table.number}</p>
                      {table.zone && <p className="text-[9px] text-muted-foreground leading-none">{table.zone}</p>}

                      {/* Badges */}
                      <div className="flex gap-1 flex-wrap justify-center">
                        {hasCall && (
                          <span className="rounded-md bg-amber-500 px-1 py-0.5 text-[9px] font-black text-white">📣</span>
                        )}
                        {hasBill && (
                          <span className="rounded-md bg-rose-500 px-1 py-0.5 text-[9px] font-black text-white">💳</span>
                        )}
                        {hasReady && (
                          <span className="rounded-md bg-emerald-500 px-1 py-0.5 text-[9px] font-black text-white">✓</span>
                        )}
                        {activeOrders > 0 && !hasReady && (
                          <span className="rounded-md bg-amber-500/20 px-1.5 py-0.5 text-[9px] font-bold text-amber-600">
                            {activeOrders}
                          </span>
                        )}
                      </div>

                      {isSelected && (
                        <motion.div
                          layoutId="selected-indicator"
                          className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[8px] font-black text-primary-foreground"
                        >
                          ✓
                        </motion.div>
                      )}
                    </motion.button>
                  )
                })}
              </div>

              {/* Call history section */}
              {callHistory.length > 0 && (
                <div className="mt-6">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="h-px flex-1 bg-border" />
                    <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Вызовы за смену</p>
                    <div className="h-px flex-1 bg-border" />
                  </div>
                  <div className="space-y-1.5">
                    {callHistory.map((call) => (
                      <div key={call.id} className={`flex items-center justify-between rounded-xl border px-3 py-2 ${call.status === 'new' || call.status === 'seen' ? 'border-amber-500/30 bg-amber-500/[0.05]' : 'border-border bg-card'}`}>
                        <div className="flex items-center gap-2">
                          <Bell size={11} className={call.status === 'new' ? 'text-amber-500 animate-pulse' : 'text-muted-foreground'} />
                          <span className="text-sm font-bold text-foreground">Стол №{call.tableNumber ?? '?'}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          {call.status === 'completed' && (
                            <span className="text-[10px] font-bold text-emerald-500">Выполнен</span>
                          )}
                          {call.status === 'seen' && (
                            <span className="text-[10px] font-bold text-blue-500">Принят</span>
                          )}
                          {call.status === 'new' && (
                            <span className="text-[10px] font-bold text-amber-500">Новый</span>
                          )}
                          <span className="text-[10px] text-muted-foreground">{timeAgo(call.createdAt)}</span>
                          {(call.status === 'new' || call.status === 'seen') && (
                            <button
                              onClick={() => resolveCall.mutate(call.id)}
                              className="rounded-lg bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-600 hover:bg-emerald-500/20"
                            >
                              ✓
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Orders panel */}
        <AnimatePresence>
          {selectedTableId && (
            <motion.div
              key="orders-panel"
              initial={{ opacity: 0, x: 40 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 40 }}
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
              className="hidden md:flex w-1/2 lg:w-3/5 flex-col border-l border-border/60 overflow-hidden"
            >
              {/* Panel header */}
              <div className="flex-shrink-0 border-b border-border/60 px-5 pt-4 pb-0">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Стол №{selectedTable?.number}</p>
                  <button onClick={() => handleTableSelect(null)} className="rounded-xl p-2 text-muted-foreground hover:bg-muted hover:text-foreground">
                    <X size={18} />
                  </button>
                </div>
                <div className="flex gap-1">
                  <button
                    onClick={() => setActiveTab('orders')}
                    className={`flex items-center gap-1.5 rounded-t-xl px-4 py-2 text-sm font-bold transition-colors ${activeTab === 'orders' ? 'bg-card border-t border-x border-border/60 text-foreground -mb-px' : 'text-muted-foreground hover:text-foreground'}`}
                  >
                    <ReceiptText size={13} />
                    Заказы
                    {selectedActiveOrders.length > 0 && (
                      <span className="ml-1 rounded-full bg-primary px-1.5 py-0.5 text-[9px] font-black text-primary-foreground">{selectedActiveOrders.length}</span>
                    )}
                  </button>
                  <button
                    onClick={() => setActiveTab('menu')}
                    className={`flex items-center gap-1.5 rounded-t-xl px-4 py-2 text-sm font-bold transition-colors ${activeTab === 'menu' ? 'bg-card border-t border-x border-border/60 text-foreground -mb-px' : 'text-muted-foreground hover:text-foreground'}`}
                  >
                    <BookOpen size={13} />
                    Меню
                    {cartCount > 0 && (
                      <span className="ml-1 rounded-full bg-emerald-500 px-1.5 py-0.5 text-[9px] font-black text-white">{cartCount}</span>
                    )}
                  </button>
                </div>
              </div>

              {/* Orders tab */}
              {activeTab === 'orders' && (
                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                  {ordersLoading ? (
                    [1, 2].map((i) => <div key={i} className="skeleton h-36 rounded-2xl" />)
                  ) : selectedOrders.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-3">
                      <Sparkles size={32} className="opacity-20" />
                      <p className="font-semibold text-foreground">Заказов нет</p>
                      <p className="text-sm text-center">На этом столе сегодня не было заказов</p>
                    </div>
                  ) : (
                    <>
                      {selectedActiveOrders.map((order) => (
                        <OrderCard key={order.id} order={order} onAccept={acceptOrder.mutate} onServed={markServed.mutate} onCancel={cancelOrder.mutate} onCancelItem={(orderId, itemId) => cancelItem.mutate({ orderId, itemId })} onPay={setPayOrder} />
                      ))}
                      {selectedHistoryOrders.length > 0 && (
                        <>
                          <div className="flex items-center gap-2 pt-1">
                            <div className="h-px flex-1 bg-border" />
                            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">История смены</span>
                            <div className="h-px flex-1 bg-border" />
                          </div>
                          {selectedHistoryOrders.map((order) => (
                            <OrderCard key={order.id} order={order} onAccept={acceptOrder.mutate} onServed={markServed.mutate} onCancel={cancelOrder.mutate} onCancelItem={(orderId, itemId) => cancelItem.mutate({ orderId, itemId })} onPay={setPayOrder} />
                          ))}
                        </>
                      )}
                    </>
                  )}
                </div>
              )}

              {/* Menu tab */}
              {activeTab === 'menu' && (
                <div className="flex flex-col flex-1 overflow-hidden">
                  {/* Category filter */}
                  <div className="flex gap-2 overflow-x-auto p-3 border-b border-border/40 flex-shrink-0">
                    <button
                      onClick={() => setActiveCategoryId(null)}
                      className={`flex-shrink-0 rounded-xl px-3 py-1.5 text-xs font-bold transition-colors ${!activeCategoryId ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground'}`}
                    >
                      Все
                    </button>
                    {categories.map((cat) => (
                      <button
                        key={cat.id}
                        onClick={() => setActiveCategoryId(cat.id)}
                        className={`flex-shrink-0 rounded-xl px-3 py-1.5 text-xs font-bold transition-colors ${activeCategoryId === cat.id ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground'}`}
                      >
                        {cat.name}
                      </button>
                    ))}
                  </div>

                  {/* Items list */}
                  <div className="flex-1 overflow-y-auto p-3 space-y-2">
                    {filteredItems.map((item) => {
                      const qty = cart[item.id] ?? 0
                      return (
                        <div key={item.id} className="flex items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3">
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-bold text-foreground leading-tight">{item.name}</p>
                            {item.description && <p className="mt-0.5 text-xs text-muted-foreground line-clamp-1">{item.description}</p>}
                            {item.weight && <p className="mt-0.5 text-[10px] text-muted-foreground">{item.weight}</p>}
                          </div>
                          <div className="flex-shrink-0 text-right">
                            <p className="text-sm font-black text-foreground">{fmt(item.price)}</p>
                          </div>
                          {qty === 0 ? (
                            <button
                              onClick={() => addToCart(item.id)}
                              className="flex-shrink-0 flex h-8 w-8 items-center justify-center rounded-xl bg-primary text-primary-foreground hover:opacity-90 active:scale-90"
                            >
                              <Plus size={15} />
                            </button>
                          ) : (
                            <div className="flex-shrink-0 flex items-center gap-1">
                              <button onClick={() => removeFromCart(item.id)} className="flex h-7 w-7 items-center justify-center rounded-lg bg-muted text-foreground hover:bg-muted/80">
                                <Minus size={13} />
                              </button>
                              <span className="w-5 text-center text-sm font-black text-foreground">{qty}</span>
                              <button onClick={() => addToCart(item.id)} className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-primary-foreground hover:opacity-90">
                                <Plus size={13} />
                              </button>
                            </div>
                          )}
                        </div>
                      )
                    })}
                    {filteredItems.length === 0 && (
                      <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
                        <BookOpen size={32} className="opacity-20" />
                        <p className="text-sm font-semibold text-foreground">Позиций нет</p>
                      </div>
                    )}
                  </div>

                  {/* Cart bar */}
                  {cartCount > 0 && (
                    <div className="flex-shrink-0 border-t border-border/60 p-3">
                      <div className="flex items-center gap-3 rounded-2xl bg-muted/60 px-4 py-2.5 mb-2">
                        <ShoppingCart size={15} className="text-muted-foreground flex-shrink-0" />
                        <span className="flex-1 text-sm font-semibold text-foreground">{cartCount} позиций</span>
                        <span className="text-sm font-black text-foreground">{fmt(cartTotal)}</span>
                      </div>
                      <button
                        disabled={createOrder.isPending}
                        onClick={() => createOrder.mutate({
                          tableId: selectedTableId!,
                          items: Object.entries(cart).map(([menuItemId, quantity]) => ({ menuItemId, quantity })),
                        })}
                        className="flex w-full items-center justify-center gap-2 rounded-2xl bg-primary py-3 text-sm font-extrabold text-primary-foreground hover:opacity-90 active:scale-[0.98] disabled:opacity-50 transition-all"
                      >
                        <ReceiptText size={15} />
                        {createOrder.isPending ? 'Оформляем...' : 'Оформить заказ'}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Mobile orders bottom sheet */}
      <AnimatePresence>
        {selectedTableId && (
          <motion.div
            key="mobile-sheet"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            className="fixed inset-x-0 bottom-0 z-50 flex flex-col rounded-t-3xl border-t border-border bg-card shadow-2xl md:hidden"
            style={{ maxHeight: '75vh' }}
          >
            {/* Drag handle */}
            <div className="flex justify-center pt-3 pb-1">
              <div className="h-1 w-10 rounded-full bg-border" />
            </div>
            <div className="flex items-center justify-between px-5 pb-0 pt-1">
              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Стол №{selectedTable?.number}</p>
              <button onClick={() => handleTableSelect(null)} className="rounded-xl p-2 text-muted-foreground hover:bg-muted">
                <X size={18} />
              </button>
            </div>

            {/* Tabs */}
            <div className="flex gap-1 px-4 pt-2 pb-0">
              <button
                onClick={() => setActiveTab('orders')}
                className={`flex items-center gap-1.5 rounded-t-xl px-3 py-2 text-xs font-bold transition-colors ${activeTab === 'orders' ? 'bg-background border-t border-x border-border/60 text-foreground' : 'text-muted-foreground'}`}
              >
                <ReceiptText size={12} />
                Заказы
                {selectedActiveOrders.length > 0 && <span className="rounded-full bg-primary px-1.5 py-0.5 text-[8px] font-black text-primary-foreground">{selectedActiveOrders.length}</span>}
              </button>
              <button
                onClick={() => setActiveTab('menu')}
                className={`flex items-center gap-1.5 rounded-t-xl px-3 py-2 text-xs font-bold transition-colors ${activeTab === 'menu' ? 'bg-background border-t border-x border-border/60 text-foreground' : 'text-muted-foreground'}`}
              >
                <BookOpen size={12} />
                Меню
                {cartCount > 0 && <span className="rounded-full bg-emerald-500 px-1.5 py-0.5 text-[8px] font-black text-white">{cartCount}</span>}
              </button>
            </div>

            {activeTab === 'orders' && (
              <div className="flex-1 overflow-y-auto px-4 pb-6 pt-3 space-y-3">
                {ordersLoading ? (
                  [1, 2].map((i) => <div key={i} className="skeleton h-36 rounded-2xl" />)
                ) : selectedOrders.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-10 text-muted-foreground gap-3">
                    <Sparkles size={28} className="opacity-20" />
                    <p className="text-sm font-semibold text-foreground">Заказов нет</p>
                  </div>
                ) : (
                  <>
                    {selectedActiveOrders.map((order) => (
                      <OrderCard key={order.id} order={order} onAccept={acceptOrder.mutate} onServed={markServed.mutate} onCancel={cancelOrder.mutate} onCancelItem={(orderId, itemId) => cancelItem.mutate({ orderId, itemId })} onPay={setPayOrder} />
                    ))}
                    {selectedHistoryOrders.length > 0 && (
                      <>
                        <div className="flex items-center gap-2 pt-1">
                          <div className="h-px flex-1 bg-border" />
                          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">История смены</span>
                          <div className="h-px flex-1 bg-border" />
                        </div>
                        {selectedHistoryOrders.map((order) => (
                          <OrderCard key={order.id} order={order} onAccept={acceptOrder.mutate} onServed={markServed.mutate} onCancel={cancelOrder.mutate} onCancelItem={(orderId, itemId) => cancelItem.mutate({ orderId, itemId })} onPay={setPayOrder} />
                        ))}
                      </>
                    )}
                  </>
                )}
              </div>
            )}

            {activeTab === 'menu' && (
              <div className="flex flex-col flex-1 overflow-hidden">
                <div className="flex gap-2 overflow-x-auto px-4 py-2 border-b border-border/40 flex-shrink-0">
                  <button onClick={() => setActiveCategoryId(null)} className={`flex-shrink-0 rounded-xl px-3 py-1.5 text-xs font-bold ${!activeCategoryId ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>Все</button>
                  {categories.map((cat) => (
                    <button key={cat.id} onClick={() => setActiveCategoryId(cat.id)} className={`flex-shrink-0 rounded-xl px-3 py-1.5 text-xs font-bold ${activeCategoryId === cat.id ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>{cat.name}</button>
                  ))}
                </div>
                <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
                  {filteredItems.map((item) => {
                    const qty = cart[item.id] ?? 0
                    return (
                      <div key={item.id} className="flex items-center gap-3 rounded-2xl border border-border bg-card px-3 py-2.5">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-bold text-foreground">{item.name}</p>
                          {item.weight && <p className="text-[10px] text-muted-foreground">{item.weight}</p>}
                        </div>
                        <p className="flex-shrink-0 text-sm font-black text-foreground">{fmt(item.price)}</p>
                        {qty === 0 ? (
                          <button onClick={() => addToCart(item.id)} className="flex-shrink-0 flex h-8 w-8 items-center justify-center rounded-xl bg-primary text-primary-foreground">
                            <Plus size={15} />
                          </button>
                        ) : (
                          <div className="flex-shrink-0 flex items-center gap-1">
                            <button onClick={() => removeFromCart(item.id)} className="flex h-7 w-7 items-center justify-center rounded-lg bg-muted"><Minus size={13} /></button>
                            <span className="w-5 text-center text-sm font-black">{qty}</span>
                            <button onClick={() => addToCart(item.id)} className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-primary-foreground"><Plus size={13} /></button>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
                {cartCount > 0 && (
                  <div className="flex-shrink-0 border-t border-border/60 px-4 py-3">
                    <button
                      disabled={createOrder.isPending}
                      onClick={() => createOrder.mutate({
                        tableId: selectedTableId!,
                        items: Object.entries(cart).map(([menuItemId, quantity]) => ({ menuItemId, quantity })),
                      })}
                      className="flex w-full items-center justify-center gap-2 rounded-2xl bg-primary py-3 text-sm font-extrabold text-primary-foreground disabled:opacity-50"
                    >
                      <ShoppingCart size={15} />
                      {createOrder.isPending ? 'Оформляем...' : `Оформить · ${fmt(cartTotal)}`}
                    </button>
                  </div>
                )}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Mobile overlay */}
      {selectedTableId && (
        <div
          className="fixed inset-0 z-40 bg-black/40 md:hidden"
          onClick={() => handleTableSelect(null)}
        />
      )}

      <AnimatePresence>
        {payOrder && (
          <WaiterPaymentModal
            order={payOrder}
            onPay={(method) => createPayment.mutate({ orderId: payOrder.id, method, amount: payOrder.totalAmount })}
            onClose={() => setPayOrder(null)}
            isPending={createPayment.isPending}
          />
        )}
      </AnimatePresence>
    </div>
  )
}

function WaiterPaymentModal({
  order,
  onPay,
  onClose,
  isPending,
}: {
  order: Order
  onPay: (method: string) => void
  onClose: () => void
  isPending: boolean
}) {
  const [method, setMethod] = useState<'cash' | 'card' | 'qr'>('cash')
  const fmt = useFormatPrice()
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center" onClick={onClose}>
      <motion.div
        initial={{ y: 60, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 60, opacity: 0 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-t-3xl sm:rounded-3xl bg-card border border-border p-6 space-y-4"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-extrabold text-foreground">Принять оплату</h2>
          <button onClick={onClose} className="rounded-xl p-2 text-muted-foreground hover:bg-muted">
            <X size={18} />
          </button>
        </div>

        <div className="rounded-2xl bg-muted/60 px-4 py-3 space-y-0.5">
          <p className="text-xs text-muted-foreground">Заказ #{order.orderNumber} · Стол №{order.tableNumber ?? '?'}</p>
          <p className="text-2xl font-black text-foreground">{order.totalAmount.toLocaleString('ru-RU')} ₸</p>
        </div>

        <div>
          <p className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">Способ оплаты</p>
          <div className="grid grid-cols-3 gap-2">
            {([
              { value: 'cash', label: 'Наличные' },
              { value: 'card', label: 'Карта' },
              { value: 'qr', label: 'QR' },
            ] as const).map((m) => (
              <button
                key={m.value}
                onClick={() => setMethod(m.value)}
                className={`h-12 rounded-2xl text-sm font-bold border transition-all ${method === m.value ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:border-primary/50'}`}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>

        <button
          onClick={() => onPay(method)}
          disabled={isPending}
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-500 py-3.5 text-base font-extrabold text-white hover:bg-emerald-400 active:scale-[0.98] disabled:opacity-60 transition-all"
        >
          <CreditCard size={17} />
          {isPending ? 'Фиксируем...' : 'Подтвердить оплату'}
        </button>
      </motion.div>
    </div>
  )
}

function OrderCard({ order, onAccept, onServed, onCancel, onCancelItem, onPay }: {
  order: Order
  onAccept: (id: string) => void
  onServed: (id: string) => void
  onCancel: (id: string) => void
  onCancelItem: (orderId: string, itemId: string) => void
  onPay: (order: Order) => void
}) {
  const fmt = useFormatPrice()
  const isReady = order.status === 'ready'
  const isNew = order.status === 'new'
  const isAccepted = order.status === 'accepted'
  const isServed = order.status === 'served'
  const canCancel = isNew || isAccepted
  const canCancelItems = isNew || isAccepted

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={`overflow-hidden rounded-2xl border ${isReady ? 'border-emerald-500/40 bg-emerald-500/[0.04]' : isNew ? 'border-blue-500/30 bg-blue-500/[0.04]' : 'border-border bg-card'}`}
    >
      {/* Order header */}
      <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="text-base font-black text-foreground">#{order.orderNumber}</span>
          <span className={`rounded-lg px-2 py-0.5 text-[10px] font-bold ${getOrderStatusColor(order.status)}`}>
            {getOrderStatusLabel(order.status)}
          </span>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Clock3 size={11} />
          {timeAgo(order.createdAt)}
        </div>
      </div>

      {/* Items */}
      <div className="space-y-2 p-4">
        {order.items.map((item) => (
          <div key={item.id} className={`flex items-start gap-2 ${item.isCancelled ? 'opacity-40' : ''}`}>
            <span className={`flex h-6 min-w-6 items-center justify-center rounded-md text-xs font-black ${item.isCancelled ? 'bg-red-500/10 text-red-400' : 'bg-primary/10 text-primary'}`}>
              {item.quantity}
            </span>
            <div className="min-w-0 flex-1">
              <p className={`text-sm font-semibold leading-tight ${item.isCancelled ? 'text-muted-foreground line-through' : 'text-foreground'}`}>
                {item.itemNameSnapshot}
              </p>
              {item.comment && (
                <p className="mt-0.5 text-xs text-amber-500 font-medium">💬 {item.comment}</p>
              )}
            </div>
            <span className="text-xs font-semibold text-muted-foreground flex-shrink-0">
              {fmt(item.itemPriceSnapshot * item.quantity)}
            </span>
            {canCancelItems && !item.isCancelled && (
              <button
                onClick={() => onCancelItem(order.id, item.id)}
                className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-md border border-red-500/30 bg-red-500/10 text-red-500 hover:bg-red-500/20 active:scale-90"
                title="Убрать одну порцию"
              >
                <Minus size={11} />
              </button>
            )}
          </div>
        ))}

        {order.customerComment && (
          <div className="mt-2 rounded-xl bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
            💬 {order.customerComment}
          </div>
        )}

        <div className="mt-2 flex items-center justify-between border-t border-border/60 pt-2">
          <span className="text-xs text-muted-foreground">{order.items.length} позиций</span>
          <span className="text-sm font-black text-foreground">{fmt(order.totalAmount)}</span>
        </div>

        {/* Action buttons */}
        {isNew && (
          <button
            onClick={() => onAccept(order.id)}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-blue-500 py-2.5 text-sm font-bold text-white hover:bg-blue-400 active:scale-[0.98] transition-all"
          >
            <CheckCircle2 size={15} />
            Принять заказ → кухня
          </button>
        )}
        {isReady && (
          <button
            onClick={() => onServed(order.id)}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 py-2.5 text-sm font-bold text-white hover:bg-emerald-400 active:scale-[0.98] transition-all"
          >
            <UtensilsCrossed size={15} />
            Подано клиенту ✓
          </button>
        )}
        {isServed && (
          <button
            onClick={() => onPay(order)}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-green-500 py-2.5 text-sm font-bold text-white hover:bg-green-400 active:scale-[0.98] transition-all"
          >
            <CreditCard size={15} />
            Клиент оплатил
          </button>
        )}
        {canCancel && (
          <button
            onClick={() => onCancel(order.id)}
            className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 py-2 text-sm font-semibold text-red-500 hover:bg-red-500/20 active:scale-[0.98] transition-all"
          >
            <X size={14} />
            Отменить заказ
          </button>
        )}
      </div>
    </motion.div>
  )
}
