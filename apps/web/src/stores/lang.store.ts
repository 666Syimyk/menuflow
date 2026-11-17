import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Locale } from '@/lib/i18n'

interface LangStore {
  locale: Locale
  setLocale: (locale: Locale) => void
}

export const useLangStore = create<LangStore>()(
  persist(
    (set) => ({
      locale: 'ru',
      setLocale: (locale) => set({ locale }),
    }),
    { name: 'menuflow-lang' },
  ),
)
