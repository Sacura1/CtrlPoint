import React, { useEffect, useMemo, useRef, useState } from 'react'
import { ActivityIndicator, Alert, Animated, Easing, KeyboardAvoidingView, Linking, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { HelpCircle, Settings, Trash2, X } from 'lucide-react-native'
import { WEB_ORIGIN, billing as billingApi, support as supportApi } from '../api'
import { useAuth } from '../auth/AuthContext'
import { AppInput } from '../components/AppInput'
import { alpha, ThemeColors, useTheme } from '../utils/theme'
import { BOTTOM_INSET } from '../utils/layout'
import { Navigate } from './Shell'

interface Transaction {
  id: string
  amount: number
  type: string
  note: string | null
  createdAt: string
}

export default function SettingsScreen({ navigate }: { navigate: Navigate }) {
  const { colors, common } = useTheme()
  const styles = useMemo(() => createStyles(colors), [colors])
  const { user, logout, deleteAccount } = useAuth()
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [transactionsLoading, setTransactionsLoading] = useState(true)
  const [historyExpanded, setHistoryExpanded] = useState(false)
  const [supportOpen, setSupportOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)

  useEffect(() => {
    setTransactionsLoading(true)
    billingApi.history()
      .then(({ transactions }) => setTransactions(transactions))
      .catch(() => null)
      .finally(() => setTransactionsLoading(false))
  }, [])

  return (
    <ScrollView style={common.screen} contentContainerStyle={common.content}>
      <Text style={common.title}>Settings</Text>

      <View style={[common.card, styles.card]}>
        <Text style={styles.section}>Account</Text>
        <Text style={styles.email}>{user?.email}</Text>
        <Text style={common.subtitle}>Wallet transfers and ownership tools are managed on the website.</Text>
      </View>

      <View style={[common.card, styles.card]}>
        <Text style={styles.section}>Credits</Text>
        <View style={styles.creditRow}>
          <Text style={common.subtitle}>Current balance</Text>
          <Text style={styles.credits}>{user?.credits ?? 0}</Text>
        </View>
        {transactionsLoading ? (
          <CreditHistorySkeleton />
        ) : transactions.length ? (
          <>
            {(historyExpanded ? transactions : transactions.slice(0, 5)).map((tx) => (
              <View key={tx.id} style={styles.tx}>
                <Text style={styles.txNote}>{tx.note || tx.type}</Text>
                <Text style={tx.amount > 0 ? styles.txPositive : styles.txNegative}>{tx.amount > 0 ? '+' : ''}{tx.amount}</Text>
              </View>
            ))}
            {transactions.length > 5 ? (
              <Pressable onPress={() => setHistoryExpanded((value) => !value)} style={({ pressed }) => [styles.showMoreButton, pressed && styles.pressed]}>
                <Text style={styles.showMoreText}>
                  {historyExpanded ? 'Show less' : `Show ${transactions.length - 5} more`}
                </Text>
              </Pressable>
            ) : null}
          </>
        ) : (
          <Text style={common.subtitle}>No credit history yet.</Text>
        )}
      </View>

      <View style={[common.card, styles.card]}>
        <View style={styles.sectionRow}>
          <View style={styles.flex}>
            <Text style={styles.section}>Custom domains</Text>
            <Text style={common.subtitle}>Manage DNS records and verification on the website.</Text>
          </View>
          <Pressable onPress={() => Linking.openURL(`${WEB_ORIGIN}/settings#custom-domains`)} style={styles.smallIconButton}>
            <Settings size={17} color={colors.brand2} />
          </Pressable>
        </View>
      </View>

      <View style={[common.card, styles.card]}>
        <View style={styles.sectionRow}>
          <View style={styles.flex}>
            <Text style={styles.section}>Support</Text>
            <Text style={common.subtitle}>Send an issue, question, or bug report. Include the web-app name or URL if it helps.</Text>
          </View>
          <Pressable onPress={() => setSupportOpen(true)} style={({ pressed }) => [styles.smallIconButton, pressed && styles.pressed]}>
            <HelpCircle size={18} color={colors.brand2} />
          </Pressable>
        </View>
      </View>

      <View style={[common.card, styles.card]}>
        <Text style={styles.section}>Session</Text>
        <Pressable
          onPress={() =>
            Alert.alert('Sign out?', user?.email || '', [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Sign out',
                style: 'destructive',
                onPress: async () => {
                  await logout()
                  navigate({ name: 'Editor' })
                },
              },
            ])
          }
          style={common.secondaryButton}
        >
          <Text style={[common.secondaryText, { color: colors.red }]}>Sign out</Text>
        </Pressable>
      </View>

      <View style={[common.card, styles.card, styles.dangerCard]}>
        <Text style={styles.section}>Delete account</Text>
        <Text style={common.subtitle}>Permanently remove your account, drafts, sites, credits, API keys, and deployment records.</Text>
        <Pressable onPress={() => setDeleteOpen(true)} style={({ pressed }) => [styles.dangerButton, pressed && styles.pressed]}>
          <Trash2 size={16} color={colors.red} />
          <Text style={styles.dangerText}>Delete account</Text>
        </Pressable>
      </View>

      <SupportModal visible={supportOpen} email={user?.email ?? ''} onClose={() => setSupportOpen(false)} />
      <DeleteAccountModal
        visible={deleteOpen}
        email={user?.email ?? ''}
        onClose={() => setDeleteOpen(false)}
        onDelete={async () => {
          await deleteAccount()
          setDeleteOpen(false)
          navigate({ name: 'Editor' })
        }}
      />
    </ScrollView>
  )
}

function CreditHistorySkeleton() {
  const { colors } = useTheme()
  const styles = useMemo(() => createStyles(colors), [colors])
  const shimmer = useRef(new Animated.Value(0)).current

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(shimmer, {
        toValue: 1,
        duration: 1100,
        easing: Easing.inOut(Easing.quad),
        useNativeDriver: true,
      }),
    )
    loop.start()
    return () => loop.stop()
  }, [shimmer])

  const translateX = shimmer.interpolate({ inputRange: [0, 1], outputRange: [-90, 260] })

  return (
    <View style={styles.skeletonWrap}>
      {[0, 1, 2].map((item) => (
        <View key={item} style={styles.skeletonRow}>
          <View style={[styles.skeletonLine, styles.skeletonWide]}>
            <Animated.View style={[styles.skeletonSweep, { transform: [{ translateX }] }]} />
          </View>
          <View style={[styles.skeletonLine, styles.skeletonAmount]}>
            <Animated.View style={[styles.skeletonSweep, { transform: [{ translateX }] }]} />
          </View>
        </View>
      ))}
    </View>
  )
}

function SupportModal({ visible, email, onClose }: { visible: boolean; email: string; onClose: () => void }) {
  const { colors, common } = useTheme()
  const styles = useMemo(() => createStyles(colors), [colors])
  const [formEmail, setFormEmail] = useState(email)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)

  useEffect(() => {
    if (!visible) return
    setFormEmail(email)
    setMessage(null)
  }, [email, visible])

  const canSend = formEmail.trim() && title.trim().length >= 3 && body.trim().length >= 10 && !sending

  const submit = async () => {
    if (!canSend) return
    setSending(true)
    setMessage(null)
    try {
      await supportApi.createTicket({
        email: formEmail.trim(),
        title: title.trim(),
        body: body.trim(),
      })
      setTitle('')
      setBody('')
      setMessage({ ok: true, text: 'Support request sent. We will reply by email if we need more details.' })
    } catch (err) {
      setMessage({ ok: false, text: err instanceof Error ? err.message : 'Could not send support request.' })
    } finally {
      setSending(false)
    }
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.modalBackdrop} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.modalCard}>
          <View style={styles.modalHead}>
            <View style={styles.modalTitleWrap}>
              <Text style={styles.modalTitle}>Support</Text>
              <Text style={styles.modalSub}>Tell us what happened. We will reply by email if we need more details.</Text>
            </View>
            <Pressable onPress={onClose} style={({ pressed }) => [styles.smallIconButton, pressed && styles.pressed]}>
              <X size={18} color={colors.text} />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={styles.modalBody} keyboardShouldPersistTaps="handled">
            <View style={styles.formBlock}>
              <Text style={common.label}>Email</Text>
              <AppInput
                value={formEmail}
                onChangeText={setFormEmail}
                placeholder="you@example.com"
                autoCapitalize="none"
                keyboardType="email-address"
              />
            </View>

            <View style={styles.formBlock}>
              <Text style={common.label}>Title</Text>
              <AppInput value={title} onChangeText={setTitle} placeholder="Short summary" maxLength={140} />
            </View>

            <View style={styles.formBlock}>
              <Text style={common.label}>Message</Text>
              <AppInput
                value={body}
                onChangeText={setBody}
                placeholder="What happened? What did you expect?"
                multiline
                textAlignVertical="top"
                style={styles.messageInput}
              />
            </View>

            {message ? (
              <Text style={[styles.statusText, message.ok ? styles.statusOk : styles.statusBad]}>{message.text}</Text>
            ) : null}

            <Pressable onPress={submit} disabled={!canSend} style={({ pressed }) => [common.primaryButton, styles.sendButton, pressed && canSend && styles.pressed, !canSend && styles.disabled]}>
              {sending ? <ActivityIndicator color="#fff" /> : <Text style={common.primaryText}>Send</Text>}
            </Pressable>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  )
}

function DeleteAccountModal({ visible, email, onClose, onDelete }: { visible: boolean; email: string; onClose: () => void; onDelete: () => Promise<void> }) {
  const { colors, common } = useTheme()
  const styles = useMemo(() => createStyles(colors), [colors])
  const [confirmText, setConfirmText] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!visible) return
    setConfirmText('')
    setError('')
    setDeleting(false)
  }, [visible])

  const canDelete = confirmText.trim().toLowerCase() === 'delete' && !deleting

  const submit = async () => {
    if (!canDelete) return
    setDeleting(true)
    setError('')
    try {
      await onDelete()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete account.')
      setDeleting(false)
    }
  }

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView style={[styles.modalBackdrop, styles.centerBackdrop]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.confirmCard}>
          <View style={styles.confirmIcon}>
            <Trash2 size={24} color={colors.red} />
          </View>
          <Text style={styles.confirmTitle}>Delete account?</Text>
          <Text style={styles.confirmBody}>
            This permanently deletes {email || 'this account'} and its drafts, sites, credits, API keys, and deployment records. This cannot be undone.
          </Text>
          <View style={styles.formBlock}>
            <Text style={common.label}>Type DELETE to confirm</Text>
            <AppInput value={confirmText} onChangeText={setConfirmText} autoCapitalize="characters" placeholder="DELETE" />
          </View>
          {error ? <Text style={common.error}>{error}</Text> : null}
          <View style={styles.confirmActions}>
            <Pressable onPress={onClose} disabled={deleting} style={({ pressed }) => [common.secondaryButton, styles.confirmButton, pressed && !deleting && styles.pressed]}>
              <Text style={common.secondaryText}>Cancel</Text>
            </Pressable>
            <Pressable onPress={submit} disabled={!canDelete} style={({ pressed }) => [styles.deleteConfirmButton, styles.confirmButton, pressed && canDelete && styles.pressed, !canDelete && styles.disabled]}>
              {deleting ? <ActivityIndicator color="#fff" /> : <Text style={styles.deleteConfirmText}>Delete</Text>}
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  )
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
  card: {
    gap: 12,
  },
  section: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '900',
  },
  email: {
    color: colors.muted,
  },
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  smallIconButton: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceStrong,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pressed: {
    opacity: 0.84,
    transform: [{ scale: 0.98 }],
  },
  disabled: {
    opacity: 0.45,
  },
  flex: {
    flex: 1,
  },
  creditRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  credits: {
    color: colors.brand2,
    fontSize: 26,
    fontWeight: '900',
  },
  tx: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 10,
  },
  txNote: {
    color: colors.muted,
    flex: 1,
  },
  txPositive: {
    color: colors.green,
    fontFamily: 'monospace',
    fontWeight: '900',
  },
  txNegative: {
    color: colors.faint,
    fontFamily: 'monospace',
    fontWeight: '900',
  },
  showMoreButton: {
    minHeight: 42,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  showMoreText: {
    color: colors.textSoft,
    fontSize: 13,
    fontWeight: '900',
  },
  skeletonWrap: {
    gap: 10,
  },
  skeletonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 10,
  },
  skeletonLine: {
    height: 15,
    borderRadius: 999,
    backgroundColor: colors.surfaceStrong,
    overflow: 'hidden',
  },
  skeletonWide: {
    flex: 1,
  },
  skeletonAmount: {
    width: 42,
  },
  skeletonSweep: {
    width: 70,
    height: '100%',
    backgroundColor: alpha(colors.text, colors.mode === 'light' ? 0.16 : 0.11),
  },
  dangerCard: {
    borderColor: alpha(colors.red, 0.28),
  },
  dangerButton: {
    minHeight: 44,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: alpha(colors.red, 0.32),
    backgroundColor: alpha(colors.red, 0.08),
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  dangerText: {
    color: colors.red,
    fontWeight: '900',
  },
  modalBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: colors.overlay,
  },
  centerBackdrop: {
    justifyContent: 'center',
    padding: 18,
  },
  modalCard: {
    maxHeight: '88%',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.panel,
    overflow: 'hidden',
  },
  modalHead: {
    minHeight: 76,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  modalTitleWrap: {
    flex: 1,
  },
  modalTitle: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '900',
  },
  modalSub: {
    marginTop: 3,
    color: colors.textSoft,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '700',
  },
  modalBody: {
    padding: 16,
    paddingBottom: 18 + BOTTOM_INSET,
    gap: 14,
  },
  formBlock: {
    gap: 8,
  },
  messageInput: {
    minHeight: 132,
  },
  statusText: {
    borderRadius: 13,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '800',
  },
  statusOk: {
    color: colors.green,
    borderColor: alpha(colors.green, 0.22),
    backgroundColor: alpha(colors.green, 0.08),
  },
  statusBad: {
    color: colors.red,
    borderColor: alpha(colors.red, 0.22),
    backgroundColor: alpha(colors.red, 0.08),
  },
  sendButton: {
    minHeight: 50,
  },
  confirmCard: {
    borderRadius: 22,
    borderWidth: 1,
    borderColor: alpha(colors.red, 0.24),
    backgroundColor: colors.panel,
    padding: 18,
    gap: 14,
  },
  confirmIcon: {
    width: 52,
    height: 52,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: alpha(colors.red, 0.1),
    borderWidth: 1,
    borderColor: alpha(colors.red, 0.18),
  },
  confirmTitle: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '900',
  },
  confirmBody: {
    color: colors.textSoft,
    fontSize: 13,
    lineHeight: 20,
    fontWeight: '700',
  },
  confirmActions: {
    flexDirection: 'row',
    gap: 10,
  },
  confirmButton: {
    flex: 1,
  },
  deleteConfirmButton: {
    minHeight: 42,
    borderRadius: 14,
    backgroundColor: colors.red,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteConfirmText: {
    color: '#fff',
    fontWeight: '900',
  },
})
}
