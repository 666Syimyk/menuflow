'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import { api } from '@/lib/api'
import { formatDate } from '@/lib/utils'
import toast from 'react-hot-toast'
import { Plus, Store, CheckCircle, XCircle, ArrowUpRight } from 'lucide-react'
import {
  CreateRestaurantModal,
  RestaurantCreatedModal,
  type CreatedRestaurantResult,
  type CreateRestaurantPayload,
} from './create-restaurant-modal'

interface Restaurant {
  id: string
  name: string
  slug: string
  phone?: string
  address?: string
  status: string
  createdAt: string
  tariffId?: string
}

const STATUS_LABELS: Record<string, string> = {
  active: 'Активен',
  trial: 'Пробный',
  blocked: 'Заблокирован',
  expired: 'Истёк',
}

const STATUS_COLORS: Record<string, string> = {
  active: 'text-emerald-500 bg-emerald-500/10',
  trial: 'text-violet-500 bg-violet-500/10',
  blocked: 'text-red-500 bg-red-500/10',
  expired: 'text-orange-500 bg-orange-500/10',
}

export default function SuperRestaurantsPage() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const [showModal, setShowModal] = useState(false)
  const [createdResult, setCreatedResult] = useState<CreatedRestaurantResult | null>(null)

  const { data: restaurantsRaw, isLoading } = useQuery({
    queryKey: ['super', 'restaurants'],
    queryFn: () => api.get('/super/restaurants'),
  })
  const restaurants: Restaurant[] = Array.isArray(restaurantsRaw) ? restaurantsRaw as Restaurant[] : []

  const blockRestaurant = useMutation({
    mutationFn: (id: string) => api.patch(`/super/restaurants/${id}/block`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['super', 'restaurants'] })
      toast.success('Ресторан заблокирован')
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const unblockRestaurant = useMutation({
    mutationFn: (id: string) => api.patch(`/super/restaurants/${id}/unblock`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['super', 'restaurants'] })
      toast.success('Ресторан активирован')
    },
    onError: (e: Error) => toast.error(e.message),
  })

  async function handleCreate(payload: CreateRestaurantPayload): Promise<CreatedRestaurantResult> {
    const restaurant = await api.post('/super/restaurants', {
      name: payload.name,
      slug: payload.slug,
      phone: payload.phone || undefined,
      address: payload.address || undefined,
      currency: payload.currency,
      language: payload.language,
    }) as Restaurant

    if (payload.tariffId && payload.subscriptionEndsAt) {
      await api.patch(`/super/restaurants/${restaurant.id}/assign-tariff`, {
        tariffId: payload.tariffId,
        subscriptionEndsAt: new Date(`${payload.subscriptionEndsAt}T23:59:59`).toISOString(),
      })
    }

    await api.post(`/super/restaurants/${restaurant.id}/admin`, {
      name: payload.admin.name,
      username: payload.admin.login,
      email: payload.admin.email,
      password: payload.admin.password,
    })

    return {
      restaurant: { id: restaurant.id, name: restaurant.name, slug: restaurant.slug },
      credentials: {
        name: payload.admin.name,
        login: payload.admin.login,
        email: payload.admin.email,
        password: payload.admin.password,
      },
    }
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Рестораны</h1>
          <p className="text-muted-foreground text-sm mt-0.5">{restaurants.length} всего</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 h-9 px-4 bg-primary text-primary-foreground text-sm font-medium rounded-xl hover:bg-primary/90"
        >
          <Plus size={15} /> Добавить
        </button>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <div key={i} className="skeleton h-24 rounded-xl" />)}
        </div>
      ) : restaurants.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Store size={48} className="mx-auto mb-3 opacity-20" />
          <p className="font-medium">Нет ресторанов</p>
        </div>
      ) : (
        <div className="space-y-3">
          {restaurants.map((r, i) => (
            <motion.article
              key={r.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04 }}
              role="link"
              tabIndex={0}
              onClick={() => router.push(`/super/restaurants/${r.id}`)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') router.push(`/super/restaurants/${r.id}`)
              }}
              className="group flex cursor-pointer items-center gap-4 rounded-xl border border-border bg-card p-4 transition-all hover:-translate-y-0.5 hover:border-primary/35 hover:shadow-lg hover:shadow-primary/5 focus:outline-none focus:ring-2 focus:ring-primary/40"
            >
              <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                <Store size={20} className="text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-foreground">{r.name}</span>
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-md ${STATUS_COLORS[r.status] ?? 'bg-muted text-muted-foreground'}`}>
                    {STATUS_LABELS[r.status] ?? r.status}
                  </span>
                </div>
                <div className="flex gap-3 text-xs text-muted-foreground mt-1 flex-wrap">
                  {r.phone && <span>{r.phone}</span>}
                  {r.address && <span>{r.address}</span>}
                  <span>Создан {formatDate(r.createdAt)}</span>
                </div>
              </div>
              <div className="flex gap-2 flex-shrink-0">
                {r.status === 'blocked' ? (
                  <button
                    onClick={(event) => { event.stopPropagation(); unblockRestaurant.mutate(r.id) }}
                    className="flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-medium border border-emerald-500/30 text-emerald-500 hover:bg-emerald-500/10 transition-colors"
                  >
                    <CheckCircle size={13} /> Активировать
                  </button>
                ) : (
                  <button
                    onClick={(event) => { event.stopPropagation(); blockRestaurant.mutate(r.id) }}
                    className="flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-medium border border-red-500/30 text-red-500 hover:bg-red-500/10 transition-colors"
                  >
                    <XCircle size={13} /> Заблокировать
                  </button>
                )}
              </div>
              <ArrowUpRight size={17} className="text-muted-foreground opacity-0 transition group-hover:opacity-100" />
            </motion.article>
          ))}
        </div>
      )}

      <AnimatePresence>
        {showModal && (
          <CreateRestaurantModal
            onSubmit={handleCreate}
            onClose={() => setShowModal(false)}
          />
        )}
        {createdResult && (
          <RestaurantCreatedModal
            result={createdResult}
            onClose={() => setCreatedResult(null)}
          />
        )}
      </AnimatePresence>
    </div>
  )
}
