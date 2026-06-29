import { StyleSheet } from 'react-native'
import { BOTTOM_NAV_SPACE } from './layout'
import { font } from './typography'

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
}

export function createCommonStyles(colors: {
  bg: string
  text: string
  textSoft: string
  surface: string
  border: string
  borderStrong: string
  input: string
  muted: string
  brand: string
  red: string
  green: string
  surfaceStrong: string
}) {
  return StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  content: {
    padding: 16,
    paddingBottom: BOTTOM_NAV_SPACE + 32,
    gap: 14,
  },
  title: {
    color: colors.text,
    fontSize: 24,
    fontFamily: font.medium,
    fontWeight: '800',
  },
  subtitle: {
    color: colors.textSoft,
    fontSize: 13,
    fontFamily: font.medium,
    fontWeight: '600',
    lineHeight: 19,
  },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: 16,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  input: {
    minHeight: 44,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.input,
    color: colors.text,
    fontFamily: font.regular,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  label: {
    color: colors.muted,
    fontSize: 11,
    fontFamily: font.medium,
    fontWeight: '800',
    letterSpacing: 0,
    textTransform: 'uppercase',
  },
  primaryButton: {
    minHeight: 44,
    borderRadius: radius.md,
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
    flexDirection: 'row',
    gap: 8,
  },
  primaryText: {
    color: '#fff',
    fontFamily: font.medium,
    fontWeight: '800',
    fontSize: 14,
  },
  secondaryButton: {
    minHeight: 42,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceStrong,
    borderColor: colors.border,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
    flexDirection: 'row',
    gap: 8,
  },
  secondaryText: {
    color: colors.text,
    fontFamily: font.medium,
    fontWeight: '700',
    fontSize: 13,
  },
  error: {
    color: colors.red,
    fontFamily: font.medium,
    fontWeight: '700',
    fontSize: 12,
    lineHeight: 17,
  },
  success: {
    color: colors.green,
    fontFamily: font.medium,
    fontWeight: '700',
    fontSize: 12,
    lineHeight: 17,
  },
  mono: {
    fontFamily: font.mono,
  },
})
}

export const common = createCommonStyles({
  bg: '#030404',
  text: '#f4f0e8',
  textSoft: '#d9d3c8',
  surface: 'rgba(244,240,232,0.035)',
  border: 'rgba(244,240,232,0.10)',
  borderStrong: 'rgba(244,240,232,0.16)',
  input: '#0d100f',
  muted: '#9f988d',
  brand: '#16a463',
  red: '#f87171',
  green: '#34d399',
  surfaceStrong: 'rgba(244,240,232,0.06)',
})
