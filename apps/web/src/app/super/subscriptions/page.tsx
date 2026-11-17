'use client'

import { useState, useCallback, type ElementType } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AnimatePresence, motion } from 'framer-motion'
import {
  CalendarClock,
  ChevronDown,
  X,
  CheckCircle,
  AlertCircle,
  Clock,
  Ban,
  CreditCard,
  History,
  FileText,
  Settings,
  Plus,
  Minus,
  Calendar,
  ArrowRight,
  RefreshCw,
  ReceiptText,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { api } from '@/lib/api'
import { formatDate, formatPrice } from '@/lib/utils'

// ─── Types ────────────────────────────────────────────────────────────────────

interface SubscriptionSummary {
  restaurant_id: string
  restaurant_name: string
  restaurant_slug: string
  restaurant_status: string
  tariff_id: string | null
  tariff_name: string | null
  tariff_price: number | null
  subscription_started_at: string | null
  subscription_ends_at: string | null
  days_left: number | null
  last_payment_at: string | null
  last_extension_at: string | null
  last_extended_by: string | null
}

interface SubscriptionDetail extends SubscriptionSummary {
  tariff_max_tables: number | null
  tariff_max_staff: number | null
  tariff_max_menu_items: number | null
  tariff_analytics_enabled: boolean | null
  tariff_feedback_enabled: boolean | null
  tariff_branding_enabled: boolean | null
}

interface SubscriptionHistoryItem {
  id: string
  restaurant_id: string
  action: string
  tariff_before: string | null
  tariff_after: string | null
  old_end_date: string | null
  new_end_date: string | null
  days_delta: number | null
  payment_amount: number | null
  payment_currency: string | null
  payment_method: string | null
  payment_status: string | null
  transaction_reference: string | null
  comment: string | null
  changed_by_name: string | null
  changed_by_role: string | null
  ip_address: string | null
  created_at: string
}

interface SubscriptionPaymentItem {
  id: string
  restaurant_id: string
  tariff_name: string | null
  amount: number
  currency: string
  payment_method: string
  payment_status: string
  paid_days: number | null
  paid_from: string | null
  paid_until: string | null
  transaction_reference: string | null
  comment: string | null
  accepted_by_name: string | null
  created_at: string
  paid_at: string | null
}

interface Tariff {
  id: string
  name: string
  price: number
  period_days: number
}

interface ActivityLogItem {
  id: string
  action: string
  entityType: string | null
  description: string | null
  createdAt: string
}

// ─── Constants ────────────────────────────────────────────────────────────────

const RESTAURANT_STATUS_LABELS: Record<string, string> = {
  trial: 'Пробный',
  active: 'Активен',
  expired: 'Истёк',
  blocked: 'Заблокирован',
}

const RESTAURANT_STATUS_COLORS: Record<string, string> = {
  trial: 'bg-violet-500/10 text-violet-500',
  active: 'bg-emerald-500/10 text-emerald-500',
  expired: 'bg-orange-500/10 text-orange-500',
  blocked: 'bg-red-500/10 text-red-500',
}

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  cash: 'Наличные',
  bank_transfer: 'Банк. перевод',
  card: 'Карта',
  mbank: 'MBank',
  odengi: 'O!Деньги',
  balance: 'Баланс',
  free: 'Бесплатно',
  other: 'Другое',
}

const PAYMENT_STATUS_LABELS: Record<string, string> = {
  pending: 'Ожидание',
  paid: 'Оплачено',
  cancelled: 'Отменено',
  refunded: 'Возврат',
}

const PAYMENT_STATUS_COLORS: Record<string, string> = {
  pending: 'bg-amber-500/10 text-amber-500',
  paid: 'bg-emerald-500/10 text-emerald-500',
  cancelled: 'bg-gray-500/10 text-gray-400',
  refunded: 'bg-blue-500/10 text-blue-500',
}

const HISTORY_ACTION_LABELS: Record<string, string> = {
  created: 'Создана',
  extended: 'Продлена',
  reduced: 'Сокращена',
  set_expiry_date: 'Дата задана',
  tariff_changed: 'Тариф изменён',
  activated: 'Активирована',
  expired: 'Истекла',
  blocked: 'Заблокирована',
}

const HISTORY_ACTION_COLORS: Record<string, string> = {
  created: 'bg-blue-500/10 text-blue-500',
  extended: 'bg-emerald-500/10 text-emerald-500',
  reduced: 'bg-orange-500/10 text-orange-500',
  set_expiry_date: 'bg-violet-500/10 text-violet-500',
  tariff_changed: 'bg-cyan-500/10 text-cyan-500',
  activated: 'bg-green-500/10 text-green-500',
  expired: 'bg-orange-500/10 text-orange-500',
  blocked: 'bg-red-500/10 text-red-500',
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function computeNewEndDate(currentEndsAt: string | null, days: number): Date {
  const now = new Date()
  if (currentEndsAt) {
    const base = new Date(currentEndsAt)
    return new Date(Math.max(base.getTime(), now.getTime()) + days * 86400000)
  }
  return new Date(now.getTime() + days * 86400000)
}

function DaysLeftBadge({ daysLeft, status }: { daysLeft: number | null; status: string }) {
  if (status === 'blocked') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-red-500/10 px-2 py-0.5 text-xs font-medium text-red-500">
        <Ban size={11} /> Заблокирован
      </span>
    )
  }
  if (status === 'trial') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-violet-500/10 px-2 py-0.5 text-xs font-medium text-violet-500">
        <Clock size={11} /> Пробный
      </span>
    )
  }
  if (daysLeft === null) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-gray-500/10 px-2 py-0.5 text-xs font-medium text-gray-400">
        Нет подписки
      </span>
    )
  }
  if (daysLeft < 0) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-orange-500/10 px-2 py-0.5 text-xs font-medium text-orange-500">
        <AlertCircle size={11} /> Истекла {Math.abs(daysLeft)}д назад
      </span>
    )
  }
  if (daysLeft === 0) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-red-500/10 px-2 py-0.5 text-xs font-medium text-red-500">
        <AlertCircle size={11} /> Истекает сегодня
      </span>
    )
  }
  if (daysLeft <= 7) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-red-500/10 px-2 py-0.5 text-xs font-medium text-red-500">
        <Clock size={11} /> {daysLeft}д
      </span>
    )
  }
  if (daysLeft <= 30) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-500">
        <Clock size={11} /> {daysLeft}д
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-500">
      <CheckCircle size={11} /> {daysLeft}д
    </span>
  )
}

// ─── Quick +30 Days Modal ─────────────────────────────────────────────────────

interface QuickExtendModalProps {
  subscription: SubscriptionSummary
  onClose: () => void
  onSuccess: () => void
}

function QuickExtendModal({ subscription, onClose, onSuccess }: QuickExtendModalProps) {
  const queryClient = useQueryClient()
  const [comment, setComment] = useState('')
  const [amount, setAmount] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('cash')
  const [showPayment, setShowPayment] = useState(false)

  const newEndDate = computeNewEndDate(subscription.subscription_ends_at, 30)

  const extend = useMutation({
    mutationFn: () =>
      api.post(`/super/subscriptions/${subscription.restaurant_id}/extend`, {
        days: 30,
        comment: comment || undefined,
        amount: showPayment && amount ? parseFloat(amount) : undefined,
        payment_method: showPayment && amount ? paymentMethod : undefined,
        payment_status: showPayment && amount ? 'paid' : undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['super', 'subscriptions'] })
      toast.success(`Подписка продлена на 30 дней`)
      onSuccess()
      onClose()
    },
    onError: (e: Error) => toast.error(e.message),
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 8 }}
        className="relative z-10 w-full max-w-md rounded-2xl border border-border bg-card shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-border p-5">
          <div>
            <h3 className="font-semibold text-foreground">Продлить на 30 дней</h3>
            <p className="mt-0.5 text-sm text-muted-foreground">{subscription.restaurant_name}</p>
          </div>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted"
          >
            <X size={16} />
          </button>
        </div>

        <div className="space-y-4 p-5">
          {/* Date preview */}
          <div className="flex items-center gap-3 rounded-xl bg-muted/50 p-3 text-sm">
            <div className="flex-1 text-center">
              <p className="text-xs text-muted-foreground">Текущая дата</p>
              <p className="font-medium text-foreground">
                {subscription.subscription_ends_at
                  ? formatDate(subscription.subscription_ends_at, 'long')
                  : 'Не задана'}
              </p>
            </div>
            <ArrowRight size={16} className="flex-shrink-0 text-muted-foreground" />
            <div className="flex-1 text-center">
              <p className="text-xs text-muted-foreground">Новая дата</p>
              <p className="font-semibold text-emerald-500">{formatDate(newEndDate, 'long')}</p>
            </div>
          </div>

          {/* Comment */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-foreground">
              Комментарий <span className="text-muted-foreground">(необязательно)</span>
            </label>
            <input
              type="text"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Причина продления..."
              className="w-full rounded-xl border border-border bg-input px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </div>

          {/* Payment toggle */}
          <div>
            <button
              type="button"
              onClick={() => setShowPayment((v) => !v)}
              className="flex items-center gap-2 text-sm font-medium text-primary hover:underline"
            >
              <Plus size={14} />
              {showPayment ? 'Скрыть оплату' : 'Добавить оплату'}
            </button>
          </div>

          {showPayment && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Сумма (KGS)</label>
                <input
                  type="number"
                  min={0}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0"
                  className="w-full rounded-xl border border-border bg-input px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Способ оплаты</label>
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                  className="w-full rounded-xl border border-border bg-input px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                >
                  {Object.entries(PAYMENT_METHOD_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </div>
            </div>
          )}
        </div>

        <div className="flex gap-3 border-t border-border p-5">
          <button
            onClick={onClose}
            className="flex-1 rounded-xl border border-border py-2.5 text-sm font-medium text-foreground hover:bg-muted"
          >
            Отмена
          </button>
          <button
            onClick={() => extend.mutate()}
            disabled={extend.isPending}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-primary py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {extend.isPending ? (
              <RefreshCw size={14} className="animate-spin" />
            ) : (
              <CheckCircle size={14} />
            )}
            Продлить
          </button>
        </div>
      </motion.div>
    </div>
  )
}

// ─── Edit Confirm Modal ───────────────────────────────────────────────────────

interface ConfirmEditModalProps {
  title: string
  description: string
  onConfirm: () => void
  onCancel: () => void
  isPending: boolean
}

function ConfirmEditModal({ title, description, onConfirm, onCancel, isPending }: ConfirmEditModalProps) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onCancel}
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="relative z-10 w-full max-w-sm rounded-2xl border border-border bg-card p-6 shadow-2xl"
      >
        <h3 className="font-semibold text-foreground">{title}</h3>
        <p className="mt-2 text-sm text-muted-foreground">{description}</p>
        <div className="mt-5 flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 rounded-xl border border-border py-2.5 text-sm font-medium text-foreground hover:bg-muted"
          >
            Отмена
          </button>
          <button
            onClick={onConfirm}
            disabled={isPending}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-primary py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {isPending ? <RefreshCw size={13} className="animate-spin" /> : null}
            Подтвердить
          </button>
        </div>
      </motion.div>
    </div>
  )
}

// ─── Drawer Tabs ──────────────────────────────────────────────────────────────

// Info Tab
function InfoTab({ detail }: { detail: SubscriptionDetail }) {
  const rows = [
    { label: 'Ресторан', value: detail.restaurant_name },
    { label: 'Слаг', value: detail.restaurant_slug },
    { label: 'Статус', value: (
      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${RESTAURANT_STATUS_COLORS[detail.restaurant_status] ?? 'bg-muted text-muted-foreground'}`}>
        {RESTAURANT_STATUS_LABELS[detail.restaurant_status] ?? detail.restaurant_status}
      </span>
    )},
    { label: 'Тариф', value: detail.tariff_name ?? 'Не задан' },
    { label: 'Стоимость тарифа', value: detail.tariff_price != null ? formatPrice(detail.tariff_price) : '—' },
    { label: 'Подписка с', value: detail.subscription_started_at ? formatDate(detail.subscription_started_at, 'long') : '—' },
    { label: 'Подписка до', value: detail.subscription_ends_at ? formatDate(detail.subscription_ends_at, 'long') : '—' },
    { label: 'Осталось дней', value: <DaysLeftBadge daysLeft={detail.days_left} status={detail.restaurant_status} /> },
    { label: 'Последнее продление', value: detail.last_extension_at ? formatDate(detail.last_extension_at, 'long') : '—' },
    { label: 'Продлил', value: detail.last_extended_by ?? '—' },
    { label: 'Последняя оплата', value: detail.last_payment_at ? formatDate(detail.last_payment_at, 'long') : '—' },
  ]

  const limits = [
    { label: 'Столов', value: detail.tariff_max_tables != null ? `до ${detail.tariff_max_tables}` : '—' },
    { label: 'Сотрудников', value: detail.tariff_max_staff != null ? `до ${detail.tariff_max_staff}` : '—' },
    { label: 'Позиций меню', value: detail.tariff_max_menu_items != null ? `до ${detail.tariff_max_menu_items}` : '—' },
    { label: 'Аналитика', value: detail.tariff_analytics_enabled == null ? '—' : detail.tariff_analytics_enabled ? 'Включена' : 'Выключена' },
    { label: 'Отзывы', value: detail.tariff_feedback_enabled == null ? '—' : detail.tariff_feedback_enabled ? 'Включены' : 'Выключены' },
    { label: 'Брендинг', value: detail.tariff_branding_enabled == null ? '—' : detail.tariff_branding_enabled ? 'Включён' : 'Выключен' },
  ]

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-border overflow-hidden">
        <div className="bg-muted/40 px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Подписка
        </div>
        {rows.map(({ label, value }) => (
          <div key={label} className="flex items-center justify-between border-t border-border px-4 py-2.5">
            <span className="text-sm text-muted-foreground">{label}</span>
            <span className="text-sm font-medium text-foreground">{value}</span>
          </div>
        ))}
      </div>

      {detail.tariff_name && (
        <div className="rounded-xl border border-border overflow-hidden">
          <div className="bg-muted/40 px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Лимиты тарифа
          </div>
          {limits.map(({ label, value }) => (
            <div key={label} className="flex items-center justify-between border-t border-border px-4 py-2.5">
              <span className="text-sm text-muted-foreground">{label}</span>
              <span className="text-sm font-medium text-foreground">{value as string}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// History Tab
function HistoryTab({ restaurantId }: { restaurantId: string }) {
  const { data: history = [], isLoading } = useQuery<SubscriptionHistoryItem[]>({
    queryKey: ['super', 'subscriptions', restaurantId, 'history'],
    queryFn: () => api.get(`/super/subscriptions/${restaurantId}/history`) as unknown as Promise<SubscriptionHistoryItem[]>,
  })

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3].map((i) => <div key={i} className="skeleton h-16 rounded-xl" />)}
      </div>
    )
  }

  if (history.length === 0) {
    return (
      <div className="py-12 text-center text-muted-foreground">
        <History size={36} className="mx-auto mb-3 opacity-20" />
        История пуста
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {history.map((item) => (
        <div key={item.id} className="rounded-xl border border-border p-3 text-sm">
          <div className="flex items-start justify-between gap-2">
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${HISTORY_ACTION_COLORS[item.action] ?? 'bg-muted text-muted-foreground'}`}>
              {HISTORY_ACTION_LABELS[item.action] ?? item.action}
            </span>
            <span className="flex-shrink-0 text-xs text-muted-foreground">
              {formatDate(item.created_at, 'long')}
            </span>
          </div>

          {(item.old_end_date || item.new_end_date) && (
            <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
              {item.old_end_date && <span>{formatDate(item.old_end_date)}</span>}
              {item.old_end_date && item.new_end_date && <ArrowRight size={12} />}
              {item.new_end_date && (
                <span className="font-medium text-foreground">{formatDate(item.new_end_date)}</span>
              )}
              {item.days_delta != null && (
                <span className={item.days_delta > 0 ? 'text-emerald-500' : 'text-red-500'}>
                  ({item.days_delta > 0 ? '+' : ''}{item.days_delta}д)
                </span>
              )}
            </div>
          )}

          {(item.tariff_before || item.tariff_after) && (
            <div className="mt-1.5 flex items-center gap-2 text-xs text-muted-foreground">
              {item.tariff_before && <span>{item.tariff_before}</span>}
              {item.tariff_before && item.tariff_after && <ArrowRight size={12} />}
              {item.tariff_after && <span className="font-medium text-foreground">{item.tariff_after}</span>}
            </div>
          )}

          {item.payment_amount != null && (
            <div className="mt-1.5 text-xs text-muted-foreground">
              Оплата: <span className="font-medium text-foreground">
                {formatPrice(item.payment_amount, item.payment_currency ?? 'KGS')}
              </span>
              {item.payment_method && ` · ${PAYMENT_METHOD_LABELS[item.payment_method] ?? item.payment_method}`}
            </div>
          )}

          {item.comment && (
            <p className="mt-1.5 text-xs text-muted-foreground italic">"{item.comment}"</p>
          )}

          <div className="mt-1.5 flex gap-3 text-xs text-muted-foreground">
            {item.changed_by_name && <span>{item.changed_by_name}</span>}
            {item.changed_by_role && <span className="opacity-60">{item.changed_by_role}</span>}
          </div>
        </div>
      ))}
    </div>
  )
}

// Payments Tab
function PaymentsTab({ restaurantId, tariffName }: { restaurantId: string; tariffName: string | null }) {
  const queryClient = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [formAmount, setFormAmount] = useState('')
  const [formMethod, setFormMethod] = useState('cash')
  const [formStatus, setFormStatus] = useState('paid')
  const [formPaidDays, setFormPaidDays] = useState('')
  const [formRef, setFormRef] = useState('')
  const [formComment, setFormComment] = useState('')
  const [formExtend, setFormExtend] = useState(false)

  const { data: payments = [], isLoading } = useQuery<SubscriptionPaymentItem[]>({
    queryKey: ['super', 'subscriptions', restaurantId, 'payments'],
    queryFn: () => api.get(`/super/subscriptions/${restaurantId}/payments`) as unknown as Promise<SubscriptionPaymentItem[]>,
  })

  const addPayment = useMutation({
    mutationFn: () =>
      api.post(`/super/subscriptions/${restaurantId}/payments`, {
        amount: parseFloat(formAmount),
        payment_method: formMethod,
        payment_status: formStatus,
        paid_days: formPaidDays ? parseInt(formPaidDays) : undefined,
        transaction_reference: formRef || undefined,
        comment: formComment || undefined,
        extend_subscription: formExtend,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['super', 'subscriptions', restaurantId, 'payments'] })
      queryClient.invalidateQueries({ queryKey: ['super', 'subscriptions'] })
      queryClient.invalidateQueries({ queryKey: ['super', 'subscription-detail', restaurantId] })
      toast.success('Оплата добавлена')
      setShowForm(false)
      setFormAmount('')
      setFormPaidDays('')
      setFormRef('')
      setFormComment('')
      setFormExtend(false)
    },
    onError: (e: Error) => toast.error(e.message),
  })

  return (
    <div className="space-y-4">
      {/* Add payment */}
      <div className="rounded-xl border border-border overflow-hidden">
        <button
          onClick={() => setShowForm((v) => !v)}
          className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium text-foreground hover:bg-muted/50"
        >
          <span className="flex items-center gap-2">
            <Plus size={14} className="text-primary" />
            Добавить оплату
          </span>
          <ChevronDown
            size={15}
            className={`text-muted-foreground transition-transform ${showForm ? 'rotate-180' : ''}`}
          />
        </button>

        {showForm && (
          <div className="border-t border-border p-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Сумма *</label>
                <input
                  type="number"
                  min={0}
                  value={formAmount}
                  onChange={(e) => setFormAmount(e.target.value)}
                  placeholder="0"
                  className="w-full rounded-xl border border-border bg-input px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Способ</label>
                <select
                  value={formMethod}
                  onChange={(e) => setFormMethod(e.target.value)}
                  className="w-full rounded-xl border border-border bg-input px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                >
                  {Object.entries(PAYMENT_METHOD_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Статус</label>
                <select
                  value={formStatus}
                  onChange={(e) => setFormStatus(e.target.value)}
                  className="w-full rounded-xl border border-border bg-input px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                >
                  {Object.entries(PAYMENT_STATUS_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Дней оплачено</label>
                <input
                  type="number"
                  min={0}
                  value={formPaidDays}
                  onChange={(e) => setFormPaidDays(e.target.value)}
                  placeholder="30"
                  className="w-full rounded-xl border border-border bg-input px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
              </div>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Референс транзакции</label>
              <input
                type="text"
                value={formRef}
                onChange={(e) => setFormRef(e.target.value)}
                placeholder="TXN-..."
                className="w-full rounded-xl border border-border bg-input px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Комментарий</label>
              <input
                type="text"
                value={formComment}
                onChange={(e) => setFormComment(e.target.value)}
                placeholder="Примечание..."
                className="w-full rounded-xl border border-border bg-input px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </div>

            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={formExtend}
                onChange={(e) => setFormExtend(e.target.checked)}
                className="rounded border-border"
              />
              <span className="text-sm text-foreground">Продлить подписку на оплаченные дни</span>
            </label>

            <button
              onClick={() => addPayment.mutate()}
              disabled={!formAmount || addPayment.isPending}
              className="w-full rounded-xl bg-primary py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {addPayment.isPending ? 'Сохранение...' : 'Добавить оплату'}
            </button>
          </div>
        )}
      </div>

      {/* Payment list */}
      {isLoading ? (
        <div className="space-y-2">
          {[1, 2].map((i) => <div key={i} className="skeleton h-16 rounded-xl" />)}
        </div>
      ) : payments.length === 0 ? (
        <div className="py-10 text-center text-muted-foreground">
          <ReceiptText size={36} className="mx-auto mb-3 opacity-20" />
          Оплат пока нет
        </div>
      ) : (
        <div className="space-y-2">
          {payments.map((p) => (
            <div key={p.id} className="rounded-xl border border-border p-3 text-sm">
              <div className="flex items-start justify-between gap-2">
                <span className="font-semibold text-foreground">{formatPrice(p.amount, p.currency)}</span>
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${PAYMENT_STATUS_COLORS[p.payment_status] ?? 'bg-muted text-muted-foreground'}`}>
                  {PAYMENT_STATUS_LABELS[p.payment_status] ?? p.payment_status}
                </span>
              </div>
              <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                <span>{PAYMENT_METHOD_LABELS[p.payment_method] ?? p.payment_method}</span>
                {p.tariff_name && <span>{p.tariff_name}</span>}
                {p.paid_days != null && <span>{p.paid_days}д</span>}
                {p.paid_until && <span>до {formatDate(p.paid_until)}</span>}
              </div>
              {p.comment && (
                <p className="mt-1 text-xs italic text-muted-foreground">"{p.comment}"</p>
              )}
              <div className="mt-1 flex gap-3 text-xs text-muted-foreground">
                {p.accepted_by_name && <span>{p.accepted_by_name}</span>}
                <span>{formatDate(p.created_at, 'long')}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// Logs Tab
function LogsTab({ restaurantId }: { restaurantId: string }) {
  const { data: logs = [], isLoading } = useQuery<ActivityLogItem[]>({
    queryKey: ['super', 'activity-logs', restaurantId],
    queryFn: () =>
      api.get(`/activity-logs?restaurant_id=${restaurantId}&limit=100`) as unknown as Promise<ActivityLogItem[]>,
  })

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3].map((i) => <div key={i} className="skeleton h-12 rounded-xl" />)}
      </div>
    )
  }

  if (logs.length === 0) {
    return (
      <div className="py-12 text-center text-muted-foreground">
        <FileText size={36} className="mx-auto mb-3 opacity-20" />
        Логов нет
      </div>
    )
  }

  return (
    <div className="space-y-1.5">
      {logs.map((log) => (
        <div key={log.id} className="rounded-lg border border-border px-3 py-2 text-xs">
          <div className="flex items-center justify-between gap-2">
            <span className="font-medium text-foreground">{log.action}</span>
            <span className="flex-shrink-0 text-muted-foreground">{formatDate(log.createdAt, 'long')}</span>
          </div>
          {log.description && (
            <p className="mt-0.5 text-muted-foreground">{log.description}</p>
          )}
        </div>
      ))}
    </div>
  )
}

// Edit Tab
interface EditTabProps {
  detail: SubscriptionDetail
  tariffs: Tariff[]
  onEditSuccess: () => void
}

function EditTab({ detail, tariffs, onEditSuccess }: EditTabProps) {
  const queryClient = useQueryClient()
  const [action, setAction] = useState<'extend' | 'reduce' | 'set_expiry' | 'change_tariff'>('extend')
  const [days, setDays] = useState(30)
  const [expiryDate, setExpiryDate] = useState('')
  const [tariffId, setTariffId] = useState(detail.tariff_id ?? '')
  const [comment, setComment] = useState('')
  const [amount, setAmount] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('cash')
  const [activateIfBlocked, setActivateIfBlocked] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)

  const isBlocked = detail.restaurant_status === 'blocked'

  function buildConfirmText(): string {
    if (action === 'extend') {
      const newEnd = computeNewEndDate(detail.subscription_ends_at, days)
      return `Продлить подписку на ${days} дней. Новая дата окончания: ${formatDate(newEnd, 'long')}.`
    }
    if (action === 'reduce') {
      return `Сократить подписку на ${days} дней. Комментарий: "${comment}".`
    }
    if (action === 'set_expiry') {
      return `Установить дату окончания: ${expiryDate}.`
    }
    if (action === 'change_tariff') {
      const t = tariffs.find((t) => t.id === tariffId)
      return `Сменить тариф на "${t?.name ?? tariffId}".`
    }
    return ''
  }

  const doAction = useMutation({
    mutationFn: () => {
      if (action === 'extend') {
        return api.post(`/super/subscriptions/${detail.restaurant_id}/extend`, {
          days,
          comment: comment || undefined,
          amount: amount ? parseFloat(amount) : undefined,
          payment_method: amount ? paymentMethod : undefined,
          payment_status: amount ? 'paid' : undefined,
          activate_if_blocked: activateIfBlocked,
        })
      }
      if (action === 'reduce') {
        return api.post(`/super/subscriptions/${detail.restaurant_id}/reduce`, {
          days,
          comment,
        })
      }
      if (action === 'set_expiry') {
        return api.patch(`/super/subscriptions/${detail.restaurant_id}/set-expiry`, {
          subscription_ends_at: new Date(expiryDate).toISOString(),
          comment: comment || undefined,
          activate_if_blocked: activateIfBlocked,
        })
      }
      if (action === 'change_tariff') {
        return api.patch(`/super/subscriptions/${detail.restaurant_id}/change-tariff`, {
          tariff_id: tariffId,
          comment: comment || undefined,
        })
      }
      return Promise.reject(new Error('Unknown action'))
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['super', 'subscriptions'] })
      queryClient.invalidateQueries({ queryKey: ['super', 'subscription-detail', detail.restaurant_id] })
      queryClient.invalidateQueries({ queryKey: ['super', 'subscriptions', detail.restaurant_id, 'history'] })
      toast.success('Изменения сохранены')
      setShowConfirm(false)
      onEditSuccess()
    },
    onError: (e: Error) => {
      toast.error(e.message)
      setShowConfirm(false)
    },
  })

  const canSubmit =
    action === 'extend' ? days > 0 :
    action === 'reduce' ? days > 0 && comment.trim().length > 0 :
    action === 'set_expiry' ? !!expiryDate :
    action === 'change_tariff' ? !!tariffId : false

  const QUICK_DAYS = [7, 14, 30, 90, 365]

  return (
    <>
      <div className="space-y-5">
        {/* Action selector */}
        <div>
          <label className="mb-2 block text-sm font-medium text-foreground">Действие</label>
          <div className="grid grid-cols-2 gap-2">
            {[
              { value: 'extend', label: 'Продлить', icon: Plus },
              { value: 'reduce', label: 'Сократить', icon: Minus },
              { value: 'set_expiry', label: 'Задать дату', icon: Calendar },
              { value: 'change_tariff', label: 'Тариф', icon: Settings },
            ].map(({ value, label, icon: Icon }) => (
              <button
                key={value}
                type="button"
                onClick={() => setAction(value as typeof action)}
                className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-medium transition-colors ${
                  action === value
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border bg-card text-muted-foreground hover:bg-muted'
                }`}
              >
                <Icon size={14} /> {label}
              </button>
            ))}
          </div>
        </div>

        {/* Blocked warning */}
        {isBlocked && (action === 'extend' || action === 'set_expiry') && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-3">
            <p className="flex items-center gap-2 text-sm font-medium text-red-500">
              <Ban size={14} /> Ресторан заблокирован
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Продление подписки не снимет блокировку автоматически, если не отметить опцию ниже.
            </p>
            <label className="mt-2 flex cursor-pointer items-center gap-2 select-none">
              <input
                type="checkbox"
                checked={activateIfBlocked}
                onChange={(e) => setActivateIfBlocked(e.target.checked)}
                className="rounded border-border"
              />
              <span className="text-sm text-foreground">Активировать после продления</span>
            </label>
          </div>
        )}

        {/* Extend / Reduce — days input */}
        {(action === 'extend' || action === 'reduce') && (
          <div>
            <label className="mb-2 block text-sm font-medium text-foreground">
              {action === 'extend' ? 'Количество дней' : 'Сократить на (дней)'}
            </label>
            <div className="mb-2 flex gap-1.5 flex-wrap">
              {QUICK_DAYS.map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDays(d)}
                  className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                    days === d ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:bg-muted'
                  }`}
                >
                  {d === 365 ? '1 год' : `+${d}д`}
                </button>
              ))}
            </div>
            <input
              type="number"
              min={1}
              value={days}
              onChange={(e) => setDays(Math.max(1, parseInt(e.target.value) || 1))}
              className="w-full rounded-xl border border-border bg-input px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
            {action === 'extend' && detail.subscription_ends_at && (
              <p className="mt-1.5 text-xs text-muted-foreground">
                Новая дата: <span className="font-medium text-foreground">
                  {formatDate(computeNewEndDate(detail.subscription_ends_at, days), 'long')}
                </span>
              </p>
            )}
          </div>
        )}

        {/* Set expiry date */}
        {action === 'set_expiry' && (
          <div>
            <label className="mb-2 block text-sm font-medium text-foreground">Дата окончания</label>
            <input
              type="date"
              value={expiryDate}
              onChange={(e) => setExpiryDate(e.target.value)}
              className="w-full rounded-xl border border-border bg-input px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </div>
        )}

        {/* Change tariff */}
        {action === 'change_tariff' && (
          <div>
            <label className="mb-2 block text-sm font-medium text-foreground">Тариф</label>
            <select
              value={tariffId}
              onChange={(e) => setTariffId(e.target.value)}
              className="w-full rounded-xl border border-border bg-input px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
            >
              <option value="">Выберите тариф</option>
              {tariffs.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} — {formatPrice(t.price)}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Comment */}
        <div>
          <label className="mb-2 block text-sm font-medium text-foreground">
            Комментарий {action === 'reduce' && <span className="text-red-500">*</span>}
          </label>
          <input
            type="text"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder={action === 'reduce' ? 'Причина обязательна...' : 'Примечание...'}
            className="w-full rounded-xl border border-border bg-input px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
        </div>

        {/* Payment fields for extend */}
        {action === 'extend' && (
          <div className="rounded-xl border border-border p-3">
            <p className="mb-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">Оплата (необязательно)</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">Сумма (KGS)</label>
                <input
                  type="number"
                  min={0}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0"
                  className="w-full rounded-xl border border-border bg-input px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">Способ</label>
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                  className="w-full rounded-xl border border-border bg-input px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                >
                  {Object.entries(PAYMENT_METHOD_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        )}

        <button
          onClick={() => setShowConfirm(true)}
          disabled={!canSubmit}
          className="w-full rounded-xl bg-primary py-3 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          Сохранить изменения
        </button>
      </div>

      <AnimatePresence>
        {showConfirm && (
          <ConfirmEditModal
            title="Подтвердите действие"
            description={buildConfirmText()}
            onConfirm={() => doAction.mutate()}
            onCancel={() => setShowConfirm(false)}
            isPending={doAction.isPending}
          />
        )}
      </AnimatePresence>
    </>
  )
}

// ─── Subscription Drawer ──────────────────────────────────────────────────────

type DrawerTab = 'info' | 'edit' | 'history' | 'payments' | 'logs'

interface SubscriptionDrawerProps {
  restaurantId: string
  onClose: () => void
}

function SubscriptionDrawer({ restaurantId, onClose }: SubscriptionDrawerProps) {
  const [activeTab, setActiveTab] = useState<DrawerTab>('info')

  const { data: detail, isLoading } = useQuery<SubscriptionDetail>({
    queryKey: ['super', 'subscription-detail', restaurantId],
    queryFn: () =>
      api.get(`/super/subscriptions/${restaurantId}`) as unknown as Promise<SubscriptionDetail>,
  })

  const { data: tariffs = [] } = useQuery<Tariff[]>({
    queryKey: ['tariffs'],
    queryFn: () => api.get('/tariffs') as unknown as Promise<Tariff[]>,
  })

  const tabs: { key: DrawerTab; label: string; icon: ElementType }[] = [
    { key: 'info', label: 'Подписка', icon: CalendarClock },
    { key: 'edit', label: 'Редактирование', icon: Settings },
    { key: 'history', label: 'История', icon: History },
    { key: 'payments', label: 'Оплаты', icon: CreditCard },
    { key: 'logs', label: 'Логи', icon: FileText },
  ]

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />
      <motion.div
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        transition={{ type: 'spring', damping: 30, stiffness: 300 }}
        className="relative z-10 flex h-full w-full max-w-xl flex-col bg-card shadow-2xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div className="min-w-0">
            {isLoading ? (
              <div className="skeleton h-5 w-40 rounded" />
            ) : (
              <>
                <h2 className="font-semibold text-foreground truncate">{detail?.restaurant_name}</h2>
                <p className="text-xs text-muted-foreground">{detail?.restaurant_slug}</p>
              </>
            )}
          </div>
          <button
            onClick={onClose}
            className="ml-4 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted"
          >
            <X size={16} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-border overflow-x-auto">
          {tabs.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={`flex flex-shrink-0 items-center gap-1.5 px-4 py-3 text-xs font-medium border-b-2 transition-colors ${
                activeTab === key
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              <Icon size={13} /> {label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5">
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4].map((i) => <div key={i} className="skeleton h-10 rounded-xl" />)}
            </div>
          ) : detail ? (
            <>
              {activeTab === 'info' && <InfoTab detail={detail} />}
              {activeTab === 'edit' && (
                <EditTab
                  detail={detail}
                  tariffs={tariffs}
                  onEditSuccess={() => setActiveTab('info')}
                />
              )}
              {activeTab === 'history' && <HistoryTab restaurantId={restaurantId} />}
              {activeTab === 'payments' && (
                <PaymentsTab restaurantId={restaurantId} tariffName={detail.tariff_name} />
              )}
              {activeTab === 'logs' && <LogsTab restaurantId={restaurantId} />}
            </>
          ) : (
            <div className="py-12 text-center text-muted-foreground">Данные не найдены</div>
          )}
        </div>
      </motion.div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function SuperSubscriptionsPage() {
  const [statusFilter, setStatusFilter] = useState('')
  const [drawerRestaurantId, setDrawerRestaurantId] = useState<string | null>(null)
  const [quickExtendTarget, setQuickExtendTarget] = useState<SubscriptionSummary | null>(null)

  const { data: subscriptions = [], isLoading } = useQuery<SubscriptionSummary[]>({
    queryKey: ['super', 'subscriptions', statusFilter],
    queryFn: () => {
      const url = statusFilter
        ? `/super/subscriptions?status=${statusFilter}`
        : '/super/subscriptions'
      return api.get(url) as unknown as Promise<SubscriptionSummary[]>
    },
  })

  const openDrawer = useCallback((restaurantId: string) => {
    setDrawerRestaurantId(restaurantId)
  }, [])

  const closeDrawer = useCallback(() => {
    setDrawerRestaurantId(null)
  }, [])

  const STATUS_FILTERS = [
    { value: '', label: 'Все' },
    { value: 'active', label: 'Активные' },
    { value: 'trial', label: 'Пробные' },
    { value: 'expired', label: 'Истекшие' },
    { value: 'blocked', label: 'Заблокированные' },
  ]

  return (
    <div className="space-y-6 p-4 sm:p-6">
      {/* Page header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Подписки</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {subscriptions.length} ресторанов
          </p>
        </div>

        {/* Status filter */}
        <div className="flex gap-1.5 flex-wrap">
          {STATUS_FILTERS.map(({ value, label }) => (
            <button
              key={value}
              onClick={() => setStatusFilter(value)}
              className={`rounded-xl border px-3 py-1.5 text-xs font-medium transition-colors ${
                statusFilter === value
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border text-muted-foreground hover:bg-muted'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Subscription list */}
      <section className="overflow-hidden rounded-2xl border border-border bg-card">
        {isLoading ? (
          <div className="space-y-3 p-5">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="skeleton h-16 rounded-xl" />
            ))}
          </div>
        ) : subscriptions.length === 0 ? (
          <div className="p-14 text-center text-muted-foreground">
            <CalendarClock size={42} className="mx-auto mb-3 opacity-20" />
            <p>Нет подписок</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {subscriptions.map((sub, i) => (
              <motion.div
                key={sub.restaurant_id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.03 }}
                className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center"
              >
                {/* Restaurant info */}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      onClick={() => openDrawer(sub.restaurant_id)}
                      className="font-semibold text-foreground hover:text-primary hover:underline text-left"
                    >
                      {sub.restaurant_name}
                    </button>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        RESTAURANT_STATUS_COLORS[sub.restaurant_status] ?? 'bg-muted text-muted-foreground'
                      }`}
                    >
                      {RESTAURANT_STATUS_LABELS[sub.restaurant_status] ?? sub.restaurant_status}
                    </span>
                    <DaysLeftBadge daysLeft={sub.days_left} status={sub.restaurant_status} />
                  </div>
                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                    {sub.tariff_name && <span>{sub.tariff_name}</span>}
                    {sub.tariff_price != null && <span>{formatPrice(sub.tariff_price)}/мес</span>}
                    {sub.subscription_ends_at && (
                      <span>до {formatDate(sub.subscription_ends_at)}</span>
                    )}
                    {sub.last_extended_by && (
                      <span>Продлил: {sub.last_extended_by}</span>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex flex-shrink-0 gap-2">
                  <button
                    onClick={() => setQuickExtendTarget(sub)}
                    className="h-8 rounded-lg border border-border px-3 text-xs font-medium text-foreground hover:bg-muted transition-colors"
                  >
                    +30 дней
                  </button>
                  <button
                    onClick={() => openDrawer(sub.restaurant_id)}
                    className="h-8 rounded-lg border border-primary/30 px-3 text-xs font-medium text-primary hover:bg-primary/10 transition-colors"
                  >
                    Подробнее
                  </button>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </section>

      {/* Modals & Drawer */}
      <AnimatePresence>
        {quickExtendTarget && (
          <QuickExtendModal
            key="quick-extend"
            subscription={quickExtendTarget}
            onClose={() => setQuickExtendTarget(null)}
            onSuccess={() => setQuickExtendTarget(null)}
          />
        )}
        {drawerRestaurantId && (
          <SubscriptionDrawer
            key={`drawer-${drawerRestaurantId}`}
            restaurantId={drawerRestaurantId}
            onClose={closeDrawer}
          />
        )}
      </AnimatePresence>
    </div>
  )
}
