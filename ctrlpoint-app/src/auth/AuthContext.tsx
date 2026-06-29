import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { auth as authApi, getToken, setToken } from '../api'
import { User } from '../types'
import { registerPushNotifications } from '../utils/pushNotifications'

const STARTUP_AUTH_TIMEOUT_MS = 6000
const USER_KEY = 'ctrlpoint_user'

function timeout(ms: number) {
  return new Promise<null>((resolve) => setTimeout(() => resolve(null), ms))
}

async function getCachedUser(): Promise<User | null> {
  const raw = await AsyncStorage.getItem(USER_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw) as User
  } catch {
    await AsyncStorage.removeItem(USER_KEY)
    return null
  }
}

async function setCachedUser(user: User | null): Promise<void> {
  if (user) await AsyncStorage.setItem(USER_KEY, JSON.stringify(user))
  else await AsyncStorage.removeItem(USER_KEY)
}

function isUnauthorizedError(err: unknown) {
  const message = err instanceof Error ? err.message : String(err || '')
  return /\((401|403)\)/.test(message)
}

interface AuthContextValue {
  user: User | null
  loading: boolean
  login: (email: string, password: string) => Promise<void>
  register: (email: string, password: string, massaAddress?: string) => Promise<void>
  requestEmailCode: (email: string, purpose: 'register' | 'reset') => Promise<string | undefined>
  verifyRegister: (email: string, password: string, code: string, massaAddress?: string) => Promise<void>
  resetPassword: (email: string, code: string, password: string) => Promise<void>
  guest: () => Promise<void>
  google: (token: string, type?: 'idToken' | 'accessToken') => Promise<void>
  logout: () => Promise<void>
  deleteAccount: () => Promise<void>
  setUser: (user: User) => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUserState] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  const setCurrentUser = useCallback((nextUser: User | null) => {
    setUserState(nextUser)
    setCachedUser(nextUser).catch(() => null)
  }, [])

  useEffect(() => {
    let active = true
    async function init() {
      const token = await getToken()
      if (!token) {
        if (active) {
          setCurrentUser(null)
          setLoading(false)
        }
        return
      }

      const cachedUser = await getCachedUser()
      if (cachedUser && active) {
        setUserState(cachedUser)
        setLoading(false)
      }

      Promise.race([authApi.me(), timeout(STARTUP_AUTH_TIMEOUT_MS)])
        .then((result) => {
          if (!active) return
          if (result && 'user' in result) {
            setCurrentUser(result.user)
          } else if (!cachedUser) {
            setCurrentUser(null)
          }
        })
        .catch(async (err) => {
          if (!active) return
          if (isUnauthorizedError(err)) {
            await setToken(null)
            setCurrentUser(null)
          } else if (!cachedUser) {
            setCurrentUser(null)
          }
        })
        .finally(() => {
          if (active) setLoading(false)
        })
    }
    init().catch(() => {
      if (active) {
        setCurrentUser(null)
        setLoading(false)
      }
    })
    return () => {
      active = false
    }
  }, [setCurrentUser])

  const persistAuth = useCallback(async (result: { user: User; token?: string }) => {
    if (result.token) await setToken(result.token)
    setCurrentUser(result.user)
  }, [setCurrentUser])

  useEffect(() => {
    if (!user) return
    registerPushNotifications().catch(() => null)
  }, [user?.id])

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      login: async (email, password) => persistAuth(await authApi.login(email, password)),
      register: async (email, password, massaAddress) => persistAuth(await authApi.register(email, password, massaAddress)),
      requestEmailCode: async (email, purpose) => (await authApi.startEmail(email, purpose)).devCode,
      verifyRegister: async (email, password, code, massaAddress) => persistAuth(await authApi.verifyRegister(email, password, code, massaAddress)),
      resetPassword: async (email, code, password) => persistAuth(await authApi.resetPassword(email, code, password)),
      guest: async () => persistAuth(await authApi.guest()),
      google: async (token, type = 'accessToken') => persistAuth(await authApi.google(token, type)),
      logout: async () => {
        await authApi.logout().catch(() => null)
        await setToken(null)
        setCurrentUser(null)
      },
      deleteAccount: async () => {
        await authApi.deleteAccount()
        await setToken(null)
        setCurrentUser(null)
      },
      setUser: setCurrentUser,
    }),
    [loading, persistAuth, setCurrentUser, user],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth must be used inside AuthProvider')
  return value
}
