'use client'

import { useState, useRef, useEffect } from 'react'
import { ChevronDown } from 'lucide-react'
import { useLangStore } from '@/stores/lang.store'
import { localeNames, localeFlags, type Locale } from '@/lib/i18n'

const LOCALES: Locale[] = ['ru', 'en', 'ky']

export function LanguageSwitcher({ compact = false }: { compact?: boolean }) {
  const { locale, setLocale } = useLangStore()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center gap-1.5 rounded-xl border border-border bg-card text-xs font-semibold text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground ${
          compact ? 'px-2 py-1.5' : 'px-3 py-2'
        }`}
      >
        <span>{localeFlags[locale]}</span>
        {!compact && <span>{localeNames[locale]}</span>}
        <ChevronDown size={12} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute bottom-full left-0 z-50 mb-1 min-w-[130px] overflow-hidden rounded-2xl border border-border bg-card shadow-xl">
          {LOCALES.map((loc) => (
            <button
              key={loc}
              onClick={() => { setLocale(loc); setOpen(false) }}
              className={`flex w-full items-center gap-2 px-3 py-2.5 text-xs font-semibold transition-colors hover:bg-muted ${
                locale === loc ? 'bg-primary/10 text-primary' : 'text-foreground'
              }`}
            >
              <span>{localeFlags[loc]}</span>
              <span>{localeNames[loc]}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
