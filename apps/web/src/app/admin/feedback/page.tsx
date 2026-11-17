'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { useState } from 'react'
import { api } from '@/lib/api'
import { formatDate } from '@/lib/utils'
import { Check, MessageSquare, Star, Trash2 } from 'lucide-react'
import toast from 'react-hot-toast'

interface Feedback {
  id: string
  rating: number
  comment?: string
  isReviewed: boolean
  createdAt: string
  tableNumber?: number | null
}

export default function FeedbackPage() {
  const queryClient = useQueryClient()
  const [minRating, setMinRating] = useState<number | null>(null)

  const { data: feedback = [], isLoading, isError } = useQuery<Feedback[]>({
    queryKey: ['admin', 'feedback', minRating],
    queryFn: () => api.get('/feedback', { params: minRating ? { min_rating: minRating } : {} }),
    select: (d: unknown) => Array.isArray(d) ? d as Feedback[] : [],
  })

  const markReviewed = useMutation({
    mutationFn: (id: string) => api.patch(`/feedback/${id}`, { isReviewed: true }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin', 'feedback'] }),
    onError: (error: Error) => toast.error(error.message),
  })

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/feedback/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'feedback'] })
      toast.success('Отзыв удалён')
    },
    onError: (error: Error) => toast.error(error.message),
  })

  const avgRating = feedback.length > 0
    ? feedback.reduce((sum, f) => sum + f.rating, 0) / feedback.length
    : 0

  const ratingCounts = [5, 4, 3, 2, 1].map((r) => ({
    rating: r,
    count: feedback.filter((f) => f.rating === r).length,
  }))

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Отзывы</h1>
        <p className="text-muted-foreground text-sm mt-0.5">Отзывы от клиентов</p>
      </div>

      {/* Stats */}
      {feedback.length > 0 && (
        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <div className="flex items-center gap-5">
            <div className="text-center">
              <div className="text-4xl font-black text-foreground">{avgRating.toFixed(1)}</div>
              <div className="flex gap-0.5 mt-1 justify-center">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star key={i} size={12} className={i < Math.round(avgRating) ? 'text-amber-400 fill-amber-400' : 'text-muted'} />
                ))}
              </div>
              <div className="text-xs text-muted-foreground mt-1">{feedback.length} отзывов</div>
            </div>
            <div className="flex-1 space-y-1.5">
              {ratingCounts.map(({ rating, count }) => (
                <div key={rating} className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-muted-foreground w-3">{rating}</span>
                  <Star size={10} className="text-amber-400 fill-amber-400 flex-shrink-0" />
                  <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full rounded-full bg-amber-400 transition-all"
                      style={{ width: feedback.length > 0 ? `${(count / feedback.length) * 100}%` : '0%' }}
                    />
                  </div>
                  <span className="text-xs text-muted-foreground w-4 text-right">{count}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Filter */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm font-semibold text-muted-foreground">Фильтр:</span>
        {[null, 5, 4, 3, 2, 1].map((r) => (
          <button
            key={r ?? 'all'}
            onClick={() => setMinRating(r)}
            className={`flex items-center gap-1 rounded-xl px-3 py-1.5 text-xs font-bold transition-all ${
              minRating === r
                ? 'bg-foreground text-background'
                : 'border border-border bg-card text-muted-foreground hover:text-foreground'
            }`}
          >
            {r === null ? 'Все' : (
              <>
                {r}+ <Star size={10} className={minRating === r ? 'fill-background text-background' : 'fill-amber-400 text-amber-400'} />
              </>
            )}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <div key={i} className="skeleton h-20 rounded-xl" />)}
        </div>
      ) : isError ? (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-5 text-sm text-destructive">
          Не удалось загрузить отзывы.
        </div>
      ) : feedback.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <MessageSquare size={48} className="mx-auto mb-3 opacity-20" />
          <p className="font-medium">Отзывов нет</p>
          <p className="text-sm mt-1">Отзывы клиентов появятся здесь</p>
        </div>
      ) : (
        <div className="space-y-3">
          {feedback.map((item, i) => (
            <motion.div
              key={item.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04 }}
              className={`bg-card border rounded-xl p-4 ${item.isReviewed ? 'border-border/50 opacity-70' : 'border-border'}`}
            >
              <div className="flex items-start justify-between gap-3 mb-2">
                <div className="flex flex-col gap-1">
                  <div className="flex gap-0.5">
                    {Array.from({ length: 5 }).map((_, j) => (
                      <Star key={j} size={14} className={j < item.rating ? 'text-amber-400 fill-amber-400' : 'text-muted'} />
                    ))}
                  </div>
                  {item.tableNumber != null && (
                    <span className="text-xs font-semibold text-muted-foreground">Стол №{item.tableNumber}</span>
                  )}
                </div>
                <div className="flex flex-col items-end gap-1 flex-shrink-0">
                  {item.isReviewed && (
                    <span className="text-xs text-emerald-500 font-medium">Просмотрен</span>
                  )}
                  <span className="text-xs text-muted-foreground">{formatDate(item.createdAt, 'long')}</span>
                </div>
              </div>
              {item.comment && <p className="text-sm text-foreground">{item.comment}</p>}
              <div className="mt-3 flex justify-end gap-2">
                {!item.isReviewed && (
                  <button
                    onClick={() => markReviewed.mutate(item.id)}
                    disabled={markReviewed.isPending}
                    className="flex h-8 items-center gap-1.5 rounded-lg border border-border px-3 text-xs text-foreground hover:bg-muted"
                  >
                    <Check size={14} /> Просмотрен
                  </button>
                )}
                <button
                  onClick={() => {
                    if (window.confirm('Удалить этот отзыв?')) {
                      remove.mutate(item.id)
                    }
                  }}
                  disabled={remove.isPending}
                  className="flex h-8 items-center gap-1.5 rounded-lg border border-red-500/30 px-3 text-xs text-red-500 hover:bg-red-500/10"
                >
                  <Trash2 size={14} /> Удалить
                </button>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  )
}
