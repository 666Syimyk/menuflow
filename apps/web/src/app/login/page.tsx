'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import {
  ArrowRight,
  BarChart3,
  Eye,
  EyeOff,
  LockKeyhole,
  QrCode,
  ShieldCheck,
  UtensilsCrossed,
} from 'lucide-react'
import { useAuthStore, getRoleRedirectPath } from '@/stores/auth.store'
import { useT } from '@/hooks/useT'
import { LanguageSwitcher } from '@/components/LanguageSwitcher'
import toast from 'react-hot-toast'

export default function LoginPage() {
  const [login, setLogin] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const { login: authLogin } = useAuthStore()
  const router = useRouter()
  const t = useT()

  const demoAccounts = [
    { label: t.login_demo_owner, login: 'admin_demo', password: 'admin123' },
    { label: t.login_demo_waiter, login: 'waiter1', password: 'waiter123' },
    { label: t.login_demo_kitchen, login: 'cook1', password: 'cook123' },
  ]

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!login || !password) return

    setLoading(true)
    try {
      await authLogin(login, password)
      const user = useAuthStore.getState().user!
      router.push(getRoleRedirectPath(user.role))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t.login_error)
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="min-h-screen bg-[#17120f] p-3 sm:p-5">
      <div className="mx-auto grid min-h-[calc(100vh-24px)] max-w-[1500px] overflow-hidden rounded-[30px] bg-background shadow-2xl sm:min-h-[calc(100vh-40px)] lg:grid-cols-[1.08fr_0.92fr]">
        <section
          className="relative hidden overflow-hidden lg:flex lg:flex-col lg:justify-between lg:p-12"
          style={{
            backgroundImage:
              "linear-gradient(90deg, rgba(20,13,8,.88) 0%, rgba(20,13,8,.48) 58%, rgba(20,13,8,.16) 100%), url('/images/restaurant-hero.png')",
            backgroundPosition: 'center',
            backgroundSize: 'cover',
          }}
        >
          <div className="relative z-10 flex items-center gap-3 text-white">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary shadow-lg shadow-primary/30">
              <UtensilsCrossed size={21} />
            </div>
            <div>
              <p className="text-lg font-extrabold tracking-tight">MenuFlow</p>
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/60">
                Restaurant OS
              </p>
            </div>
          </div>

          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.65 }}
            className="relative z-10 max-w-xl"
          >
            <p className="mb-5 text-xs font-bold uppercase tracking-[0.22em] text-brand-300">
              {t.login_hero_eyebrow}
            </p>
            <h1 className="text-balance text-5xl font-extrabold leading-[1.06] tracking-[-0.045em] text-white xl:text-6xl">
              {t.login_hero_title}
            </h1>
            <p className="mt-6 max-w-lg text-base leading-7 text-white/70">
              {t.login_hero_text}
            </p>

            <div className="mt-9 grid grid-cols-3 gap-3">
              {[
                { icon: QrCode, label: t.login_hero_qr },
                { icon: BarChart3, label: t.login_hero_analytics },
                { icon: ShieldCheck, label: t.login_hero_reliability },
              ].map(({ icon: Icon, label }) => (
                <div
                  key={label}
                  className="rounded-2xl border border-white/10 bg-white/[0.07] p-4 text-white backdrop-blur-md"
                >
                  <Icon size={18} className="mb-3 text-brand-300" />
                  <p className="text-xs font-semibold">{label}</p>
                </div>
              ))}
            </div>
          </motion.div>

          <p className="relative z-10 text-xs text-white/40">
            {t.login_hero_footer}
          </p>
        </section>

        <section className="flex items-center justify-center px-5 py-10 sm:px-10 lg:px-16">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45 }}
            className="w-full max-w-[460px]"
          >
            <div className="mb-6 flex items-center justify-between">
              <div className="flex items-center gap-3 lg:hidden">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary text-white shadow-lg shadow-primary/25">
                  <UtensilsCrossed size={20} />
                </div>
                <div>
                  <p className="text-lg font-extrabold tracking-tight">MenuFlow</p>
                  <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">Restaurant OS</p>
                </div>
              </div>
              <div className="ml-auto">
                <LanguageSwitcher />
              </div>
            </div>

            <p className="eyebrow">{t.login_welcome}</p>
            <h2 className="mt-3 text-4xl font-extrabold tracking-[-0.045em] text-foreground">
              {t.login_title}
            </h2>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              {t.login_subtitle}
            </p>

            <form onSubmit={handleSubmit} className="mt-8 space-y-5">
              <div>
                <label className="mb-2 block text-xs font-bold uppercase tracking-[0.1em] text-muted-foreground">
                  {t.login_label_login}
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={login}
                    onChange={(e) => setLogin(e.target.value)}
                    placeholder={t.login_placeholder_login}
                    autoComplete="username"
                    className="h-14 w-full rounded-2xl border border-border bg-input pl-12 pr-4 text-sm font-medium text-foreground placeholder:text-muted-foreground/70 focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary/10"
                    required
                  />
                  <div className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground">
                    <ShieldCheck size={18} />
                  </div>
                </div>
              </div>

              <div>
                <label className="mb-2 block text-xs font-bold uppercase tracking-[0.1em] text-muted-foreground">
                  {t.login_label_password}
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={t.login_placeholder_password}
                    autoComplete="current-password"
                    className="h-14 w-full rounded-2xl border border-border bg-input pl-12 pr-12 text-sm font-medium text-foreground placeholder:text-muted-foreground/70 focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary/10"
                    required
                  />
                  <LockKeyhole size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <button
                    type="button"
                    onClick={() => setShowPassword((value) => !value)}
                    className="absolute right-3 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-xl text-muted-foreground hover:bg-muted hover:text-foreground"
                    aria-label={showPassword ? t.login_hide_password : t.login_show_password}
                  >
                    {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="flex h-14 w-full items-center justify-center gap-3 rounded-2xl bg-primary px-5 text-sm font-bold text-primary-foreground shadow-xl shadow-primary/20 hover:-translate-y-0.5 hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? (
                  <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                ) : (
                  <>
                    {t.login_btn}
                    <ArrowRight size={18} />
                  </>
                )}
              </button>
            </form>

            <div className="mt-8 border-t border-border pt-6">
              <p className="mb-3 text-xs font-semibold text-muted-foreground">{t.login_demo_title}</p>
              <div className="grid grid-cols-3 gap-2">
                {demoAccounts.map((account) => (
                  <button
                    key={account.login}
                    type="button"
                    onClick={() => {
                      setLogin(account.login)
                      setPassword(account.password)
                    }}
                    className="rounded-xl border border-border bg-card px-2 py-2.5 text-xs font-semibold text-foreground hover:border-primary/40 hover:bg-primary/5 hover:text-primary"
                  >
                    {account.label}
                  </button>
                ))}
              </div>
            </div>
          </motion.div>
        </section>
      </div>
    </main>
  )
}
