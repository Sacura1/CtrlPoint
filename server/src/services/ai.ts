import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'
import { cfg } from '../config'
import { GenerateResult } from '../types'
import { AppError } from '../middleware/errorHandler'

let _anthropic: Anthropic | null = null
let _openai: OpenAI | null = null

function anthropic(apiKey?: string) {
  if (apiKey) return new Anthropic({ apiKey })
  if (!_anthropic) _anthropic = new Anthropic({ apiKey: cfg.anthropicKey })
  return _anthropic
}
function openai(apiKey?: string) {
  if (apiKey) return new OpenAI({ apiKey })
  if (!_openai) _openai = new OpenAI({ apiKey: cfg.openaiKey })
  return _openai
}

// ── System prompts ────────────────────────────────────────────────────────────

const CHAT_SYSTEM = `You are CtrlPoint's AI assistant — a friendly, sharp web builder agent.

Your job:
- Chat naturally with users about what they want to build
- Ask ONE clarifying question if you need more info
- When you have enough detail to build the site, output the full HTML immediately
- Keep chat replies short (1-3 sentences max)

When to output HTML (not chat):
- User clearly describes a site/app/page they want built
- User says "build", "create", "make", "generate", "deploy" etc.
- User has given enough detail after a clarifying question

When to chat (not HTML):
- Greetings ("hi", "hello", "hey")
- Vague questions ("what can you do?", "help")
- Feedback/thanks ("looks good", "nice")
- Anything that isn't a build request

OUTPUT FORMAT:
- If chatting: plain text only. No markdown, no code.
- If building: first line must be exactly:
  <!-- META: {"title":"Title here","description":"Description here"} -->
  Then immediately <!DOCTYPE html> on the next line. Nothing else before or after.

HTML RULES (when building):
- All CSS in <style> tag, all JS in <script> before </body>
- NO external dependencies, CDN links, external fonts, or external images
- Use CSS gradients or inline SVG for visuals
- System font stack only
- Must be fully self-contained and work offline
- Modern, responsive, mobile-first design`

const UPDATE_SYSTEM = `You are CtrlPoint's AI web editor. The user has an existing website and wants to change something.

RULES:
- If the message is a clear edit request: output the full updated HTML immediately
- If the message is vague: ask one short clarifying question (plain text, no HTML)
- If chatting/feedback: respond briefly in plain text

When outputting HTML:
- First line: <!-- META: {"title":"Title","description":"Description"} -->
- Then immediately <!DOCTYPE html>
- Keep all existing structure unless asked to change it
- No external dependencies`

// ── Core AI call ──────────────────────────────────────────────────────────────

export interface ChatMessage { role: 'user' | 'assistant'; content: string }

export const OPENAI_REASONING_EFFORTS = [
  { id: 'low', label: 'Low', sub: 'Faster, lower-cost reasoning' },
  { id: 'medium', label: 'Medium', sub: 'Balanced reasoning' },
  { id: 'high', label: 'High', sub: 'Deeper reasoning' },
  { id: 'xhigh', label: 'XHigh', sub: 'Hardest OpenAI tasks' },
] as const

export const CLAUDE_REASONING_EFFORTS = [
  { id: 'low', label: 'Low', sub: 'Most efficient' },
  { id: 'medium', label: 'Medium', sub: 'Balanced token savings' },
  { id: 'high', label: 'High', sub: 'Claude default depth' },
  { id: 'xhigh', label: 'XHigh', sub: 'Long agentic work' },
  { id: 'max', label: 'Max', sub: 'Absolute maximum capability' },
] as const

export const REASONING_EFFORTS = [
  ...OPENAI_REASONING_EFFORTS,
  CLAUDE_REASONING_EFFORTS[4],
] as const
export type ReasoningEffort = typeof REASONING_EFFORTS[number]['id']

export const MODEL_CATALOG = [
  { id: 'gpt-5.5', label: 'GPT-5.5', full: 'GPT-5.5', sub: 'Best GPT for complex builds', provider: 'OpenAI', cost: 3, supportsReasoning: true, reasoningEfforts: ['low', 'medium', 'high', 'xhigh'] },
  { id: 'gpt-5.4', label: 'GPT-5.4', full: 'GPT-5.4', sub: 'Strong GPT at lower cost', provider: 'OpenAI', cost: 2, supportsReasoning: true, reasoningEfforts: ['low', 'medium', 'high', 'xhigh'] },
  { id: 'gpt-5.4-mini', label: 'GPT-5.4 mini', full: 'GPT-5.4 mini', sub: 'Cheapest GPT option', provider: 'OpenAI', cost: 1, supportsReasoning: true, reasoningEfforts: ['low', 'medium', 'high', 'xhigh'] },
  { id: 'claude-opus-4-7', label: 'Opus 4.7', full: 'Claude Opus 4.7', sub: 'Best Claude for hard work', provider: 'Anthropic', cost: 3, supportsReasoning: true, reasoningEfforts: ['low', 'medium', 'high', 'xhigh', 'max'] },
  { id: 'claude-sonnet-4-6', label: 'Sonnet 4.6', full: 'Claude Sonnet 4.6', sub: 'Balanced Claude option', provider: 'Anthropic', cost: 2, supportsReasoning: true, reasoningEfforts: ['low', 'medium', 'high', 'max'] },
] as const

const ALLOWED_MODELS = MODEL_CATALOG.map(m => m.id)
export type AllowedModel = typeof ALLOWED_MODELS[number]

export function isAllowedModel(m: unknown): m is AllowedModel {
  return typeof m === 'string' && (ALLOWED_MODELS as readonly string[]).includes(m)
}

export function isReasoningEffort(value: unknown): value is ReasoningEffort {
  return typeof value === 'string' && (REASONING_EFFORTS as readonly { id: string }[]).some(effort => effort.id === value)
}

export interface UserKeys {
  openaiKey?: string
  anthropicKey?: string
}

function supportsReasoning(model: string): boolean {
  return MODEL_CATALOG.some(option => option.id === model && option.supportsReasoning)
}

function modelAllowsReasoningEffort(model: string, reasoningEffort?: ReasoningEffort): reasoningEffort is ReasoningEffort {
  if (!reasoningEffort) return false
  const option = MODEL_CATALOG.find(option => option.id === model)
  return !!option?.supportsReasoning && (option.reasoningEfforts as readonly string[]).includes(reasoningEffort)
}

function logAiKeySource(provider: 'openai' | 'anthropic', model: string, usingUserKey: boolean, reasoningEffort?: ReasoningEffort) {
  console.info('[AI] request', {
    provider,
    model,
    keySource: usingUserKey ? 'user' : 'platform',
    reasoningEffort: reasoningEffort ?? 'none',
  })
}

function classifyApiError(err: any, usingUserKey: boolean, provider: 'openai' | 'anthropic'): never {
  const status = err?.status ?? err?.statusCode ?? err?.error?.status
  const code = err?.code ?? err?.error?.code ?? err?.error?.type
  const msg: string = err?.message ?? ''
  const isUserKey = usingUserKey
  const providerName = provider === 'openai' ? 'OpenAI' : 'Anthropic'

  if (status === 401 || code === 'invalid_api_key' || code === 'authentication_error') {
    throw new AppError(isUserKey ? 401 : 503, isUserKey
      ? `Your ${providerName} API key is invalid or has been revoked. Update it in API Keys settings.`
      : `Platform AI key misconfigured. Please contact support.`)
  }
  if (status === 429 || code === 'insufficient_quota' || code === 'rate_limit_exceeded' || msg.includes('quota') || msg.includes('credits')) {
    throw new AppError(isUserKey ? 402 : 429, isUserKey
      ? `Your ${providerName} API key has run out of credits. Top up your account or remove the key to use platform credits.`
      : `Platform AI rate limit reached. Please try again in a moment.`)
  }
  if (status === 400 || status === 404 || code === 'model_not_found' || msg.includes('model')) {
    const modelName = err?.error?.message?.match(/model `([^`]+)`/)?.[1] || err?.param || 'selected model'
    throw new AppError(400, isUserKey
      ? `${modelName} is not available for your ${providerName} API key. This usually means the key's project or organization does not have access to that model yet, or your API account is below the required paid usage tier. Choose another model or check model access in your ${providerName} dashboard.`
      : `${modelName} is not available on the platform ${providerName} account. Choose another model or contact support.`)
  }
  throw err
}

async function callAI(system: string, messages: ChatMessage[], modelOverride?: AllowedModel, userKeys?: UserKeys, reasoningEffort?: ReasoningEffort): Promise<string> {
  const useOpenAI = modelOverride
    ? modelOverride.startsWith('gpt-')
    : cfg.aiProvider === 'openai'
  const model = modelOverride ?? (useOpenAI ? cfg.openaiModel : cfg.anthropicModel)
  const effectiveReasoningEffort = modelAllowsReasoningEffort(model, reasoningEffort) ? reasoningEffort : undefined

  if (useOpenAI) {
    try {
      logAiKeySource('openai', model, !!userKeys?.openaiKey, effectiveReasoningEffort)
      const res = await openai(userKeys?.openaiKey).chat.completions.create({
        model,
        max_completion_tokens: 8192,
        ...(effectiveReasoningEffort ? { reasoning_effort: effectiveReasoningEffort as any } : {}),
        messages: [{ role: 'system', content: system }, ...messages],
      })
      return res.choices[0]?.message?.content ?? ''
    } catch (err: any) {
      return classifyApiError(err, !!userKeys?.openaiKey, 'openai')
    }
  } else {
    try {
      logAiKeySource('anthropic', model, !!userKeys?.anthropicKey, effectiveReasoningEffort)
      const msg = await anthropic(userKeys?.anthropicKey).messages.create({
        model,
        max_tokens: effectiveReasoningEffort === 'xhigh' || effectiveReasoningEffort === 'max' ? 64000 : 8192,
        ...(effectiveReasoningEffort ? {
          thinking: { type: 'adaptive' as const },
          output_config: { effort: effectiveReasoningEffort },
        } : {}),
        system,
        messages,
      } as any)
      const text = msg.content.find(block => block.type === 'text')
      return text?.type === 'text' ? text.text : ''
    } catch (err: any) {
      return classifyApiError(err, !!userKeys?.anthropicKey, 'anthropic')
    }
  }
}

// ── Response parsing ──────────────────────────────────────────────────────────

export interface AIResponse {
  type: 'chat' | 'site'
  text?: string        // for chat replies
  html?: string        // for site generation
  title?: string
  description?: string
}

function parseResponse(raw: string): AIResponse {
  const trimmed = raw.trim()

  // Find HTML anywhere in the response (AI sometimes adds preamble text)
  const doctypeIdx = trimmed.indexOf('<!DOCTYPE')
  const metaIdx = trimmed.indexOf('<!-- META:')
  const htmlStart = metaIdx !== -1 ? Math.min(metaIdx, doctypeIdx === -1 ? Infinity : doctypeIdx)
    : doctypeIdx

  if (htmlStart !== -1 && htmlStart !== Infinity) {
    const htmlBlock = trimmed.slice(htmlStart)
    const metaMatch = htmlBlock.match(/<!--\s*META:\s*(\{[^}]+\})\s*-->/)
    let title = 'My Site'
    let description = ''
    if (metaMatch) {
      try {
        const meta = JSON.parse(metaMatch[1])
        title = (meta.title || 'My Site').slice(0, 50)
        description = (meta.description || '').slice(0, 250)
      } catch {}
    }
    const html = htmlBlock.replace(/<!--\s*META:\s*\{[^}]+\}\s*-->\n?/, '').trim()

    if (!html.includes('<!DOCTYPE html>') || !html.includes('</html>')) {
      return { type: 'chat', text: 'I had trouble generating the site. Could you describe what you want in more detail?' }
    }

    return { type: 'site', html, title, description }
  }

  return { type: 'chat', text: trimmed }
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function chat(history: ChatMessage[], model?: AllowedModel, userKeys?: UserKeys, reasoningEffort?: ReasoningEffort): Promise<AIResponse> {
  const raw = await callAI(CHAT_SYSTEM, history, model, userKeys, reasoningEffort)
  return parseResponse(raw)
}

export async function updateSiteChat(existingCode: string, history: ChatMessage[], model?: AllowedModel, userKeys?: UserKeys, reasoningEffort?: ReasoningEffort): Promise<AIResponse> {
  const systemWithCode = UPDATE_SYSTEM + `\n\nCURRENT SITE CODE:\n${existingCode}`
  const raw = await callAI(systemWithCode, history, model, userKeys, reasoningEffort)
  return parseResponse(raw)
}

export function activeProvider(): string {
  return cfg.aiProvider === 'openai' ? 'gpt-4o' : 'claude-sonnet-4-6'
}

// Legacy exports kept for compatibility
export async function generateSite(prompt: string): Promise<GenerateResult> {
  const res = await chat([{ role: 'user', content: prompt }])
  if (res.type === 'site') return { html: res.html!, title: res.title!, description: res.description! }
  throw new Error(res.text || 'Could not generate site from that prompt.')
}

export async function updateSite(existingCode: string, changeRequest: string): Promise<GenerateResult> {
  const res = await updateSiteChat(existingCode, [{ role: 'user', content: changeRequest }])
  if (res.type === 'site') return { html: res.html!, title: res.title!, description: res.description! }
  throw new Error(res.text || 'Could not apply changes.')
}
