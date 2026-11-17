import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function formatPrice(amount: number | string, _currency?: string): string {
  const num = typeof amount === 'string' ? parseFloat(amount) : amount
  if (isNaN(num)) return '— сом'
  return `${num.toLocaleString('ru-RU', { maximumFractionDigits: 0 })} сом`
}

export function formatDate(date: string | Date, format: 'short' | 'long' | 'time' = 'short'): string {
  const d = new Date(date)
  if (format === 'time') {
    return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
  }
  if (format === 'long') {
    return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  }
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })
}

export function timeAgo(date: string | Date): string {
  const now = Date.now()
  const then = new Date(date).getTime()
  const diff = Math.floor((now - then) / 1000)

  if (diff < 60) return `${diff}с`
  if (diff < 3600) return `${Math.floor(diff / 60)}м`
  if (diff < 86400) return `${Math.floor(diff / 3600)}ч`
  return `${Math.floor(diff / 86400)}д`
}

export function getOrderStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    new: 'Новый',
    accepted: 'Принят',
    cooking: 'Готовится',
    ready: 'Готов',
    served: 'Подан',
    paid: 'Оплачен',
    cancelled: 'Отменён',
  }
  return labels[status] ?? status
}

export function getOrderStatusColor(status: string): string {
  const colors: Record<string, string> = {
    new: 'text-blue-500 bg-blue-500/10',
    accepted: 'text-violet-500 bg-violet-500/10',
    cooking: 'text-amber-500 bg-amber-500/10',
    ready: 'text-emerald-500 bg-emerald-500/10',
    served: 'text-teal-500 bg-teal-500/10',
    paid: 'text-green-500 bg-green-500/10',
    cancelled: 'text-red-500 bg-red-500/10',
  }
  return colors[status] ?? 'text-gray-500 bg-gray-500/10'
}
