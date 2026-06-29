import React, { useEffect, useMemo, useState } from 'react'
import { ActivityIndicator, Image, Keyboard, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import Constants from 'expo-constants'
import * as Google from 'expo-auth-session/providers/google'
import * as WebBrowser from 'expo-web-browser'
import Svg, { Path } from 'react-native-svg'
import { Mail, ShieldCheck } from 'lucide-react-native'
import { useAuth } from '../auth/AuthContext'
import { AppInput } from '../components/AppInput'
import { alpha, ThemeColors, useTheme } from '../utils/theme'

WebBrowser.maybeCompleteAuthSession()

const extra = Constants.expoConfig?.extra as Record<string, string | undefined> | undefined

function GoogleMark() {
  return (
    <Svg width={19} height={19} viewBox="0 0 48 48">
      <Path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.1 6.1 29.3 4 24 4 13 4 4 13 4 24s9 20 20 20 20-9 20-20c0-1.3-.1-2.4-.4-3.5Z" />
      <Path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.1 6.1 29.3 4 24 4 16.2 4 9.5 8.5 6.3 14.7Z" />
      <Path fill="#4CAF50" d="M24 44c5.2 0 10-2 13.5-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.4 39.5 16.1 44 24 44Z" />
      <Path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.3 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5Z" />
    </Svg>
  )
}

type AuthMode = 'login' | 'register' | 'reset'

export default function AuthScreen() {
  const { colors, common } = useTheme()
  const styles = useMemo(() => createStyles(colors, common), [colors, common])
  const { google, login, requestEmailCode, resetPassword, verifyRegister } = useAuth()
  const logo = colors.mode === 'light' ? require('../../assets/logo-black.png') : require('../../assets/logo.png')
  const [mode, setMode] = useState<AuthMode>('login')
  const [codeSent, setCodeSent] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [loadingAction, setLoadingAction] = useState<'google' | 'email' | null>(null)
  const [error, setError] = useState('')
  const [hint, setHint] = useState('')
  const [keyboardOpen, setKeyboardOpen] = useState(false)
  const scrollRef = React.useRef<ScrollView>(null)

  const [request, response, promptAsync] = Google.useAuthRequest({
    clientId: Platform.OS === 'web' ? process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID || extra?.googleWebClientId : undefined,
    iosClientId: Platform.OS === 'ios' ? process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID || extra?.googleIosClientId : undefined,
    androidClientId: Platform.OS === 'android' ? process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID || extra?.googleAndroidClientId : undefined,
    webClientId: Platform.OS === 'web' ? process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID || extra?.googleWebClientId : undefined,
  })

  useEffect(() => {
    if (response?.type !== 'success') return
    const accessToken = response.authentication?.accessToken
    if (!accessToken) {
      setError('Google sign-in did not return a usable token.')
      return
    }
    setLoadingAction('google')
    setError('')
    google(accessToken, 'accessToken')
      .catch((err) => setError(err.message))
      .finally(() => setLoadingAction(null))
  }, [google, response])

  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', () => setKeyboardOpen(true))
    const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboardOpen(false))
    return () => {
      show.remove()
      hide.remove()
    }
  }, [])

  const revealInputs = () => {
    setTimeout(() => scrollRef.current?.scrollTo({ y: 210, animated: true }), 120)
  }

  const resetForm = (next: AuthMode) => {
    setMode(next)
    setCodeSent(false)
    setCode('')
    setPassword('')
    setError('')
    setHint('')
  }

  const handleEmail = async () => {
    setLoadingAction('email')
    setError('')
    setHint('')
    try {
      if (mode === 'login') {
        await login(email.trim(), password)
      } else if (!codeSent) {
        const devCode = await requestEmailCode(email.trim(), mode === 'register' ? 'register' : 'reset')
        setCodeSent(true)
        setHint(devCode ? `Dev code: ${devCode}` : 'Check your email for the verification code.')
      } else if (mode === 'register') {
        await verifyRegister(email.trim(), password, code.trim())
      } else {
        await resetPassword(email.trim(), code.trim(), password)
      }
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoadingAction(null)
    }
  }

  const needsPassword = mode !== 'reset' || codeSent
  const loading = loadingAction !== null
  const disabled = loading || !email.trim() || (needsPassword && password.length < 8) || (codeSent && code.trim().length < 4)
  const title = mode === 'login' ? 'Welcome back' : mode === 'register' ? 'Create account' : 'Reset password'
  const action = mode === 'login' ? 'Sign in with email' : codeSent ? (mode === 'register' ? 'Create account' : 'Reset and sign in') : 'Send verification code'

  return (
    <KeyboardAvoidingView style={common.screen} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={[styles.wrap, keyboardOpen && styles.wrapKeyboard]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
      >
        <View style={styles.hero}>
          <Image source={logo} style={styles.logo} resizeMode="contain" />
        </View>

        <View style={styles.card}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.sub}>Use Google or email to access CtrlPoint.</Text>

          <Pressable disabled={!request || loading} onPress={() => promptAsync()} style={({ pressed }) => [styles.googleButton, pressed && !loading && styles.buttonPressed, (!request || loading) && styles.disabled]}>
            {loadingAction === 'google' ? <ActivityIndicator color={colors.text} /> : <GoogleMark />}
            <Text style={styles.googleText}>Continue with Google</Text>
          </Pressable>

          <View style={styles.divider}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>or</Text>
            <View style={styles.dividerLine} />
          </View>

          <View style={styles.emailHead}>
            {codeSent ? <ShieldCheck size={16} color={colors.brand2} /> : <Mail size={16} color={colors.brand2} />}
            <Text style={styles.emailHeadText}>{codeSent ? 'Enter verification code' : 'Email access'}</Text>
          </View>

          <AppInput
            style={styles.authInput}
            placeholder="Email address"
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            value={email}
            editable={!codeSent && !loading}
            onChangeText={setEmail}
            onFocus={() => {
              revealInputs()
            }}
          />

          {codeSent ? (
            <AppInput
              style={styles.authInput}
              placeholder="Verification code"
              keyboardType="number-pad"
              value={code}
              onChangeText={setCode}
              onFocus={() => {
                revealInputs()
              }}
            />
          ) : null}

          {needsPassword ? (
            <AppInput
              style={styles.authInput}
              placeholder={mode === 'reset' ? 'New password' : 'Password'}
              secureTextEntry
              value={password}
              onChangeText={setPassword}
              onFocus={() => {
                revealInputs()
              }}
            />
          ) : null}

          <Pressable disabled={disabled} onPress={handleEmail} style={({ pressed }) => [common.primaryButton, pressed && !disabled && styles.buttonPressed, disabled && styles.disabled]}>
            {loadingAction === 'email' ? <ActivityIndicator color="#fff" /> : <Text style={common.primaryText}>{action}</Text>}
          </Pressable>

          {hint ? <Text style={styles.hint}>{hint}</Text> : null}
          {error ? <Text style={common.error}>{error}</Text> : null}
        </View>

        <View style={styles.modeRow}>
          <Pressable onPress={() => resetForm(mode === 'login' ? 'register' : 'login')} style={({ pressed }) => [styles.modeButton, pressed && styles.modeButtonPressed]}>
            <Text style={styles.modeText}>{mode === 'login' ? 'Create account' : 'Sign in instead'}</Text>
          </Pressable>
          <Pressable onPress={() => resetForm('reset')} style={({ pressed }) => [styles.modeButton, pressed && styles.modeButtonPressed]}>
            <Text style={styles.modeText}>Forgot password?</Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

function createStyles(colors: ThemeColors, common: ReturnType<typeof import('../utils/commonStyles').createCommonStyles>) {
  return StyleSheet.create({
  wrap: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 22,
    paddingVertical: 34,
    gap: 24,
  },
  wrapKeyboard: {
    justifyContent: 'flex-start',
    paddingTop: 18,
    paddingBottom: 180,
  },
  hero: {
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  logo: {
    width: 118,
    height: 78,
  },
  card: {
    ...common.card,
    gap: 11,
    padding: 15,
  },
  title: {
    color: colors.text,
    fontSize: 21,
    fontWeight: '900',
    textAlign: 'center',
  },
  sub: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 4,
  },
  googleButton: {
    minHeight: 52,
    borderRadius: 14,
    backgroundColor: colors.mode === 'light' ? '#ffffff' : colors.surfaceStrong,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 16,
  },
  googleText: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '900',
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 4,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: colors.border,
  },
  dividerText: {
    color: colors.faint,
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  emailHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  emailHeadText: {
    color: colors.textSoft,
    fontSize: 12,
    fontWeight: '900',
  },
  authInput: {
    borderWidth: 1,
  },
  buttonPressed: {
    opacity: 0.82,
    transform: [{ scale: 0.985 }],
  },
  guestButton: {
    minHeight: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  guestText: {
    color: colors.muted,
    fontSize: 14,
    fontWeight: '900',
  },
  hint: {
    color: colors.green,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '800',
  },
  modeRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 10,
    flexWrap: 'wrap',
  },
  modeButton: {
    minHeight: 40,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 13,
  },
  modeButtonPressed: {
    backgroundColor: colors.surfaceStrong,
  },
  modeText: {
    color: colors.textSoft,
    fontSize: 13,
    fontWeight: '900',
  },
  disabled: {
    opacity: 0.45,
  },
})
}
