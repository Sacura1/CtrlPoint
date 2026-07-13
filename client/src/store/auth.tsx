import { create } from 'zustand'
import { User } from '../types'
import { auth as authApi } from '../api'

const AUTH_MARKER_KEY = 'ctrlpoint_has_auth'

function hasAuthMarker() {
  return typeof window !== 'undefined' && window.localStorage.getItem(AUTH_MARKER_KEY) === 'true'
}

function setAuthMarker(value: boolean) {
  if (typeof window === 'undefined') return
  if (value) window.localStorage.setItem(AUTH_MARKER_KEY, 'true')
  else window.localStorage.removeItem(AUTH_MARKER_KEY)
}

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
    if (!hasAuthMarker()) {
      set({ user: null, loading: false })
      return
    }

    try {
      const { user } = await authApi.me()
      set({ user, loading: false })
    } catch {
      setAuthMarker(false)
      set({ user: null, loading: false })
    }
  },

  login: async (email, password) => {
    const { user } = await authApi.login(email, password)
    setAuthMarker(true)
    set({ user })
  },

  register: async (email, password, massaAddress) => {
    const { user } = await authApi.register(email, password, massaAddress)
    setAuthMarker(true)
    set({ user })
  },

  logout: async () => {
    await authApi.logout().catch(() => null)
    setAuthMarker(false)
    set({ user: null })
  },

  setUser: (user) => {
    setAuthMarker(true)
    set({ user })
  },
}))
