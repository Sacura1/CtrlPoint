import React, { useMemo, useState } from 'react'
import { ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import * as DocumentPicker from 'expo-document-picker'
import Svg, { Path } from 'react-native-svg'
import { Upload } from 'lucide-react-native'
import { WEB_ORIGIN, upload as uploadApi } from '../api'
import { alpha, ThemeColors, useTheme } from '../utils/theme'
import { Navigate } from './Shell'

function GitHubMark({ size = 22, color }: { size?: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <Path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
    </Svg>
  )
}

export default function DeployScreen({ navigate }: { navigate: Navigate }) {
  const { colors, common } = useTheme()
  const styles = useMemo(() => createStyles(colors, common), [colors, common])
  const [uploading, setUploading] = useState(false)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)

  const pickUpload = async () => {
    setUploading(true)
    setMessage(null)
    try {
      const picked = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true, multiple: false })
      if (picked.canceled) return
      const asset = picked.assets[0]
      const result = await uploadApi.file({ uri: asset.uri, name: asset.name, mimeType: asset.mimeType })
      if (result.multiFile) {
        setMessage({ ok: false, text: result.message || 'Multi-file project detected. Open the website for repo-based deploys.' })
      } else if (result.html) {
        navigate({ name: 'Editor', upload: { html: result.html, title: result.title } })
      } else {
        setMessage({ ok: true, text: result.message || 'Upload processed.' })
      }
    } catch (err: any) {
      setMessage({ ok: false, text: err.message })
    } finally {
      setUploading(false)
    }
  }

  return (
    <ScrollView style={common.screen} contentContainerStyle={common.content}>
      <View>
        <Text style={common.title}>Deploy Web-App</Text>
        <Text style={common.subtitle}>Upload a single HTML file or zip and finish deployment inside the app.</Text>
      </View>

      <Pressable onPress={pickUpload} disabled={uploading} style={styles.method}>
        <View style={styles.iconTile}>
          <Upload size={22} color={colors.brand2} />
        </View>
        <View style={styles.methodText}>
          <Text style={styles.methodTitle}>Upload Files</Text>
          <Text style={common.subtitle}>Drop an HTML file or zip. Opens in the AI editor so you can tweak before deploying.</Text>
          <Text style={styles.actionText}>{'Upload & Edit ->'}</Text>
        </View>
        {uploading ? <ActivityIndicator color={colors.brand2} /> : null}
      </Pressable>

      <View style={[common.card, styles.method]}>
        <View style={styles.iconTile}>
          <GitHubMark color={colors.brand2} />
        </View>
        <View style={styles.methodText}>
          <Text style={styles.methodTitle}>Deploy a GitHub Repo</Text>
          <Text style={common.subtitle}>Connect a repo, register a new MNS, and auto-redeploy every push from the website.</Text>
          <Text style={styles.actionText}>{'Open website ->'}</Text>
        </View>
        <Pressable onPress={() => Linking.openURL(`${WEB_ORIGIN}/auth`)} style={common.primaryButton}>
          <Text style={common.primaryText}>Open website</Text>
        </Pressable>
      </View>

      {message ? <Text style={message.ok ? common.success : common.error}>{message.text}</Text> : null}
    </ScrollView>
  )
}

function createStyles(colors: ThemeColors, common: ReturnType<typeof import('../utils/commonStyles').createCommonStyles>) {
  return StyleSheet.create({
  method: {
    ...common.card,
    alignItems: 'flex-start',
    gap: 14,
  },
  iconTile: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: alpha(colors.brand2, 0.12),
    borderWidth: 1,
    borderColor: alpha(colors.brand2, 0.25),
  },
  methodText: {
    flex: 1,
    gap: 4,
  },
  methodTitle: {
    color: colors.text,
    fontWeight: '900',
    fontSize: 16,
  },
  actionText: {
    color: colors.brand2,
    fontSize: 12,
    fontWeight: '900',
    marginTop: 6,
  },
})
}
