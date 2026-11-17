import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { api } from '@/lib/api'

export type UserRole = 'SUPER_ADMIN' | 'RESTAURANT_ADMIN' | 'WAITER' | 'COOK' | 'CASHIER'

export interface AuthUser {
  id: string
  username: string | null
  name: string
  role: UserRole
  restaurantId: string | null
}

interface AuthState {
  user: AuthUser | null
  accessToken: string | null
  refreshToken: string | null
  isAuthenticated: boolean

  login: (login: string, password: string) => Promise<void>
  logout: () => Promise<void>
  setTokens: (accessToken: string, refreshToken: string) => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      isAuthenticated: false,

      login: async (login, password) => {
        const data = await api.post('/auth/login', { login, password }) as unknown as {
          accessToken: string
          refreshToken: string
          user: AuthUser
        }

        localStorage.setItem('accessToken', data.accessToken)
        localStorage.setItem('refreshToken', data.refreshToken)

        set({ user: data.user, accessToken: data.accessToken, refreshToken: data.refreshToken, isAuthenticated: true })
      },

      logout: async () => {
        const { refreshToken } = get()
        try {
          if (refreshToken) {
            await api.post('/auth/logout', { refreshToken })
          }
        } catch {
          // silent
        }
        localStorage.removeItem('accessToken')
        localStorage.removeItem('refreshToken')
        set({ user: null, accessToken: null, refreshToken: null, isAuthenticated: false })
      },

      setTokens: (accessToken, refreshToken) => {
        localStorage.setItem('accessToken', accessToken)
        localStorage.setItem('refreshToken', refreshToken)
        set({ accessToken, refreshToken })
      },
    }),
    {
      name: 'menuflow-auth',
      partialize: (s) => ({ user: s.user, accessToken: s.accessToken, refreshToken: s.refreshToken, isAuthenticated: s.isAuthenticated }),
    },
  ),
)

export function getRoleRedirectPath(role: UserRole): string {
  const map: Record<UserRole, string> = {
    SUPER_ADMIN: '/super',
    RESTAURANT_ADMIN: '/admin',
    WAITER: '/waiter',
    COOK: '/kitchen',
    CASHIER: '/cashier',
  }
  return map[role] ?? '/login'
}
