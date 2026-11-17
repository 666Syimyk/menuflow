import { formatPrice as _fmt } from '@/lib/utils'

export function useFormatPrice() {
  return (amount: number | string) => _fmt(amount)
}
