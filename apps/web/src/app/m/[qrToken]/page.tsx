'use client'

import { useState, useEffect, useRef } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import Image from 'next/image'
import { useParams } from 'next/navigation'
import axios from 'axios'
import {
  ArrowLeft, Bell, Clock3, CreditCard, Minus, Plus,
  ReceiptText, Search, ShoppingBag, ShieldAlert, Sparkles, Star,
  UtensilsCrossed, X, ChevronRight,
} from 'lucide-react'
import { formatPrice, getOrderStatusLabel } from '@/lib/utils'
import { useSocket } from '@/hooks/useSocket'
import toast from 'react-hot-toast'

const guestApi = axios.create({
  baseURL: `${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000'}/api/v1`,
})

// ─── Types ────────────────────────────────────────────────────────────────────

interface MenuItem {
  id: string
  name: string
  description: string | null
  price: number
  imageUrl: string | null
  weight: string | null
  cookingTime: number | null
  isAvailable: boolean
  isPopular: boolean
  categoryId: string | null
}

interface MenuCategory {
  id: string
  name: string
  sortOrder: number
  items: MenuItem[]
}

interface MenuData {
  restaurant: { id: string; name: string; logoUrl: string | null; currency: string }
  table: { id: string; number: number; zone: string | null }
  menu: MenuCategory[]
}

interface OrderStatusData {
  id: string
  orderNumber: number
  status: string
  paymentStatus: string
  totalAmount: number
  createdAt: string
}

interface CartItem {
  item: MenuItem
  quantity: number
}

// ─── Cart ─────────────────────────────────────────────────────────────────────

function useCart() {
  const [items, setItems] = useState<CartItem[]>([])

  function addItem(item: MenuItem) {
    setItems((prev) => {
      const existing = prev.find((i) => i.item.id === item.id)
      if (existing) return prev.map((i) => i.item.id === item.id ? { ...i, quantity: i.quantity + 1 } : i)
      return [...prev, { item, quantity: 1 }]
    })
  }

  function removeItem(itemId: string) {
    setItems((prev) => {
      const existing = prev.find((i) => i.item.id === itemId)
      if (!existing) return prev
      if (existing.quantity <= 1) return prev.filter((i) => i.item.id !== itemId)
      return prev.map((i) => i.item.id === itemId ? { ...i, quantity: i.quantity - 1 } : i)
    })
  }

  function updateQty(itemId: string, qty: number) {
    if (qty <= 0) { setItems((prev) => prev.filter((i) => i.item.id !== itemId)); return }
    setItems((prev) => prev.map((i) => i.item.id === itemId ? { ...i, quantity: qty } : i))
  }

  function clear() { setItems([]) }

  const total = items.reduce((sum, i) => sum + i.item.price * i.quantity, 0)
  const count = items.reduce((s, i) => s + i.quantity, 0)

  return { items, addItem, removeItem, updateQty, clear, total, count }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function GuestMenuPage() {
  const { qrToken } = useParams<{ qrToken: string }>()
  const [activeCategory, setActiveCategory] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [cartOpen, setCartOpen] = useState(false)
  const [feedbackOpen, setFeedbackOpen] = useState(false)
  const [customerComment, setCustomerComment] = useState('')
  const [publicToken, setPublicToken] = useState<string | null>(null)
  const categoryRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const cart = useCart()
  const storageKey = `menuflow:order:${qrToken}`

  const { connected, on } = useSocket({ orderToken: publicToken ?? undefined })

  const { data: menuData, isLoading, error } = useQuery<MenuData>({
    queryKey: ['menu', qrToken],
    queryFn: () => guestApi.get(`/public/table/${qrToken}/menu`).then((r) => r.data),
  })

  const { data: orderStatus, isError: orderStatusError, refetch: refetchStatus } = useQuery<OrderStatusData>({
    queryKey: ['order-status', publicToken],
    queryFn: () => guestApi.get(`/public/orders/${publicToken}/status`).then((r) => r.data),
    enabled: !!publicToken,
    refetchInterval: publicToken ? 15_000 : false,
  })

  useEffect(() => {
    const saved = localStorage.getItem(storageKey)
    if (!saved) return
    try { const { token } = JSON.parse(saved) as { token: string }; if (token) setPublicToken(token) }
    catch { localStorage.removeItem(storageKey) }
  }, [storageKey])

  useEffect(() => {
    if (!orderStatusError) return
    localStorage.removeItem(storageKey)
    setPublicToken(null)
  }, [orderStatusError, storageKey])

  useEffect(() => {
    if (!orderStatus) return
    if (orderStatus.status === 'paid' || orderStatus.status === 'served') {
      const t = setTimeout(() => { localStorage.removeItem(storageKey); setPublicToken(null) }, 8000)
      return () => clearTimeout(t)
    }
  }, [orderStatus?.status, storageKey])

  useEffect(() => {
    if (menuData?.menu[0]) setActiveCategory(menuData.menu[0].id)
  }, [menuData])

  useEffect(() => {
    if (!publicToken || !connected) return
    const offAccepted = on('order_accepted', () => refetchStatus())
    const offCooking = on('order_cooking', () => refetchStatus())
    const offReady = on('order_ready', () => refetchStatus())
    const offPaid = on('order_paid', () => refetchStatus())
    const offCancelled = on('order_cancelled', () => refetchStatus())
    const offBill = on('bill_completed', () => {
      toast('💳 Официант несёт счёт — подождите немного', { duration: 8000 })
    })
    return () => { offAccepted(); offCooking(); offReady(); offPaid(); offCancelled(); offBill() }
  }, [connected, publicToken, on, refetchStatus])

  const createOrderMutation = useMutation({
    mutationFn: () => guestApi.post(`/public/table/${qrToken}/orders`, {
      items: cart.items.map((i) => ({ menuItemId: i.item.id, quantity: i.quantity })),
      customerComment: customerComment || null,
    }),
    onSuccess: (res) => {
      const data = res.data as { publicToken: string }
      setPublicToken(data.publicToken)
      localStorage.setItem(storageKey, JSON.stringify({ token: data.publicToken }))
      cart.clear()
      setCartOpen(false)
      toast.success('Заказ отправлен!')
    },
    onError: () => toast.error('Не удалось отправить заказ'),
  })

  const callWaiterMutation = useMutation({
    mutationFn: () => guestApi.post(`/public/table/${qrToken}/call-waiter`),
    onSuccess: () => toast.success('Официант вызван'),
    onError: () => toast.error('Не удалось вызвать официанта'),
  })

  const requestBillMutation = useMutation({
    mutationFn: () => guestApi.post(`/public/table/${qrToken}/bill-request`),
    onSuccess: () => toast.success('Счёт будет принесён'),
    onError: () => toast.error('Ошибка'),
  })

  const callAdminMutation = useMutation({
    mutationFn: () => guestApi.post(`/public/table/${qrToken}/call-admin`),
    onSuccess: () => toast.success('Администратор уведомлён'),
    onError: () => toast.error('Не удалось вызвать администратора'),
  })

  const submitFeedbackMutation = useMutation({
    mutationFn: (data: { rating: number; comment: string | null }) =>
      guestApi.post(`/public/table/${qrToken}/feedback`, data),
    onSuccess: () => toast.success('Спасибо за отзыв!'),
    onError: () => toast.error('Не удалось отправить отзыв'),
  })

  if (isLoading) return <MenuSkeleton />
  if (error || !menuData) return <ErrorScreen />

  const { restaurant, table, menu } = menuData
  const currency = restaurant.currency

  if (publicToken && orderStatus) {
    return (
      <OrderStatusScreen
        order={orderStatus}
        currency={currency}
        onCallWaiter={() => callWaiterMutation.mutate()}
        onCallAdmin={() => callAdminMutation.mutate()}
        onRequestBill={() => requestBillMutation.mutate()}
        onBack={() => { localStorage.removeItem(storageKey); setPublicToken(null) }}
        onSubmitFeedback={(rating, comment) => submitFeedbackMutation.mutateAsync({ rating, comment })}
        feedbackSubmitting={submitFeedbackMutation.isPending}
      />
    )
  }

  const isSearching = searchQuery.trim().length > 0
  const searchResults = isSearching
    ? menu.flatMap((cat) => cat.items).filter(
        (item) => item.isAvailable && (
          item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          item.description?.toLowerCase().includes(searchQuery.toLowerCase())
        )
      )
    : []

  function scrollToCategory(catId: string) {
    setActiveCategory(catId)
    setSearchQuery('')
    setTimeout(() => {
      categoryRefs.current[catId]?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 50)
  }

  return (
    <div className="mx-auto min-h-screen max-w-[540px] bg-[#f7f3ed] shadow-[0_0_80px_rgba(52,31,13,0.12)]">

      {/* ── Hero ── */}
      <div className="relative overflow-hidden bg-[#160e09]" style={{ minHeight: 220 }}>
        {/* Background texture */}
        <div
          className="absolute inset-0 opacity-20"
          style={{
            backgroundImage: restaurant.logoUrl
              ? `url('${restaurant.logoUrl}')`
              : "url('/images/restaurant-hero.png')",
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            filter: 'blur(18px)',
            transform: 'scale(1.1)',
          }}
        />
        <div className="absolute inset-0 bg-gradient-to-b from-[#160e09]/50 via-[#160e09]/70 to-[#160e09]" />

        {/* Content */}
        <div className="relative flex flex-col items-center px-5 pb-10 pt-10 text-center">
          {/* Logo */}
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 260, damping: 20 }}
            className="mb-4 flex h-20 w-20 items-center justify-center overflow-hidden rounded-[22px] border border-white/15 bg-white/10 shadow-[0_20px_60px_rgba(0,0,0,0.4)] backdrop-blur-md"
          >
            {restaurant.logoUrl ? (
              <Image src={restaurant.logoUrl} alt={restaurant.name} width={80} height={80} className="h-full w-full object-cover" />
            ) : (
              <UtensilsCrossed size={30} className="text-orange-300" />
            )}
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
            <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-orange-300/80">Добро пожаловать</p>
            <h1 className="mt-1.5 text-2xl font-black tracking-tight text-white">{restaurant.name}</h1>
            <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-4 py-1.5 text-xs font-semibold text-white/70 backdrop-blur-sm">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              Стол №{table.number}{table.zone ? ` · ${table.zone}` : ''}
            </div>
            <p className="mt-2.5 text-[11px] leading-relaxed text-white/40">Выберите блюда и оформите заказ прямо с телефона</p>
          </motion.div>
        </div>
      </div>

      {/* ── Sticky header: search + categories ── */}
      <div className="sticky top-0 z-20 border-b border-[#eadfd2] bg-[#f7f3ed]/96 backdrop-blur-xl">
        {/* Search */}
        <div className="px-4 pt-3 pb-2">
          <div className="relative">
            <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#a09184]" />
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Поиск блюд..."
              className="w-full rounded-2xl border border-[#e0d5c8] bg-white py-2.5 pl-9 pr-9 text-sm text-[#251a14] placeholder:text-[#a09184] focus:border-[#c4a882] focus:outline-none focus:ring-4 focus:ring-[#e8d5c0]/50 transition-all"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 flex h-5 w-5 items-center justify-center rounded-full bg-[#d0c4b8] text-[#7b6c60] hover:bg-[#c4b8ac]"
              >
                <X size={11} />
              </button>
            )}
          </div>
        </div>

        {/* Categories */}
        <div className="overflow-x-auto no-scrollbar">
          <div className="flex gap-2 px-4 pb-3">
            {menu.map((cat) => (
              <button
                key={cat.id}
                onClick={() => scrollToCategory(cat.id)}
                className={`relative whitespace-nowrap rounded-2xl px-4 py-2 text-xs font-bold transition-all ${
                  activeCategory === cat.id && !isSearching
                    ? 'bg-[#201712] text-white shadow-lg shadow-[#201712]/20'
                    : 'border border-[#e4d8c8] bg-white text-[#7b6c60] hover:border-[#c4a882] hover:text-[#251a14]'
                }`}
              >
                {cat.name}
                {activeCategory === cat.id && !isSearching && (
                  <motion.span
                    layoutId="cat-indicator"
                    className="absolute inset-0 rounded-2xl bg-[#201712]"
                    style={{ zIndex: -1 }}
                  />
                )}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Menu content ── */}
      {isSearching ? (
        // Search results
        <div className="px-4 pb-52 pt-5">
          {searchResults.length === 0 ? (
            <div className="flex flex-col items-center py-20 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-[20px] bg-[#e8ddd0] text-[#a09184]">
                <Search size={24} />
              </div>
              <p className="mt-4 font-extrabold text-[#251a14]">Ничего не найдено</p>
              <p className="mt-1 text-sm text-[#8c7c70]">Попробуйте другой запрос</p>
            </div>
          ) : (
            <>
              <p className="mb-4 text-xs font-bold text-[#a09184]">
                Найдено: {searchResults.length} {searchResults.length === 1 ? 'блюдо' : 'блюд'}
              </p>
              <div className="grid grid-cols-2 gap-3">
                {searchResults.map((item) => (
                  <DishCard
                    key={item.id}
                    item={item}
                    currency={currency}
                    qty={cart.items.find((i) => i.item.id === item.id)?.quantity ?? 0}
                    onAdd={() => { cart.addItem(item); toast.success('Добавлено', { duration: 1200 }) }}
                    onRemove={() => cart.removeItem(item.id)}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      ) : (
        // Categories
        <div className="space-y-8 px-4 pb-52 pt-6">
          {menu.map((cat) => {
            const available = cat.items.filter((i) => i.isAvailable)
            if (available.length === 0) return null
            return (
              <div
                key={cat.id}
                ref={(el) => { categoryRefs.current[cat.id] = el }}
                className="scroll-mt-[124px]"
              >
                {/* Category header */}
                <div className="mb-4 flex items-end justify-between">
                  <div>
                    <p className="text-[9px] font-black uppercase tracking-[0.22em] text-[#c4955a]">Раздел меню</p>
                    <h2 className="mt-1 text-xl font-extrabold tracking-tight text-[#251a14]">{cat.name}</h2>
                  </div>
                  <span className="rounded-xl bg-[#ede5da] px-2.5 py-1 text-[10px] font-bold text-[#8c7c70]">
                    {available.length} блюд
                  </span>
                </div>

                {/* 2-column grid */}
                <div className="grid grid-cols-2 gap-3">
                  {available.map((item) => (
                    <DishCard
                      key={item.id}
                      item={item}
                      currency={currency}
                      qty={cart.items.find((i) => i.item.id === item.id)?.quantity ?? 0}
                      onAdd={() => { cart.addItem(item); toast.success('Добавлено', { duration: 1200 }) }}
                      onRemove={() => cart.removeItem(item.id)}
                    />
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ── Cart FAB ── */}
      <AnimatePresence>
        {cart.count > 0 && (
          <motion.div
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 100, opacity: 0 }}
            className="fixed bottom-[72px] left-4 right-4 z-30 mx-auto max-w-[508px]"
          >
            <button
              onClick={() => setCartOpen(true)}
              className="flex w-full items-center justify-between rounded-2xl bg-[#201712] px-4 py-3.5 font-bold text-white shadow-[0_20px_45px_rgba(32,23,18,0.32)] active:scale-[0.98] transition-transform"
            >
              <span className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-500 shadow-lg shadow-orange-500/30">
                  <ShoppingBag size={18} />
                </span>
                <span className="text-left">
                  <span className="block text-sm font-extrabold">Корзина</span>
                  <span className="block text-[10px] font-medium text-white/50">{cart.count} позиций</span>
                </span>
              </span>
              <span className="flex items-center gap-1.5 text-sm font-black">
                {formatPrice(cart.total, currency)}
                <ChevronRight size={16} className="text-white/40" />
              </span>
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Bottom action bar ── */}
      <div className="fixed bottom-0 left-0 right-0 z-20 mx-auto flex max-w-[540px] gap-2 border-t border-[#eadfd2] bg-[#f7f3ed]/95 px-4 py-3 backdrop-blur-md">
        <button
          onClick={() => callWaiterMutation.mutate()}
          disabled={callWaiterMutation.isPending}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-2xl border border-[#dfd2c4] bg-white py-3 text-sm font-extrabold text-[#251a14] shadow-sm active:scale-[0.97] disabled:opacity-60 transition-all"
        >
          <Bell size={15} />
          Официант
        </button>
        <button
          onClick={() => callAdminMutation.mutate()}
          disabled={callAdminMutation.isPending}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-2xl border border-amber-300/60 bg-amber-50 py-3 text-sm font-extrabold text-amber-700 shadow-sm active:scale-[0.97] disabled:opacity-60 transition-all"
        >
          <ShieldAlert size={15} />
          Менеджер
        </button>
        <button
          onClick={() => setFeedbackOpen(true)}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-2xl border border-orange-200/70 bg-orange-50 py-3 text-sm font-extrabold text-orange-600 shadow-sm active:scale-[0.97] transition-all"
        >
          <Star size={15} />
          Отзыв
        </button>
      </div>

      {/* ── Cart Sheet ── */}
      <AnimatePresence>
        {cartOpen && (
          <CartSheet
            cart={cart}
            currency={currency}
            customerComment={customerComment}
            onCommentChange={setCustomerComment}
            onClose={() => setCartOpen(false)}
            onSubmit={() => createOrderMutation.mutate()}
            isSubmitting={createOrderMutation.isPending}
          />
        )}
      </AnimatePresence>

      {/* ── Feedback Sheet ── */}
      <AnimatePresence>
        {feedbackOpen && (
          <FeedbackSheet
            onClose={() => setFeedbackOpen(false)}
            onSubmit={(rating, comment) => submitFeedbackMutation.mutateAsync({ rating, comment })}
            isSubmitting={submitFeedbackMutation.isPending}
          />
        )}
      </AnimatePresence>
    </div>
  )
}

// ─── DishCard ─────────────────────────────────────────────────────────────────

function DishCard({ item, currency, qty, onAdd, onRemove }: {
  item: MenuItem
  currency: string
  qty: number
  onAdd: () => void
  onRemove: () => void
}) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      className="relative flex flex-col overflow-hidden rounded-2xl border border-[#eadfd2] bg-white shadow-[0_4px_20px_rgba(67,42,21,0.07)]"
    >
      {/* Image */}
      <div className="relative aspect-[4/3] overflow-hidden bg-gradient-to-br from-[#ead8c3] to-[#d4bfa6]">
        {item.imageUrl ? (
          <Image src={item.imageUrl} alt={item.name} fill className="object-cover" sizes="(max-width: 540px) 50vw" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-[#c0a080]">
            <UtensilsCrossed size={28} />
          </div>
        )}

        {/* Popular badge */}
        {item.isPopular && (
          <span className="absolute left-2 top-2 rounded-lg bg-orange-500 px-2 py-0.5 text-[9px] font-black text-white shadow-md">
            ⭐ Хит
          </span>
        )}

        {/* Qty badge */}
        {qty > 0 && (
          <motion.span
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className="absolute right-2 top-2 flex h-6 min-w-6 items-center justify-center rounded-full bg-[#201712] px-1 text-[10px] font-black text-white shadow-lg"
          >
            {qty}
          </motion.span>
        )}
      </div>

      {/* Info */}
      <div className="flex flex-1 flex-col p-3">
        <p className="text-[13px] font-extrabold leading-snug text-[#251a14] line-clamp-2">{item.name}</p>

        {item.description && (
          <p className="mt-1 text-[11px] leading-4 text-[#9b8c80] line-clamp-2">{item.description}</p>
        )}

        {(item.weight || item.cookingTime) && (
          <div className="mt-1.5 flex items-center gap-2 text-[10px] text-[#b0a090]">
            {item.weight && <span>{item.weight}</span>}
            {item.cookingTime && (
              <span className="flex items-center gap-0.5">
                <Clock3 size={10} />{item.cookingTime} мин
              </span>
            )}
          </div>
        )}

        <div className="mt-auto flex items-center justify-between pt-2.5">
          <p className="text-sm font-black text-[#251a14]">{formatPrice(item.price, currency)}</p>

          {qty === 0 ? (
            <button
              onClick={onAdd}
              className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#201712] text-white shadow-md shadow-[#201712]/20 active:scale-90 transition-transform"
            >
              <Plus size={16} strokeWidth={2.8} />
            </button>
          ) : (
            <div className="flex items-center gap-0.5 rounded-xl bg-[#201712] p-0.5 shadow-md shadow-[#201712]/20">
              <button
                onClick={onRemove}
                className="flex h-6 w-6 items-center justify-center rounded-lg text-white/70 hover:text-white active:scale-90 transition-transform"
              >
                <Minus size={11} strokeWidth={2.5} />
              </button>
              <span className="w-5 text-center text-xs font-black text-white">{qty}</span>
              <button
                onClick={onAdd}
                className="flex h-6 w-6 items-center justify-center rounded-lg text-white/70 hover:text-white active:scale-90 transition-transform"
              >
                <Plus size={11} strokeWidth={2.5} />
              </button>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  )
}

// ─── CartSheet ────────────────────────────────────────────────────────────────

function CartSheet({ cart, currency, customerComment, onCommentChange, onClose, onSubmit, isSubmitting }: {
  cart: ReturnType<typeof useCart>
  currency: string
  customerComment: string
  onCommentChange: (v: string) => void
  onClose: () => void
  onSubmit: () => void
  isSubmitting: boolean
}) {
  return (
    <>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm" onClick={onClose}
      />
      <motion.div
        initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 30, stiffness: 300 }}
        className="fixed bottom-0 left-0 right-0 z-50 mx-auto flex max-h-[88vh] max-w-[540px] flex-col rounded-t-[32px] bg-[#fffdfa] shadow-2xl"
      >
        <div className="mx-auto mb-4 mt-3 h-1 w-12 rounded-full bg-[#d8cdc1]" />
        <div className="mb-4 flex items-center justify-between px-5">
          <div>
            <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-orange-500">Ваш заказ</p>
            <h2 className="mt-1 text-xl font-extrabold text-[#251a14]">Корзина</h2>
          </div>
          <button onClick={onClose} className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#f1ebe4] text-[#76685c] hover:text-[#251a14] transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 space-y-2.5 overflow-y-auto px-5">
          {cart.items.map((cartItem) => (
            <div key={cartItem.item.id} className="flex items-center gap-3 rounded-2xl border border-[#eadfd2] bg-white p-3">
              <div className="h-12 w-12 flex-shrink-0 overflow-hidden rounded-xl bg-[#ead8c3]">
                {cartItem.item.imageUrl ? (
                  <Image src={cartItem.item.imageUrl} alt={cartItem.item.name} width={48} height={48} className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-[#c0a080]">
                    <UtensilsCrossed size={16} />
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-extrabold text-[#251a14] leading-tight line-clamp-1">{cartItem.item.name}</p>
                <p className="text-xs text-[#8c7c70]">{formatPrice(cartItem.item.price, currency)} / шт.</p>
              </div>
              <div className="flex items-center gap-1 rounded-xl bg-[#f3ede6] p-0.5">
                <button
                  onClick={() => cart.updateQty(cartItem.item.id, cartItem.quantity - 1)}
                  className="flex h-7 w-7 items-center justify-center rounded-lg bg-white text-[#251a14] shadow-sm"
                ><Minus size={12} /></button>
                <span className="w-6 text-center text-sm font-extrabold text-[#251a14]">{cartItem.quantity}</span>
                <button
                  onClick={() => cart.updateQty(cartItem.item.id, cartItem.quantity + 1)}
                  className="flex h-7 w-7 items-center justify-center rounded-lg bg-white text-[#251a14] shadow-sm"
                ><Plus size={12} /></button>
              </div>
              <span className="w-16 flex-shrink-0 text-right text-sm font-extrabold text-[#251a14]">
                {formatPrice(cartItem.item.price * cartItem.quantity, currency)}
              </span>
            </div>
          ))}

          <textarea
            value={customerComment}
            onChange={(e) => onCommentChange(e.target.value)}
            placeholder="Комментарий к заказу (аллергии, пожелания)..."
            rows={2}
            className="w-full resize-none rounded-2xl border border-[#eadfd2] bg-white px-4 py-3 text-sm text-[#251a14] placeholder:text-[#a09184] focus:border-[#c4a882] focus:outline-none focus:ring-4 focus:ring-[#e8d5c0]/50"
          />
        </div>

        <div className="space-y-3 border-t border-[#eadfd2] p-5">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-[#8c7c70]">Итого</span>
            <span className="text-2xl font-black text-[#251a14]">{formatPrice(cart.total, currency)}</span>
          </div>
          <button
            onClick={onSubmit}
            disabled={isSubmitting}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[#201712] py-4 font-extrabold text-white shadow-xl active:scale-[0.98] disabled:opacity-50 transition-all"
          >
            <ReceiptText size={18} />
            {isSubmitting ? 'Отправка...' : 'Оформить заказ'}
          </button>
        </div>
      </motion.div>
    </>
  )
}

// ─── FeedbackSheet ───────────────────────────────────────────────────────────

function FeedbackSheet({ onClose, onSubmit, isSubmitting }: {
  onClose: () => void
  onSubmit: (rating: number, comment: string | null) => Promise<unknown>
  isSubmitting: boolean
}) {
  const [rating, setRating] = useState(0)
  const [hover, setHover] = useState(0)
  const [comment, setComment] = useState('')
  const [done, setDone] = useState(false)

  async function handleSubmit() {
    if (rating === 0) return
    await onSubmit(rating, comment.trim() || null)
    setDone(true)
  }

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm" onClick={onClose}
      />
      <motion.div
        initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 30, stiffness: 300 }}
        className="fixed bottom-0 left-0 right-0 z-50 mx-auto max-w-[540px] rounded-t-[32px] bg-[#fffdfa] shadow-2xl"
      >
        <div className="mx-auto mb-4 mt-3 h-1 w-12 rounded-full bg-[#d8cdc1]" />
        <div className="mb-5 flex items-center justify-between px-5">
          <div>
            <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-orange-500">Ваше мнение важно</p>
            <h2 className="mt-1 text-xl font-extrabold text-[#251a14]">Оставить отзыв</h2>
          </div>
          <button onClick={onClose} className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#f1ebe4] text-[#76685c] hover:text-[#251a14] transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="px-5 pb-8">
          {done ? (
            <div className="flex flex-col items-center py-6 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-[22px] bg-emerald-500 text-white shadow-lg">
                <Sparkles size={28} />
              </div>
              <p className="mt-5 text-lg font-extrabold text-[#251a14]">Спасибо за отзыв!</p>
              <p className="mt-1 text-sm text-[#8c7c70]">Ваше мнение помогает нам стать лучше</p>
              <button
                onClick={onClose}
                className="mt-6 rounded-2xl bg-[#201712] px-8 py-3 text-sm font-extrabold text-white shadow-lg active:scale-[0.98]"
              >
                Закрыть
              </button>
            </div>
          ) : (
            <>
              {/* Stars */}
              <div className="flex justify-center gap-3 mb-5">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    onMouseEnter={() => setHover(star)}
                    onMouseLeave={() => setHover(0)}
                    onClick={() => setRating(star)}
                    className="transition-transform active:scale-110"
                  >
                    <Star
                      size={40}
                      className={`transition-colors ${star <= (hover || rating) ? 'text-amber-400 fill-amber-400' : 'text-[#d0c4b8]'}`}
                    />
                  </button>
                ))}
              </div>

              {rating > 0 && (
                <p className="text-center text-sm font-semibold text-[#8c7c70] mb-4">
                  {['', 'Очень плохо', 'Плохо', 'Нормально', 'Хорошо', 'Отлично!'][rating]}
                </p>
              )}

              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Расскажите подробнее (необязательно)..."
                rows={3}
                className="w-full resize-none rounded-2xl border border-[#eadfd2] bg-[#faf7f3] px-4 py-3 text-sm text-[#251a14] placeholder:text-[#a09184] focus:border-[#c4a882] focus:outline-none focus:ring-4 focus:ring-[#e8d5c0]/50"
              />

              <button
                onClick={handleSubmit}
                disabled={rating === 0 || isSubmitting}
                className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-[#201712] py-4 font-extrabold text-white shadow-xl active:scale-[0.98] disabled:opacity-40 transition-all"
              >
                <Star size={16} className="fill-white" />
                {isSubmitting ? 'Отправка...' : 'Отправить отзыв'}
              </button>
            </>
          )}
        </div>
      </motion.div>
    </>
  )
}

// ─── OrderStatusScreen ────────────────────────────────────────────────────────

function OrderStatusScreen({ order, currency, onCallWaiter, onCallAdmin, onRequestBill, onBack, onSubmitFeedback, feedbackSubmitting }: {
  order: OrderStatusData
  currency: string
  onCallWaiter: () => void
  onCallAdmin: () => void
  onRequestBill: () => void
  onBack: () => void
  onSubmitFeedback: (rating: number, comment: string | null) => Promise<unknown>
  feedbackSubmitting: boolean
}) {
  const [feedbackRating, setFeedbackRating] = useState(0)
  const [feedbackHover, setFeedbackHover] = useState(0)
  const [feedbackComment, setFeedbackComment] = useState('')
  const [feedbackDone, setFeedbackDone] = useState(false)

  const isFinished = order.status === 'paid' || order.status === 'served'
  const isPaid = order.status === 'paid' || order.status === 'cancelled'

  async function handleSendFeedback() {
    if (feedbackRating === 0) return
    await onSubmitFeedback(feedbackRating, feedbackComment.trim() || null)
    setFeedbackDone(true)
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-[540px] flex-col bg-[#f7f3ed] p-5">
      <div className="flex-shrink-0 pt-4">
        <button
          onClick={onBack}
          className="flex items-center gap-2 rounded-2xl border border-[#eadfd2] bg-white px-4 py-2.5 text-sm font-semibold text-[#251a14] transition-all hover:bg-[#f0e8df] active:scale-[0.97]"
        >
          <ArrowLeft size={16} />
          Назад в меню
        </button>
      </div>
      <div className="flex-1 space-y-5">
        <div className="pt-8 text-center">
          <div className={`mx-auto flex h-20 w-20 items-center justify-center rounded-[28px] shadow-xl ${isPaid ? 'bg-emerald-500 text-white' : 'bg-[#201712] text-orange-300'}`}>
            {isPaid ? <Sparkles size={30} /> : <Clock3 size={30} />}
          </div>
          <p className="mt-5 text-[10px] font-bold uppercase tracking-[0.18em] text-orange-500">Статус заказа</p>
          <h1 className="mt-2 text-3xl font-black tracking-tight text-[#251a14]">{getOrderStatusLabel(order.status)}</h1>
          <p className="mt-1 text-sm text-[#8c7c70]">Заказ #{order.orderNumber}</p>
        </div>

        <div className="rounded-3xl border border-[#eadfd2] bg-white p-4 shadow-[0_12px_35px_rgba(67,42,21,0.06)]">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-[#8c7c70]">Сумма заказа</span>
            <span className="text-xl font-black text-[#251a14]">{formatPrice(order.totalAmount, currency)}</span>
          </div>
        </div>

        <div className="space-y-3">
          {!isPaid && (
            <>
              <div className="grid grid-cols-2 gap-2">
                <button onClick={onCallWaiter} className="flex items-center justify-center gap-1.5 rounded-2xl border border-[#dfd2c4] bg-white py-3.5 text-sm font-extrabold text-[#251a14] hover:border-orange-300/60 active:scale-[0.97] transition-all">
                  <Bell size={16} /> Официант
                </button>
                <button onClick={onCallAdmin} className="flex items-center justify-center gap-1.5 rounded-2xl border border-amber-300/60 bg-amber-50 py-3.5 text-sm font-extrabold text-amber-700 hover:bg-amber-100 active:scale-[0.97] transition-all">
                  <ShieldAlert size={16} /> Менеджер
                </button>
              </div>
              <button onClick={onRequestBill} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[#201712] py-3.5 text-sm font-extrabold text-white shadow-xl active:scale-[0.98] transition-all">
                <ReceiptText size={17} /> Попросить счёт
              </button>
            </>
          )}
          {isPaid && (
            <button onClick={onBack} className="w-full rounded-2xl bg-[#201712] py-3.5 text-sm font-extrabold text-white shadow-xl active:scale-[0.98]">
              Сделать новый заказ
            </button>
          )}
        </div>

        {/* Feedback block — shown when order is paid or served */}
        {isFinished && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="rounded-3xl border border-[#eadfd2] bg-white p-5 shadow-[0_12px_35px_rgba(67,42,21,0.06)]"
          >
            {feedbackDone ? (
              <div className="flex flex-col items-center py-4 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-[20px] bg-emerald-500 text-white shadow-lg">
                  <Sparkles size={24} />
                </div>
                <p className="mt-4 text-base font-extrabold text-[#251a14]">Спасибо за отзыв!</p>
                <p className="mt-1 text-sm text-[#8c7c70]">Ваше мнение помогает нам стать лучше</p>
              </div>
            ) : (
              <>
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-orange-500">Оцените визит</p>
                <h3 className="mt-1 text-base font-extrabold text-[#251a14]">Как вам понравилось?</h3>

                {/* Star picker */}
                <div className="mt-4 flex justify-center gap-2">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      onMouseEnter={() => setFeedbackHover(star)}
                      onMouseLeave={() => setFeedbackHover(0)}
                      onClick={() => setFeedbackRating(star)}
                      className="transition-transform active:scale-110"
                    >
                      <Star
                        size={34}
                        className={`transition-colors ${star <= (feedbackHover || feedbackRating) ? 'text-amber-400 fill-amber-400' : 'text-[#d0c4b8]'}`}
                      />
                    </button>
                  ))}
                </div>

                {/* Comment */}
                <textarea
                  value={feedbackComment}
                  onChange={(e) => setFeedbackComment(e.target.value)}
                  placeholder="Расскажите подробнее (необязательно)..."
                  rows={3}
                  className="mt-4 w-full resize-none rounded-2xl border border-[#eadfd2] bg-[#faf7f3] px-4 py-3 text-sm text-[#251a14] placeholder:text-[#a09184] focus:border-[#c4a882] focus:outline-none focus:ring-4 focus:ring-[#e8d5c0]/50"
                />

                <button
                  onClick={handleSendFeedback}
                  disabled={feedbackRating === 0 || feedbackSubmitting}
                  className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl bg-[#201712] py-3.5 text-sm font-extrabold text-white shadow-lg transition-all active:scale-[0.98] disabled:opacity-40"
                >
                  <Star size={16} className="fill-white" />
                  {feedbackSubmitting ? 'Отправка...' : 'Отправить отзыв'}
                </button>
              </>
            )}
          </motion.div>
        )}
      </div>
    </div>
  )
}

// ─── Skeletons / Error ────────────────────────────────────────────────────────

function MenuSkeleton() {
  return (
    <div className="mx-auto min-h-screen max-w-[540px] bg-[#f7f3ed]">
      <div className="skeleton h-[220px] w-full" />
      <div className="p-4 space-y-3">
        <div className="skeleton h-10 w-full rounded-2xl" />
        <div className="flex gap-2">
          {[1, 2, 3, 4].map((i) => <div key={i} className="skeleton h-9 w-20 flex-shrink-0 rounded-2xl" />)}
        </div>
        <div className="skeleton h-5 w-32 rounded-lg mt-4" />
        <div className="grid grid-cols-2 gap-3">
          {[1, 2, 3, 4].map((i) => <div key={i} className="skeleton h-52 rounded-2xl" />)}
        </div>
      </div>
    </div>
  )
}

function ErrorScreen() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#f7f3ed] p-6 text-center">
      <div className="flex h-20 w-20 items-center justify-center rounded-[28px] bg-[#201712] text-orange-300 shadow-xl">
        <UtensilsCrossed size={30} />
      </div>
      <p className="mt-6 text-[10px] font-bold uppercase tracking-[0.18em] text-orange-500">MenuFlow</p>
      <h1 className="mt-2 text-2xl font-black tracking-tight text-[#251a14]">Меню не найдено</h1>
      <p className="mt-2 max-w-xs text-sm leading-6 text-[#8c7c70]">QR-код мог устареть. Попросите сотрудника показать актуальный код.</p>
    </div>
  )
}
