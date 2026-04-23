function normalizeHost(value: string): string {
  return value
    .trim()
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '')
}

export const mnsPublicDomain = normalizeHost(import.meta.env.VITE_MNS_PUBLIC_DOMAIN || 'massahub.network') || 'massahub.network'

export function getSiteUrl(mnsName: string): string {
  return `https://${mnsName}.${mnsPublicDomain}`
}
