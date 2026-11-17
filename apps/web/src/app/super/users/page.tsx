'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import { api } from '@/lib/api'
import { formatDate } from '@/lib/utils'
import toast from 'react-hot-toast'
import { Plus, Users, UserCheck, UserX } from 'lucide-react'

interface Restaurant { id: string; name: string }

interface User {
  id: string
  name: string
  username?: string
  email?: string
  role: string
  isActive: boolean
  restaurantId?: string
  createdAt: string
}

interface UserListResponse {
  items: User[]
  total: number
}

const ROLE_LABELS: Record<string, string> = {
  SUPER_ADMIN: 'Супер-Админ',
  RESTAURANT_ADMIN: 'Администратор',
  WAITER: 'Официант',
  COOK: 'Повар',
  CASHIER: 'Кассир',
}

const ROLE_COLORS: Record<string, string> = {
  SUPER_ADMIN: 'bg-red-500/10 text-red-500',
  RESTAURANT_ADMIN: 'bg-violet-500/10 text-violet-500',
  WAITER: 'bg-blue-500/10 text-blue-500',
  COOK: 'bg-amber-500/10 text-amber-500',
  CASHIER: 'bg-emerald-500/10 text-emerald-500',
}

function CreateAdminModal({
  restaurants,
  onSave,
  onClose,
}: {
  restaurants: Restaurant[]
  onSave: (data: { restaurantId: string; name: string; username: string; email: string; password: string }) => void
  onClose: () => void
}) {
  const [form, setForm] = useState({
    restaurantId: restaurants[0]?.id ?? '',
    name: '',
    username: '',
    email: '',
    password: '',
  })

  function set(key: string, value: string) { setForm((f) => ({ ...f, [key]: value })) }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        onClick={(e) => e.stopPropagation()}
        className="bg-card border border-border rounded-2xl p-6 w-full max-w-md space-y-4"
      >
        <h2 className="text-lg font-bold text-foreground">Создать администратора</h2>
        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Ресторан *</label>
            <select
              value={form.restaurantId}
              onChange={(e) => set('restaurantId', e.target.value)}
              className="w-full h-10 px-3 bg-input border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
            >
              {restaurants.map((r) => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Полное имя *</label>
            <input
              autoFocus
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
              placeholder="Иван Иванов"
              className="w-full h-10 px-3 bg-input border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Логин *</label>
              <input
                value={form.username}
                onChange={(e) => set('username', e.target.value)}
                placeholder="admin_kafe"
                className="w-full h-10 px-3 bg-input border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Email *</label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => set('email', e.target.value)}
                placeholder="admin@menuflow.local"
                className="w-full h-10 px-3 bg-input border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Пароль *</label>
            <input
              type="password"
              value={form.password}
              onChange={(e) => set('password', e.target.value)}
              placeholder="••••••••"
              className="w-full h-10 px-3 bg-input border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>
        </div>
        <div className="flex gap-2 pt-2">
          <button
            onClick={() => {
              if (!form.restaurantId || !form.name.trim() || !form.username.trim() || !form.email.trim() || !form.password.trim()) {
                toast.error('Заполните все поля')
                return
              }
              onSave(form)
            }}
            className="flex-1 h-10 bg-primary text-primary-foreground text-sm font-semibold rounded-xl hover:bg-primary/90"
          >
            Создать
          </button>
          <button onClick={onClose} className="h-10 px-4 border border-border text-sm text-muted-foreground rounded-xl hover:bg-muted">
            Отмена
          </button>
        </div>
      </motion.div>
    </div>
  )
}

export default function SuperUsersPage() {
  const queryClient = useQueryClient()
  const [showModal, setShowModal] = useState(false)

  const { data, isLoading } = useQuery<UserListResponse>({
    queryKey: ['super', 'users'],
    queryFn: () => api.get('/super/users') as unknown as Promise<UserListResponse>,
  })

  const { data: restaurants = [] } = useQuery<Restaurant[]>({
    queryKey: ['super', 'restaurants'],
    queryFn: () => api.get('/super/restaurants') as unknown as Promise<Restaurant[]>,
  })

  const createAdmin = useMutation({
    mutationFn: ({ restaurantId, ...body }: { restaurantId: string; name: string; username: string; email: string; password: string }) =>
      api.post(`/super/restaurants/${restaurantId}/admin`, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['super', 'users'] })
      setShowModal(false)
      toast.success('Администратор создан')
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const toggleActive = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      api.patch(`/super/users/${id}/${isActive ? 'activate' : 'deactivate'}`, {}),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['super', 'users'] }),
    onError: (e: Error) => toast.error(e.message),
  })

  const users = data?.items ?? []

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Пользователи</h1>
          <p className="text-muted-foreground text-sm mt-0.5">{data?.total ?? 0} всего</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 h-9 px-4 bg-primary text-primary-foreground text-sm font-medium rounded-xl hover:bg-primary/90"
        >
          <Plus size={15} /> Создать администратора
        </button>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => <div key={i} className="skeleton h-16 rounded-xl" />)}
        </div>
      ) : users.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Users size={48} className="mx-auto mb-3 opacity-20" />
          <p>Нет пользователей</p>
        </div>
      ) : (
        <div className="space-y-2">
          {users.map((user, i) => (
            <motion.div
              key={user.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.03 }}
              className={`flex items-center gap-4 p-4 bg-card border rounded-xl transition-all ${user.isActive ? 'border-border' : 'border-border/40 opacity-60'}`}
            >
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm flex-shrink-0">
                {user.name[0]?.toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-foreground">{user.name}</span>
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-md ${ROLE_COLORS[user.role] ?? 'bg-muted text-muted-foreground'}`}>
                    {ROLE_LABELS[user.role] ?? user.role}
                  </span>
                  {!user.isActive && (
                    <span className="text-xs bg-destructive/10 text-destructive px-2 py-0.5 rounded-md">Заблокирован</span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {user.username && `@${user.username}`}
                  {user.email && ` · ${user.email}`}
                  {` · ${formatDate(user.createdAt)}`}
                </p>
              </div>
              {user.role !== 'SUPER_ADMIN' && (
                <button
                  onClick={() => toggleActive.mutate({ id: user.id, isActive: !user.isActive })}
                  className={`flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-medium border transition-colors ${
                    user.isActive
                      ? 'border-destructive/30 text-destructive hover:bg-destructive/10'
                      : 'border-emerald-500/30 text-emerald-500 hover:bg-emerald-500/10'
                  }`}
                >
                  {user.isActive ? <><UserX size={12} /> Блок</> : <><UserCheck size={12} /> Активировать</>}
                </button>
              )}
            </motion.div>
          ))}
        </div>
      )}

      <AnimatePresence>
        {showModal && (
          <CreateAdminModal
            restaurants={restaurants}
            onSave={(data) => createAdmin.mutate(data)}
            onClose={() => setShowModal(false)}
          />
        )}
      </AnimatePresence>
    </div>
  )
}
