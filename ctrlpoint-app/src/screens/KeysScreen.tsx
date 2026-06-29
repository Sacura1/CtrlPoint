import React, { useEffect, useMemo, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { keys as keysApi } from '../api'
import { AppInput } from '../components/AppInput'
import { alpha, ThemeColors, useTheme } from '../utils/theme'
import { CardSkeleton } from '../components/Skeleton'

const PROVIDERS = [
  { id: 'openai', label: 'OpenAI', placeholder: 'sk-...', description: 'Used for GPT models' },
  { id: 'anthropic', label: 'Anthropic', placeholder: 'sk-ant-...', description: 'Used for Claude models' },
]

export default function KeysScreen() {
  const { colors, common } = useTheme()
  const styles = useMemo(() => createStyles(colors), [colors])
  const [savedKeys, setSavedKeys] = useState<Record<string, boolean>>({})
  const [inputs, setInputs] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)

  useEffect(() => {
    keysApi
      .list()
      .then(({ keys }) => setSavedKeys(keys))
      .catch((err) => setMessage({ ok: false, text: err.message }))
      .finally(() => setLoading(false))
  }, [])

  const save = async (provider: string) => {
    const apiKey = inputs[provider]?.trim()
    if (!apiKey) return
    setBusy(provider)
    setMessage(null)
    try {
      await keysApi.save(provider, apiKey)
      setSavedKeys((prev) => ({ ...prev, [provider]: true }))
      setInputs((prev) => ({ ...prev, [provider]: '' }))
      setMessage({ ok: true, text: 'Key saved.' })
    } catch (err: any) {
      setMessage({ ok: false, text: err.message })
    } finally {
      setBusy(null)
    }
  }

  const remove = async (provider: string) => {
    setBusy(provider)
    setMessage(null)
    try {
      await keysApi.remove(provider)
      setSavedKeys((prev) => ({ ...prev, [provider]: false }))
      setMessage({ ok: true, text: 'Key removed.' })
    } catch (err: any) {
      setMessage({ ok: false, text: err.message })
    } finally {
      setBusy(null)
    }
  }

  return (
    <ScrollView style={common.screen} contentContainerStyle={common.content}>
      <View>
        <Text style={common.title}>API Keys</Text>
        <Text style={common.subtitle}>Add your own provider keys to use them instead of platform credits.</Text>
      </View>
      {loading ? (
        <>
          <CardSkeleton />
          <CardSkeleton />
        </>
      ) : (
        PROVIDERS.map((provider) => {
          const saved = savedKeys[provider.id]
          return (
            <View key={provider.id} style={[common.card, styles.card]}>
              <View style={styles.head}>
                <View style={styles.flex}>
                  <Text style={styles.provider}>{provider.label}</Text>
                  <Text style={common.subtitle}>{provider.description}</Text>
                </View>
                {saved ? <Text style={styles.inUse}>In use</Text> : null}
              </View>
              {saved ? (
                <>
                  <Text style={styles.mask}>••••••••••••••••••••••••••••</Text>
                  <Pressable onPress={() => remove(provider.id)} disabled={busy === provider.id} style={common.secondaryButton}>
                    <Text style={[common.secondaryText, { color: colors.red }]}>{busy === provider.id ? 'Removing...' : 'Remove'}</Text>
                  </Pressable>
                </>
              ) : (
                <View style={styles.row}>
                  <AppInput
                    style={styles.flex}
                    placeholder={provider.placeholder}
                    secureTextEntry
                    autoCapitalize="none"
                    value={inputs[provider.id] || ''}
                    onChangeText={(text) => setInputs((prev) => ({ ...prev, [provider.id]: text }))}
                  />
                  <Pressable onPress={() => save(provider.id)} disabled={busy === provider.id || !inputs[provider.id]?.trim()} style={common.primaryButton}>
                    <Text style={common.primaryText}>{busy === provider.id ? 'Saving' : 'Save'}</Text>
                  </Pressable>
                </View>
              )}
            </View>
          )
        })
      )}
      {message ? <Text style={message.ok ? common.success : common.error}>{message.text}</Text> : null}
    </ScrollView>
  )
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
  card: {
    gap: 12,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  flex: {
    flex: 1,
  },
  provider: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '900',
  },
  inUse: {
    color: colors.green,
    borderColor: alpha(colors.green, 0.3),
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    fontSize: 11,
    fontWeight: '900',
  },
  mask: {
    color: colors.faint,
    fontFamily: 'monospace',
    padding: 12,
    borderRadius: 12,
    backgroundColor: colors.surface,
  },
  row: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
})
}
