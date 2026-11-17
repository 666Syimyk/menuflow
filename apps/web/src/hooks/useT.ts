import { useLangStore } from '@/stores/lang.store'
import { getTranslations } from '@/lib/i18n'

export function useT() {
  const locale = useLangStore((s) => s.locale)
  return getTranslations(locale)
}
