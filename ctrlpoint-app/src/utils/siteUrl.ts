import Constants from 'expo-constants'

function normalizeHost(value: string): string {
  return value
    .trim()
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '')
}

const extra = Constants.expoConfig?.extra as Record<string, string | undefined> | undefined

export const mnsPublicDomain =
  normalizeHost(process.env.EXPO_PUBLIC_MNS_PUBLIC_DOMAIN || extra?.mnsPublicDomain || 'massahub.network') ||
  'massahub.network'

export function getSiteDomain(mnsName: string, customDomain?: string | null): string {
  return customDomain || `${mnsName}.${mnsPublicDomain}`
}

export function getSiteUrl(mnsName: string, customDomain?: string | null): string {
  return `https://${getSiteDomain(mnsName, customDomain)}`
}
