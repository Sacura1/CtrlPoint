import { create } from 'zustand'
import { User } from '../types'
import { auth as authApi } from '../api'

interface AuthStore {
  user: User | null
  loading: boolean
  init: () => Promise<void>
  login: (email: string, password: string) => Promise<void>
  register: (email: string, password: string, massaAddress?: string) => Promise<void>
  logout: () => Promise<void>
  setUser: (user: User) => void
}

export const useAuth = create<AuthStore>((set) => ({
  user: null,
  loading: true,

  init: async () => {
    try {
      const { user } = await authApi.me()
      set({ user, loading: false })
    } catch {
      set({ user: null, loading: false })
    }
  },

  login: async (email, password) => {
    const { user } = await authApi.login(email, password)
    set({ user })
  },

  register: async (email, password, massaAddress) => {
    const { user } = await authApi.register(email, password, massaAddress)
    set({ user })
  },

  logout: async () => {
    await authApi.logout()
    set({ user: null })
  },

  setUser: (user) => set({ user }),
}))
