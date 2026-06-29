import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native'
import { RefreshCw } from 'lucide-react-native'
import { sites as sitesApi } from '../api'
import { Site, SiteDeployment } from '../types'
import { ThemeColors, useTheme } from '../utils/theme'
import { mnsPublicDomain } from '../utils/siteUrl'
import { CardSkeleton } from '../components/Skeleton'

function timeAgo(date: string) {
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000)
  if (seconds < 60) return `${seconds}s ago`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  return `${Math.floor(seconds / 86400)}d ago`
}

function isActive(status: string) {
  return ['QUEUED', 'BUILDING', 'UPLOADING', 'MNS_REGISTERING'].includes(status)
}

export default function DeploymentsScreen() {
  const { colors, common } = useTheme()
  const styles = useMemo(() => createStyles(colors), [colors])
  const [sites, setSites] = useState<Site[]>([])
  const [deployMap, setDeployMap] = useState<Record<string, SiteDeployment[]>>({})
  const [expandedSites, setExpandedSites] = useState<Record<string, boolean>>({})
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const load = useCallback(async () => {
    const { sites } = await sitesApi.list()
    setSites(sites)
    const result = await Promise.all(
      sites.map((site) => sitesApi.deployments(site.id).then(({ deployments }) => ({ siteId: site.id, deployments })).catch(() => ({ siteId: site.id, deployments: [] }))),
    )
    const next: Record<string, SiteDeployment[]> = {}
    result.forEach((item) => {
      next[item.siteId] = item.deployments
    })
    setDeployMap(next)
  }, [])

  useEffect(() => {
    load().finally(() => setLoading(false))
  }, [load])

  useEffect(() => {
    const hasActive = Object.values(deployMap).flat().some((deployment) => isActive(deployment.status))
    const interval = setInterval(() => {
      load().catch(() => null)
    }, hasActive ? 3000 : 10000)
    return () => clearInterval(interval)
  }, [deployMap, load])

  const refresh = async () => {
    setRefreshing(true)
    await load().catch(() => null)
    setRefreshing(false)
  }

  return (
    <ScrollView style={common.screen} contentContainerStyle={common.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.brand2} />}>
      <View style={styles.head}>
        <View style={styles.flex}>
          <Text style={common.title}>Deployments</Text>
          <Text style={common.subtitle}>Live activity across all your web-apps.</Text>
        </View>
        <Pressable onPress={refresh} style={styles.refresh}>
          <RefreshCw size={16} color={colors.muted} />
        </Pressable>
      </View>

      {loading ? (
        <>
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton rows={2} />
        </>
      ) : sites.length === 0 ? (
        <View style={[common.card, styles.empty]}>
          <Text style={styles.title}>No web-apps yet</Text>
          <Text style={common.subtitle}>Deploy your first web-app to see activity here.</Text>
        </View>
      ) : (
        sites.map((site) => {
          const deployments = deployMap[site.id] || []
          const hasActive = deployments.some((d) => isActive(d.status))
          const expanded = Boolean(expandedSites[site.id])
          const visibleDeployments = expanded ? deployments : deployments.filter((deployment) => deployment.status !== 'SUPERSEDED')
          const hiddenCount = deployments.length - visibleDeployments.length
          return (
            <View key={site.id} style={common.card}>
              <View style={styles.siteHead}>
                <View style={[styles.dot, { backgroundColor: hasActive ? colors.amber : site.status === 'LIVE' ? colors.green : colors.faint }]} />
                <Text style={[styles.siteName, common.mono]}>
                  {site.mnsName}.{mnsPublicDomain}
                </Text>
                <Text style={styles.count}>{deployments.length}</Text>
              </View>
              {deployments.length === 0 ? (
                <Text style={common.subtitle}>No deployments</Text>
              ) : (
                <>
                  {visibleDeployments.map((deployment) => <DeploymentRow key={deployment.id} deployment={deployment} />)}
                  {hiddenCount > 0 ? (
                    <Pressable
                      onPress={() => setExpandedSites((current) => ({ ...current, [site.id]: !expanded }))}
                      style={({ pressed }) => [styles.viewAllButton, pressed && styles.viewAllPressed]}
                    >
                      <Text style={styles.viewAllText}>{expanded ? 'Hide older deployments' : `View all deployments`}</Text>
                      {!expanded ? <Text style={styles.viewAllMeta}>{hiddenCount} older hidden</Text> : null}
                    </Pressable>
                  ) : null}
                </>
              )}
            </View>
          )
        })
      )}
    </ScrollView>
  )
}

function DeploymentRow({ deployment }: { deployment: SiteDeployment }) {
  const { colors } = useTheme()
  const styles = useMemo(() => createStyles(colors), [colors])
  const active = isActive(deployment.status)
  const live = deployment.status === 'COMPLETE'
  const failed = deployment.status === 'FAILED'
  return (
    <View style={styles.deployRow}>
      <View style={[styles.smallDot, { backgroundColor: live ? colors.green : failed ? colors.red : active ? colors.amber : colors.faint }]} />
      <View style={styles.flex}>
        <Text style={styles.deployTitle}>
          {live ? 'Live' : failed ? deployment.errorMsg || 'Failed' : active ? deployment.step || 'In progress' : deployment.step || deployment.status}
        </Text>
        <Text style={styles.deployMeta}>
          {deployment.source}
          {deployment.commitSha ? ` ${deployment.commitSha.slice(0, 7)}` : ''} · {timeAgo(deployment.createdAt)}
        </Text>
      </View>
    </View>
  )
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
  head: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
  },
  flex: {
    flex: 1,
  },
  refresh: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceStrong,
  },
  empty: {
    alignItems: 'center',
    gap: 8,
    paddingVertical: 48,
  },
  title: {
    color: colors.text,
    fontWeight: '900',
  },
  siteHead: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginBottom: 12,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginTop: 5,
  },
  siteName: {
    flex: 1,
    color: colors.text,
    fontWeight: '800',
    fontSize: 12,
    lineHeight: 17,
    flexWrap: 'wrap',
  },
  count: {
    color: colors.faint,
    fontSize: 12,
    lineHeight: 17,
  },
  deployRow: {
    flexDirection: 'row',
    gap: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    marginTop: 8,
  },
  smallDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    marginTop: 6,
  },
  deployTitle: {
    color: colors.text,
    fontWeight: '700',
    fontSize: 13,
  },
  deployMeta: {
    color: colors.muted,
    fontSize: 12,
    marginTop: 2,
  },
  viewAllButton: {
    minHeight: 42,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceStrong,
    marginTop: 10,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  viewAllPressed: {
    opacity: 0.82,
    transform: [{ scale: 0.985 }],
  },
  viewAllText: {
    color: colors.textSoft,
    fontSize: 13,
    fontWeight: '900',
  },
  viewAllMeta: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: '800',
  },
})
}
