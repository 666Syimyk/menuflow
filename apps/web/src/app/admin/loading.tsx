export default function AdminLoading() {
  return (
    <div className="p-6 space-y-6 animate-pulse">
      {/* Header */}
      <div className="space-y-2">
        <div className="h-7 w-48 rounded-xl bg-muted" />
        <div className="h-4 w-64 rounded-lg bg-muted" />
      </div>

      {/* KPI cards row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="rounded-2xl border border-border bg-card p-5 space-y-3">
            <div className="h-10 w-10 rounded-xl bg-muted" />
            <div className="h-4 w-24 rounded-lg bg-muted" />
            <div className="h-8 w-20 rounded-lg bg-muted" />
          </div>
        ))}
      </div>

      {/* Main content block */}
      <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
        <div className="h-5 w-36 rounded-lg bg-muted" />
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="flex items-center gap-4">
            <div className="h-10 w-10 rounded-xl bg-muted flex-shrink-0" />
            <div className="flex-1 space-y-2">
              <div className="h-4 rounded-lg bg-muted" style={{ width: `${50 + (i * 13) % 40}%` }} />
              <div className="h-3 w-24 rounded-lg bg-muted" />
            </div>
            <div className="h-8 w-20 rounded-xl bg-muted" />
          </div>
        ))}
      </div>
    </div>
  )
}
