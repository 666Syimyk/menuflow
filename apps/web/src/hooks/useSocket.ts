'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuthStore } from '@/stores/auth.store'

const WS_BASE = (process.env.NEXT_PUBLIC_WS_URL ?? 'ws://localhost:8000').replace(/\/$/, '')

type Handler = (data: unknown) => void

const ROLE_TO_WS_ROLE: Record<string, string | null> = {
  RESTAURANT_ADMIN: 'admin',
  COOK: 'kitchen',
  WAITER: 'waiter',
  CASHIER: 'waiter',
  SUPER_ADMIN: null,
}

interface UseSocketOptions {
  orderToken?: string
}

export function useSocket(options: UseSocketOptions = {}) {
  // Point selectors so only relevant primitive changes cause re-renders
  const restaurantId = useAuthStore((s) => s.user?.restaurantId ?? null)
  const userRole = useAuthStore((s) => s.user?.role ?? null)
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)

  const [connected, setConnected] = useState(false)
  const handlersRef = useRef<Map<string, Set<Handler>>>(new Map())

  // Build WS URL as a plain string (stable primitive for useEffect dep)
  let wsUrl: string | null = null
  if (options.orderToken) {
    wsUrl = `${WS_BASE}/api/v1/public/ws/order/${options.orderToken}`
  } else if (isAuthenticated && restaurantId && userRole) {
    const wsRole = ROLE_TO_WS_ROLE[userRole]
    if (wsRole) {
      wsUrl = `${WS_BASE}/api/v1/public/ws/${wsRole}/${restaurantId}`
    }
  }

  useEffect(() => {
    if (!wsUrl) return

    let active = true
    let retryTimer: ReturnType<typeof setTimeout> | null = null
    let ws: WebSocket | null = null

    const doConnect = () => {
      if (!active) return
      ws = new WebSocket(wsUrl as string)

      ws.onopen = () => {
        if (active) setConnected(true)
      }

      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data as string) as { event: string; data: unknown }
          // Backend sends pings to keep connection alive — no handler needed
          if (msg.event === 'ping') return
          handlersRef.current.get(msg.event)?.forEach((h) => h(msg.data))
        } catch {
          // ignore malformed messages
        }
      }

      ws.onclose = () => {
        if (!active) return
        setConnected(false)
        ws = null
        retryTimer = setTimeout(doConnect, 3000)
      }

      ws.onerror = () => {
        ws?.close()
      }
    }

    doConnect()

    return () => {
      active = false
      if (retryTimer) clearTimeout(retryTimer)
      ws?.close()
      ws = null
      setConnected(false)
    }
  }, [wsUrl]) // string dep — stable, changes only when URL truly changes

  const on = useCallback(<T = unknown>(event: string, handler: (data: T) => void) => {
    if (!handlersRef.current.has(event)) {
      handlersRef.current.set(event, new Set())
    }
    handlersRef.current.get(event)!.add(handler as Handler)
    return () => {
      handlersRef.current.get(event)?.delete(handler as Handler)
    }
  }, [])

  const emit = useCallback((_event: string, _data?: unknown) => {
    // kept for API compatibility
  }, [])

  const subscribeToOrder = useCallback((_orderToken: string) => {
    // order tracking is handled via useSocket({ orderToken }) directly
  }, [])

  return { connected, on, emit, subscribeToOrder }
}

export function getSocket() {
  return null
}
