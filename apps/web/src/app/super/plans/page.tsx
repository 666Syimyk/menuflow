'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import { api } from '@/lib/api'
import { formatPrice } from '@/lib/utils'
import toast from 'react-hot-toast'
import { Plus, CreditCard } from 'lucide-react'

interface Tariff {
  id: string
  name: string
  price: number
  periodDays: number
  maxTables: number
  maxStaff: number
  maxMenuItems: number
  analyticsEnabled: boolean
  feedbackEnabled: boolean
  brandingEnabled: boolean
  isActive: boolean
  createdAt: string
}

function TariffModal({
  tariff,
  onSave,
  onClose,
}: {
  tariff?: Partial<Tariff>
  onSave: (data: object) => void
  onClose: () => void
}) {
  const [form, setForm] = useState({
    name: tariff?.name ?? '',
    price: tariff?.price?.toString() ?? '',
    periodDays: tariff?.periodDays?.toString() ?? '30',
    maxTables: (tariff?.maxTables ?? 10).toString(),
    maxStaff: (tariff?.maxStaff ?? 5).toString(),
    maxMenuItems: (tariff?.maxMenuItems ?? 50).toString(),
    analyticsEnabled: tariff?.analyticsEnabled ?? false,
    feedbackEnabled: tariff?.feedbackEnabled ?? true,
  })

  function set(key: string, value: string | boolean) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        onClick={(e) => e.stopPropagation()}
        className="bg-card border border-border rounded-2xl p-6 w-full max-w-sm space-y-4"
      >
        <h2 className="text-lg font-bold text-foreground">{tariff?.id ? 'Редактировать тариф' : 'Новый тариф'}</h2>
        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Название</label>
            <input value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Pro"
              className="w-full h-10 px-3 bg-input border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Цена (KGS)</label>
              <input type="number" value={form.price} onChange={(e) => set('price', e.target.value)}
                className="w-full h-10 px-3 bg-input border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Дней</label>
              <input type="number" value={form.periodDays} onChange={(e) => set('periodDays', e.target.value)}
                className="w-full h-10 px-3 bg-input border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50" />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Столов</label>
              <input type="number" value={form.maxTables} onChange={(e) => set('maxTables', e.target.value)}
                className="w-full h-10 px-3 bg-input border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Сотрудников</label>
              <input type="number" value={form.maxStaff} onChange={(e) => set('maxStaff', e.target.value)}
                className="w-full h-10 px-3 bg-input border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Блюд</label>
              <input type="number" value={form.maxMenuItems} onChange={(e) => set('maxMenuItems', e.target.value)}
                className="w-full h-10 px-3 bg-input border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50" />
            </div>
          </div>
          <div className="flex gap-4">
            <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
              <input type="checkbox" checked={form.analyticsEnabled} onChange={(e) => set('analyticsEnabled', e.target.checked)} className="accent-primary" />
              Аналитика
            </label>
            <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
              <input type="checkbox" checked={form.feedbackEnabled} onChange={(e) => set('feedbackEnabled', e.target.checked)} className="accent-primary" />
              Отзывы
            </label>
          </div>
        </div>
        <div className="flex gap-2 pt-2">
          <button
            onClick={() => {
              if (!form.name.trim() || !form.price) { toast.error('Заполните поля'); return }
              onSave({
                name: form.name,
                price: parseFloat(form.price),
                periodDays: parseInt(form.periodDays),
                maxTables: parseInt(form.maxTables),
                maxStaff: parseInt(form.maxStaff),
                maxMenuItems: parseInt(form.maxMenuItems),
                analyticsEnabled: form.analyticsEnabled,
                feedbackEnabled: form.feedbackEnabled,
              })
            }}
            className="flex-1 h-10 bg-primary text-primary-foreground text-sm font-semibold rounded-xl hover:bg-primary/90"
          >
            Сохранить
          </button>
          <button onClick={onClose} className="h-10 px-4 border border-border text-sm text-muted-foreground rounded-xl hover:bg-muted">
            Отмена
          </button>
        </div>
      </motion.div>
    </div>
  )
}

export default function SuperPlansPage() {
  const queryClient = useQueryClient()
  const [modal, setModal] = useState<{ tariff?: Partial<Tariff> } | null>(null)

  const { data: tariffs = [], isLoading } = useQuery<Tariff[]>({
    queryKey: ['tariffs'],
    queryFn: () => api.get('/tariffs') as unknown as Promise<Tariff[]>,
  })

  const createTariff = useMutation({
    mutationFn: (data: object) => api.post('/tariffs', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tariffs'] })
      setModal(null)
      toast.success('Тариф создан')
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const updateTariff = useMutation({
    mutationFn: ({ id, data }: { id: string; data: object }) => api.patch(`/tariffs/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tariffs'] })
      setModal(null)
      toast.success('Тариф обновлён')
    },
    onError: (e: Error) => toast.error(e.message),
  })

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Тарифы</h1>
          <p className="text-muted-foreground text-sm mt-0.5">Управление планами подписки</p>
        </div>
        <button
          onClick={() => setModal({})}
          className="flex items-center gap-2 h-9 px-4 bg-primary text-primary-foreground text-sm font-medium rounded-xl hover:bg-primary/90"
        >
          <Plus size={15} /> Новый тариф
        </button>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => <div key={i} className="skeleton h-48 rounded-2xl" />)}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {tariffs.map((tariff, i) => (
            <motion.div
              key={tariff.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.07 }}
              className={`bg-card border rounded-2xl p-6 flex flex-col gap-4 ${tariff.isActive ? 'border-border' : 'border-border/40 opacity-60'}`}
            >
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-bold text-foreground text-xl">{tariff.name}</p>
                  <p className="text-xs text-muted-foreground">{tariff.periodDays} дней</p>
                </div>
                <CreditCard size={20} className="text-primary" />
              </div>
              <p className="text-3xl font-bold text-primary">{formatPrice(tariff.price)}</p>
              <div className="space-y-1 text-sm text-muted-foreground">
                <div className="flex justify-between">
                  <span>Столов</span>
                  <span className="text-foreground font-medium">{tariff.maxTables}</span>
                </div>
                <div className="flex justify-between">
                  <span>Сотрудников</span>
                  <span className="text-foreground font-medium">{tariff.maxStaff}</span>
                </div>
                <div className="flex justify-between">
                  <span>Блюд</span>
                  <span className="text-foreground font-medium">{tariff.maxMenuItems}</span>
                </div>
                {tariff.analyticsEnabled && (
                  <div className="flex justify-between">
                    <span>Аналитика</span>
                    <span className="text-emerald-500 font-medium">✓</span>
                  </div>
                )}
              </div>
              <div className="flex gap-2 mt-auto">
                <button
                  onClick={() => setModal({ tariff })}
                  className="flex-1 h-8 border border-border text-xs text-muted-foreground rounded-lg hover:bg-muted transition-colors"
                >
                  Редактировать
                </button>
                <button
                  onClick={() => updateTariff.mutate({ id: tariff.id, data: { isActive: !tariff.isActive } })}
                  className={`h-8 px-3 rounded-lg text-xs font-medium transition-colors ${tariff.isActive ? 'border border-red-500/30 text-red-500 hover:bg-red-500/10' : 'border border-emerald-500/30 text-emerald-500 hover:bg-emerald-500/10'}`}
                >
                  {tariff.isActive ? 'Скрыть' : 'Активировать'}
                </button>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      <AnimatePresence>
        {modal && (
          <TariffModal
            tariff={modal.tariff}
            onSave={(data) => {
              if (modal.tariff?.id) {
                updateTariff.mutate({ id: modal.tariff.id, data })
              } else {
                createTariff.mutate(data)
              }
            }}
            onClose={() => setModal(null)}
          />
        )}
      </AnimatePresence>
    </div>
  )
}
