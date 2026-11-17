'use client'

import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { CheckCircle2, Copy, CreditCard, Eye, EyeOff, Store, UserRound, WandSparkles, X } from 'lucide-react'
import toast from 'react-hot-toast'
import { api } from '@/lib/api'

type Tariff = { id: string; name: string; periodDays: number; isActive: boolean }

export type CreateRestaurantPayload = {
  name: string
  phone?: string
  address: string
  slug: string
  tariffId: string
  subscriptionEndsAt: string
  currency: string
  language: string
  admin: {
    name: string
    login: string
    email: string
    password: string
  }
}

export type CreatedRestaurantResult = {
  restaurant: { id: string; name: string; slug: string }
  credentials: { name: string; login: string; email: string; password: string }
}

const inputClass =
  'h-11 w-full rounded-xl border border-border bg-input px-3 text-sm text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20'

function inThirtyDays() {
  const d = new Date()
  d.setDate(d.getDate() + 30)
  return d.toISOString().slice(0, 10)
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 50)
}

function generateCredentials(restaurantName: string) {
  const base = restaurantName.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 10) || 'admin'
  const num = Math.floor(1000 + Math.random() * 9000)
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
  const special = '!@#$%'
  const pwd =
    Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join('') +
    special[Math.floor(Math.random() * special.length)] +
    num
  return {
    slug: `${base}-${num}`,
    adminName: `Администратор ${restaurantName}`,
    login: `${base}_admin_${num}`,
    email: `${base}.admin.${num}@menuflow.local`,
    password: pwd,
  }
}

function initialForm(): CreateRestaurantPayload {
  return {
    name: '',
    phone: '',
    address: '',
    slug: '',
    tariffId: '',
    subscriptionEndsAt: inThirtyDays(),
    currency: 'KGS',
    language: 'ru',
    admin: { name: '', login: '', email: '', password: '' },
  }
}

function Field({
  label,
  required,
  error,
  children,
}: {
  label: string
  required?: boolean
  error?: string
  children: React.ReactNode
}) {
  return (
    <label className="block min-w-0">
      <span className="mb-1.5 block text-xs font-semibold text-foreground">
        {label} {required && <span className="text-destructive">*</span>}
      </span>
      {children}
      {error && <span className="mt-1 block text-xs text-destructive">{error}</span>}
    </label>
  )
}

export function CreateRestaurantModal({
  onSubmit,
  onClose,
}: {
  onSubmit: (payload: CreateRestaurantPayload) => Promise<CreatedRestaurantResult>
  onClose: () => void
}) {
  const [form, setForm] = useState<CreateRestaurantPayload>(initialForm)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [submitError, setSubmitError] = useState('')

  const { data: tariffs = [] } = useQuery<Tariff[]>({
    queryKey: ['tariffs'],
    queryFn: () => api.get('/tariffs') as unknown as Promise<Tariff[]>,
  })

  const setValue = <K extends keyof CreateRestaurantPayload>(key: K, value: CreateRestaurantPayload[K]) =>
    setForm((f) => ({ ...f, [key]: value }))
  const setAdmin = (key: keyof CreateRestaurantPayload['admin'], value: string) =>
    setForm((f) => ({ ...f, admin: { ...f.admin, [key]: value } }))

  function applyGenerated() {
    if (form.name.trim().length < 2) {
      toast.error('Сначала введите название ресторана')
      return
    }
    const creds = generateCredentials(form.name.trim())
    setForm((f) => ({
      ...f,
      slug: f.slug || creds.slug,
      admin: {
        name: creds.adminName,
        login: creds.login,
        email: creds.email,
        password: creds.password,
      },
    }))
  }

  const passwordValid = useMemo(
    () => form.admin.password.length >= 6,
    [form.admin.password],
  )

  const canSubmit = Boolean(
    form.name.trim() &&
      form.address.trim() &&
      form.slug &&
      form.tariffId &&
      form.subscriptionEndsAt &&
      form.admin.name.trim() &&
      form.admin.login.trim() &&
      form.admin.email.trim() &&
      passwordValid,
  )

  async function submit() {
    if (!canSubmit || isSubmitting) return
    setIsSubmitting(true)
    setSubmitError('')
    try {
      const result = await onSubmit({
        ...form,
        phone: form.phone || undefined,
      })
      return result
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Не удалось создать ресторан')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-2 backdrop-blur-sm sm:p-4" onMouseDown={onClose}>
      <motion.div
        initial={{ opacity: 0, scale: 0.97, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        onMouseDown={(e) => e.stopPropagation()}
        className="flex max-h-[96vh] w-full max-w-3xl flex-col overflow-hidden rounded-3xl border border-border bg-card shadow-2xl"
      >
        <header className="flex items-start justify-between border-b border-border px-4 py-4 sm:px-6">
          <div>
            <h2 className="mt-1 text-xl font-extrabold text-foreground sm:text-2xl">Новый ресторан</h2>
            <p className="mt-1 text-xs text-muted-foreground">Создайте ресторан и первый аккаунт администратора.</p>
          </div>
          <button onClick={onClose} className="rounded-xl p-2 text-muted-foreground hover:bg-muted hover:text-foreground">
            <X size={19} />
          </button>
        </header>

        <div className="grid flex-1 gap-4 overflow-y-auto p-4 sm:p-6 lg:grid-cols-2">
          {/* Restaurant info */}
          <section className="rounded-2xl border border-border bg-background/55 p-4 sm:p-5 space-y-3">
            <div className="flex items-center gap-2 mb-1">
              <Store size={16} className="text-primary" />
              <h3 className="text-sm font-bold text-foreground">Данные ресторана</h3>
            </div>
            <Field label="Название" required>
              <input
                autoFocus
                className={inputClass}
                value={form.name}
                onChange={(e) => {
                  setValue('name', e.target.value)
                  if (!form.slug) setValue('slug', slugify(e.target.value))
                }}
                placeholder="Кафе Мирас"
              />
            </Field>
            <Field label="Slug (публичная ссылка)" required>
              <input
                className={inputClass}
                value={form.slug}
                onChange={(e) => setValue('slug', e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))}
                placeholder="kafe-miras"
              />
            </Field>
            <Field label="Телефон">
              <input className={inputClass} value={form.phone} onChange={(e) => setValue('phone', e.target.value)} placeholder="+996 700 000 000" />
            </Field>
            <Field label="Адрес" required>
              <input className={inputClass} value={form.address} onChange={(e) => setValue('address', e.target.value)} placeholder="ул. Чуй, 100" />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Валюта">
                <select className={inputClass} value={form.currency} onChange={(e) => setValue('currency', e.target.value)}>
                  <option value="KGS">KGS</option>
                  <option value="KZT">KZT</option>
                  <option value="RUB">RUB</option>
                  <option value="USD">USD</option>
                </select>
              </Field>
              <Field label="Язык">
                <select className={inputClass} value={form.language} onChange={(e) => setValue('language', e.target.value)}>
                  <option value="ru">Русский</option>
                  <option value="ky">Кыргызский</option>
                  <option value="en">English</option>
                </select>
              </Field>
            </div>
            <Field label="Тариф" required>
              <select className={inputClass} value={form.tariffId} onChange={(e) => setValue('tariffId', e.target.value)}>
                <option value="">Выберите тариф</option>
                {tariffs.filter((t) => t.isActive).map((t) => (
                  <option key={t.id} value={t.id}>{t.name} ({t.periodDays} дней)</option>
                ))}
              </select>
            </Field>
            <Field label="Дата окончания подписки" required>
              <input
                type="date"
                className={inputClass}
                value={form.subscriptionEndsAt}
                min={new Date().toISOString().slice(0, 10)}
                onChange={(e) => setValue('subscriptionEndsAt', e.target.value)}
              />
            </Field>
          </section>

          {/* Admin credentials */}
          <section className="rounded-2xl border border-border bg-background/55 p-4 sm:p-5 space-y-3">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                <UserRound size={16} className="text-primary" />
                <h3 className="text-sm font-bold text-foreground">Доступ администратора</h3>
              </div>
              <button
                type="button"
                onClick={applyGenerated}
                className="flex h-8 items-center gap-1.5 rounded-xl border border-primary/25 bg-primary/5 px-2.5 text-xs font-bold text-primary"
              >
                <WandSparkles size={13} /> Сгенерировать
              </button>
            </div>
            <Field label="Имя администратора" required>
              <input className={inputClass} value={form.admin.name} onChange={(e) => setAdmin('name', e.target.value)} placeholder="Иван Иванов" />
            </Field>
            <Field label="Логин" required>
              <input
                className={inputClass}
                value={form.admin.login}
                onChange={(e) => setAdmin('login', e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                placeholder="miras_admin_1234"
              />
            </Field>
            <Field label="Email" required>
              <input
                type="email"
                className={inputClass}
                value={form.admin.email}
                onChange={(e) => setAdmin('email', e.target.value)}
                placeholder="admin@kafe-miras.kg"
              />
            </Field>
            <Field label="Пароль" required error={form.admin.password && !passwordValid ? 'Минимум 6 символов' : undefined}>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  className={`${inputClass} pr-10 font-mono`}
                  value={form.admin.password}
                  onChange={(e) => setAdmin('password', e.target.value)}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-2 text-muted-foreground"
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </Field>
          </section>
        </div>

        <footer className="border-t border-border bg-card px-4 py-4 sm:px-6">
          {submitError && <p className="mb-3 rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">{submitError}</p>}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button onClick={onClose} className="h-11 rounded-xl border border-border px-5 text-sm font-semibold text-muted-foreground hover:bg-muted">Отмена</button>
            <button
              onClick={() => void submit()}
              disabled={!canSubmit || isSubmitting}
              className="flex h-11 items-center justify-center gap-2 rounded-xl bg-primary px-6 text-sm font-bold text-primary-foreground shadow-lg shadow-primary/20 disabled:cursor-not-allowed disabled:opacity-45"
            >
              <CheckCircle2 size={17} />
              {isSubmitting ? 'Создаём...' : 'Создать ресторан'}
            </button>
          </div>
        </footer>
      </motion.div>
    </div>
  )
}

async function copy(value: string, label: string) {
  await navigator.clipboard.writeText(value)
  toast.success(`${label} скопирован`)
}

export function RestaurantCreatedModal({
  result,
  onClose,
}: {
  result: CreatedRestaurantResult
  onClose: () => void
}) {
  const { credentials } = result
  const all = `Ресторан: ${result.restaurant.name}\nИмя: ${credentials.name}\nЛогин: ${credentials.login}\nEmail: ${credentials.email}\nПароль: ${credentials.password}`
  const rows = [
    ['Имя администратора', credentials.name, null],
    ['Логин', credentials.login, 'Логин'],
    ['Email', credentials.email, 'Email'],
    ['Пароль', credentials.password, 'Пароль'],
  ] as const

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4 backdrop-blur-sm">
      <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} className="w-full max-w-lg rounded-3xl border border-border bg-card p-5 shadow-2xl sm:p-7">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/12 text-emerald-600"><CheckCircle2 size={24} /></div>
        <h2 className="mt-4 text-2xl font-extrabold text-foreground">Ресторан успешно создан</h2>
        <p className="mt-1 text-sm text-muted-foreground">Данные доступа показываются только сейчас. Сохраните их перед закрытием.</p>
        <div className="mt-5 overflow-hidden rounded-2xl border border-border">
          {rows.map(([label, value, copyLabel]) => (
            <div key={label} className="flex items-center gap-3 border-b border-border p-3 last:border-b-0">
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
                <p className={`mt-0.5 break-all text-sm text-foreground ${label === 'Пароль' ? 'font-mono font-bold' : 'font-medium'}`}>{value}</p>
              </div>
              {copyLabel && (
                <button onClick={() => void copy(value, copyLabel)} className="rounded-xl border border-border p-2 text-muted-foreground hover:text-primary">
                  <Copy size={16} />
                </button>
              )}
            </div>
          ))}
        </div>
        <button onClick={() => void copy(all, 'Все данные')} className="mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary text-sm font-bold text-primary-foreground">
          <Copy size={16} /> Скопировать все данные
        </button>
        <button onClick={onClose} className="mt-2 h-11 w-full rounded-xl border border-border text-sm font-semibold text-muted-foreground hover:bg-muted">Я сохранил данные, закрыть</button>
      </motion.div>
    </div>
  )
}
