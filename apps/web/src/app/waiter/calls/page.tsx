'use client'

import { useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { api } from '@/lib/api'
import { timeAgo } from '@/lib/utils'
import { useSocket } from '@/hooks/useSocket'
import toast from 'react-hot-toast'
import { Bell, CheckCheck } from 'lucide-react'

interface WaiterCall {
  id: string
  tableId: string | null
  tableNumber: number | null
  status: string
  createdAt: string
}

interface BillRequest {
  id: string
  tableId: string
  tableNumber?: number | null
  status: string
  createdAt: string
}

export default function WaiterCallsPage() {
  const queryClient = useQueryClient()
  const { on } = useSocket()

  const { data: calls = [], isLoading: loadingCalls } = useQuery<WaiterCall[]>({
    queryKey: ['waiter', 'calls'],
    queryFn: () => api.get('/waiter/calls'),
    select: (d: unknown) => Array.isArray(d) ? d as WaiterCall[] : [],
    refetchInterval: 10_000,
  })

  const { data: billRequests = [] } = useQuery<BillRequest[]>({
    queryKey: ['waiter', 'bill-requests'],
    queryFn: () => api.get('/waiter/bill-requests'),
    select: (d: unknown) => Array.isArray(d) ? d as BillRequest[] : [],
    refetchInterval: 10_000,
  })

  useEffect(() => {
    const offCall = on('waiter_call_created', () => {
      queryClient.invalidateQueries({ queryKey: ['waiter', 'calls'] })
      try { new Audio('/sounds/new-order.mp3').play() } catch {}
      toast('Гость вызывает официанта', { duration: 5000 })
    })
    const offBill = on('bill_requested', () => {
      queryClient.invalidateQueries({ queryKey: ['waiter', 'bill-requests'] })
      toast('Гость просит счёт', { duration: 5000 })
    })
    return () => { offCall(); offBill() }
  }, [on, queryClient])

  const closeCall = useMutation({
    mutationFn: (callId: string) => api.patch(`/waiter/calls/${callId}`, { status: 'completed' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['waiter', 'calls'] })
      toast.success('Вызов закрыт')
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const closeBill = useMutation({
    mutationFn: (reqId: string) => api.patch(`/waiter/bill-requests/${reqId}`, { status: 'completed' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['waiter', 'bill-requests'] })
      toast.success('Счёт закрыт')
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const isLoading = loadingCalls

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Вызовы</h1>
        <p className="text-muted-foreground text-sm mt-0.5">
          {calls.length + billRequests.length} активных
        </p>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2].map((i) => <div key={i} className="skeleton h-20 rounded-xl" />)}
        </div>
      ) : calls.length === 0 && billRequests.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Bell size={48} className="mx-auto mb-3 opacity-20" />
          <p className="font-medium">Вызовов нет</p>
          <p className="text-sm mt-1">Все тихо</p>
        </div>
      ) : (
        <div className="space-y-3">
          {calls.map((call, i) => (
            <motion.div
              key={call.id}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.06 }}
              className="flex items-center gap-4 p-4 rounded-xl border bg-amber-500/5 border-amber-500/20"
            >
              <div className="w-12 h-12 rounded-full flex items-center justify-center text-xl flex-shrink-0 bg-amber-500/10">
                🛎️
              </div>
              <div className="flex-1">
                <p className="font-bold text-foreground text-lg">Вызов официанта</p>
                <p className="text-sm font-medium text-amber-500">
                  {call.tableNumber ? `Стол №${call.tableNumber}` : 'Стол ожидает'}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">{timeAgo(call.createdAt)} назад</p>
              </div>
              <button
                onClick={() => closeCall.mutate(call.id)}
                className="flex items-center gap-1.5 h-9 px-4 bg-card border border-border rounded-xl text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-all"
              >
                <CheckCheck size={14} /> Закрыть
              </button>
            </motion.div>
          ))}

          {billRequests.map((req, i) => (
            <motion.div
              key={req.id}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: (calls.length + i) * 0.06 }}
              className="flex items-center gap-4 p-4 rounded-xl border bg-pink-500/5 border-pink-500/20"
            >
              <div className="w-12 h-12 rounded-full flex items-center justify-center text-xl flex-shrink-0 bg-pink-500/10">
                💳
              </div>
              <div className="flex-1">
                <p className="font-bold text-foreground text-lg">Просят счёт</p>
                <p className="text-sm font-medium text-pink-500">
                  {req.tableNumber ? `Стол №${req.tableNumber}` : 'Принести счёт на стол'}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">{timeAgo(req.createdAt)} назад</p>
              </div>
              <button
                onClick={() => closeBill.mutate(req.id)}
                className="flex items-center gap-1.5 h-9 px-4 bg-card border border-border rounded-xl text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-all"
              >
                <CheckCheck size={14} /> Закрыть
              </button>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  )
}
