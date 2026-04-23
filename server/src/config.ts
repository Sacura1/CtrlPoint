function normalizeOrigin(origin: string): string {
  return origin.replace(/\/+$/, '').trim()
}

function normalizeHost(value: string): string {
  return value
    .trim()
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '')
}

function parseOrigins(raw: string | undefined, fallback: string[]): string[] {
  if (!raw) return fallback
  const parsed = raw
    .split(',')
    .map(normalizeOrigin)
    .filter(Boolean)
  return parsed.length > 0 ? parsed : fallback
}

const defaultClientOrigins =
  process.env.NODE_ENV === 'production'
    ? ['https://www.ctrlpoint.dev', 'https://ctrlpoint.dev']
    : ['http://localhost:5173']

const allowedOrigins = parseOrigins(process.env.CLIENT_URLS || process.env.CLIENT_URL, defaultClientOrigins)
const mnsPublicDomain = normalizeHost(process.env.MNS_PUBLIC_DOMAIN || 'massahub.network')

export const cfg = {
  port: parseInt(process.env.PORT || (process.env.NODE_ENV === 'production' ? '8000' : '3001')),
  jwtSecret: process.env.JWT_SECRET || 'dev-secret-change-in-prod',
  jwtExpiresIn: '7d',

  googleClientId: process.env.GOOGLE_CLIENT_ID || '',

  // AI provider: 'anthropic' uses Claude (best for code), 'openai' uses GPT-4o
  aiProvider: (process.env.AI_PROVIDER || 'anthropic') as 'anthropic' | 'openai',
  anthropicKey: process.env.ANTHROPIC_API_KEY || '',
  anthropicModel: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6',
  openaiKey: process.env.OPENAI_API_KEY || '',
  openaiModel: process.env.OPENAI_MODEL || 'gpt-4o-mini',

  massaNodeUrl: process.env.MASSA_NODE_URL || 'https://mainnet.massa.net/api/v2',
  massaSecretKey: process.env.MASSA_PLATFORM_SECRET_KEY || '',
  massaNetwork: (process.env.MASSA_NETWORK || 'mainnet') as 'mainnet' | 'buildnet',

  stripeSecretKey: process.env.STRIPE_SECRET_KEY || '',
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET || '',

  clientUrl: allowedOrigins[0],
  allowedOrigins,
  mnsPublicDomain: mnsPublicDomain || 'massahub.network',
  nodeEnv: process.env.NODE_ENV || 'development',

  // Credits cost per action
  credits: {
    deploy: 1,
    update: 1,
    generate: 0,
  },

  // MAS balance threshold to warn admin (in nanoMAS)
  masWarningThreshold: BigInt('1000000000000'), // 1000 MAS
}

export function validateConfig() {
  const aiKey = cfg.aiProvider === 'openai' ? 'OPENAI_API_KEY' : 'ANTHROPIC_API_KEY'
  const required = [aiKey, 'JWT_SECRET', 'MASSA_PLATFORM_SECRET_KEY']
  const missing = required.filter(k => !process.env[k])
  if (missing.length > 0 && cfg.nodeEnv === 'production') {
    throw new Error(`Missing required env vars: ${missing.join(', ')}`)
  }
}
