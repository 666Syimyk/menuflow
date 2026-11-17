'use client'

import { useState, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import Image from 'next/image'
import { api } from '@/lib/api'
import toast from 'react-hot-toast'
import {
  Plus, UserCheck, UserX, Users, Camera, RefreshCw,
  Eye, EyeOff, Phone, Calendar, X, Loader2, Copy,
} from 'lucide-react'

interface Staff {
  id: string
  name: string
  username: string
  role: string
  phone: string | null
  birthDate: string | null
  avatarUrl: string | null
  isActive: boolean
  createdAt: string
}

const ROLE_LABELS: Record<string, string> = {
  RESTAURANT_ADMIN: 'Администратор',
  WAITER: 'Официант',
  COOK: 'Повар',
  CASHIER: 'Кассир',
}

const ROLE_COLORS: Record<string, string> = {
  RESTAURANT_ADMIN: 'bg-violet-500/10 text-violet-500',
  WAITER: 'bg-blue-500/10 text-blue-500',
  COOK: 'bg-amber-500/10 text-amber-500',
  CASHIER: 'bg-emerald-500/10 text-emerald-500',
}

const ROLE_BG: Record<string, string> = {
  RESTAURANT_ADMIN: 'bg-violet-500',
  WAITER: 'bg-blue-500',
  COOK: 'bg-amber-500',
  CASHIER: 'bg-emerald-500',
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function generatePassword(length = 10): string {
  const chars = 'abcdefghijkmnpqrstuvwxyz23456789'
  return Array.from({ length }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
}

function generateUsername(name: string): string {
  const parts = name.trim().toLowerCase().split(/\s+/)
  const base = parts[0]?.replace(/[^a-zа-яёүөкг]/gi, '') || 'staff'
  const num = Math.floor(10 + Math.random() * 90)
  // Simple transliteration of common Cyrillic chars
  const tr: Record<string, string> = {
    а:'a',б:'b',в:'v',г:'g',д:'d',е:'e',ё:'yo',ж:'zh',з:'z',и:'i',
    й:'y',к:'k',л:'l',м:'m',н:'n',о:'o',п:'p',р:'r',с:'s',т:'t',
    у:'u',ф:'f',х:'h',ц:'ts',ч:'ch',ш:'sh',щ:'shch',ъ:'',ы:'y',
    ь:'',э:'e',ю:'yu',я:'ya',ү:'u',ө:'o',
  }
  const latin = base.split('').map((c) => tr[c] ?? c).join('').replace(/[^a-z0-9]/g, '')
  return (latin || 'staff') + num
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

// ─── Staff Modal ──────────────────────────────────────────────────────────────

function StaffModal({
  onSave,
  onClose,
}: {
  onSave: (data: object) => Promise<string>
  onClose: () => void
}) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [avatarFile, setAvatarFile] = useState<File | null>(null)
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null)
  const [showPassword, setShowPassword] = useState(false)
  const [saving, setSaving] = useState(false)

  const [form, setForm] = useState({
    name: '',
    phone: '',
    birthDate: '',
    role: 'WAITER',
    username: '',
    password: generatePassword(),
  })

  function setField(key: string, value: string) {
    setForm((f) => {
      const next = { ...f, [key]: value }
      // Auto-generate username from name if not manually edited
      if (key === 'name' && !f.username) {
        next.username = generateUsername(value)
      }
      return next
    })
  }

  function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setAvatarFile(file)
    setAvatarPreview(URL.createObjectURL(file))
    e.target.value = ''
  }

  function copyToClipboard(text: string, label: string) {
    navigator.clipboard.writeText(text)
    toast.success(`${label} скопирован`)
  }

  async function handleSave() {
    if (!form.name.trim()) { toast.error('Введите имя'); return }
    if (!form.username.trim()) { toast.error('Введите логин'); return }
    if (form.password.length < 6) { toast.error('Пароль минимум 6 символов'); return }

    setSaving(true)
    try {
      const staffId = await onSave({
        name: form.name.trim(),
        username: form.username.trim(),
        password: form.password,
        role: form.role,
        phone: form.phone || null,
        birthDate: form.birthDate || null,
      })

      if (avatarFile) {
        const fd = new FormData()
        fd.append('file', avatarFile)
        await api.post(`/admin/staff/${staffId}/avatar`, fd, {
          headers: { 'Content-Type': 'multipart/form-data' },
        })
      }
      onClose()
    } catch {
      // error handled upstream
    } finally {
      setSaving(false)
    }
  }

  const initials = form.name.trim() ? form.name.trim().split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase() : '?'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[92vh] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <h2 className="text-lg font-bold text-foreground">Новый сотрудник</h2>
          <button onClick={onClose} className="rounded-xl p-1.5 text-muted-foreground hover:bg-muted">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">

          {/* ── Avatar ── */}
          <div className="flex flex-col items-center gap-3">
            <div className="relative">
              <div className={`flex h-24 w-24 items-center justify-center overflow-hidden rounded-[28px] text-white text-2xl font-black shadow-lg ${ROLE_BG[form.role] ?? 'bg-primary'}`}>
                {avatarPreview ? (
                  <Image src={avatarPreview} alt="" fill className="object-cover rounded-[28px]" />
                ) : (
                  initials
                )}
              </div>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="absolute -bottom-1 -right-1 flex h-8 w-8 items-center justify-center rounded-xl border-2 border-card bg-primary text-white shadow-md hover:bg-primary/90 transition-colors"
              >
                <Camera size={14} />
              </button>
            </div>
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
            <p className="text-[11px] text-muted-foreground">Нажмите на камеру чтобы добавить фото</p>
          </div>

          {/* ── Роль ── */}
          <div>
            <label className="text-xs font-semibold text-muted-foreground mb-2 block">Должность</label>
            <div className="grid grid-cols-2 gap-2">
              {Object.entries(ROLE_LABELS).filter(([k]) => k !== 'RESTAURANT_ADMIN').map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setField('role', key)}
                  className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-semibold transition-all ${form.role === key ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:border-primary/30 hover:text-foreground'}`}
                >
                  <span className={`h-2 w-2 rounded-full ${ROLE_BG[key]}`} />
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* ── Имя ── */}
          <div>
            <label className="text-xs font-semibold text-muted-foreground mb-1 block">Полное имя *</label>
            <input
              autoFocus
              value={form.name}
              onChange={(e) => setField('name', e.target.value)}
              placeholder="Айгерим Садырова"
              className="w-full h-10 px-3 bg-input border border-border rounded-xl text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>

          {/* ── Телефон + Дата рождения ── */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-muted-foreground mb-1 block">Телефон</label>
              <div className="relative">
                <Phone size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  value={form.phone}
                  onChange={(e) => setField('phone', e.target.value)}
                  placeholder="+996 700 000 000"
                  className="w-full h-10 pl-8 pr-3 bg-input border border-border rounded-xl text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground mb-1 block">Дата рождения</label>
              <div className="relative">
                <Calendar size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="date"
                  value={form.birthDate}
                  onChange={(e) => setField('birthDate', e.target.value)}
                  className="w-full h-10 pl-8 pr-3 bg-input border border-border rounded-xl text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>
            </div>
          </div>

          {/* ── Логин и пароль ── */}
          <div className="rounded-2xl border border-border bg-muted/30 p-4 space-y-3">
            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Данные для входа</p>

            <div>
              <label className="text-xs font-semibold text-muted-foreground mb-1 block">Логин *</label>
              <div className="flex gap-2">
                <input
                  value={form.username}
                  onChange={(e) => setField('username', e.target.value)}
                  placeholder="aigerim90"
                  className="flex-1 h-10 px-3 bg-input border border-border rounded-xl text-sm text-foreground font-mono focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
                <button
                  onClick={() => copyToClipboard(form.username, 'Логин')}
                  className="flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-input text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                  title="Скопировать"
                >
                  <Copy size={14} />
                </button>
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-muted-foreground mb-1 block">Пароль *</label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={form.password}
                    onChange={(e) => setField('password', e.target.value)}
                    className="w-full h-10 px-3 pr-9 bg-input border border-border rounded-xl text-sm text-foreground font-mono focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                  <button
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
                <button
                  onClick={() => setField('password', generatePassword())}
                  className="flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-input text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                  title="Сгенерировать новый пароль"
                >
                  <RefreshCw size={14} />
                </button>
                <button
                  onClick={() => copyToClipboard(form.password, 'Пароль')}
                  className="flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-input text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                  title="Скопировать пароль"
                >
                  <Copy size={14} />
                </button>
              </div>
              <p className="mt-1.5 text-[11px] text-muted-foreground">
                Сообщите сотруднику логин и пароль — они понадобятся для входа
              </p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex gap-2 border-t border-border px-6 py-4">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex flex-1 items-center justify-center gap-2 h-10 bg-primary text-primary-foreground text-sm font-semibold rounded-xl hover:bg-primary/90 disabled:opacity-60"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : null}
            {saving ? 'Создание...' : 'Создать сотрудника'}
          </button>
          <button
            onClick={onClose}
            disabled={saving}
            className="h-10 px-4 border border-border text-sm text-muted-foreground rounded-xl hover:bg-muted disabled:opacity-60"
          >
            Отмена
          </button>
        </div>
      </motion.div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function StaffPage() {
  const queryClient = useQueryClient()
  const [showModal, setShowModal] = useState(false)

  const { data: staff = [], isLoading } = useQuery<Staff[]>({
    queryKey: ['admin', 'staff'],
    queryFn: () => api.get('/admin/staff'),
    select: (d: unknown) => Array.isArray(d) ? d as Staff[] : [],
  })

  const createStaff = useMutation({
    mutationFn: (data: object) => api.post('/admin/staff', data) as Promise<Staff>,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'staff'] })
      toast.success('Сотрудник добавлен')
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const toggleActive = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      api.patch(`/admin/staff/${id}`, { isActive }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin', 'staff'] }),
    onError: (e: Error) => toast.error(e.message),
  })

  const activeCount = staff.filter((s) => s.isActive).length

  return (
    <div className="p-6 space-y-6 max-w-3xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Сотрудники</h1>
          <p className="text-muted-foreground text-sm mt-0.5">{activeCount} активных · {staff.length} всего</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 h-9 px-4 bg-primary text-primary-foreground text-sm font-semibold rounded-xl hover:bg-primary/90"
        >
          <Plus size={15} /> Добавить
        </button>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <div key={i} className="skeleton h-20 rounded-2xl" />)}
        </div>
      ) : staff.length === 0 ? (
        <div className="flex flex-col items-center py-20 text-muted-foreground gap-4">
          <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-muted">
            <Users size={32} className="opacity-30" />
          </div>
          <div className="text-center">
            <p className="font-semibold text-foreground">Нет сотрудников</p>
            <p className="text-sm mt-1">Добавьте первого сотрудника</p>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {staff.map((employee, i) => (
            <motion.div
              key={employee.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04 }}
              className={`flex items-center gap-4 rounded-2xl border bg-card p-4 transition-all ${employee.isActive ? 'border-border' : 'border-border/40 opacity-60'}`}
            >
              {/* Avatar */}
              <div className={`relative flex h-14 w-14 flex-shrink-0 items-center justify-center overflow-hidden rounded-2xl text-white text-lg font-black shadow-sm ${ROLE_BG[employee.role] ?? 'bg-primary'}`}>
                {employee.avatarUrl ? (
                  <Image src={employee.avatarUrl} alt={employee.name} fill className="object-cover" sizes="56px" />
                ) : (
                  employee.name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase()
                )}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-foreground">{employee.name}</span>
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-lg ${ROLE_COLORS[employee.role] ?? 'bg-muted text-muted-foreground'}`}>
                    {ROLE_LABELS[employee.role] ?? employee.role}
                  </span>
                  {!employee.isActive && (
                    <span className="text-xs bg-destructive/10 text-destructive px-2 py-0.5 rounded-lg font-semibold">Заблокирован</span>
                  )}
                </div>
                <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                  <span>@{employee.username}</span>
                  {employee.phone && (
                    <span className="flex items-center gap-1">
                      <Phone size={10} />
                      {employee.phone}
                    </span>
                  )}
                  {employee.birthDate && (
                    <span className="flex items-center gap-1">
                      <Calendar size={10} />
                      {formatDate(employee.birthDate)}
                    </span>
                  )}
                </div>
              </div>

              {/* Actions */}
              <button
                onClick={() => toggleActive.mutate({ id: employee.id, isActive: !employee.isActive })}
                className={`flex items-center gap-1.5 h-8 px-3 rounded-xl text-xs font-semibold border transition-all flex-shrink-0 ${
                  employee.isActive
                    ? 'border-destructive/30 text-destructive hover:bg-destructive/10'
                    : 'border-emerald-500/30 text-emerald-500 hover:bg-emerald-500/10'
                }`}
              >
                {employee.isActive
                  ? <><UserX size={13} /> Заблокировать</>
                  : <><UserCheck size={13} /> Активировать</>}
              </button>
            </motion.div>
          ))}
        </div>
      )}

      <AnimatePresence>
        {showModal && (
          <StaffModal
            onSave={async (data) => {
              const created = await createStaff.mutateAsync(data)
              return (created as Staff).id
            }}
            onClose={() => setShowModal(false)}
          />
        )}
      </AnimatePresence>
    </div>
  )
}
