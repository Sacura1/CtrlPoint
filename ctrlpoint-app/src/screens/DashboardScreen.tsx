import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Alert, Linking, Modal, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native'
import * as Clipboard from 'expo-clipboard'
import { Check, Copy, ExternalLink, Settings, Trash2, X } from 'lucide-react-native'
import { WEB_ORIGIN, github as githubApi, sites as sitesApi } from '../api'
import { Site } from '../types'
import { alpha, ThemeColors, useTheme } from '../utils/theme'
import { getSiteUrl, mnsPublicDomain } from '../utils/siteUrl'
import { Navigate } from './Shell'
import { CardSkeleton } from '../components/Skeleton'

function statusMap(colors: ThemeColors): Record<Site['status'], { label: string; color: string }> {
  return {
    DRAFT: { label: 'Draft', color: colors.faint },
    GENERATING: { label: 'Generating...', color: colors.brand2 },
    GENERATION_FAILED: { label: 'Generation failed', color: colors.red },
    DEPLOYING: { label: 'Deploying', color: colors.amber },
    LIVE: { label: 'Live', color: colors.green },
    ERROR: { label: 'Error', color: colors.red },
    UPDATING: { label: 'Updating', color: colors.brand2 },
  }
}

export default function DashboardScreen({ navigate }: { navigate: Navigate }) {
  const { colors, common } = useTheme()
  const styles = useMemo(() => createStyles(colors), [colors])
  const status = useMemo(() => statusMap(colors), [colors])
  const [siteList, setSiteList] = useState<Site[]>([])
  const [connections, setConnections] = useState<Record<string, any>>({})
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [settingsSite, setSettingsSite] = useState<Site | null>(null)
  const [copiedSiteId, setCopiedSiteId] = useState<string | null>(null)

  const load = useCallback(async () => {
    const { sites } = await sitesApi.list()
    const sorted = [...sites].sort((a, b) => (STATUS_ORDER[a.status] ?? 3) - (STATUS_ORDER[b.status] ?? 3))
    setSiteList(sorted)
    const pairs = await Promise.all(
      sorted.map((site) => githubApi.connection(site.id).then((c) => (c ? [site.id, c] as const : null)).catch(() => null)),
    )
    const next: Record<string, any> = {}
    pairs.forEach((pair) => {
      if (pair) next[pair[0]] = pair[1]
    })
    setConnections(next)
  }, [])

  useEffect(() => {
    load().finally(() => setLoading(false))
  }, [load])

  useEffect(() => {
    const hasBusySite = siteList.some((site) => site.status === 'DEPLOYING' || site.status === 'UPDATING' || site.status === 'GENERATING')
    const interval = setInterval(() => {
      load().catch(() => null)
    }, hasBusySite ? 3000 : 10000)
    return () => clearInterval(interval)
  }, [load, siteList])

  const refresh = async () => {
    setRefreshing(true)
    await load().catch(() => null)
    setRefreshing(false)
  }

  const deleteSite = (site: Site) => {
    Alert.alert('Delete web-app?', `This removes "${site.title}" from CtrlPoint.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await sitesApi.delete(site.id)
            setSiteList((prev) => prev.filter((s) => s.id !== site.id))
          } catch (err: any) {
            Alert.alert('Delete failed', err.message)
          }
        },
      },
    ])
  }

  return (
    <ScrollView style={common.screen} contentContainerStyle={common.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.brand2} />}>
      <View>
        <Text style={common.title}>My Web-Apps</Text>
        <Text style={common.subtitle}>{loading ? 'Loading saved web-apps.' : siteList.length === 0 ? 'No web-apps yet' : `${siteList.length} saved web-app${siteList.length === 1 ? '' : 's'}`}</Text>
      </View>

      {loading ? (
        <>
          <CardSkeleton />
          <CardSkeleton rows={2} />
          <CardSkeleton rows={2} />
        </>
      ) : siteList.length === 0 ? (
        <View style={[common.card, styles.empty]}>
          <Text style={styles.emptyTitle}>No web-apps yet</Text>
          <Text style={common.subtitle}>Describe what you want to build. AI does the rest.</Text>
          <Pressable onPress={() => navigate({ name: 'Editor' })} style={[common.primaryButton, styles.emptyButton]}>
            <Text style={common.primaryText}>Build your first web-app</Text>
          </Pressable>
        </View>
      ) : (
        siteList.map((site) => {
          const siteStatus = status[site.status]
          const conn = connections[site.id]
          const generating = site.status === 'GENERATING'
          return (
            <Pressable
              key={site.id}
              disabled={generating}
              onPress={() => navigate({ name: 'Editor', siteId: site.id, openTab: 'preview' })}
              style={({ pressed }) => [styles.siteCard, pressed && !generating && styles.siteCardPressed, generating && styles.siteCardDisabled]}
            >
              <View style={styles.siteTop}>
                <View style={[styles.dot, { backgroundColor: siteStatus.color }]} />
                <Text style={[styles.siteName, common.mono]}>{site.customDomain || `${site.mnsName}.${mnsPublicDomain}`}</Text>
              </View>
              <View style={styles.siteFooter}>
                <View style={styles.badges}>
                  <Text style={[styles.badge, { color: siteStatus.color, borderColor: siteStatus.color }]}>{siteStatus.label}</Text>
                  {site.ownershipClaimed ? <Text style={styles.claimed}>Claimed</Text> : null}
                  <Text style={styles.source}>{generating ? 'Agent working' : conn ? `${conn.repoOwner}/${conn.repoName}` : site.lastPrompt ? 'Agent' : 'File Upload'}</Text>
                </View>
                <View style={styles.actions}>
                  {site.status === 'LIVE' ? (
                    <>
                      <Pressable
                        onPress={async (event) => {
                          event.stopPropagation()
                          await Clipboard.setStringAsync(getSiteUrl(site.mnsName, site.customDomain))
                          setCopiedSiteId(site.id)
                          setTimeout(() => setCopiedSiteId((current) => (current === site.id ? null : current)), 3000)
                        }}
                        style={styles.iconButton}
                      >
                        {copiedSiteId === site.id ? <Check size={16} color={colors.green} /> : <Copy size={16} color={colors.brand2} />}
                      </Pressable>
                      <Pressable
                        onPress={(event) => {
                          event.stopPropagation()
                          Linking.openURL(getSiteUrl(site.mnsName, site.customDomain))
                        }}
                        style={styles.iconButton}
                      >
                        <ExternalLink size={16} color={colors.brand2} />
                      </Pressable>
                    </>
                  ) : null}
                  <Pressable
                    onPress={(event) => {
                      event.stopPropagation()
                      setSettingsSite(site)
                    }}
                    style={styles.iconButton}
                  >
                    <Settings size={16} color={colors.muted} />
                  </Pressable>
                </View>
              </View>
            </Pressable>
          )
        })
      )}
      <SiteSettingsModal
        site={settingsSite}
        onClose={() => setSettingsSite(null)}
        onDelete={(site) => {
          setSettingsSite(null)
          deleteSite(site)
        }}
      />
    </ScrollView>
  )
}

function SiteSettingsModal({ site, onClose, onDelete }: { site: Site | null; onClose: () => void; onDelete: (site: Site) => void }) {
  const { colors, common } = useTheme()
  const styles = useMemo(() => createStyles(colors), [colors])
  if (!site) return null
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.modalBackdrop} onPress={onClose}>
        <Pressable style={styles.modalCard}>
          <View style={styles.modalHead}>
            <View style={styles.modalTitleWrap}>
              <Text style={styles.modalTitle}>Site settings</Text>
              <Text style={[styles.modalDomain, common.mono]}>{site.customDomain || `${site.mnsName}.${mnsPublicDomain}`}</Text>
            </View>
            <Pressable onPress={onClose} style={styles.iconButton}>
              <X size={16} color={colors.text} />
            </Pressable>
          </View>
          <Pressable onPress={() => Linking.openURL(`${WEB_ORIGIN}/settings?site=${site.id}#custom-domains`)} style={common.primaryButton}>
            <Settings size={16} color="#fffdfa" />
            <Text style={common.primaryText}>Manage on website</Text>
          </Pressable>
          <Pressable onPress={() => onDelete(site)} style={styles.deleteButton}>
            <Trash2 size={16} color={colors.red} />
            <Text style={styles.deleteText}>Delete web-app</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  )
}

const STATUS_ORDER: Record<string, number> = { GENERATING: 0, LIVE: 1, DEPLOYING: 2, UPDATING: 2, GENERATION_FAILED: 3, ERROR: 3, DRAFT: 4 }

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
  empty: {
    alignItems: 'center',
    gap: 12,
    paddingVertical: 48,
  },
  emptyTitle: {
    color: colors.text,
    fontWeight: '900',
    fontSize: 18,
  },
  emptyButton: {
    marginTop: 8,
  },
  siteCard: {
    minHeight: 86,
    gap: 12,
    padding: 14,
    borderRadius: 16,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  siteCardDisabled: {
    opacity: 0.9,
  },
  siteCardPressed: {
    transform: [{ scale: 0.985 }],
    borderColor: alpha(colors.brand2, 0.32),
    backgroundColor: colors.surfaceStrong,
  },
  siteTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginTop: 5,
  },
  siteName: {
    flex: 1,
    minWidth: 0,
    color: colors.text,
    fontWeight: '900',
    fontSize: 14,
    lineHeight: 20,
  },
  siteFooter: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 10,
  },
  actions: {
    flexDirection: 'row',
    gap: 6,
    flexShrink: 0,
  },
  badges: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  badge: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 7,
    paddingVertical: 2,
    fontSize: 11,
    fontWeight: '800',
  },
  claimed: {
    color: colors.amber,
    borderColor: alpha(colors.amber, 0.45),
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 7,
    paddingVertical: 2,
    fontSize: 11,
    fontWeight: '800',
  },
  source: {
    color: colors.muted,
    backgroundColor: colors.surfaceStrong,
    borderRadius: 8,
    paddingHorizontal: 7,
    paddingVertical: 3,
    fontSize: 11,
    fontWeight: '700',
  },
  iconButton: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceStrong,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'center',
    padding: 18,
  },
  modalCard: {
    backgroundColor: colors.panel,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    gap: 12,
  },
  modalHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  modalTitleWrap: {
    flex: 1,
  },
  modalTitle: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '900',
  },
  modalDomain: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 3,
  },
  deleteButton: {
    minHeight: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: alpha(colors.red, 0.32),
    backgroundColor: alpha(colors.red, 0.08),
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  deleteText: {
    color: colors.red,
    fontWeight: '900',
  },
})
}
