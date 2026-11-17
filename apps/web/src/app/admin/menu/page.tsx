'use client'

import { useState, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import Image from 'next/image'
import { api } from '@/lib/api'
import { useFormatPrice } from '@/hooks/useCurrency'
import toast from 'react-hot-toast'
import {
  Plus, Pencil, Trash2, Eye, EyeOff, ChevronDown, ChevronRight,
  ImagePlus, X as XIcon, Loader2,
} from 'lucide-react'

interface Category {
  id: string
  name: string
  sortOrder: number
  isActive: boolean
}

interface MenuItem {
  id: string
  name: string
  price: number
  description?: string | null
  isAvailable: boolean
  isPopular: boolean
  categoryId: string | null
  weight?: string | null
  cookingTime?: number | null
  imageUrl?: string | null
  images?: string[]
}

// ─── Category Form ──────────────────────────────────────────────────────────

function CategoryForm({
  initial,
  onSave,
  onCancel,
}: {
  initial?: Partial<Category>
  onSave: (data: { name: string }) => void
  onCancel: () => void
}) {
  const [name, setName] = useState(initial?.name ?? '')
  return (
    <div className="flex items-center gap-2">
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Название категории"
        className="flex-1 h-9 px-3 bg-input border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
      />
      <button
        onClick={() => name.trim() && onSave({ name: name.trim() })}
        className="h-9 px-4 bg-primary text-primary-foreground text-sm font-medium rounded-lg hover:bg-primary/90"
      >
        Сохранить
      </button>
      <button
        onClick={onCancel}
        className="h-9 px-3 border border-border text-sm text-muted-foreground rounded-lg hover:bg-muted"
      >
        Отмена
      </button>
    </div>
  )
}

// ─── Item Modal ─────────────────────────────────────────────────────────────

function ItemModal({
  item,
  categories,
  onSave,
  onClose,
}: {
  item?: Partial<MenuItem>
  categories: Category[]
  onSave: (data: object) => Promise<string> // returns created/updated item id
  onClose: () => void
}) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [form, setForm] = useState({
    name: item?.name ?? '',
    price: item?.price?.toString() ?? '',
    description: item?.description ?? '',
    categoryId: item?.categoryId ?? categories[0]?.id ?? '',
    weight: item?.weight?.toString() ?? '',
    cookingTime: item?.cookingTime?.toString() ?? '',
  })
  // Existing images (from saved item)
  const [savedImages, setSavedImages] = useState<string[]>(item?.images ?? [])
  // Pending files (selected but not yet uploaded)
  const [pendingFiles, setPendingFiles] = useState<{ file: File; preview: string }[]>([])
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)

  function setField(key: string, value: string) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    if (!files.length) return
    const newPending = files.map((file) => ({
      file,
      preview: URL.createObjectURL(file),
    }))
    setPendingFiles((prev) => [...prev, ...newPending])
    // Reset input so same file can be selected again
    e.target.value = ''
  }

  function removePending(idx: number) {
    setPendingFiles((prev) => {
      URL.revokeObjectURL(prev[idx].preview)
      return prev.filter((_, i) => i !== idx)
    })
  }

  async function removeSaved(url: string) {
    if (!item?.id) return
    try {
      await api.delete(`/menu/items/${item.id}/image`, { data: { url } })
      setSavedImages((prev) => prev.filter((u) => u !== url))
      toast.success('Фото удалено')
    } catch {
      toast.error('Не удалось удалить фото')
    }
  }

  async function uploadPending(itemId: string) {
    for (const { file } of pendingFiles) {
      const formData = new FormData()
      formData.append('file', file)
      await api.post(`/menu/items/${itemId}/image`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
    }
  }

  async function handleSave() {
    if (!form.name.trim() || !form.price) {
      toast.error('Заполните обязательные поля')
      return
    }
    setSaving(true)
    try {
      const itemId = await onSave({
        name: form.name.trim(),
        price: parseFloat(form.price),
        description: form.description || null,
        categoryId: form.categoryId || null,
        weight: form.weight || null,
        cookingTime: form.cookingTime ? parseInt(form.cookingTime) : null,
      })
      if (pendingFiles.length > 0) {
        setUploading(true)
        await uploadPending(itemId)
      }
      onClose()
    } catch {
      // error handled in parent
    } finally {
      setSaving(false)
      setUploading(false)
    }
  }

  const allImages = [
    ...savedImages,
    ...pendingFiles.map((p) => p.preview),
  ]
  const isBusy = saving || uploading

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-border bg-card"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <h2 className="text-lg font-bold text-foreground">
            {item?.id ? 'Редактировать блюдо' : 'Новое блюдо'}
          </h2>
          <button onClick={onClose} className="rounded-xl p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground">
            <XIcon size={18} />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">

          {/* ── Photo gallery ── */}
          <div>
            <label className="text-xs font-semibold text-muted-foreground mb-2 block">Фотографии блюда</label>
            <div className="flex flex-wrap gap-2">
              {/* Saved photos */}
              {savedImages.map((url) => (
                <div key={url} className="relative h-24 w-24 flex-shrink-0 overflow-hidden rounded-xl border border-border bg-muted group">
                  <Image src={url} alt="" fill className="object-cover" sizes="96px" />
                  <button
                    onClick={() => removeSaved(url)}
                    className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/70 text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500"
                  >
                    <XIcon size={10} />
                  </button>
                </div>
              ))}

              {/* Pending (not yet uploaded) */}
              {pendingFiles.map((p, idx) => (
                <div key={p.preview} className="relative h-24 w-24 flex-shrink-0 overflow-hidden rounded-xl border-2 border-dashed border-primary/40 bg-primary/5 group">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.preview} alt="" className="h-full w-full object-cover" />
                  <div className="absolute inset-x-0 bottom-0 bg-primary/80 text-center text-[9px] font-bold text-white py-0.5">
                    Не сохранено
                  </div>
                  <button
                    onClick={() => removePending(idx)}
                    className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/70 text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500"
                  >
                    <XIcon size={10} />
                  </button>
                </div>
              ))}

              {/* Add button */}
              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex h-24 w-24 flex-shrink-0 flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-border bg-muted/40 text-muted-foreground hover:border-primary/40 hover:bg-primary/5 hover:text-primary transition-colors"
              >
                <ImagePlus size={20} />
                <span className="text-[10px] font-semibold">Добавить</span>
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={handleFileSelect}
              />
            </div>
            {allImages.length === 0 && (
              <p className="mt-1.5 text-[11px] text-muted-foreground">
                Первое фото станет обложкой в меню
              </p>
            )}
          </div>

          {/* ── Text fields ── */}
          <div>
            <label className="text-xs font-semibold text-muted-foreground mb-1 block">Название *</label>
            <input
              value={form.name}
              onChange={(e) => setField('name', e.target.value)}
              placeholder="Например: Манты"
              className="w-full h-10 px-3 bg-input border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-muted-foreground mb-1 block">Цена (KGS) *</label>
              <input
                type="number"
                value={form.price}
                onChange={(e) => setField('price', e.target.value)}
                placeholder="0"
                className="w-full h-10 px-3 bg-input border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground mb-1 block">Вес/порция</label>
              <input
                value={form.weight}
                onChange={(e) => setField('weight', e.target.value)}
                placeholder="300г"
                className="w-full h-10 px-3 bg-input border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-muted-foreground mb-1 block">Время готовки (мин)</label>
              <input
                type="number"
                value={form.cookingTime}
                onChange={(e) => setField('cookingTime', e.target.value)}
                placeholder="15"
                className="w-full h-10 px-3 bg-input border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground mb-1 block">Категория</label>
              <select
                value={form.categoryId}
                onChange={(e) => setField('categoryId', e.target.value)}
                className="w-full h-10 px-3 bg-input border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
              >
                <option value="">Без категории</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-muted-foreground mb-1 block">Описание</label>
            <textarea
              value={form.description}
              onChange={(e) => setField('description', e.target.value)}
              rows={3}
              placeholder="Состав, особенности блюда..."
              className="w-full px-3 py-2 bg-input border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex gap-2 border-t border-border px-6 py-4">
          {uploading && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground mr-2">
              <Loader2 size={14} className="animate-spin" />
              Загрузка фото...
            </div>
          )}
          <button
            onClick={handleSave}
            disabled={isBusy}
            className="flex flex-1 items-center justify-center gap-2 h-10 bg-primary text-primary-foreground text-sm font-semibold rounded-xl hover:bg-primary/90 disabled:opacity-60"
          >
            {isBusy ? <Loader2 size={14} className="animate-spin" /> : null}
            {saving ? 'Сохранение...' : uploading ? 'Загрузка фото...' : 'Сохранить'}
          </button>
          <button
            onClick={onClose}
            disabled={isBusy}
            className="h-10 px-4 border border-border text-sm text-muted-foreground rounded-xl hover:bg-muted disabled:opacity-60"
          >
            Отмена
          </button>
        </div>
      </motion.div>
    </div>
  )
}

// ─── Main Page ──────────────────────────────────────────────────────────────

export default function MenuPage() {
  const queryClient = useQueryClient()
  const fmt = useFormatPrice()
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [addingCategory, setAddingCategory] = useState(false)
  const [editingCategory, setEditingCategory] = useState<Category | null>(null)
  const [itemModal, setItemModal] = useState<{ item?: Partial<MenuItem>; categoryId?: string } | null>(null)

  const { data: categories = [], isLoading } = useQuery<Category[]>({
    queryKey: ['admin', 'menu', 'categories'],
    queryFn: () => api.get('/menu/categories') as unknown as Promise<Category[]>,
  })

  const { data: allItems = [] } = useQuery<MenuItem[]>({
    queryKey: ['admin', 'menu', 'items'],
    queryFn: () => api.get('/menu/items') as unknown as Promise<MenuItem[]>,
  })

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['admin', 'menu'] })
  }

  const createCategory = useMutation({
    mutationFn: (data: { name: string }) => api.post('/menu/categories', data),
    onSuccess: () => { invalidate(); setAddingCategory(false); toast.success('Категория создана') },
    onError: (e: Error) => toast.error(e.message),
  })

  const updateCategory = useMutation({
    mutationFn: ({ id, data }: { id: string; data: object }) => api.patch(`/menu/categories/${id}`, data),
    onSuccess: () => { invalidate(); setEditingCategory(null); toast.success('Категория обновлена') },
    onError: (e: Error) => toast.error(e.message),
  })

  const deleteCategory = useMutation({
    mutationFn: (id: string) => api.delete(`/menu/categories/${id}`),
    onSuccess: () => { invalidate(); toast.success('Категория удалена') },
    onError: (e: Error) => toast.error(e.message),
  })

  const createItem = useMutation({
    mutationFn: (data: object) => api.post('/menu/items', data) as Promise<MenuItem>,
    onSuccess: () => { invalidate(); toast.success('Блюдо добавлено') },
    onError: (e: Error) => toast.error(e.message),
  })

  const updateItem = useMutation({
    mutationFn: ({ id, data }: { id: string; data: object }) => api.patch(`/menu/items/${id}`, data) as Promise<MenuItem>,
    onSuccess: () => { invalidate(); toast.success('Блюдо обновлено') },
    onError: (e: Error) => toast.error(e.message),
  })

  const deleteItem = useMutation({
    mutationFn: (id: string) => api.delete(`/menu/items/${id}`),
    onSuccess: () => { invalidate(); toast.success('Блюдо удалено') },
    onError: (e: Error) => toast.error(e.message),
  })

  function toggleAvailability(item: MenuItem) {
    updateItem.mutate({ id: item.id, data: { isAvailable: !item.isAvailable } })
  }

  function getItemsForCategory(categoryId: string) {
    return allItems.filter((i) => i.categoryId === categoryId)
  }

  function getUncategorizedItems() {
    return allItems.filter((i) => !i.categoryId)
  }

  function toggleExpand(id: string) {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  const ItemRow = ({ item }: { item: MenuItem }) => (
    <div className="flex items-center gap-3 px-4 py-3 border-b border-border/50 last:border-0 hover:bg-muted/30 transition-colors">
      {/* Thumbnail */}
      <div className="h-10 w-10 flex-shrink-0 overflow-hidden rounded-lg bg-muted">
        {item.imageUrl ? (
          <Image src={item.imageUrl} alt={item.name} width={40} height={40} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-muted-foreground/40 text-lg">🍽</div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className={`text-sm font-medium ${!item.isAvailable ? 'line-through text-muted-foreground' : 'text-foreground'}`}>
            {item.name}
          </span>
          {!item.isAvailable && (
            <span className="text-xs bg-red-500/10 text-red-500 px-1.5 py-0.5 rounded-md font-medium">
              Нет в наличии
            </span>
          )}
          {item.isPopular && (
            <span className="text-xs bg-amber-500/10 text-amber-500 px-1.5 py-0.5 rounded-md font-medium">
              Хит
            </span>
          )}
        </div>
        <span className="text-xs text-muted-foreground">
          {fmt(item.price)}
          {item.weight ? ` · ${item.weight}` : ''}
          {item.cookingTime ? ` · ${item.cookingTime} мин` : ''}
        </span>
      </div>

      <div className="flex items-center gap-1">
        <button
          onClick={() => toggleAvailability(item)}
          className={`p-1.5 rounded-lg transition-colors ${item.isAvailable ? 'text-muted-foreground hover:text-foreground hover:bg-muted' : 'text-red-500 hover:bg-red-500/10'}`}
          title={item.isAvailable ? 'Убрать из наличия' : 'Вернуть в наличие'}
        >
          {item.isAvailable ? <Eye size={14} /> : <EyeOff size={14} />}
        </button>
        <button
          onClick={() => setItemModal({ item })}
          className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
        >
          <Pencil size={14} />
        </button>
        <button
          onClick={() => deleteItem.mutate(item.id)}
          className="p-1.5 rounded-lg hover:bg-red-500/10 text-muted-foreground hover:text-red-500 transition-colors"
        >
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  )

  const uncategorized = getUncategorizedItems()

  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Меню</h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            {categories.length} категорий, {allItems.length} блюд
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setItemModal({})}
            className="flex items-center gap-2 h-9 px-4 border border-border text-sm font-medium rounded-xl hover:bg-muted"
          >
            <Plus size={15} />
            Блюдо
          </button>
          <button
            onClick={() => setAddingCategory(true)}
            className="flex items-center gap-2 h-9 px-4 bg-primary text-primary-foreground text-sm font-medium rounded-xl hover:bg-primary/90"
          >
            <Plus size={15} />
            Категория
          </button>
        </div>
      </div>

      <AnimatePresence>
        {addingCategory && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="bg-card border border-border rounded-xl p-4"
          >
            <CategoryForm
              onSave={(data) => createCategory.mutate(data)}
              onCancel={() => setAddingCategory(false)}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <div key={i} className="skeleton h-14 rounded-xl" />)}
        </div>
      ) : (
        <div className="space-y-3">
          {categories.map((cat, i) => {
            const items = getItemsForCategory(cat.id)
            const isOpen = expanded[cat.id]

            return (
              <motion.div
                key={cat.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04 }}
                className="bg-card border border-border rounded-xl overflow-hidden"
              >
                {editingCategory?.id === cat.id ? (
                  <div className="p-4">
                    <CategoryForm
                      initial={cat}
                      onSave={(data) => updateCategory.mutate({ id: cat.id, data })}
                      onCancel={() => setEditingCategory(null)}
                    />
                  </div>
                ) : (
                  <div
                    className="flex items-center gap-3 px-4 py-3.5 cursor-pointer hover:bg-muted/50 transition-colors"
                    onClick={() => toggleExpand(cat.id)}
                  >
                    <span className="text-muted-foreground">
                      {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                    </span>
                    <span className="font-semibold text-foreground flex-1">{cat.name}</span>
                    <span className="text-xs text-muted-foreground">{items.length} блюд</span>
                    <button
                      onClick={(e) => { e.stopPropagation(); setEditingCategory(cat) }}
                      className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground"
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); deleteCategory.mutate(cat.id) }}
                      className="p-1.5 rounded-lg hover:bg-red-500/10 text-muted-foreground hover:text-red-500"
                    >
                      <Trash2 size={14} />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); setItemModal({ categoryId: cat.id }) }}
                      className="p-1.5 rounded-lg hover:bg-primary/10 text-primary"
                    >
                      <Plus size={14} />
                    </button>
                  </div>
                )}

                <AnimatePresence>
                  {isOpen && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="border-t border-border overflow-hidden"
                    >
                      {items.length === 0 ? (
                        <div className="py-6 text-center text-muted-foreground text-sm">Нет блюд в этой категории</div>
                      ) : (
                        items.map((item) => <ItemRow key={item.id} item={item} />)
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            )
          })}

          {uncategorized.length > 0 && (
            <div className="bg-card border border-border rounded-xl overflow-hidden">
              <div
                className="flex items-center gap-3 px-4 py-3.5 cursor-pointer hover:bg-muted/50 transition-colors"
                onClick={() => toggleExpand('__uncategorized__')}
              >
                <span className="text-muted-foreground">
                  {expanded['__uncategorized__'] ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                </span>
                <span className="font-semibold text-foreground flex-1 text-muted-foreground">Без категории</span>
                <span className="text-xs text-muted-foreground">{uncategorized.length} блюд</span>
              </div>
              <AnimatePresence>
                {expanded['__uncategorized__'] && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="border-t border-border overflow-hidden"
                  >
                    {uncategorized.map((item) => <ItemRow key={item.id} item={item} />)}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}

          {categories.length === 0 && allItems.length === 0 && (
            <div className="text-center py-16 text-muted-foreground">
              <p className="text-4xl mb-3">🍽️</p>
              <p className="font-medium">Меню пустое</p>
              <p className="text-sm mt-1">Добавьте категорию или блюдо</p>
            </div>
          )}
        </div>
      )}

      <AnimatePresence>
        {itemModal && (
          <ItemModal
            item={itemModal.item}
            categories={categories}
            onSave={async (data) => {
              if (itemModal.item?.id) {
                const updated = await updateItem.mutateAsync({ id: itemModal.item.id, data })
                return (updated as MenuItem).id
              } else {
                const created = await createItem.mutateAsync({
                  ...data,
                  categoryId: (data as { categoryId?: string }).categoryId || itemModal.categoryId || null,
                })
                return (created as MenuItem).id
              }
            }}
            onClose={() => setItemModal(null)}
          />
        )}
      </AnimatePresence>
    </div>
  )
}
