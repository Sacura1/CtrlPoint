import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { BackHandler, Image, Keyboard, Linking, Pressable, SafeAreaView, StatusBar, StyleSheet, Text, TextInput, View } from 'react-native'
import * as Notifications from 'expo-notifications'
import { AuthProvider, useAuth } from './src/auth/AuthContext'
import AuthScreen from './src/screens/AuthScreen'
import { BottomNav, Header, Route } from './src/screens/Shell'
import DashboardScreen from './src/screens/DashboardScreen'
import EditorScreen from './src/screens/EditorScreen'
import DeployScreen from './src/screens/DeployScreen'
import DeploymentsScreen from './src/screens/DeploymentsScreen'
import KeysScreen from './src/screens/KeysScreen'
import SettingsScreen from './src/screens/SettingsScreen'
import CreditsScreen from './src/screens/CreditsScreen'
import { ThemeColors, ThemeProvider, useTheme } from './src/utils/theme'
import { TOP_INSET } from './src/utils/layout'
import { font } from './src/utils/typography'

const startupLogo = require('./assets/logo-splash.png')

const textDefaults = Text as unknown as { defaultProps?: Record<string, unknown> }
textDefaults.defaultProps = {
  ...(textDefaults.defaultProps || {}),
  style: [{ fontFamily: font.regular }, (textDefaults.defaultProps || {}).style],
}

const inputDefaults = TextInput as unknown as { defaultProps?: Record<string, unknown> }
inputDefaults.defaultProps = {
  ...(inputDefaults.defaultProps || {}),
  style: [{ fontFamily: font.regular }, (inputDefaults.defaultProps || {}).style],
}

const pressableDefaults = Pressable as unknown as { defaultProps?: Record<string, unknown> }
pressableDefaults.defaultProps = {
  ...(pressableDefaults.defaultProps || {}),
  android_ripple: { color: 'rgba(244,240,232,0.12)' },
}

function AppInner() {
  const { user, loading } = useAuth()
  const { colors } = useTheme()
  const styles = useMemo(() => createStyles(colors), [colors])
  const [route, setRoute] = useState<Route>({ name: 'Editor' })
  const [routeStack, setRouteStack] = useState<Route[]>([{ name: 'Editor' }])
  const [keyboardVisible, setKeyboardVisible] = useState(false)

  const navigate = useCallback((next: Route) => {
    setRoute((current) => {
      if (JSON.stringify(current) === JSON.stringify(next)) return current
      setRouteStack((prev) => [...prev, next].slice(-24))
      return next
    })
  }, [])

  const replaceRoute = useCallback((next: Route) => {
    setRoute(next)
    setRouteStack((prev) => [...prev.slice(0, -1), next])
  }, [])

  useEffect(() => {
    const handleUrl = ({ url }: { url: string }) => {
      if (url.includes('github-installed')) navigate({ name: 'Deploy' })
    }
    const sub = Linking.addEventListener('url', handleUrl)
    Linking.getInitialURL().then((url) => {
      if (url?.includes('github-installed')) navigate({ name: 'Deploy' })
    })
    return () => sub.remove()
  }, [navigate])

  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data as { type?: string; siteId?: string }
      if (data.type === 'site_generated' && data.siteId) navigate({ name: 'Editor', siteId: data.siteId, openTab: 'preview' })
      else if ((data.type === 'site_deployed' || data.type === 'site_updated') && data.siteId) navigate({ name: 'Editor', siteId: data.siteId, openTab: 'preview' })
      else if (data.type === 'build_reminder') navigate({ name: 'Editor' })
    })
    return () => sub.remove()
  }, [navigate])

  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', () => setKeyboardVisible(true))
    const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboardVisible(false))
    return () => {
      show.remove()
      hide.remove()
    }
  }, [])

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (!user || loading) return false
      if (routeStack.length <= 1) {
        if (route.name !== 'Editor') {
          const home: Route = { name: 'Editor' }
          setRoute(home)
          setRouteStack([home])
          return true
        }
        return false
      }
      const nextStack = routeStack.slice(0, -1)
      setRouteStack(nextStack)
      setRoute(nextStack[nextStack.length - 1])
      return true
    })
    return () => sub.remove()
  }, [loading, route.name, routeStack, user])

  if (loading) {
    return (
      <SafeAreaView style={[styles.safe, styles.startupSafe]}>
        <StatusBar barStyle="light-content" backgroundColor="#030404" translucent={false} />
        <StartupSkeleton />
      </SafeAreaView>
    )
  }

  if (!user) {
    return (
      <SafeAreaView style={styles.safe}>
        <StatusBar barStyle={colors.mode === 'light' ? 'dark-content' : 'light-content'} backgroundColor={colors.bg} translucent={false} />
        <AuthScreen />
      </SafeAreaView>
    )
  }

  let screen: React.ReactNode
  if (route.name === 'Dashboard') screen = <DashboardScreen navigate={navigate} />
  else if (route.name === 'Deploy') screen = <DeployScreen navigate={navigate} />
  else if (route.name === 'Deployments') screen = <DeploymentsScreen />
  else if (route.name === 'Keys') screen = <KeysScreen />
  else if (route.name === 'Settings') screen = <SettingsScreen navigate={navigate} />
  else if (route.name === 'Credits') screen = <CreditsScreen />
  else screen = <EditorScreen route={route} navigate={replaceRoute} />

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle={colors.mode === 'light' ? 'dark-content' : 'light-content'} backgroundColor={colors.bg} translucent={false} />
      <Header route={route} navigate={navigate} />
      <View style={styles.body}>{screen}</View>
      {keyboardVisible ? null : <BottomNav route={route} navigate={navigate} />}
    </SafeAreaView>
  )
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <AppInner />
      </AuthProvider>
    </ThemeProvider>
  )
}

function StartupSkeleton() {
  const { colors } = useTheme()
  const styles = useMemo(() => createStyles(colors), [colors])
  return (
    <View style={styles.startup}>
      <Image source={startupLogo} style={styles.startupLogo} resizeMode="contain" />
    </View>
  )
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.bg,
    paddingTop: TOP_INSET,
  },
  startupSafe: {
    backgroundColor: '#030404',
  },
  startup: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
    backgroundColor: '#030404',
  },
  startupLogo: {
    width: 162,
    height: 118,
  },
  body: {
    flex: 1,
  },
})
}
