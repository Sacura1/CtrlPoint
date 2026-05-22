function normalizeHost(value: string): string {
  return value
    .trim()
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '')
}

export const mnsPublicDomain = normalizeHost(import.meta.env.VITE_MNS_PUBLIC_DOMAIN || 'massahub.network') || 'massahub.network'

export function getSiteDomain(mnsName: string, customDomain?: string | null): string {
  return customDomain || `${mnsName}.${mnsPublicDomain}`
}

export function getSiteUrl(mnsName: string, customDomain?: string | null): string {
  return `https://${getSiteDomain(mnsName, customDomain)}`
}
