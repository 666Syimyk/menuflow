'use client'

import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { api } from '@/lib/api'
import { Table2, UserCheck } from 'lucide-react'

interface Table {
  id: string
  number: number
  zone?: string | null
  isActive: boolean
  publicToken: string
  waiterId: string | null
  waiter: { id: string; name: string } | null
}

export default function WaiterTablesPage() {
  const { data: myTablesRaw, isLoading } = useQuery({
    queryKey: ['waiter', 'my-tables'],
    queryFn: () => api.get('/waiter/my-tables'),
    refetchInterval: 30_000,
  })
  const myTables: Table[] = Array.isArray(myTablesRaw) ? myTablesRaw as Table[] : []

  return (
    <div className="p-6 space-y-6">
      <div>
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-primary">Мои столы</p>
        <h1 className="mt-1 text-2xl font-bold text-foreground">Закреплённые столы</h1>
        <p className="text-muted-foreground text-sm mt-0.5">{myTables.length} стол(ов) закреплено за вами</p>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-3">
          {[1, 2, 3, 4, 5, 6].map((i) => <div key={i} className="skeleton h-28 rounded-2xl" />)}
        </div>
      ) : myTables.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-muted-foreground gap-4">
          <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-muted">
            <Table2 size={36} className="opacity-30" />
          </div>
          <div className="text-center">
            <p className="font-semibold text-foreground">Столов пока нет</p>
            <p className="text-sm mt-1">Обратитесь к администратору, чтобы он назначил вам столы</p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-3">
          {myTables.map((table, i) => (
            <motion.div
              key={table.id}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: i * 0.04 }}
              className={`flex flex-col items-center justify-center gap-2 p-4 rounded-2xl border aspect-square ${
                table.isActive
                  ? 'border-primary/30 bg-primary/[0.06]'
                  : 'border-border/50 bg-card opacity-50'
              }`}
            >
              <div className={`flex h-12 w-12 items-center justify-center rounded-xl ${table.isActive ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground'}`}>
                <Table2 size={22} />
              </div>
              <p className="text-2xl font-black text-foreground">№{table.number}</p>
              {table.zone && <p className="text-[10px] text-muted-foreground text-center truncate w-full">{table.zone}</p>}
              {!table.isActive && (
                <span className="text-[10px] font-semibold text-muted-foreground">Отключён</span>
              )}
            </motion.div>
          ))}
        </div>
      )}

      <div className="flex items-center gap-2 rounded-2xl border border-border bg-card/60 px-4 py-3 text-xs text-muted-foreground">
        <UserCheck size={14} className="text-primary" />
        Здесь отображаются только столы, которые администратор закрепил за вами
      </div>
    </div>
  )
}
