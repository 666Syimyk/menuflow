'use client'

import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import { api } from '@/lib/api'
import toast from 'react-hot-toast'
import { Copy, Download, Plus, QrCode, Table2, Trash2, UserCheck, X } from 'lucide-react'

interface WaiterBrief {
  id: string
  name: string
  username: string | null
}

interface Table {
  id: string
  number: number
  zone: string | null
  publicToken: string
  isActive: boolean
  waiterId: string | null
  waiter: WaiterBrief | null
  createdAt: string
}

interface StaffUser {
  id: string
  name: string
  username: string | null
  role: string
}

function QrDisplay({ token, tableNumber }: { token: string; tableNumber: number }) {
  const url = `${window.location.origin}/m/${token}`
  const imageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=640x640&data=${encodeURIComponent(url)}`

  async function downloadPng() {
    try {
      const res = await fetch(imageUrl)
      const blob = await res.blob()
      const objectUrl = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = objectUrl
      anchor.download = `menuflow-table-${tableNumber}.png`
      anchor.click()
      URL.revokeObjectURL(objectUrl)
    } catch {
      toast.error('Не удалось скачать QR-код')
    }
  }

  return (
    <div className="text-center space-y-3">
      <p className="text-sm font-semibold text-foreground">Стол №{tableNumber}</p>
      <div className="bg-white p-3 rounded-xl inline-block">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={imageUrl} alt="QR Code" className="w-44 h-44" />
      </div>
      <p className="text-xs text-muted-foreground break-all max-w-xs mx-auto">{url}</p>
      <button
        onClick={() => { navigator.clipboard.writeText(url); toast.success('Ссылка скопирована') }}
        className="flex items-center gap-1.5 mx-auto text-xs text-primary hover:underline"
      >
        <Copy size={12} /> Скопировать ссылку
      </button>
      <button
        onClick={downloadPng}
        className="flex items-center gap-1.5 mx-auto h-9 px-4 rounded-xl bg-primary text-primary-foreground text-xs font-semibold"
      >
        <Download size={13} /> Скачать PNG
      </button>
    </div>
  )
}

export default function TablesPage() {
  const queryClient = useQueryClient()
  const [showAddTable, setShowAddTable] = useState(false)
  const [newTableNum, setNewTableNum] = useState('')
  const [newTableZone, setNewTableZone] = useState('')
  const [qrModal, setQrModal] = useState<{ token: string; tableNumber: number } | null>(null)
  const [assignModal, setAssignModal] = useState<Table | null>(null)
  const [selectedWaiterId, setSelectedWaiterId] = useState<string>('')

  const { data: tablesRaw, isLoading } = useQuery({
    queryKey: ['admin', 'tables'],
    queryFn: () => api.get('/tables'),
    refetchInterval: 15_000,
  })
  const tables: Table[] = Array.isArray(tablesRaw) ? tablesRaw as Table[] : []

  const { data: staffRaw } = useQuery({
    queryKey: ['admin', 'staff'],
    queryFn: () => api.get('/admin/staff'),
  })
  const waiters: StaffUser[] = Array.isArray(staffRaw)
    ? (staffRaw as StaffUser[]).filter((s) => s.role === 'WAITER')
    : []

  // Recalculate next free number when zone changes
  useEffect(() => {
    if (!showAddTable) return
    const usedInZone = new Set(
      tables.filter((t) => (t.zone ?? '') === newTableZone).map((t) => t.number)
    )
    let next = 1
    while (usedInZone.has(next)) next++
    setNewTableNum(String(next))
  }, [newTableZone, showAddTable]) // eslint-disable-line react-hooks/exhaustive-deps

  const createTable = useMutation({
    mutationFn: (body: { number: number; zone?: string }) => api.post('/tables', body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'tables'] })
      // Auto-increment within the same zone
      const usedInZone = new Set(
        tables.filter((t) => (t.zone ?? '') === newTableZone).map((t) => t.number)
      )
      let next = parseInt(newTableNum) + 1
      while (usedInZone.has(next)) next++
      setNewTableNum(String(next))
      toast.success('Стол добавлен')
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const deleteTable = useMutation({
    mutationFn: (id: string) => api.delete(`/tables/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'tables'] })
      toast.success('Стол удалён')
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const toggleActive = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      api.patch(`/tables/${id}`, { isActive }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin', 'tables'] }),
    onError: (e: Error) => toast.error(e.message),
  })

  const assignWaiter = useMutation({
    mutationFn: ({ tableId, waiterId }: { tableId: string; waiterId: string | null }) =>
      api.patch(`/tables/${tableId}/assign`, { waiterId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'tables'] })
      setAssignModal(null)
      toast.success('Официант назначен')
    },
    onError: (e: Error) => toast.error(e.message),
  })

  function openAssign(table: Table) {
    setAssignModal(table)
    setSelectedWaiterId(table.waiterId ?? '')
  }

  const activeCount = tables.filter((t) => t.isActive).length

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Столы</h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            {activeCount} активных из {tables.length}
          </p>
        </div>
        <button
          onClick={() => {
            setNewTableZone('')
            const usedInZone = new Set(tables.filter((t) => !t.zone).map((t) => t.number))
            let next = 1
            while (usedInZone.has(next)) next++
            setNewTableNum(String(next))
            setShowAddTable(true)
          }}
          className="h-9 px-4 bg-primary text-primary-foreground text-sm font-medium rounded-xl hover:bg-primary/90 flex items-center gap-1.5"
        >
          <Plus size={14} /> Стол
        </button>
      </div>

      <AnimatePresence>
        {showAddTable && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="bg-card border border-border rounded-xl p-4 flex gap-2 items-center flex-wrap"
          >
            <span className="text-sm text-muted-foreground">Номер:</span>
            <input
              autoFocus
              type="number"
              value={newTableNum}
              onChange={(e) => setNewTableNum(e.target.value)}
              placeholder="1"
              className="w-20 h-9 px-3 bg-input border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
            <span className="text-sm text-muted-foreground">Зона:</span>
            <input
              list="zone-suggestions"
              value={newTableZone}
              onChange={(e) => setNewTableZone(e.target.value)}
              placeholder="Выберите или введите зону"
              className="w-56 h-9 px-3 bg-input border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
            <datalist id="zone-suggestions">
              <option value="Основной зал" />
              <option value="1 этаж" />
              <option value="2 этаж" />
              <option value="Летник" />
              <option value="Терраса" />
              <option value="Топчаны" />
              <option value="VIP-зал" />
              <option value="Банкетный зал" />
              <option value="Балкон" />
              <option value="Двор" />
              <option value="Кабинки" />
              <option value="Барная зона" />
              <option value="Кыргыз үй / Боз үй" />
            </datalist>
            <button
              onClick={() => {
                const num = parseInt(newTableNum)
                if (!newTableNum || isNaN(num) || num < 1) {
                  toast.error('Введите корректный номер стола')
                  return
                }
                const zoneKey = newTableZone || ''
                if (tables.some((t) => t.number === num && (t.zone ?? '') === zoneKey)) {
                  const label = newTableZone ? ` в зоне "${newTableZone}"` : ''
                  toast.error(`Стол №${num} уже существует${label}`)
                  return
                }
                createTable.mutate({ number: num, zone: newTableZone || undefined })
              }}
              disabled={createTable.isPending}
              className="h-9 px-4 bg-primary text-primary-foreground text-sm font-medium rounded-lg disabled:opacity-50"
            >
              {createTable.isPending ? 'Создание...' : 'Создать'}
            </button>
            <button
              onClick={() => setShowAddTable(false)}
              className="h-9 px-3 border border-border text-sm rounded-lg text-muted-foreground hover:bg-muted"
            >
              Отмена
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {isLoading ? (
        <div className="space-y-6">
          {[1, 2].map((g) => (
            <div key={g} className="space-y-3">
              <div className="skeleton h-5 w-32 rounded-lg" />
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                {Array.from({ length: 5 }).map((_, i) => <div key={i} className="skeleton h-40 rounded-xl" />)}
              </div>
            </div>
          ))}
        </div>
      ) : tables.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Table2 size={48} className="mx-auto mb-3 opacity-20" />
          <p className="font-medium">Столов нет</p>
          <p className="text-sm mt-1">Добавьте первый стол</p>
        </div>
      ) : (() => {
        // Group tables by zone, preserve insertion order
        const zoneMap = new Map<string, Table[]>()
        for (const t of tables) {
          const key = t.zone || 'Без зоны'
          if (!zoneMap.has(key)) zoneMap.set(key, [])
          zoneMap.get(key)!.push(t)
        }
        const groups = Array.from(zoneMap.entries())

        return (
          <div className="space-y-8">
            {groups.map(([zone, zoneTables]) => (
              <div key={zone}>
                {/* Zone header */}
                <div className="flex items-center gap-3 mb-3">
                  <h2 className="text-sm font-bold text-foreground">{zone}</h2>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-semibold text-muted-foreground">
                    {zoneTables.length} {zoneTables.length === 1 ? 'стол' : 'столов'}
                  </span>
                  <div className="flex-1 h-px bg-border" />
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                  {zoneTables.map((table, i) => (
                    <motion.div
                      key={table.id}
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: i * 0.03 }}
                      className={`bg-card border rounded-xl p-4 flex flex-col gap-2 ${table.isActive ? 'border-border' : 'border-border/50 opacity-60'}`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xl font-bold text-foreground">№{table.number}</span>
                      </div>

                      <span className={`text-xs font-medium px-2 py-1 rounded-lg w-fit ${table.isActive ? 'bg-emerald-500/10 text-emerald-500' : 'bg-muted text-muted-foreground'}`}>
                        {table.isActive ? 'Активен' : 'Отключён'}
                      </span>

                      <button
                        onClick={() => openAssign(table)}
                        className={`flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium transition-colors w-full text-left ${
                          table.waiter
                            ? 'bg-blue-500/10 text-blue-600 hover:bg-blue-500/20'
                            : 'bg-muted/60 text-muted-foreground hover:bg-muted'
                        }`}
                      >
                        <UserCheck size={11} className="flex-shrink-0" />
                        <span className="truncate">
                          {table.waiter ? table.waiter.name : 'Назначить'}
                        </span>
                      </button>

                      <div className="flex gap-1 mt-auto">
                        <button
                          onClick={() => setQrModal({ token: table.publicToken, tableNumber: table.number })}
                          className="flex-1 h-8 flex items-center justify-center gap-1 text-xs bg-primary/10 hover:bg-primary/20 text-primary rounded-lg transition-colors"
                        >
                          <QrCode size={12} /> QR
                        </button>
                        <button
                          onClick={() => toggleActive.mutate({ id: table.id, isActive: !table.isActive })}
                          className="h-8 w-8 flex items-center justify-center rounded-lg bg-muted hover:bg-muted/80 text-muted-foreground text-xs"
                          title={table.isActive ? 'Отключить' : 'Включить'}
                        >
                          {table.isActive ? '⏸' : '▶'}
                        </button>
                        <button
                          onClick={() => deleteTable.mutate(table.id)}
                          className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-red-500/10 text-muted-foreground hover:text-red-500 transition-colors"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )
      })()}

      {/* Assign waiter modal */}
      <AnimatePresence>
        {assignModal && (
          <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={() => setAssignModal(null)}>
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-card border border-border rounded-2xl p-6 w-full max-w-sm space-y-4"
            >
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold text-foreground">Назначить официанта</h2>
                <button onClick={() => setAssignModal(null)} className="rounded-xl p-1.5 hover:bg-muted text-muted-foreground">
                  <X size={16} />
                </button>
              </div>
              <p className="text-sm text-muted-foreground">Стол №{assignModal.number}</p>

              <div className="space-y-2">
                <button
                  onClick={() => setSelectedWaiterId('')}
                  className={`w-full flex items-center gap-3 rounded-xl border px-3 py-2.5 text-sm transition-colors ${
                    selectedWaiterId === '' ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:border-primary/40'
                  }`}
                >
                  <span className="h-8 w-8 flex items-center justify-center rounded-lg bg-muted text-xs font-bold">—</span>
                  <span className="font-medium">Не назначен</span>
                </button>

                {waiters.length === 0 && (
                  <p className="text-xs text-muted-foreground text-center py-3">
                    Нет официантов в ресторане. Добавьте их в разделе «Сотрудники».
                  </p>
                )}

                {waiters.map((w) => (
                  <button
                    key={w.id}
                    onClick={() => setSelectedWaiterId(w.id)}
                    className={`w-full flex items-center gap-3 rounded-xl border px-3 py-2.5 text-sm transition-colors ${
                      selectedWaiterId === w.id ? 'border-primary bg-primary/10 text-primary' : 'border-border text-foreground hover:border-primary/40'
                    }`}
                  >
                    <span className="h-8 w-8 flex items-center justify-center rounded-lg bg-foreground text-background text-xs font-bold">
                      {w.name[0]?.toUpperCase()}
                    </span>
                    <div className="text-left">
                      <p className="font-semibold">{w.name}</p>
                      {w.username && <p className="text-xs opacity-60">@{w.username}</p>}
                    </div>
                  </button>
                ))}
              </div>

              <div className="flex gap-2 pt-1">
                <button
                  onClick={() =>
                    assignWaiter.mutate({
                      tableId: assignModal.id,
                      waiterId: selectedWaiterId || null,
                    })
                  }
                  disabled={assignWaiter.isPending}
                  className="flex-1 h-10 bg-primary text-primary-foreground text-sm font-semibold rounded-xl hover:bg-primary/90 disabled:opacity-50"
                >
                  {assignWaiter.isPending ? 'Сохранение...' : 'Сохранить'}
                </button>
                <button
                  onClick={() => setAssignModal(null)}
                  className="h-10 px-4 border border-border text-sm text-muted-foreground rounded-xl hover:bg-muted"
                >
                  Отмена
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* QR modal */}
      <AnimatePresence>
        {qrModal && (
          <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={() => setQrModal(null)}>
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-card border border-border rounded-2xl p-6"
            >
              <h2 className="text-lg font-bold text-foreground mb-4 text-center">QR-код стола</h2>
              <QrDisplay token={qrModal.token} tableNumber={qrModal.tableNumber} />
              <button
                onClick={() => setQrModal(null)}
                className="mt-4 w-full h-10 border border-border text-sm text-muted-foreground rounded-xl hover:bg-muted"
              >
                Закрыть
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  )
}
