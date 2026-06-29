import React, { useMemo, useState } from 'react'
import { Image, Modal, Pressable, StyleSheet, Text, View } from 'react-native'
import { Code2, CreditCard, Globe2, KeyRound, Menu, Moon, Rocket, Settings, Sun, WalletCards, X } from 'lucide-react-native'
import { useAuth } from '../auth/AuthContext'
import { alpha, ThemeColors, useTheme } from '../utils/theme'
import { BOTTOM_INSET, BOTTOM_NAV_HEIGHT } from '../utils/layout'
import { font } from '../utils/typography'

export type Route =
  | { name: 'Editor'; siteId?: string; upload?: { html: string; title?: string }; openTab?: 'chat' | 'preview' }
  | { name: 'Dashboard' }
  | { name: 'Deploy' }
  | { name: 'Deployments' }
  | { name: 'Keys' }
  | { name: 'Settings' }
  | { name: 'Credits' }

export type Navigate = (route: Route) => void

const NAV = [
  { name: 'Editor', label: 'Build', Icon: Code2 },
  { name: 'Dashboard', label: 'Apps', Icon: Globe2 },
  { name: 'Deploy', label: 'Deploy', Icon: Rocket },
  { name: 'Deployments', label: 'Activity', Icon: WalletCards },
] as const

const SIDE_ITEMS = [
  { name: 'Keys', label: 'API Keys', Icon: KeyRound },
  { name: 'Settings', label: 'Settings', Icon: Settings },
] as const

export function Header({ route, navigate }: { route: Route; navigate: Navigate }) {
  const { user } = useAuth()
  const { colors, toggleTheme } = useTheme()
  const styles = useMemo(() => createStyles(colors), [colors])
  const [menuOpen, setMenuOpen] = useState(false)
  const logo = colors.mode === 'light' ? require('../../assets/logo-black.png') : require('../../assets/logo.png')

  const go = (next: Route) => {
    setMenuOpen(false)
    navigate(next)
  }

  return (
    <View style={styles.header}>
      <View style={styles.leftCluster}>
        <Pressable onPress={() => setMenuOpen(true)} style={styles.menuButton}>
          <Menu size={20} color={colors.text} />
        </Pressable>
        <Pressable onPress={() => navigate({ name: 'Editor' })} style={styles.brand}>
          <Image source={logo} style={styles.logoImage} resizeMode="contain" />
        </Pressable>
      </View>
      <View style={styles.rightCluster}>
        <Pressable onPress={toggleTheme} style={styles.themeButton}>
          {colors.mode === 'light' ? <Moon size={17} color={colors.text} /> : <Sun size={17} color={colors.text} />}
        </Pressable>
        <Pressable onPress={() => navigate({ name: 'Credits' })} style={styles.credits}>
          <Text style={styles.creditValue}>{user?.credits ?? 0}</Text>
          <Text style={styles.creditLabel}>credits</Text>
          <CreditCard size={14} color={colors.brand2} />
        </Pressable>
      </View>

      <Modal visible={menuOpen} transparent animationType="fade" onRequestClose={() => setMenuOpen(false)}>
        <Pressable style={styles.menuBackdrop} onPress={() => setMenuOpen(false)}>
          <Pressable style={styles.menuPanel}>
            <View style={styles.menuHead}>
              <Text style={styles.menuTitle}>Menu</Text>
              <Pressable onPress={() => setMenuOpen(false)} style={styles.menuClose}>
                <X size={18} color={colors.text} />
              </Pressable>
            </View>
            {SIDE_ITEMS.map(({ name, label, Icon }) => {
              const active = route.name === name
              return (
                <Pressable key={name} onPress={() => go({ name } as Route)} style={[styles.menuRow, active && styles.menuRowActive]}>
                  <Icon size={18} color={active ? colors.text : colors.muted} />
                  <Text style={[styles.menuRowText, active && styles.menuRowTextActive]}>{label}</Text>
                </Pressable>
              )
            })}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  )
}

export function BottomNav({ route, navigate }: { route: Route; navigate: Navigate }) {
  const { colors } = useTheme()
  const styles = useMemo(() => createStyles(colors), [colors])
  return (
    <View style={styles.nav}>
      {NAV.map(({ name, label, Icon }) => {
        const active = route.name === name || (name === 'Editor' && route.name === 'Editor')
        return (
          <Pressable key={name} onPress={() => navigate({ name } as Route)} style={[styles.navItem, active && styles.navActive]}>
            <Icon size={18} color={active ? colors.text : colors.muted} />
            <Text style={[styles.navText, active && styles.navTextActive]} numberOfLines={1}>
              {label}
            </Text>
          </Pressable>
        )
      })}
    </View>
  )
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
  header: {
    height: 58,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    backgroundColor: colors.header,
  },
  leftCluster: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  rightCluster: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  themeButton: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceStrong,
    borderWidth: 1,
    borderColor: colors.border,
  },
  menuButton: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceStrong,
    borderWidth: 1,
    borderColor: colors.border,
  },
  brand: {
    width: 92,
    height: 32,
    justifyContent: 'center',
  },
  logoImage: {
    width: 92,
    height: 32,
  },
  credits: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: alpha(colors.brand2, 0.25),
    backgroundColor: alpha(colors.brand, 0.12),
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  creditValue: {
    color: colors.brand2,
    fontFamily: font.medium,
    fontWeight: '900',
    fontSize: 14,
  },
  creditLabel: {
    color: alpha(colors.brand2, 0.75),
    fontFamily: font.medium,
    fontWeight: '700',
    fontSize: 11,
  },
  menuBackdrop: {
    flex: 1,
    backgroundColor: colors.overlay,
  },
  menuPanel: {
    width: 230,
    marginTop: 18,
    marginLeft: 12,
    padding: 10,
    borderRadius: 16,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 6,
  },
  menuHead: {
    minHeight: 38,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
  },
  menuTitle: {
    color: colors.text,
    fontFamily: font.medium,
    fontSize: 15,
    fontWeight: '900',
  },
  menuClose: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceStrong,
  },
  menuRow: {
    minHeight: 46,
    borderRadius: 12,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  menuRowActive: {
    backgroundColor: colors.surfaceStrong,
  },
  menuRowText: {
    color: colors.muted,
    fontFamily: font.medium,
    fontWeight: '800',
  },
  menuRowTextActive: {
    color: colors.text,
  },
  nav: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    minHeight: BOTTOM_NAV_HEIGHT + BOTTOM_INSET,
    paddingHorizontal: 6,
    paddingTop: 8,
    paddingBottom: 8 + BOTTOM_INSET,
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.nav,
  },
  navItem: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    borderRadius: 12,
    paddingVertical: 7,
  },
  navActive: {
    backgroundColor: colors.surfaceStrong,
  },
  navText: {
    color: colors.muted,
    fontFamily: font.medium,
    fontSize: 10,
    fontWeight: '700',
  },
  navTextActive: {
    color: colors.text,
  },
})
}
