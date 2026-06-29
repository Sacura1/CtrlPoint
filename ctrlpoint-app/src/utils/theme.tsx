import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { Appearance } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { createCommonStyles } from './commonStyles'

export type ThemeMode = 'light' | 'dark'

export type ThemeColors = {
  mode: ThemeMode
  bg: string
  bgSoft: string
  panel: string
  panel2: string
  input: string
  border: string
  borderStrong: string
  text: string
  textSoft: string
  muted: string
  faint: string
  brand: string
  brand2: string
  green: string
  red: string
  amber: string
  blue: string
  surface: string
  surfaceStrong: string
  overlay: string
  header: string
  nav: string
}

export const THEME_KEY = 'ctrlpoint_theme'

export const palettes: Record<ThemeMode, ThemeColors> = {
  light: {
    mode: 'light',
    bg: '#f2efe7',
    bgSoft: '#e8e2d6',
    panel: '#fffdfa',
    panel2: '#eee8dc',
    input: '#ffffff',
    border: 'rgba(40,35,27,0.16)',
    borderStrong: 'rgba(40,35,27,0.26)',
    text: '#151410',
    textSoft: '#343029',
    muted: '#756e61',
    faint: '#9c9486',
    brand: '#6f5538',
    brand2: '#523d28',
    green: '#0ca66a',
    red: '#b4232f',
    amber: '#9a5b00',
    blue: '#2563eb',
    surface: 'rgba(238,232,220,0.72)',
    surfaceStrong: 'rgba(238,232,220,0.92)',
    overlay: 'rgba(21,20,16,0.22)',
    header: 'rgba(242,239,231,0.96)',
    nav: 'rgba(255,253,250,0.98)',
  },
  dark: {
    mode: 'dark',
    bg: '#030404',
    bgSoft: '#070808',
    panel: '#0a0c0b',
    panel2: '#101312',
    input: '#0d100f',
    border: 'rgba(244,240,232,0.10)',
    borderStrong: 'rgba(244,240,232,0.16)',
    text: '#f4f0e8',
    textSoft: '#d9d3c8',
    muted: '#9f988d',
    faint: '#625d55',
    brand: '#16a463',
    brand2: '#67e8a4',
    green: '#34d399',
    red: '#f87171',
    amber: '#eab308',
    blue: '#63b3ed',
    surface: 'rgba(244,240,232,0.035)',
    surfaceStrong: 'rgba(244,240,232,0.06)',
    overlay: 'rgba(0,0,0,0.48)',
    header: 'rgba(3,4,4,0.96)',
    nav: 'rgba(3,4,4,0.98)',
  },
}

const systemMode = (): ThemeMode => (Appearance.getColorScheme() === 'light' ? 'light' : 'dark')
const defaultMode = (): ThemeMode => 'dark'

export const colors = palettes[systemMode()]

type ThemeContextValue = {
  mode: ThemeMode
  colors: ThemeColors
  common: ReturnType<typeof createCommonStyles>
  toggleTheme: () => Promise<void>
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setMode] = useState<ThemeMode>(defaultMode)

  useEffect(() => {
    let active = true
    AsyncStorage.getItem(THEME_KEY)
      .then((stored) => {
        if (!active) return
        if (stored === 'light' || stored === 'dark') setMode(stored)
      })
      .catch(() => null)
    return () => {
      active = false
    }
  }, [])

  const toggleTheme = useCallback(async () => {
    const next = mode === 'light' ? 'dark' : 'light'
    setMode(next)
    Appearance.setColorScheme(next)
    await AsyncStorage.setItem(THEME_KEY, next)
  }, [mode])

  const value = useMemo(() => {
    const current = palettes[mode]
    return {
      mode,
      colors: current,
      common: createCommonStyles(current),
      toggleTheme,
    }
  }, [mode, toggleTheme])

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  const value = useContext(ThemeContext)
  if (!value) throw new Error('useTheme must be used inside ThemeProvider')
  return value
}

export function alpha(hex: string, opacity: number) {
  const value = hex.replace('#', '')
  const bigint = parseInt(value, 16)
  const r = (bigint >> 16) & 255
  const g = (bigint >> 8) & 255
  const b = bigint & 255
  return `rgba(${r},${g},${b},${opacity})`
}

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
}
