import { create } from 'zustand'
import type { User } from '@/types'
import { authApi } from '@/services/api'

interface AuthState {
  user: User | null
  isAuthenticated: boolean
  isLoading: boolean
  error: string | null

  login: (email: string, password: string) => Promise<void>
  register: (email: string, password: string, fullName: string) => Promise<void>
  logout: () => void
  checkAuth: () => Promise<void>
  clearError: () => void
  setUser: (user: User) => void
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isAuthenticated: false,
  isLoading: true,
  error: null,

  login: async (email: string, password: string) => {
    set({ isLoading: true, error: null })
    try {
      const tokens = await authApi.login(email, password)
      localStorage.setItem('access_token', tokens.access_token)
      localStorage.setItem('refresh_token', tokens.refresh_token)

      const user = await authApi.getMe()
      set({ user, isAuthenticated: true, isLoading: false })
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Login failed'
      set({ error: message, isLoading: false })
      throw error
    }
  },

  register: async (email: string, password: string, fullName: string) => {
    set({ isLoading: true, error: null })
    try {
      await authApi.register(email, password, fullName)
      // After registration, log them in
      const tokens = await authApi.login(email, password)
      localStorage.setItem('access_token', tokens.access_token)
      localStorage.setItem('refresh_token', tokens.refresh_token)

      const user = await authApi.getMe()
      set({ user, isAuthenticated: true, isLoading: false })
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Registration failed'
      set({ error: message, isLoading: false })
      throw error
    }
  },

  logout: () => {
    localStorage.removeItem('access_token')
    localStorage.removeItem('refresh_token')
    set({ user: null, isAuthenticated: false })
  },

  checkAuth: async () => {
    const token = localStorage.getItem('access_token')
    if (!token) {
      set({ isLoading: false, isAuthenticated: false })
      return
    }

    try {
      const user = await authApi.getMe()
      set({ user, isAuthenticated: true, isLoading: false })
    } catch {
      localStorage.removeItem('access_token')
      localStorage.removeItem('refresh_token')
      set({ isAuthenticated: false, isLoading: false })
    }
  },

  clearError: () => set({ error: null }),

  setUser: (user: User) => set({ user }),
}))
