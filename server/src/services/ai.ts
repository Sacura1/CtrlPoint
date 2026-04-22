import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'
import { cfg } from '../config'
import { GenerateResult } from '../types'

let _anthropic: Anthropic | null = null
let _openai: OpenAI | null = null

function anthropic() {
  if (!_anthropic) _anthropic = new Anthropic({ apiKey: cfg.anthropicKey })
  return _anthropic
}
function openai() {
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

async function callAI(system: string, messages: ChatMessage[]): Promise<string> {
  if (cfg.aiProvider === 'openai') {
    const res = await openai().chat.completions.create({
      model: cfg.openaiModel,
      max_tokens: 8192,
      messages: [{ role: 'system', content: system }, ...messages],
    })
    return res.choices[0]?.message?.content ?? ''
  } else {
    const msg = await anthropic().messages.create({
      model: cfg.anthropicModel,
      max_tokens: 8192,
      system,
      messages,
    })
    return msg.content[0].type === 'text' ? msg.content[0].text : ''
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

export async function chat(history: ChatMessage[]): Promise<AIResponse> {
  const raw = await callAI(CHAT_SYSTEM, history)
  return parseResponse(raw)
}

export async function updateSiteChat(existingCode: string, history: ChatMessage[]): Promise<AIResponse> {
  const systemWithCode = UPDATE_SYSTEM + `\n\nCURRENT SITE CODE:\n${existingCode}`
  const raw = await callAI(systemWithCode, history)
  return parseResponse(raw)
}

export function activeProvider(): string {
  return cfg.aiProvider === 'openai' ? 'gpt-4o-mini' : 'claude-sonnet-4-6'
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
