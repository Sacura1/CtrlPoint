import React, { useEffect, useMemo, useRef, useState } from 'react'
import { ActivityIndicator, Animated, BackHandler, Easing, Image, KeyboardAvoidingView, Linking, Modal, Platform, Pressable, ScrollView, Share, StyleSheet, Text, ToastAndroid, useWindowDimensions, View } from 'react-native'
import { WebView } from 'react-native-webview'
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker'
import * as ImagePicker from 'expo-image-picker'
import * as FileSystem from 'expo-file-system'
import * as ImageManipulator from 'expo-image-manipulator'
import * as Clipboard from 'expo-clipboard'
import {
  Bird,
  Brain,
  Briefcase,
  Cake,
  Check,
  Copy,
  ExternalLink,
  Footprints,
  Gamepad2,
  Gift,
  Heart,
  Joystick,
  Link,
  Megaphone,
  MessageCircle,
  PartyPopper,
  Puzzle,
  Rabbit,
  Shield,
  Sword,
  Trophy,
  CreditCard,
  Plus,
  RotateCcw,
  Send,
  Sparkles,
  X,
} from 'lucide-react-native'
import { appConfig, auth as authApi, deploy as deployApi, generate as genApi, sites as sitesApi, templates as templateApi } from '../api'
import { useAuth } from '../auth/AuthContext'
import { AppInput } from '../components/AppInput'
import { DeployStatus, ModelOption, ReasoningEffortOption, Site } from '../types'
import { alpha, ThemeColors, useTheme } from '../utils/theme'
import { BOTTOM_INSET, BOTTOM_NAV_SPACE, TOP_INSET } from '../utils/layout'
import { getSiteUrl, mnsPublicDomain } from '../utils/siteUrl'
import { maybeRequestReview } from '../utils/reviewPrompt'
import { Navigate, Route } from './Shell'
import {
  BuildTemplate,
  TemplateCategory,
  TemplateAssets,
  TemplateIcon,
  TemplateImage,
  TemplateValues,
  buildTemplateAssets,
  buildTemplatePrompt,
  templatesForCategory,
} from '../templates/templateRegistry'

interface Message {
  role: 'user' | 'assistant'
  content: string
}

const DEFAULT_MODELS: ModelOption[] = [
  {
    id: 'gpt-5.4-mini',
    label: 'GPT-5.4 mini',
    full: 'GPT-5.4 mini',
    sub: 'Cheapest GPT option',
    provider: 'OpenAI',
    cost: 1,
    supportsReasoning: true,
    reasoningEfforts: ['low', 'medium', 'high', 'xhigh'],
  },
]

const DEFAULT_REASONING_EFFORTS: Record<'openai' | 'anthropic', ReasoningEffortOption[]> = {
  openai: [
    { id: 'low', label: 'Low', sub: 'Faster, lower-cost reasoning' },
    { id: 'medium', label: 'Medium', sub: 'Balanced reasoning' },
    { id: 'high', label: 'High', sub: 'Deeper reasoning' },
    { id: 'xhigh', label: 'XHigh', sub: 'Hardest OpenAI tasks' },
  ],
  anthropic: [
    { id: 'low', label: 'Low', sub: 'Most efficient' },
    { id: 'medium', label: 'Medium', sub: 'Balanced token savings' },
    { id: 'high', label: 'High', sub: 'Claude default depth' },
    { id: 'xhigh', label: 'XHigh', sub: 'Long agentic work' },
    { id: 'max', label: 'Max', sub: 'Absolute maximum capability' },
  ],
}

function draftNameFromTitle(title: string) {
  const stopWords = new Set(['a', 'an', 'and', 'app', 'for', 'from', 'my', 'of', 'page', 'site', 'the', 'to', 'web', 'website', 'with'])
  const words =
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim()
      .split(/\s+/)
      .filter((word) => word.length > 1 && !stopWords.has(word))
      .slice(0, 5)
  const base = (words.length ? words.join('-') : 'my-site').slice(0, 42).replace(/-+$/g, '')
  return `${base}-${Math.floor(10 + Math.random() * 90)}`.slice(0, 100).replace(/-+$/g, '')
}

function lastUserMessage(messages: Message[]) {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i].role === 'user') return messages[i].content
  }
  return ''
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

const previewInjectedJavaScript = `
  (function () {
    var style = document.createElement('style');
    style.textContent = [
      'html,body{overscroll-behavior:none;-webkit-tap-highlight-color:transparent;}',
      'button,[role="button"],a,input,select,textarea{touch-action:manipulation;}',
      'canvas,.game,#game,[data-game]{touch-action:none;}'
    ].join('');
    (document.head || document.documentElement).appendChild(style);
    document.addEventListener('touchstart', function () {}, { passive: true });
    true;
  })();
`

function transientSiteError(err: unknown) {
  const message = err instanceof Error ? err.message : String(err || '')
  return /internal server error|database|can't reach|network request failed|request failed|timeout|connection/i.test(message)
}

function siteReady(site: Site) {
  return site.status !== 'GENERATING' && !!site.generatedCode
}

function mimeFromUri(uri: string) {
  const lower = uri.toLowerCase()
  if (lower.endsWith('.png')) return 'image/png'
  if (lower.endsWith('.webp')) return 'image/webp'
  return 'image/jpeg'
}

function formatTemplateDate(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function parseTemplateDate(value: string | undefined) {
  if (!value) return new Date()
  const parsed = new Date(`${value}T12:00:00`)
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed
}

export default function EditorScreen({ route, navigate }: { route: Route; navigate: Navigate }) {
  const { colors, common } = useTheme()
  const styles = useMemo(() => createStyles(colors), [colors])
  const { user, setUser } = useAuth()
  const [site, setSite] = useState<Site | null>(null)
  const [html, setHtml] = useState('')
  const [title, setTitle] = useState('New site')
  const [description, setDescription] = useState('')
  const [messages, setMessages] = useState<Message[]>([
    { role: 'assistant', content: "What do you want to build? Describe your site and I'll generate it instantly." },
  ])
  const [input, setInput] = useState('')
  const [generating, setGenerating] = useState(false)
  const [showDeploy, setShowDeploy] = useState(false)
  const [error, setError] = useState('')
  const [hasChanges, setHasChanges] = useState(false)
  const [tab, setTab] = useState<'chat' | 'preview'>('chat')
  const [modelSelectionEnabled, setModelSelectionEnabled] = useState(false)
  const [activeDefaultModel, setActiveDefaultModel] = useState(DEFAULT_MODELS[0].id)
  const [models, setModels] = useState<ModelOption[]>(DEFAULT_MODELS)
  const [reasoningEfforts, setReasoningEfforts] = useState(DEFAULT_REASONING_EFFORTS)
  const [selectedModel, setSelectedModel] = useState(DEFAULT_MODELS[0].id)
  const [selectedReasoningEffort, setSelectedReasoningEffort] = useState('medium')
  const [modelPickerOpen, setModelPickerOpen] = useState(false)
  const [effortPickerOpen, setEffortPickerOpen] = useState(false)
  const [creditError, setCreditError] = useState('')
  const [selectedTemplate, setSelectedTemplate] = useState<BuildTemplate | null>(null)
  const [remoteTemplates, setRemoteTemplates] = useState<BuildTemplate[]>([])
  const [remoteTemplatesLoading, setRemoteTemplatesLoading] = useState(true)
  const [loadingSite, setLoadingSite] = useState(false)
  const scrollRef = useRef<ScrollView>(null)
  const siteId = route.name === 'Editor' ? route.siteId : undefined

  useEffect(() => {
    appConfig
      .get()
      .then(({ enableModelSelection, activeModel, models, reasoningEfforts }) => {
        setModelSelectionEnabled(enableModelSelection)
        setActiveDefaultModel(activeModel)
        if (models.length) {
          setModels(models)
          setSelectedModel(models[0].id)
        }
        if (reasoningEfforts.openai.length && reasoningEfforts.anthropic.length) setReasoningEfforts(reasoningEfforts)
      })
      .catch(() => setModelSelectionEnabled(false))
  }, [])

  useEffect(() => {
    setRemoteTemplatesLoading(true)
    templateApi
      .mobile()
      .then(({ templates }) => setRemoteTemplates(templates))
      .catch(() => setRemoteTemplates([]))
      .finally(() => setRemoteTemplatesLoading(false))
  }, [])

  useEffect(() => {
    if (route.name !== 'Editor') return
    if (route.upload) {
      setSite(null)
      setHtml(route.upload.html)
      setTitle(route.upload.title || 'Uploaded Site')
      setDescription('')
      setHasChanges(true)
      setMessages([{ role: 'assistant', content: "I've loaded your uploaded site. You can deploy it as-is or ask me to make changes." }])
      setTab('preview')
      return
    }
    if (!siteId) return
    setLoadingSite(true)
    sitesApi
      .get(siteId)
      .then(({ site }) => {
        setSite(site)
        setHtml(site.generatedCode ?? '')
        setTitle(site.title)
        setDescription(site.description)
        setHasChanges(site.needsDeploy)
        setMessages([{ role: 'assistant', content: 'What would you like to change?' }])
        setTab(route.openTab || 'preview')
      })
      .catch(() => navigate({ name: 'Dashboard' }))
      .finally(() => setLoadingSite(false))
  }, [navigate, route, siteId])

  useEffect(() => {
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50)
  }, [messages, generating])

  const selectedModelOption = models.find((m) => m.id === selectedModel) ?? models[0]
  const reasoningProvider = selectedModelOption.provider === 'Anthropic' ? 'anthropic' : 'openai'
  const availableReasoningEfforts = reasoningEfforts[reasoningProvider].filter((effort) => selectedModelOption.reasoningEfforts.includes(effort.id))
  const activeReasoningEffort = availableReasoningEfforts.some((effort) => effort.id === selectedReasoningEffort)
    ? selectedReasoningEffort
    : availableReasoningEfforts[0]?.id ?? 'medium'
  const isBusy = site?.status === 'DEPLOYING' || site?.status === 'UPDATING'
  const isLive = site?.status === 'LIVE'
  const hasActionBar = !!html || !!site?.previousCode
  const hasConversation = messages.length > 1 || !!error
  const showBuildHome = !loadingSite && !site && !html && !generating && !hasConversation
  const showEditorToolbar = !!html || !!site?.previousCode
  const liveUrl = site && isLive ? getSiteUrl(site.mnsName, site.customDomain) : ''

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (!site && !html && hasConversation && !generating) {
        reset()
        return true
      }
      return false
    })
    return () => sub.remove()
  }, [generating, hasConversation, html, site])

  const pollGeneratedSite = async (siteId: string) => {
    let completedSite: Site | null = null
    let transientFailures = 0
    for (let attempt = 0; attempt < 120; attempt += 1) {
      await wait(3000)
      try {
        const result = await sitesApi.get(siteId)
        completedSite = result.site
        transientFailures = 0
        setSite(completedSite)
        setTitle(completedSite.title)
        setDescription(completedSite.description)
        if (completedSite.status === 'GENERATION_FAILED') {
          throw new Error(completedSite.description || 'Generation failed.')
        }
        if (siteReady(completedSite)) return completedSite
      } catch (err) {
        if (!transientSiteError(err) || transientFailures >= 12) throw err
        transientFailures += 1
      }
    }
    throw new Error('Generation is still running. Open Apps to check the draft status.')
  }

  const refreshUser = async () => {
    try {
      const result = await authApi.me()
      setUser(result.user)
    } catch {}
  }

  const startGeneration = async (rawPrompt: string, introMessage?: string, assets?: TemplateAssets) => {
    const msg = rawPrompt.trim()
    if (!msg || generating) return
    setInput('')
    setError('')
    setCreditError('')
    const nextMessages: Message[] = [...messages, { role: 'user', content: introMessage || msg }]
    setMessages(nextMessages)
    setGenerating(true)
    setTab('preview')
    try {
      const model = modelSelectionEnabled ? selectedModel : undefined

      if (!site && !html) {
        const generationHistory = introMessage ? [...messages, { role: 'user' as const, content: msg }] : nextMessages
        const { site: draftSite } = await genApi.draft(generationHistory, model, undefined, assets)
        setSite(draftSite)
        setTitle(draftSite.title)
        setDescription(draftSite.description || '')

        const completedSite = await pollGeneratedSite(draftSite.id)
        setHtml(completedSite.generatedCode || '')
        setHasChanges(completedSite.needsDeploy)
        refreshUser()
        maybeRequestReview('generated')
        setMessages((prev) => [...prev, { role: 'assistant', content: 'Done. You can keep refining or deploy when ready.' }])
        setTab('preview')
        return
      }

      if (site) {
        const { site: queuedSite } = await genApi.updateBackground(site.id, nextMessages, model)
        setSite(queuedSite)
        setTitle(queuedSite.title)
        setDescription(queuedSite.description || '')
        const completedSite = await pollGeneratedSite(queuedSite.id)
        setHtml(completedSite.generatedCode || '')
        setHasChanges(completedSite.needsDeploy)
        refreshUser()
        maybeRequestReview('generated')
        setMessages((prev) => [...prev, { role: 'assistant', content: 'Done. You can keep refining or deploy when ready.' }])
        setTab('preview')
        return
      }

      const response = await genApi.chat(nextMessages, model, html || undefined)

      if (response.type === 'site') {
        setHtml(response.html!)
        setTitle(response.title!)
        setDescription(response.description!)
        setHasChanges(true)
        if (!site) {
          try {
            const { site: draftSite } = await sitesApi.create({
              mnsName: draftNameFromTitle(response.title!),
              generatedCode: response.html!,
              title: response.title!,
              description: response.description!,
              lastPrompt: msg,
            })
            setSite(draftSite)
          } catch (err: any) {
            setError(`Site generated, but draft autosave failed: ${err.message}`)
          }
        }
        setMessages((prev) => [...prev, { role: 'assistant', content: 'Done. You can keep refining or deploy when ready.' }])
        maybeRequestReview('generated')
        setTab('preview')
      } else {
        setMessages((prev) => [...prev, { role: 'assistant', content: response.text || '' }])
      }
      if (typeof response.credits === 'number' && user) setUser({ ...user, credits: response.credits })
    } catch (err: any) {
      const message = err.message || 'Something went wrong.'
      const isCreditError = /insufficient credits|not enough credits|run out of credits|costs? [\d,]+ credits?|you need [\d,]+ credits?/i.test(message)
      setError(message)
      if (isCreditError) {
        setCreditError(message)
        setTab('chat')
        setMessages((prev) => [...prev, { role: 'assistant', content: 'You need more credits to run this request.' }])
      } else {
        setMessages((prev) => [...prev, { role: 'assistant', content: 'Something went wrong. Try again.' }])
      }
    } finally {
      setGenerating(false)
    }
  }

  const send = async () => {
    startGeneration(input)
  }

  const reset = () => {
    navigate({ name: 'Editor' })
    setSite(null)
    setHtml('')
    setTitle('New site')
    setDescription('')
    setHasChanges(false)
    setError('')
    setInput('')
    setTab('chat')
    setMessages([{ role: 'assistant', content: "What do you want to build? Describe your site and I'll generate it instantly." }])
  }

  const revert = async () => {
    if (!site?.previousCode) return
    try {
      const result = await genApi.revert(site.id)
      if (result.html) setHtml(result.html)
      setHasChanges(false)
      setMessages((prev) => [...prev, { role: 'assistant', content: 'Reverted to previous version.' }])
    } catch (err: any) {
      setError(err.message)
    }
  }

  return (
    <KeyboardAvoidingView style={[common.screen, styles.editorRoot]} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      {showEditorToolbar ? (
        <View style={styles.toolbar}>
          <Text style={styles.toolbarTitle} numberOfLines={1}>
            {title}
          </Text>
          {html ? (
            <View style={styles.segment}>
              {(['chat', 'preview'] as const).map((item) => {
                const label = item === 'chat' ? 'Edit' : 'Preview'
                return (
                  <Pressable key={item} onPress={() => setTab(item)} style={[styles.segmentItem, tab === item && styles.segmentActive]}>
                    <Text style={[styles.segmentText, tab === item && styles.segmentTextActive]}>{label}</Text>
                  </Pressable>
                )
              })}
            </View>
          ) : null}
        </View>
      ) : null}

      {loadingSite ? (
        <View style={styles.openingState}>
          <ActivityIndicator color={colors.brand2} />
          <Text style={styles.hint}>Opening web-app...</Text>
        </View>
      ) : showBuildHome ? (
        <BuildHome
          input={input}
          onInput={setInput}
          onGenerate={() => send()}
          generating={generating}
          modelLabel={modelSelectionEnabled ? selectedModelOption.label : activeDefaultModel}
          modelEnabled={modelSelectionEnabled}
          onPickModel={() => setModelPickerOpen(true)}
          onPickTemplate={setSelectedTemplate}
          remoteTemplates={remoteTemplates}
          remoteTemplatesLoading={remoteTemplatesLoading}
        />
      ) : tab === 'chat' || (!html && !generating) ? (
        <View style={[styles.chat, hasActionBar && styles.chatWithActions]}>
          <ScrollView ref={scrollRef} contentContainerStyle={styles.messages}>
            {messages.map((message, index) => (
              <View key={`${message.role}-${index}`} style={[styles.bubble, message.role === 'user' ? styles.userBubble : styles.assistantBubble]}>
                <Text style={message.role === 'user' ? styles.userText : styles.assistantText}>{message.content}</Text>
              </View>
            ))}
            {generating ? <AgentWorking /> : null}
          </ScrollView>

          <View style={styles.composer}>
            {error ? <Text style={[common.error, styles.composerError]}>{error}</Text> : null}
            <View style={styles.pickRow}>
              <Pressable
                disabled={!modelSelectionEnabled}
                onPress={() => setModelPickerOpen(true)}
                style={[styles.chip, !modelSelectionEnabled && styles.chipDisabled]}
              >
                <Text style={styles.chipText}>{modelSelectionEnabled ? selectedModelOption.label : activeDefaultModel}</Text>
              </Pressable>
            </View>
            <View style={styles.inputRow}>
              <AppInput
                style={styles.promptInput}
                placeholder={html ? 'What should I change?' : 'Describe your website'}
                value={input}
                multiline
                onChangeText={setInput}
              />
              <Pressable onPress={send} disabled={!input.trim() || generating} style={[styles.sendButton, (!input.trim() || generating) && styles.disabled]}>
                <Send size={18} color="#fff" />
              </Pressable>
            </View>
          </View>
        </View>
      ) : (
        <View style={[styles.previewWrap, hasActionBar && styles.previewWithActions]}>
          {generating ? (
            <BuildPreview />
          ) : html ? (
            <WebView
              source={{ html, baseUrl: 'https://preview.ctrlpoint.local/' }}
              style={styles.preview}
              originWhitelist={['*']}
              javaScriptEnabled
              domStorageEnabled
              setSupportMultipleWindows={false}
              javaScriptCanOpenWindowsAutomatically
              allowsInlineMediaPlayback
              mediaPlaybackRequiresUserAction={false}
              androidLayerType="hardware"
              overScrollMode="never"
              nestedScrollEnabled={false}
              injectedJavaScriptBeforeContentLoaded={previewInjectedJavaScript}
              onShouldStartLoadWithRequest={(request) => {
                const url = request.url
                if (
                  !url ||
                  url === 'about:blank' ||
                  url.startsWith('data:') ||
                  url.startsWith('blob:') ||
                  url.startsWith('file:') ||
                  url.startsWith('https://preview.ctrlpoint.local') ||
                  url.startsWith('#')
                ) {
                  return true
                }
                if (/^https?:\/\//i.test(url)) {
                  Linking.openURL(url).catch(() => {})
                  return false
                }
                return true
              }}
            />
          ) : null}
        </View>
      )}

      {hasActionBar ? (
        <View style={styles.actionBar}>
          <Pressable onPress={reset} style={common.secondaryButton}>
            <Text style={common.secondaryText}>New</Text>
          </Pressable>
          {site?.previousCode ? (
            <Pressable onPress={revert} style={common.secondaryButton}>
              <RotateCcw size={15} color={colors.text} />
              <Text style={common.secondaryText}>Revert</Text>
            </Pressable>
          ) : null}
          {html && isLive && !hasChanges && liveUrl ? (
            <>
              <Pressable onPress={() => Linking.openURL(liveUrl)} style={[common.secondaryButton, styles.liveAction]}>
                <Text style={common.secondaryText}>Open</Text>
              </Pressable>
              <Pressable onPress={() => Share.share({ message: liveUrl, url: liveUrl })} style={[common.primaryButton, styles.shareButton]}>
                <Text style={common.primaryText}>Share</Text>
              </Pressable>
            </>
          ) : html ? (
            <Pressable
              onPress={() => setShowDeploy(true)}
              disabled={isBusy}
              style={({ pressed }) => [common.primaryButton, styles.deployButton, pressed && !isBusy && styles.pressedButton, isBusy && styles.disabled]}
            >
              <Text style={common.primaryText}>{isBusy ? 'Deploying' : isLive ? 'Push update' : 'Deploy & Share'}</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      <DeployModal
        visible={showDeploy}
        generatedCode={html}
        title={title}
        description={description}
        lastPrompt={lastUserMessage(messages)}
        existingSite={site ?? undefined}
        onClose={() => setShowDeploy(false)}
        onBackground={() => {
          if (Platform.OS === 'android') ToastAndroid.show('Deployment is still running. Check Activity for progress.', ToastAndroid.LONG)
          navigate({ name: 'Deployments' })
        }}
        onDeployed={(nextSite) => setSite(nextSite)}
        onLive={(id) => {
          sitesApi.get(id).then(({ site }) => {
            setSite(site)
            setHasChanges(site.needsDeploy)
          })
        }}
      />
      <CreditRequiredModal
        visible={!!creditError}
        message={creditError}
        onClose={() => setCreditError('')}
        onTopUp={() => {
          setCreditError('')
          navigate({ name: 'Credits' })
        }}
      />
      <TemplateModal
        template={selectedTemplate}
        onClose={() => setSelectedTemplate(null)}
        onGenerate={(prompt, label, assets) => {
          setSelectedTemplate(null)
          startGeneration(prompt, label, assets)
        }}
      />
      <PickerModal
        visible={modelPickerOpen}
        title="Model"
        items={models.map((model) => ({ id: model.id, label: model.label, sub: model.sub }))}
        activeId={selectedModel}
        onClose={() => setModelPickerOpen(false)}
        onPick={(id) => {
          setSelectedModel(id)
          const nextModel = models.find((model) => model.id === id)
          if (nextModel && !nextModel.reasoningEfforts.includes(selectedReasoningEffort)) {
            setSelectedReasoningEffort(nextModel.reasoningEfforts[0] || 'medium')
          }
          setModelPickerOpen(false)
        }}
      />
      <PickerModal
        visible={effortPickerOpen}
        title="Reasoning effort"
        items={availableReasoningEfforts.map((effort) => ({ id: effort.id, label: effort.label, sub: effort.sub }))}
        activeId={activeReasoningEffort}
        onClose={() => setEffortPickerOpen(false)}
        onPick={(id) => {
          setSelectedReasoningEffort(id)
          setEffortPickerOpen(false)
        }}
      />
    </KeyboardAvoidingView>
  )
}

function BuildHome(props: {
  input: string
  onInput: (value: string) => void
  onGenerate: () => void
  generating: boolean
  modelLabel: string
  modelEnabled: boolean
  onPickModel: () => void
  onPickTemplate: (template: BuildTemplate) => void
  remoteTemplates: BuildTemplate[]
  remoteTemplatesLoading: boolean
}) {
  const { colors } = useTheme()
  const styles = useMemo(() => createStyles(colors), [colors])
  const templatesForRail = (category: TemplateCategory) => {
    const remote =
      category === 'trending'
        ? props.remoteTemplates.filter((template) => template.trending)
        : props.remoteTemplates.filter((template) => template.category === category)
    const seen = new Set<string>()
    return [...remote, ...templatesForCategory(category)].filter((template) => {
      if (seen.has(template.id)) return false
      seen.add(template.id)
      return true
    })
  }

  return (
    <ScrollView style={styles.buildHome} contentContainerStyle={styles.buildHomeContent} keyboardShouldPersistTaps="handled">
      <View style={styles.customBuildPanel}>
        <View style={styles.customBuildHead}>
          <Text style={styles.customBuildKicker}>Custom</Text>
          <Pressable disabled={!props.modelEnabled} onPress={props.onPickModel} style={[styles.modelPill, !props.modelEnabled && styles.chipDisabled]}>
            <Text style={styles.modelPillText}>{props.modelLabel}</Text>
          </Pressable>
        </View>
        <AppInput
          style={styles.homePromptInput}
          placeholder="What do you want to make?"
          value={props.input}
          onChangeText={props.onInput}
          multiline
        />
        <Pressable onPress={props.onGenerate} disabled={!props.input.trim() || props.generating} style={[styles.generateButton, (!props.input.trim() || props.generating) && styles.disabled]}>
          <Text style={styles.generateText}>Generate custom site</Text>
        </Pressable>
      </View>

      <TemplateRail title="Trending" templates={templatesForRail('trending')} loadingRemote={props.remoteTemplatesLoading} onPick={props.onPickTemplate} />
      <TemplateRail title="Fun" templates={templatesForRail('fun')} loadingRemote={props.remoteTemplatesLoading} onPick={props.onPickTemplate} />
      <TemplateRail title="Useful" templates={templatesForRail('useful')} loadingRemote={props.remoteTemplatesLoading} onPick={props.onPickTemplate} />
    </ScrollView>
  )
}

function TemplateIconView({ icon, color, size }: { icon: TemplateIcon; color: string; size: number }) {
  const props = { size, color, strokeWidth: 2.8 }
  if (icon === 'bird') return <Bird {...props} />
  if (icon === 'brain') return <Brain {...props} />
  if (icon === 'briefcase') return <Briefcase {...props} />
  if (icon === 'cake') return <Cake {...props} />
  if (icon === 'footprints') return <Footprints {...props} />
  if (icon === 'gamepad') return <Gamepad2 {...props} />
  if (icon === 'gift') return <Gift {...props} />
  if (icon === 'heart') return <Heart {...props} />
  if (icon === 'joystick') return <Joystick {...props} />
  if (icon === 'link') return <Link {...props} />
  if (icon === 'megaphone') return <Megaphone {...props} />
  if (icon === 'message') return <MessageCircle {...props} />
  if (icon === 'party') return <PartyPopper {...props} />
  if (icon === 'puzzle') return <Puzzle {...props} />
  if (icon === 'rabbit') return <Rabbit {...props} />
  if (icon === 'shield') return <Shield {...props} />
  if (icon === 'sword') return <Sword {...props} />
  return <Trophy {...props} />
}

function templateAccent(colors: ThemeColors, accent: string) {
  return colors.mode === 'light' ? colors.brand2 : accent
}

function TemplateSkeletonCard({ width }: { width: number }) {
  const { colors } = useTheme()
  const styles = useMemo(() => createStyles(colors), [colors])
  const shimmer = useRef(new Animated.Value(0)).current

  useEffect(() => {
    const animation = Animated.loop(
      Animated.timing(shimmer, {
        toValue: 1,
        duration: 1200,
        easing: Easing.inOut(Easing.quad),
        useNativeDriver: true,
      }),
    )
    animation.start()
    return () => animation.stop()
  }, [shimmer])

  const translateX = shimmer.interpolate({ inputRange: [0, 1], outputRange: [-120, width + 80] })

  return (
    <View style={[styles.templateCard, styles.templateSkeletonCard, { width }]}>
      <View style={styles.templateSheen} />
      <View style={styles.templateInnerStroke} />
      <View style={styles.skeletonTagRow}>
        <View style={[styles.templateSkeletonLine, styles.templateSkeletonTag]}>
          <Animated.View style={[styles.templateSkeletonSweep, { transform: [{ translateX }] }]} />
        </View>
        <View style={[styles.templateSkeletonLine, styles.templateSkeletonBadge]}>
          <Animated.View style={[styles.templateSkeletonSweep, { transform: [{ translateX }] }]} />
        </View>
      </View>
      <View style={styles.templateSkeletonMain}>
        <View style={styles.templateSkeletonIcon}>
          <Animated.View style={[styles.templateSkeletonSweep, { transform: [{ translateX }] }]} />
        </View>
        <View style={styles.templateSkeletonTitleWrap}>
          <View style={[styles.templateSkeletonLine, styles.templateSkeletonTitle]}>
            <Animated.View style={[styles.templateSkeletonSweep, { transform: [{ translateX }] }]} />
          </View>
          <View style={[styles.templateSkeletonLine, styles.templateSkeletonTitleShort]}>
            <Animated.View style={[styles.templateSkeletonSweep, { transform: [{ translateX }] }]} />
          </View>
        </View>
      </View>
      <View style={[styles.templateSkeletonLine, styles.templateSkeletonBody]}>
        <Animated.View style={[styles.templateSkeletonSweep, { transform: [{ translateX }] }]} />
      </View>
      <View style={[styles.templateSkeletonLine, styles.templateSkeletonBodyShort]}>
        <Animated.View style={[styles.templateSkeletonSweep, { transform: [{ translateX }] }]} />
      </View>
    </View>
  )
}

function TemplateRail({ title, templates, loadingRemote, onPick }: { title: string; templates: BuildTemplate[]; loadingRemote: boolean; onPick: (template: BuildTemplate) => void }) {
  const { colors } = useTheme()
  const styles = useMemo(() => createStyles(colors), [colors])
  const { width } = useWindowDimensions()
  const cardWidth = Math.max(150, Math.floor((width - 42) / 2))
  return (
    <View style={styles.templateSection}>
      <View style={styles.sectionTextureOne} />
      <Text style={styles.templateSectionTitle}>{title}</Text>
      <View style={styles.templateGrid}>
        {loadingRemote ? [0, 1].map((item) => <TemplateSkeletonCard key={`${title}-remote-skeleton-${item}`} width={cardWidth} />) : null}
        {templates.map((template) => {
          const accent = templateAccent(colors, template.accent)
          return (
            <Pressable key={`${title}-${template.id}`} onPress={() => onPick(template)} style={[styles.templateCard, { width: cardWidth }]}>
              <View style={styles.templateSheen} />
              <View style={styles.templateInnerStroke} />
              <View style={styles.templateTopRow}>
                <Text style={styles.templateKicker}>{template.tags[0] || title}</Text>
                {template.trending ? <Text style={styles.templateStatus}>Featured</Text> : null}
              </View>
              <View style={styles.templateBody}>
                <View style={[styles.templateMark, { borderColor: alpha(accent, colors.mode === 'light' ? 0.34 : 0.42) }]}>
                  <View style={styles.templateMarkShine} />
                  <View style={styles.templateMarkCore}>
                    <TemplateIconView icon={template.icon} color={accent} size={22} />
                  </View>
                </View>
                <Text style={styles.templateTitle} numberOfLines={2}>{template.title}</Text>
              </View>
              <Text style={styles.templateShort} numberOfLines={3}>{template.short}</Text>
            </Pressable>
          )
        })}
      </View>
    </View>
  )
}

function TemplateModal(props: {
  template: BuildTemplate | null
  onClose: () => void
  onGenerate: (prompt: string, label: string, assets?: TemplateAssets) => void
}) {
  const { colors, common } = useTheme()
  const styles = useMemo(() => createStyles(colors), [colors])
  const [values, setValues] = useState<TemplateValues>({})
  const [customFields, setCustomFields] = useState<Record<string, boolean>>({})
  const [imageBusy, setImageBusy] = useState('')
  const [datePickerField, setDatePickerField] = useState('')
  const template = props.template

  useEffect(() => {
    setValues({})
    setCustomFields({})
    setImageBusy('')
    setDatePickerField('')
  }, [template?.id])

  if (!template) return null
  const accent = templateAccent(colors, template.accent)

  const setValue = (id: string, value: string | TemplateImage[]) => setValues((prev) => ({ ...prev, [id]: value }))
  const missingRequired = template.fields.some((field) => {
    if (!field.required) return false
    const value = values[field.id]
    return Array.isArray(value) ? value.length === 0 : !String(value || '').trim()
  })

  const pickImages = async (fieldId: string, max: number) => {
    setImageBusy(fieldId)
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync()
      if (!permission.granted) {
        setImageBusy('')
        return
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsMultipleSelection: max > 1,
        selectionLimit: max,
        quality: 0.55,
        base64: true,
      })
      if (result.canceled) return
      const images = await Promise.all(
        result.assets.slice(0, max).map(async (asset) => {
          try {
            const manipulated = await ImageManipulator.manipulateAsync(
              asset.uri,
              [{ resize: { width: 960 } }],
              { compress: 0.72, format: ImageManipulator.SaveFormat.JPEG, base64: true },
            )
            return {
              uri: manipulated.uri,
              dataUri: manipulated.base64 ? `data:image/jpeg;base64,${manipulated.base64}` : '',
            }
          } catch {
            // Fall back to the original picker output if image manipulation fails on a device.
          }
          let base64 = asset.base64 || ''
          if (!base64) {
            try {
              base64 = await FileSystem.readAsStringAsync(asset.uri, { encoding: FileSystem.EncodingType.Base64 })
            } catch {
              base64 = ''
            }
          }
          const mimeType = asset.mimeType || mimeFromUri(asset.uri)
          return {
            uri: asset.uri,
            dataUri: base64 ? `data:${mimeType};base64,${base64}` : '',
          }
        }),
      )
      setValue(
        fieldId,
        images.filter((image) => image.uri).map((image) => ({
          uri: image.uri,
          dataUri: image.dataUri,
        })),
      )
    } finally {
      setImageBusy('')
    }
  }

  const onDateChange = (fieldId: string, event: DateTimePickerEvent, date?: Date) => {
    if (Platform.OS === 'android') setDatePickerField('')
    if (event.type === 'dismissed' || !date) return
    setValue(fieldId, formatTemplateDate(date))
  }

  return (
    <Modal visible animationType="slide" onRequestClose={props.onClose}>
      <KeyboardAvoidingView style={styles.templateModalRoot} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.templateModalHead}>
          <View style={styles.templateModalTitleWrap}>
            <Text style={styles.templateModalTitle}>{template.title}</Text>
            <Text style={styles.templateModalSub}>{template.short}</Text>
          </View>
          <Pressable onPress={props.onClose} style={styles.iconButton}>
            <X size={18} color={colors.text} />
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.templateForm} keyboardShouldPersistTaps="handled">
          <View style={[styles.templateBanner, { borderColor: alpha(template.accent, 0.28), backgroundColor: alpha(template.accent, 0.08) }]}>
            <View style={[styles.templateBannerMark, { backgroundColor: alpha(template.accent, 0.15), borderColor: alpha(template.accent, 0.34) }]}>
              <TemplateIconView icon={template.icon} color={accent} size={24} />
            </View>
            <Text style={styles.templateBannerText}>Answer a few things. CtrlPoint will turn it into a static page ready to deploy and share.</Text>
          </View>

          {template.fields.map((field) => {
            const value = values[field.id]
            if (field.type === 'select') {
              const active = typeof value === 'string' ? value : ''
              return (
                <View key={field.id} style={styles.formBlock}>
                  <Text style={styles.formLabel}>{field.label}</Text>
                  <View style={styles.optionWrap}>
                    {field.options.map((option) => (
                      <Pressable key={option} onPress={() => setValue(field.id, option)} style={[styles.optionChip, active === option && styles.optionChipActive]}>
                        <Text style={[styles.optionText, active === option && styles.optionTextActive]}>{option}</Text>
                      </Pressable>
                    ))}
                    {field.allowCustom ? (
                      <Pressable onPress={() => setCustomFields((prev) => ({ ...prev, [field.id]: true }))} style={styles.optionChip}>
                        <Plus size={13} color={colors.muted} />
                        <Text style={styles.optionText}>Custom</Text>
                      </Pressable>
                    ) : null}
                  </View>
                  {customFields[field.id] ? (
                    <AppInput
                      style={styles.customInput}
                      placeholder="Type your own"
                      value={field.options.includes(active) ? '' : active}
                      onChangeText={(text) => setValue(field.id, text)}
                    />
                  ) : null}
                </View>
              )
            }
            if (field.type === 'images') {
              const images = Array.isArray(value) ? value : []
              return (
                <View key={field.id} style={styles.formBlock}>
                  <Text style={styles.formLabel}>{field.label}</Text>
                  <Pressable onPress={() => pickImages(field.id, field.max)} style={styles.imagePickerButton}>
                    {imageBusy === field.id ? <ActivityIndicator color={colors.brand2} /> : <Plus size={17} color={colors.brand2} />}
                    <Text style={styles.imagePickerText}>Add {field.max === 1 ? 'photo' : `up to ${field.max} photos`}</Text>
                  </Pressable>
                  {images.length ? (
                    <View style={styles.imageThumbs}>
                      {images.map((image, index) => (
                        <Pressable
                          key={`${image.uri}-${index}`}
                          onPress={() => setValue(field.id, images.filter((_, i) => i !== index))}
                          style={styles.imageThumb}
                        >
                          <Image source={{ uri: image.uri }} style={styles.imageThumbImage} />
                        </Pressable>
                      ))}
                    </View>
                  ) : null}
                </View>
              )
            }
            if (field.type === 'date') {
              const active = typeof value === 'string' ? value : ''
              const pickerOpen = datePickerField === field.id
              return (
                <View key={field.id} style={styles.formBlock}>
                  <Text style={styles.formLabel}>{field.label}</Text>
                  <Pressable onPress={() => setDatePickerField(field.id)} style={({ pressed }) => [styles.dateInput, pressed && styles.pressedButton]}>
                    <Text style={[styles.dateText, !active && styles.datePlaceholder]}>{active || field.placeholder || 'Choose date'}</Text>
                  </Pressable>
                  {pickerOpen ? (
                    <View style={Platform.OS === 'ios' ? styles.iosDatePickerWrap : undefined}>
                      <DateTimePicker
                        value={parseTemplateDate(active)}
                        mode="date"
                        display={Platform.OS === 'ios' ? 'spinner' : 'calendar'}
                        onChange={(event, date) => onDateChange(field.id, event, date)}
                      />
                      {Platform.OS === 'ios' ? (
                        <Pressable onPress={() => setDatePickerField('')} style={styles.dateDoneButton}>
                          <Text style={styles.dateDoneText}>Done</Text>
                        </Pressable>
                      ) : null}
                    </View>
                  ) : null}
                </View>
              )
            }
            return (
              <View key={field.id} style={styles.formBlock}>
                <Text style={styles.formLabel}>{field.label}</Text>
                <AppInput
                  style={field.type === 'textarea' && styles.textArea}
                  placeholder={field.placeholder}
                  value={typeof value === 'string' ? value : ''}
                  onChangeText={(text) => setValue(field.id, text)}
                  multiline={field.type === 'textarea'}
                  autoCapitalize="sentences"
                />
              </View>
            )
          })}
        </ScrollView>

        <View style={styles.templateModalFooter}>
          <Pressable
            disabled={missingRequired}
            onPress={() => props.onGenerate(buildTemplatePrompt(template, values), `Build ${template.title}`, buildTemplateAssets(template, values))}
            style={[common.primaryButton, styles.templateGenerate, missingRequired && styles.disabled]}
          >
            <Sparkles size={16} color="#fff" />
            <Text style={common.primaryText}>Generate {template.title}</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  )
}

function AgentWorking() {
  const { colors } = useTheme()
  const styles = useMemo(() => createStyles(colors), [colors])
  const dots = useRef([new Animated.Value(0), new Animated.Value(0), new Animated.Value(0)]).current

  useEffect(() => {
    const animations = dots.map((dot, index) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(index * 180),
          Animated.timing(dot, { toValue: -5, duration: 260, easing: Easing.out(Easing.quad), useNativeDriver: true }),
          Animated.timing(dot, { toValue: 0, duration: 260, easing: Easing.in(Easing.quad), useNativeDriver: true }),
          Animated.delay(300),
        ]),
      ),
    )
    animations.forEach((animation) => animation.start())
    return () => animations.forEach((animation) => animation.stop())
  }, [dots])

  return (
    <View style={[styles.bubble, styles.assistantBubble, styles.typingBubble]}>
      <View style={styles.typingDots}>
        {dots.map((dot, index) => (
          <Animated.View key={index} style={[styles.typingDot, { transform: [{ translateY: dot }] }]} />
        ))}
      </View>
    </View>
  )
}

function BuildPreview() {
  const { colors } = useTheme()
  const styles = useMemo(() => createStyles(colors), [colors])
  const spin = useRef(new Animated.Value(0)).current
  const pulse = useRef(new Animated.Value(0.55)).current
  const dots = useRef([new Animated.Value(0), new Animated.Value(0), new Animated.Value(0)]).current

  useEffect(() => {
    const spinAnimation = Animated.loop(Animated.timing(spin, { toValue: 1, duration: 2200, easing: Easing.linear, useNativeDriver: true }))
    const pulseAnimation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 780, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.55, duration: 780, useNativeDriver: true }),
      ]),
    )
    const dotAnimations = dots.map((dot, index) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(index * 220),
          Animated.timing(dot, { toValue: 1, duration: 420, useNativeDriver: true }),
          Animated.timing(dot, { toValue: 0.35, duration: 420, useNativeDriver: true }),
        ]),
      ),
    )
    spinAnimation.start()
    pulseAnimation.start()
    dotAnimations.forEach((animation) => animation.start())
    return () => {
      spinAnimation.stop()
      pulseAnimation.stop()
      dotAnimations.forEach((animation) => animation.stop())
    }
  }, [dots, pulse, spin])

  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] })

  return (
    <View style={styles.previewBuild}>
      <View style={styles.previewChrome}>
        <View style={styles.previewChromeDots}>
          <View style={styles.chromeDot} />
          <View style={styles.chromeDot} />
          <View style={styles.chromeDot} />
        </View>
        <View style={styles.previewAddress}>
          <Text style={styles.previewAddressText}>building...</Text>
        </View>
      </View>
      <View style={styles.previewBuildBody}>
        <View style={styles.glowOne} />
        <View style={styles.glowTwo} />
        <Animated.View style={[styles.buildRing, { transform: [{ rotate }] }]}>
          <View style={styles.buildRingArc} />
        </Animated.View>
        <Animated.View style={[styles.buildCore, { opacity: pulse }]} />
        <Text style={styles.buildTitle}>Agent is working...</Text>
        <View style={styles.buildDots}>
          {dots.map((dot, index) => (
            <Animated.View key={index} style={[styles.buildDot, { opacity: dot }]} />
          ))}
        </View>
      </View>
    </View>
  )
}

function PickerModal(props: {
  visible: boolean
  title: string
  items: { id: string; label: string; sub?: string }[]
  activeId: string
  onClose: () => void
  onPick: (id: string) => void
}) {
  const { colors } = useTheme()
  const styles = useMemo(() => createStyles(colors), [colors])
  return (
    <Modal visible={props.visible} transparent animationType="fade" onRequestClose={props.onClose}>
      <Pressable style={styles.modalBackdrop} onPress={props.onClose}>
        <Pressable style={styles.pickerCard}>
          <View style={styles.modalHead}>
            <Text style={styles.modalTitle}>{props.title}</Text>
            <Pressable onPress={props.onClose} style={styles.iconButton}>
              <X size={17} color={colors.text} />
            </Pressable>
          </View>
          <View style={styles.pickerBody}>
            {props.items.map((item) => {
              const active = item.id === props.activeId
              return (
                <Pressable key={item.id} onPress={() => props.onPick(item.id)} style={[styles.pickerItem, active && styles.pickerItemActive]}>
                  <Text style={[styles.pickerLabel, active && styles.pickerLabelActive]}>{item.label}</Text>
                  {item.sub ? <Text style={styles.pickerSub}>{item.sub}</Text> : null}
                </Pressable>
              )
            })}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  )
}

function CreditRequiredModal(props: {
  visible: boolean
  message: string
  onClose: () => void
  onTopUp: () => void
}) {
  const { colors, common } = useTheme()
  const styles = useMemo(() => createStyles(colors), [colors])
  return (
    <Modal visible={props.visible} transparent animationType="fade" onRequestClose={props.onClose}>
      <Pressable style={styles.modalBackdrop} onPress={props.onClose}>
        <Pressable style={styles.creditModal}>
          <View style={styles.creditModalIcon}>
            <CreditCard size={22} color={colors.brand2} />
          </View>
          <Text style={styles.creditModalTitle}>Not enough credits</Text>
          <Text style={styles.creditModalText}>
            {props.message || 'You need more credits to continue using platform AI.'}
          </Text>
          <View style={styles.creditModalActions}>
            <Pressable onPress={props.onClose} style={[common.secondaryButton, styles.creditModalButton]}>
              <Text style={common.secondaryText}>Close</Text>
            </Pressable>
            <Pressable onPress={props.onTopUp} style={[common.primaryButton, styles.creditModalButton]}>
              <Text style={common.primaryText}>Top up</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  )
}

function DeployModal(props: {
  visible: boolean
  generatedCode: string
  title: string
  description: string
  lastPrompt: string
  existingSite?: Site
  onClose: () => void
  onBackground: () => void
  onDeployed: (site: Site) => void
  onLive: (siteId: string) => void
}) {
  const { colors, common } = useTheme()
  const styles = useMemo(() => createStyles(colors), [colors])
  const { user, setUser } = useAuth()
  const [mnsName, setMnsName] = useState(props.existingSite?.mnsName ?? draftNameFromTitle(props.title))
  const [available, setAvailable] = useState<boolean | null>(null)
  const [creditCost, setCreditCost] = useState(0)
  const [message, setMessage] = useState('')
  const [checking, setChecking] = useState(false)
  const [checkingDotCount, setCheckingDotCount] = useState(1)
  const [deploying, setDeploying] = useState(false)
  const [deploymentId, setDeploymentId] = useState<string | null>(null)
  const [deployedSiteId, setDeployedSiteId] = useState<string | null>(props.existingSite?.id ?? null)
  const [status, setStatus] = useState<DeployStatus | null>(null)
  const [error, setError] = useState('')
  const [isUpdateMode, setIsUpdateMode] = useState(!!props.existingSite?.scAddress)
  const [copiedLiveUrl, setCopiedLiveUrl] = useState(false)
  const successScale = useRef(new Animated.Value(0.75)).current
  const wasVisible = useRef(false)
  const mnsCheckSeq = useRef(0)

  const currentIsUpdate = !!props.existingSite?.scAddress
  const isUpdate = props.visible ? isUpdateMode : currentIsUpdate
  const isDraft = !!props.existingSite && !props.existingSite.scAddress
  const isClaimed = !!props.existingSite?.ownershipClaimed

  useEffect(() => {
    if (!props.visible) {
      wasVisible.current = false
      return
    }
    if (wasVisible.current) return
    wasVisible.current = true
    setIsUpdateMode(currentIsUpdate)
    const nextMnsName = props.existingSite?.mnsName ?? draftNameFromTitle(props.title)
    const oldAutoSuffix = /-[a-z0-9]{5,8}$/.test(nextMnsName) && !/-\d{1,3}$/.test(nextMnsName)
    setMnsName(isDraft && oldAutoSuffix ? draftNameFromTitle(props.title) : nextMnsName)
    setAvailable(currentIsUpdate ? true : null)
    setCreditCost(0)
    setMessage('')
    setDeploymentId(null)
    setDeployedSiteId(props.existingSite?.id ?? null)
    setStatus(null)
    setError('')
    setDeploying(false)
    setCopiedLiveUrl(false)
    successScale.setValue(0.75)
  }, [currentIsUpdate, isDraft, props.existingSite?.id, props.existingSite?.mnsName, props.title, props.visible])

  useEffect(() => {
    if (!props.visible || isUpdate || !mnsName || mnsName.length < 2) {
      mnsCheckSeq.current += 1
      setChecking(false)
      return
    }
    const seq = ++mnsCheckSeq.current
    setChecking(true)
    setCheckingDotCount(1)
    const t = setTimeout(async () => {
      try {
        const result = await deployApi.checkMns(mnsName)
        if (seq !== mnsCheckSeq.current) return
        setAvailable(result.available)
        setCreditCost(result.creditCost || 0)
        setMessage(result.message || result.error || '')
      } catch {
        if (seq !== mnsCheckSeq.current) return
        setAvailable(false)
      } finally {
        if (seq === mnsCheckSeq.current) setChecking(false)
      }
    }, 500)
    return () => clearTimeout(t)
  }, [isUpdate, mnsName, props.visible])

  useEffect(() => {
    if (!checking) return
    const interval = setInterval(() => {
      setCheckingDotCount((value) => (value >= 3 ? 1 : value + 1))
    }, 360)
    return () => clearInterval(interval)
  }, [checking])

  useEffect(() => {
    if (!deploymentId) return
    const iv = setInterval(async () => {
      try {
        const result = await deployApi.status(deploymentId)
        setStatus(result)
        if (result.status === 'COMPLETE' || result.status === 'FAILED') {
          clearInterval(iv)
          setDeploying(false)
          if (result.status === 'COMPLETE' && deployedSiteId) props.onLive(deployedSiteId)
        }
      } catch {}
    }, 2000)
    return () => clearInterval(iv)
  }, [deployedSiteId, deploymentId, props.onLive])

  const nameValid = /^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$/.test(mnsName) && mnsName.length >= 2
  const canDeploy = isClaimed ? false : isUpdate ? !deploying : nameValid && available === true && (!user || user.credits >= creditCost) && !deploying

  const start = async () => {
    if (!canDeploy) return
    setDeploying(true)
    setError('')
    setStatus({ status: 'QUEUED', step: isUpdate ? 'Preparing update...' : 'Preparing deployment...' })
    try {
      let siteId = props.existingSite?.id
      if (!siteId) {
        const { site } = await sitesApi.create({
          mnsName,
          generatedCode: props.generatedCode,
          title: props.title,
          description: props.description,
          lastPrompt: props.lastPrompt,
        })
        siteId = site.id
        setDeployedSiteId(siteId)
        props.onDeployed(site)
      } else if (isDraft) {
        const { site } = await sitesApi.updateDraft(siteId, {
          mnsName,
          generatedCode: props.generatedCode,
          title: props.title,
          description: props.description,
          lastPrompt: props.lastPrompt,
        })
        setDeployedSiteId(siteId)
        props.onDeployed(site)
      } else {
        setDeployedSiteId(siteId)
      }
      const { deploymentId, creditsCharged } = await deployApi.start(siteId!)
      if (creditsCharged && user) setUser({ ...user, credits: Math.max(0, user.credits - creditsCharged) })
      setDeploymentId(deploymentId)
    } catch (err: any) {
      setError(err.message)
      setStatus(null)
      setDeploying(false)
    }
  }

  const close = () => {
    if (deploying && !done) props.onBackground()
    props.onClose()
  }

  const done = status?.status === 'COMPLETE' || status?.status === 'FAILED'
  const liveResultUrl = status?.url || (props.existingSite ? getSiteUrl(props.existingSite.mnsName) : '')

  useEffect(() => {
    if (status?.status !== 'COMPLETE') return
    Animated.spring(successScale, {
      toValue: 1,
      friction: 5,
      tension: 120,
      useNativeDriver: true,
    }).start()
    maybeRequestReview(isUpdate ? 'updated' : 'deployed')
  }, [isUpdate, status?.status, successScale])

  const copyLiveUrl = async () => {
    if (!liveResultUrl) return
    await Clipboard.setStringAsync(liveResultUrl)
    setCopiedLiveUrl(true)
    setTimeout(() => setCopiedLiveUrl(false), 3000)
  }

  const shareLiveUrl = () => {
    if (!liveResultUrl) return
    Share.share({ message: liveResultUrl, url: liveResultUrl })
  }
  const cleanMnsName = mnsName.trim()
  const fullMnsName = cleanMnsName ? `${cleanMnsName}.${mnsPublicDomain}` : ''
  const paidMnsName = !isUpdate && cleanMnsName.length >= 2 && cleanMnsName.length < 6 && creditCost > 0
  const insufficientMnsCredits = paidMnsName && !!user && user.credits < creditCost
  const nameFormatLooksValid = !cleanMnsName || /^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$/.test(cleanMnsName)
  const unavailableMessage = message && !/6\+|free|short names/i.test(message)
    ? message
    : `${fullMnsName || 'This name'} is not available. Try another name.`

  const mnsFeedback = (() => {
    if (!cleanMnsName) return { text: 'Pick a site name. Names with 6+ characters are free.', style: styles.hint }
    if (!nameFormatLooksValid) return { text: 'Use lowercase letters, numbers, and hyphens only.', style: common.error }
    if (cleanMnsName.length < 2) return { text: 'Use at least 2 characters.', style: common.error }
    if (checking) {
      return {
        text: `Checking ${fullMnsName}${'.'.repeat(checkingDotCount)}`,
        style: styles.checkingMns,
      }
    }
    if (available === false) return { text: unavailableMessage, style: common.error }
    if (available === true && insufficientMnsCredits) {
      return {
        text: `${fullMnsName} costs ${creditCost} credit${creditCost === 1 ? '' : 's'}. You have ${user.credits}.`,
        style: common.error,
      }
    }
    if (available === true && paidMnsName) {
      return {
        text: `${fullMnsName} is available for ${creditCost} credit${creditCost === 1 ? '' : 's'}.`,
        style: common.success,
      }
    }
    if (available === true) return { text: `${fullMnsName} is available and free.`, style: common.success }
    if (cleanMnsName.length < 6) return { text: 'Short names may cost credits. Names with 6+ characters are free.', style: styles.hint }
    return { text: 'Names with 6+ characters are free.', style: styles.hint }
  })()

  return (
    <Modal visible={props.visible} animationType="slide" transparent onRequestClose={close}>
      <View style={styles.modalBackdrop}>
        <View style={styles.modalCard}>
          <View style={styles.modalHead}>
            <Text style={styles.modalTitle}>{isUpdate ? 'Push update' : 'Deploy to DeWeb'}</Text>
            <Pressable onPress={close} style={styles.iconButton}>
              <X size={17} color={colors.text} />
            </Pressable>
          </View>

          {!deploymentId && !deploying ? (
            <View style={styles.modalBody}>
              {isUpdate ? (
                <Text style={styles.deployInfo}>
                  Updating {props.existingSite?.mnsName}.{mnsPublicDomain}
                </Text>
              ) : (
                <>
                  <Text style={common.label}>Site name</Text>
                  <AppInput
                    placeholder="my-awesome-site"
                    value={mnsName}
                    onChangeText={(text) => setMnsName(text.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                    autoCapitalize="none"
                  />
                  <Text style={styles.hint}>
                    {fullMnsName || 'Your site will use a CtrlPoint MNS address.'}
                  </Text>
                  <Text style={styles.hint}>You can edit this name before deploying.</Text>
                  <Text style={mnsFeedback.style}>{mnsFeedback.text}</Text>
                </>
              )}
              {isClaimed ? <Text style={common.error}>This site has claimed ownership. CtrlPoint can no longer update its MNS record.</Text> : null}
              {error ? <Text style={common.error}>{error}</Text> : null}
              <Pressable onPress={start} disabled={!canDeploy} style={({ pressed }) => [common.primaryButton, pressed && canDeploy && styles.pressedButton, !canDeploy && styles.disabled]}>
                {deploying ? <ActivityIndicator color="#fff" /> : <Text style={common.primaryText}>{isUpdate ? 'Push update' : 'Deploy'}</Text>}
              </Pressable>
            </View>
          ) : (
            <View style={[styles.modalBody, styles.progressBody]}>
              {!done ? (
                <>
                  <ActivityIndicator color={colors.brand2} size="large" />
                  <Text style={styles.progressTitle}>{status?.step || 'Preparing deployment...'}</Text>
                  <Text style={styles.hint}>You can close this and check Activity while it runs.</Text>
                </>
              ) : status?.status === 'COMPLETE' ? (
                <>
                  <Animated.View style={[styles.successMark, { transform: [{ scale: successScale }] }]}>
                    <Check size={34} color="#fffdfa" strokeWidth={3.2} />
                  </Animated.View>
                  <Text style={styles.progressTitle}>Site is live</Text>
                  <Text style={[styles.hint, styles.liveUrlText]} numberOfLines={2}>{liveResultUrl}</Text>
                  <View style={styles.successActions}>
                    <Pressable onPress={copyLiveUrl} style={({ pressed }) => [styles.successAction, pressed && styles.pressedButton]}>
                      {copiedLiveUrl ? <Check size={17} color={colors.green} /> : <Copy size={17} color={colors.brand2} />}
                      <Text style={styles.successActionText}>{copiedLiveUrl ? 'Copied' : 'Copy'}</Text>
                    </Pressable>
                    <Pressable onPress={shareLiveUrl} style={({ pressed }) => [styles.successAction, pressed && styles.pressedButton]}>
                      <ExternalLink size={17} color={colors.brand2} />
                      <Text style={styles.successActionText}>Share</Text>
                    </Pressable>
                  </View>
                  <Pressable onPress={() => liveResultUrl && Linking.openURL(liveResultUrl)} style={({ pressed }) => [common.primaryButton, pressed && styles.pressedButton]}>
                    <Text style={common.primaryText}>Open site</Text>
                  </Pressable>
                  <Pressable onPress={props.onClose} style={({ pressed }) => [common.secondaryButton, pressed && styles.pressedButton]}>
                    <Text style={common.secondaryText}>Done</Text>
                  </Pressable>
                </>
              ) : (
                <>
                  <Text style={styles.progressTitle}>Deployment failed</Text>
                  <Text style={common.error}>{status?.error || 'Deployment failed.'}</Text>
                  <Pressable onPress={props.onClose} style={({ pressed }) => [common.secondaryButton, pressed && styles.pressedButton]}>
                    <Text style={common.secondaryText}>Close</Text>
                  </Pressable>
                </>
              )}
            </View>
          )}
        </View>
      </View>
    </Modal>
  )
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
  editorRoot: {
    paddingBottom: BOTTOM_NAV_SPACE,
  },
  toolbar: {
    minHeight: 48,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  toolbarTitle: {
    flex: 1,
    color: colors.text,
    fontWeight: '800',
  },
  segment: {
    flexDirection: 'row',
    padding: 4,
    borderRadius: 14,
    backgroundColor: colors.surfaceStrong,
    borderColor: alpha(colors.brand2, 0.22),
    borderWidth: 1,
  },
  segmentItem: {
    minWidth: 74,
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
  },
  segmentActive: {
    backgroundColor: colors.brand,
    shadowColor: colors.brand,
    shadowOpacity: 0.22,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  segmentText: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: '900',
  },
  segmentTextActive: {
    color: '#fff',
  },
  buildHome: {
    flex: 1,
  },
  buildHomeContent: {
    paddingHorizontal: 0,
    paddingTop: 0,
    paddingBottom: BOTTOM_NAV_SPACE + 24,
    gap: 0,
  },
  buildHero: {
    gap: 10,
  },
  buildHomeTitle: {
    color: colors.text,
    fontSize: 28,
    fontWeight: '900',
  },
  buildSubtitle: {
    color: colors.textSoft,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 19,
  },
  customBuildPanel: {
    marginHorizontal: 14,
    marginTop: 12,
    marginBottom: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.mode === 'light' ? colors.borderStrong : 'rgba(244,240,232,0.18)',
    backgroundColor: colors.mode === 'light' ? colors.panel : '#0b0e0d',
    padding: 13,
    gap: 11,
    shadowColor: colors.brand2,
    shadowOpacity: colors.mode === 'light' ? 0.08 : 0.1,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
  },
  customBuildHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  customBuildKicker: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  homePromptInput: {
    minHeight: 70,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.input,
    color: colors.text,
    paddingHorizontal: 12,
    paddingVertical: 10,
    textAlignVertical: 'top',
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '700',
  },
  homePromptActions: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  modelPill: {
    minHeight: 34,
    maxWidth: 176,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceStrong,
    paddingHorizontal: 10,
    justifyContent: 'center',
  },
  modelPillText: {
    color: colors.textSoft,
    fontSize: 11,
    fontWeight: '900',
  },
  generateButton: {
    minHeight: 42,
    borderRadius: 12,
    backgroundColor: colors.brand,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  generateText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '900',
  },
  templateSection: {
    position: 'relative',
    gap: 14,
    borderTopWidth: 1,
    borderTopColor: colors.mode === 'light' ? colors.border : 'rgba(244,240,232,0.08)',
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 16,
    overflow: 'hidden',
    backgroundColor: colors.mode === 'light' ? colors.bgSoft : '#080a0a',
  },
  sectionTextureOne: {
    position: 'absolute',
    left: -60,
    right: -60,
    top: -30,
    height: 120,
    backgroundColor: colors.mode === 'light' ? 'rgba(255,253,250,0.28)' : 'rgba(244,240,232,0.045)',
    transform: [{ rotate: '-8deg' }],
  },
  templateSectionTitle: {
    color: colors.text,
    fontSize: 26,
    lineHeight: 30,
    fontWeight: '900',
    marginLeft: 2,
  },
  templateGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  templateCard: {
    height: 226,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: colors.mode === 'light' ? 'rgba(40,35,27,0.26)' : 'rgba(244,240,232,0.25)',
    backgroundColor: colors.mode === 'light' ? '#f8f4eb' : '#121716',
    padding: 12,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: colors.mode === 'light' ? 0.12 : 0.34,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
  },
  templateSheen: {
    position: 'absolute',
    top: -20,
    right: -36,
    width: 116,
    height: 82,
    borderRadius: 26,
    backgroundColor: colors.mode === 'light' ? 'rgba(255,255,255,0.48)' : 'rgba(244,240,232,0.13)',
    transform: [{ rotate: '-16deg' }],
  },
  templateInnerStroke: {
    position: 'absolute',
    left: 1,
    right: 1,
    top: 1,
    bottom: 1,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.mode === 'light' ? 'rgba(255,255,255,0.56)' : 'rgba(255,255,255,0.08)',
  },
  templateTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    minHeight: 30,
  },
  templateKicker: {
    color: colors.textSoft,
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '900',
    textTransform: 'uppercase',
    opacity: 0.82,
  },
  templateBody: {
    marginTop: 15,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    minHeight: 56,
  },
  templateMark: {
    width: 50,
    height: 50,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.mode === 'light' ? 'rgba(255,253,250,0.52)' : '#101819',
    shadowColor: colors.brand2,
    shadowOpacity: colors.mode === 'light' ? 0.12 : 0.42,
    shadowRadius: colors.mode === 'light' ? 8 : 13,
    shadowOffset: { width: 0, height: 6 },
    elevation: colors.mode === 'light' ? 2 : 5,
  },
  templateMarkCore: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.mode === 'light' ? 'transparent' : 'rgba(244,240,232,0.08)',
  },
  templateMarkShine: {
    position: 'absolute',
    left: 7,
    right: 7,
    top: 4,
    height: 11,
    borderRadius: 8,
    backgroundColor: colors.mode === 'light' ? 'rgba(255,255,255,0.48)' : 'rgba(255,255,255,0.18)',
  },
  templateStatus: {
    color: colors.mode === 'light' ? '#2a2823' : '#f4f0e8',
    borderWidth: 1,
    borderColor: colors.mode === 'light' ? 'rgba(40,35,27,0.20)' : 'rgba(244,240,232,0.32)',
    backgroundColor: colors.mode === 'light' ? 'rgba(255,255,255,0.64)' : 'rgba(244,240,232,0.16)',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    fontSize: 11,
    lineHeight: 13,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  templateTitle: {
    flex: 1,
    color: colors.text,
    fontSize: 15,
    lineHeight: 19,
    fontWeight: '900',
  },
  templateShort: {
    color: colors.textSoft,
    marginTop: 12,
    fontSize: 11,
    lineHeight: 16,
    fontWeight: '700',
  },
  templateSkeletonCard: {
    opacity: 0.86,
  },
  skeletonTagRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    minHeight: 30,
  },
  templateSkeletonLine: {
    height: 14,
    borderRadius: 999,
    backgroundColor: colors.mode === 'light' ? 'rgba(28,25,20,0.10)' : 'rgba(244,240,232,0.08)',
    overflow: 'hidden',
  },
  templateSkeletonSweep: {
    width: 86,
    height: '100%',
    backgroundColor: colors.mode === 'light' ? 'rgba(255,255,255,0.48)' : 'rgba(255,255,255,0.10)',
  },
  templateSkeletonTag: {
    width: 66,
  },
  templateSkeletonBadge: {
    width: 76,
  },
  templateSkeletonMain: {
    marginTop: 17,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
  },
  templateSkeletonIcon: {
    width: 50,
    height: 50,
    borderRadius: 14,
    backgroundColor: colors.mode === 'light' ? 'rgba(13,16,15,0.16)' : 'rgba(244,240,232,0.08)',
    overflow: 'hidden',
  },
  templateSkeletonTitleWrap: {
    flex: 1,
    gap: 8,
  },
  templateSkeletonTitle: {
    width: '86%',
    height: 16,
  },
  templateSkeletonTitleShort: {
    width: '58%',
    height: 16,
  },
  templateSkeletonBody: {
    marginTop: 18,
    width: '92%',
    height: 13,
  },
  templateSkeletonBodyShort: {
    marginTop: 9,
    width: '72%',
    height: 13,
  },
  templateModalRoot: {
    flex: 1,
    backgroundColor: colors.bg,
    paddingTop: TOP_INSET,
  },
  templateModalHead: {
    minHeight: 72,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.header,
  },
  templateModalTitleWrap: {
    flex: 1,
  },
  templateModalTitle: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '900',
  },
  templateModalSub: {
    color: colors.textSoft,
    marginTop: 3,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '700',
  },
  templateForm: {
    padding: 16,
    paddingBottom: 96 + BOTTOM_INSET,
    gap: 16,
  },
  templateBanner: {
    borderWidth: 1,
    borderRadius: 18,
    padding: 13,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  templateBannerMark: {
    width: 46,
    height: 46,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  templateBannerText: {
    flex: 1,
    color: colors.textSoft,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '700',
  },
  formBlock: {
    gap: 9,
  },
  formLabel: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '900',
  },
  optionWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  optionChip: {
    minHeight: 38,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceStrong,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  optionChipActive: {
    backgroundColor: colors.brand,
    borderColor: alpha(colors.brand2, 0.3),
  },
  optionText: {
    color: colors.textSoft,
    fontSize: 13,
    fontWeight: '900',
  },
  optionTextActive: {
    color: '#fff',
  },
  customInput: {
    marginTop: 2,
  },
  dateInput: {
    minHeight: 46,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.input,
    paddingHorizontal: 12,
    justifyContent: 'center',
  },
  dateText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '800',
  },
  datePlaceholder: {
    color: colors.faint,
  },
  iosDatePickerWrap: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceStrong,
    overflow: 'hidden',
  },
  dateDoneButton: {
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  dateDoneText: {
    color: colors.brand2,
    fontWeight: '900',
  },
  textArea: {
    minHeight: 92,
    textAlignVertical: 'top',
  },
  imagePickerButton: {
    minHeight: 46,
    borderRadius: 14,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: alpha(colors.brand2, 0.38),
    backgroundColor: alpha(colors.brand, 0.08),
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  imagePickerText: {
    color: colors.brand2,
    fontSize: 13,
    fontWeight: '900',
  },
  imageThumbs: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  imageThumb: {
    width: 72,
    height: 72,
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceStrong,
  },
  imageThumbImage: {
    width: '100%',
    height: '100%',
  },
  templateModalFooter: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: 14,
    paddingBottom: 14 + BOTTOM_INSET,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.nav,
  },
  templateGenerate: {
    minHeight: 50,
  },
  chat: {
    flex: 1,
  },
  chatWithActions: {
    paddingBottom: 62,
  },
  messages: {
    padding: 14,
    gap: 10,
    paddingBottom: 18,
  },
  bubble: {
    maxWidth: '86%',
    borderRadius: 16,
    paddingHorizontal: 13,
    paddingVertical: 10,
  },
  userBubble: {
    alignSelf: 'flex-end',
    backgroundColor: colors.brand,
    borderBottomRightRadius: 5,
  },
  assistantBubble: {
    alignSelf: 'flex-start',
    backgroundColor: colors.surfaceStrong,
    borderWidth: 1,
    borderColor: colors.border,
    borderBottomLeftRadius: 5,
  },
  userText: {
    color: '#fff',
    lineHeight: 20,
    fontWeight: '700',
  },
  assistantText: {
    color: colors.textSoft,
    lineHeight: 20,
    fontWeight: '700',
  },
  typingBubble: {
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  typingDots: {
    flexDirection: 'row',
    gap: 6,
  },
  typingDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: alpha(colors.brand, 0.7),
  },
  composer: {
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    gap: 9,
  },
  composerError: {
    marginHorizontal: 2,
  },
  pickRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    borderRadius: 10,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  chipDisabled: {
    opacity: 0.65,
  },
  chipText: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '800',
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
  },
  promptInput: {
    flex: 1,
    maxHeight: 126,
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabled: {
    opacity: 0.45,
  },
  pressedButton: {
    opacity: 0.82,
    transform: [{ scale: 0.985 }],
  },
  openingState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingHorizontal: 22,
  },
  previewWrap: {
    flex: 1,
    margin: 12,
    overflow: 'hidden',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: '#fff',
  },
  previewWithActions: {
    marginBottom: BOTTOM_NAV_SPACE,
  },
  preview: {
    flex: 1,
    backgroundColor: '#fff',
  },
  previewEmpty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    backgroundColor: colors.panel,
  },
  previewBuild: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  previewChrome: {
    minHeight: 42,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.surface,
  },
  previewChromeDots: {
    flexDirection: 'row',
    gap: 6,
  },
  chromeDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.surfaceStrong,
  },
  previewAddress: {
    flex: 1,
    borderRadius: 9,
    backgroundColor: colors.surfaceStrong,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  previewAddressText: {
    color: colors.faint,
    fontSize: 12,
    fontFamily: 'monospace',
  },
  previewBuildBody: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  glowOne: {
    position: 'absolute',
    width: 190,
    height: 190,
    borderRadius: 95,
    backgroundColor: alpha(colors.brand, 0.13),
    top: '20%',
    left: '8%',
  },
  glowTwo: {
    position: 'absolute',
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: alpha(colors.brand2, 0.1),
    bottom: '18%',
    right: '6%',
  },
  buildRing: {
    width: 68,
    height: 68,
    borderRadius: 34,
    borderWidth: 2,
    borderColor: alpha(colors.brand, 0.16),
    alignItems: 'center',
    justifyContent: 'flex-start',
    marginBottom: 18,
  },
  buildRingArc: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.brand2,
    marginTop: -5,
  },
  buildCore: {
    position: 'absolute',
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: alpha(colors.brand, 0.8),
    top: '50%',
    marginTop: -44,
  },
  buildTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '900',
    marginBottom: 12,
  },
  buildDots: {
    flexDirection: 'row',
    gap: 7,
  },
  buildDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: alpha(colors.brand, 0.7),
  },
  previewText: {
    color: colors.muted,
    fontWeight: '700',
  },
  actionBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: BOTTOM_NAV_SPACE,
    minHeight: 60,
    padding: 10,
    flexDirection: 'row',
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.nav,
  },
  deployButton: {
    flex: 1,
  },
  liveAction: {
    flex: 0.8,
  },
  shareButton: {
    flex: 1.25,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: colors.panel,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pickerCard: {
    margin: 18,
    marginTop: 'auto',
    marginBottom: 'auto',
    backgroundColor: colors.panel,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  creditModal: {
    margin: 18,
    marginTop: 'auto',
    marginBottom: 'auto',
    backgroundColor: colors.panel,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 18,
    alignItems: 'center',
    gap: 12,
  },
  creditModalIcon: {
    width: 54,
    height: 54,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: alpha(colors.brand, 0.12),
    borderWidth: 1,
    borderColor: alpha(colors.brand2, 0.25),
  },
  creditModalTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '900',
    textAlign: 'center',
  },
  creditModalText: {
    color: colors.textSoft,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 19,
    textAlign: 'center',
  },
  creditModalActions: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  creditModalButton: {
    flex: 1,
  },
  pickerBody: {
    padding: 10,
    gap: 8,
  },
  pickerItem: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: 12,
    gap: 4,
  },
  pickerItemActive: {
    borderColor: colors.brand2,
    backgroundColor: alpha(colors.brand, 0.12),
  },
  pickerLabel: {
    color: colors.text,
    fontWeight: '900',
  },
  pickerLabelActive: {
    color: colors.brand2,
  },
  pickerSub: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 17,
  },
  modalHead: {
    minHeight: 58,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
  },
  modalTitle: {
    color: colors.text,
    fontWeight: '900',
    fontSize: 16,
  },
  iconButton: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceStrong,
  },
  modalBody: {
    padding: 16,
    gap: 12,
  },
  deployInfo: {
    color: colors.text,
    backgroundColor: alpha(colors.brand, 0.1),
    borderWidth: 1,
    borderColor: alpha(colors.brand, 0.2),
    padding: 12,
    borderRadius: 12,
  },
  hint: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 17,
  },
  checkingMns: {
    color: colors.brand2,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '900',
  },
  progressBody: {
    minHeight: 210,
    alignItems: 'center',
    justifyContent: 'center',
  },
  successMark: {
    width: 68,
    height: 68,
    borderRadius: 34,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.green,
    shadowColor: colors.green,
    shadowOpacity: 0.32,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
    marginBottom: 4,
  },
  progressTitle: {
    color: colors.text,
    fontWeight: '900',
    fontSize: 17,
    textAlign: 'center',
  },
  liveUrlText: {
    textAlign: 'center',
    maxWidth: '92%',
  },
  successActions: {
    width: '100%',
    flexDirection: 'row',
    gap: 10,
  },
  successAction: {
    flex: 1,
    minHeight: 46,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceStrong,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  successActionText: {
    color: colors.text,
    fontWeight: '900',
  },
})
}
