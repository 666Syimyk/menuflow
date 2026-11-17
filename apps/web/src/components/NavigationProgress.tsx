'use client'

import { useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'

export function NavigationProgress() {
  const pathname = usePathname()
  const [progress, setProgress] = useState(0)
  const [visible, setVisible] = useState(false)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const prevPathname = useRef(pathname)

  useEffect(() => {
    if (pathname === prevPathname.current) return
    prevPathname.current = pathname

    // New route loaded — complete the bar
    setProgress(100)
    const hide = setTimeout(() => {
      setVisible(false)
      setProgress(0)
    }, 300)
    return () => clearTimeout(hide)
  }, [pathname])

  // When link is clicked, start progress immediately (before pathname changes)
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      const a = (e.target as HTMLElement).closest('a')
      if (!a) return
      const href = a.getAttribute('href')
      if (!href || href.startsWith('http') || href.startsWith('#') || href === pathname) return

      setVisible(true)
      setProgress(15)

      if (timerRef.current) clearInterval(timerRef.current)
      let p = 15
      timerRef.current = setInterval(() => {
        p += Math.random() * 12
        if (p > 85) {
          clearInterval(timerRef.current!)
          p = 85
        }
        setProgress(p)
      }, 200)
    }

    document.addEventListener('click', handleClick)
    return () => {
      document.removeEventListener('click', handleClick)
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [pathname])

  if (!visible && progress === 0) return null

  return (
    <div
      className="fixed top-0 left-0 right-0 z-[9999] h-[3px] pointer-events-none"
      style={{ opacity: visible || progress > 0 ? 1 : 0, transition: 'opacity 300ms' }}
    >
      <div
        className="h-full bg-primary rounded-r-full shadow-[0_0_8px_hsl(var(--primary)/0.6)]"
        style={{
          width: `${progress}%`,
          transition: progress === 100 ? 'width 200ms ease-out' : 'width 200ms ease-in-out',
        }}
      />
    </div>
  )
}
