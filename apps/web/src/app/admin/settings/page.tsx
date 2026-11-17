'use client'

import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { api } from '@/lib/api'
import toast from 'react-hot-toast'
import { Settings, Globe, Phone, MapPin } from 'lucide-react'

interface Restaurant {
  id: string
  name: string
  phone?: string
  address?: string
  currency: string
  language: string
  status: string
}

export default function SettingsPage() {
  const queryClient = useQueryClient()

  const { data: restaurant, isLoading } = useQuery<Restaurant>({
    queryKey: ['admin', 'restaurant'],
    queryFn: () => api.get('/admin/restaurant') as unknown as Promise<Restaurant>,
  })

  const [form, setForm] = useState({
    name: '',
    phone: '',
    address: '',
    language: 'ru',
  })

  useEffect(() => {
    if (restaurant) {
      setForm({
        name: restaurant.name,
        phone: restaurant.phone ?? '',
        address: restaurant.address ?? '',
        language: restaurant.language,
      })
    }
  }, [restaurant])

  const update = useMutation({
    mutationFn: () => api.patch('/admin/restaurant', {
      name: form.name,
      phone: form.phone || undefined,
      address: form.address || undefined,
      currency: 'KGS',
      language: form.language,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'restaurant'] })
      toast.success('Настройки сохранены')
    },
    onError: (e: Error) => toast.error(e.message),
  })

  function set(key: string, value: string) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        {[1, 2, 3].map((i) => <div key={i} className="skeleton h-20 rounded-xl" />)}
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Настройки ресторана</h1>
        <p className="text-muted-foreground text-sm mt-0.5">Основная информация</p>
      </div>

      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
        className="bg-card border border-border rounded-2xl p-6 space-y-4"
      >
        <h2 className="font-semibold text-foreground flex items-center gap-2">
          <Globe size={16} className="text-primary" /> Основная информация
        </h2>

        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">Название ресторана</label>
          <input
            value={form.name}
            onChange={(e) => set('name', e.target.value)}
            className="w-full h-10 px-3 bg-input border border-border rounded-xl text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
        </div>

        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 flex items-center gap-1">
            <Phone size={12} /> Телефон
          </label>
          <input
            value={form.phone}
            onChange={(e) => set('phone', e.target.value)}
            placeholder="+996 700 000 000"
            className="w-full h-10 px-3 bg-input border border-border rounded-xl text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
        </div>

        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 flex items-center gap-1">
            <MapPin size={12} /> Адрес
          </label>
          <input
            value={form.address}
            onChange={(e) => set('address', e.target.value)}
            placeholder="г. Бишкек, ул. Чуй 100"
            className="w-full h-10 px-3 bg-input border border-border rounded-xl text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
        </div>

        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">Язык интерфейса</label>
          <select
            value={form.language}
            onChange={(e) => set('language', e.target.value)}
            className="w-full h-10 px-3 bg-input border border-border rounded-xl text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
          >
            <option value="ru">Русский</option>
            <option value="ky">Кыргызский</option>
            <option value="en">English</option>
          </select>
        </div>
      </motion.div>

      <button
        onClick={() => update.mutate()}
        disabled={update.isPending}
        className="h-11 px-8 bg-primary text-primary-foreground font-semibold rounded-xl hover:bg-primary/90 disabled:opacity-50 transition-all flex items-center gap-2"
      >
        <Settings size={16} />
        {update.isPending ? 'Сохранение...' : 'Сохранить изменения'}
      </button>
    </div>
  )
}
