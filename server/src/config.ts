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

function uniqueOrigins(origins: string[]): string[] {
  const seen = new Set<string>()
  return origins.filter(origin => {
    const normalized = normalizeOrigin(origin)
    if (!normalized || seen.has(normalized)) return false
    seen.add(normalized)
    return true
  })
}

function parseCsv(raw: string | undefined): string[] {
  if (!raw) return []
  return raw.split(',').map(v => v.trim()).filter(Boolean)
}

const explicitClientUrl = process.env.CLIENT_URL ? normalizeOrigin(process.env.CLIENT_URL) : ''
const extraClientOrigins = parseOrigins(process.env.CLIENT_URLS, [])
const allowedOrigins = uniqueOrigins([
  ...(explicitClientUrl ? [explicitClientUrl] : []),
  ...extraClientOrigins,
  ...defaultClientOrigins,
])
const mnsPublicDomain = normalizeHost(process.env.MNS_PUBLIC_DOMAIN || 'massahub.network')
const adminEmails = parseCsv(process.env.ADMIN_EMAILS).map(email => email.toLowerCase())

export const cfg = {
  port: parseInt(process.env.PORT || (process.env.NODE_ENV === 'production' ? '8000' : '3001')),
  jwtSecret: process.env.JWT_SECRET || 'dev-secret-change-in-prod',
  jwtExpiresIn: '7d',

  googleClientId: process.env.GOOGLE_CLIENT_ID || '',
  resendApiKey: process.env.RESEND_API_KEY || '',
  resendFromEmail: process.env.RESEND_FROM_EMAIL || 'CtrlPoint <onboarding@resend.dev>',

  // AI provider: 'anthropic' uses Claude, 'openai' uses GPT
  aiProvider: (process.env.AI_PROVIDER || 'anthropic') as 'anthropic' | 'openai',
  anthropicKey: process.env.ANTHROPIC_API_KEY || '',
  anthropicModel: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6',
  openaiKey: process.env.OPENAI_API_KEY || '',
  openaiModel: process.env.OPENAI_MODEL || 'gpt-5.4-mini',

  massaNodeUrl: process.env.MASSA_NODE_URL || 'https://mainnet.massa.net/api/v2',
  massaSecretKey: process.env.MASSA_PLATFORM_SECRET_KEY || '',
  massaNetwork: (process.env.MASSA_NETWORK || 'mainnet') as 'mainnet' | 'buildnet',
  mnsMasUsdPrice: parseFloat(process.env.MNS_MAS_USD_PRICE || '0.0033'),
  mnsCreditUsdValue: parseFloat(process.env.MNS_CREDIT_USD_VALUE || '0.25'),
  mnsCreditMarginMultiplier: parseFloat(process.env.MNS_CREDIT_MARGIN_MULTIPLIER || '2'),

  stripeSecretKey: process.env.STRIPE_SECRET_KEY || '',
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET || '',
  billingProvider: (process.env.BILLING_PROVIDER || (process.env.POLAR_ACCESS_TOKEN ? 'polar' : 'stripe')) as 'polar' | 'stripe',
  polarAccessToken: process.env.POLAR_ACCESS_TOKEN || '',
  polarWebhookSecret: process.env.POLAR_WEBHOOK_SECRET || '',
  polarEnvironment: (process.env.POLAR_ENVIRONMENT || 'production') as 'production' | 'sandbox',
  polarProducts: {
    launch: process.env.POLAR_LAUNCH_PRODUCT_ID || '',
    starter: process.env.POLAR_STARTER_PRODUCT_ID || '',
    builder: process.env.POLAR_BUILDER_PRODUCT_ID || '',
    pro: process.env.POLAR_PRO_PRODUCT_ID || '',
    studio: process.env.POLAR_STUDIO_PRODUCT_ID || '',
  },
  googlePlayPackageName: process.env.GOOGLE_PLAY_PACKAGE_NAME || 'dev.ctrlpoint.app',
  googlePlayServiceAccountJson: process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON || '',
  googlePlayServiceAccountFile: process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_FILE || '',
  googlePlayProducts: {
    launch: process.env.GOOGLE_PLAY_LAUNCH_PRODUCT_ID || 'credits_launch',
    starter: process.env.GOOGLE_PLAY_STARTER_PRODUCT_ID || 'credits_starter',
    builder: process.env.GOOGLE_PLAY_BUILDER_PRODUCT_ID || 'credits_builder',
    pro: process.env.GOOGLE_PLAY_PRO_PRODUCT_ID || 'credits_pro',
    studio: process.env.GOOGLE_PLAY_STUDIO_PRODUCT_ID || 'credits_studio',
  },

  clientUrl: explicitClientUrl || allowedOrigins[0],
  apiPublicUrl: process.env.API_PUBLIC_URL || '',
  allowedOrigins,
  mnsPublicDomain: mnsPublicDomain || 'massahub.network',
  dewebProviderHealthUrl: process.env.DEWEB_PROVIDER_HEALTH_URL || `https://${mnsPublicDomain || 'massahub.network'}/__deweb_info`,
  dewebProviderHealthPollMs: parseInt(process.env.DEWEB_PROVIDER_HEALTH_POLL_MS || '60000'),
  dewebProviderHealthTimeoutMs: parseInt(process.env.DEWEB_PROVIDER_HEALTH_TIMEOUT_MS || '5000'),
  customDomainCnameTarget: normalizeHost(process.env.CUSTOM_DOMAIN_CNAME_TARGET || (mnsPublicDomain || 'massahub.network')),
  customDomainARecords: parseCsv(process.env.CUSTOM_DOMAIN_A_RECORDS),
  customDomainMonitorPollMs: parseInt(process.env.CUSTOM_DOMAIN_MONITOR_POLL_MS || '600000'),
  customDomainMonitorIdlePollMs: parseInt(process.env.CUSTOM_DOMAIN_MONITOR_IDLE_POLL_MS || '86400000'),
  customDomainMonitorActivePollMs: parseInt(process.env.CUSTOM_DOMAIN_MONITOR_ACTIVE_POLL_MS || '259200000'),
  customDomainMonitorBatchSize: parseInt(process.env.CUSTOM_DOMAIN_MONITOR_BATCH_SIZE || '10'),
  customDomainRouteCacheMs: parseInt(process.env.CUSTOM_DOMAIN_ROUTE_CACHE_MS || '300000'),
  adminEmails,
  adminAlertWebhookUrl: process.env.ADMIN_ALERT_WEBHOOK_URL || '',
  nodeEnv: process.env.NODE_ENV || 'development',

  arc: {
    rpcUrl: process.env.ARC_RPC_URL || 'https://rpc.testnet.arc.network',
    chainId: parseInt(process.env.ARC_CHAIN_ID || '5042002'),
    explorerUrl: (process.env.ARC_EXPLORER_URL || 'https://testnet.arcscan.app').replace(/\/+$/, ''),
    deployerPrivateKey: process.env.ARC_DEPLOYER_PRIVATE_KEY || '',
    agentLedgerAddress: process.env.ARC_AGENT_LEDGER_CONTRACT_ADDRESS || '',
  },

  // AES-256-GCM key for encrypting user API keys (32-byte hex string)
  encryptionKey: process.env.ENCRYPTION_KEY || 'dev00000000000000000000000000000000000000000000000000000000000000',

  // GitHub OAuth App
  githubClientId: process.env.GITHUB_CLIENT_ID || '',
  githubClientSecret: process.env.GITHUB_CLIENT_SECRET || '',
  githubWebhookSecret: process.env.GITHUB_WEBHOOK_SECRET || '',
  // GitHub App (selected-repository access for deploys)
  githubAppName: process.env.GITHUB_APP_NAME || '',
  githubAppId: process.env.GITHUB_APP_ID || '',
  githubAppPrivateKey: (process.env.GITHUB_APP_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
  // Callback URL must match exactly what's registered in the GitHub OAuth App
  // Dev: http://localhost:3001/api/github/callback  |  Prod: https://ctrlpoint.dev/api/github/callback
  githubCallbackUrl: process.env.GITHUB_CALLBACK_URL || 'http://localhost:3001/api/github/callback',
  githubAppSetupUrl: process.env.GITHUB_APP_SETUP_URL || 'http://localhost:3001/api/github/setup',

  // Feature flags
  enableModelSelection: process.env.ENABLE_MODEL_SELECTION === 'true',
  enableArcBuilder: process.env.ENABLE_ARC_BUILDER === 'true',
  enableDeployWorker: process.env.ENABLE_DEPLOY_WORKER !== 'false',
  deployWorkerPollMs: parseInt(process.env.DEPLOY_WORKER_POLL_MS || '3000'),
  deployWorkerIdlePollMs: parseInt(process.env.DEPLOY_WORKER_IDLE_POLL_MS || '86400000'),
  deployWorkerStaticConcurrency: parseInt(process.env.DEPLOY_WORKER_STATIC_CONCURRENCY || '3'),
  deployWorkerFrameworkConcurrency: parseInt(process.env.DEPLOY_WORKER_FRAMEWORK_CONCURRENCY || '1'),

  // Circle Gateway / x402 payments for agent-facing deploy endpoints
  circleX402Enabled: process.env.CIRCLE_X402_ENABLED === 'true',
  circleX402SellerAddress: process.env.CIRCLE_X402_SELLER_ADDRESS || '',
  circleX402FacilitatorUrl: process.env.CIRCLE_X402_FACILITATOR_URL || (
    process.env.CIRCLE_X402_ENVIRONMENT === 'testnet'
      ? 'https://gateway-api-testnet.circle.com'
      : 'https://gateway-api.circle.com'
  ),
  circleX402Networks: parseCsv(process.env.CIRCLE_X402_NETWORKS),
  circleX402Prices: {
    staticDeploy: process.env.CIRCLE_X402_STATIC_DEPLOY_PRICE || '$0.01',
    frameworkDeploy: process.env.CIRCLE_X402_FRAMEWORK_DEPLOY_PRICE || '$0.01',
    staticUpdate: process.env.CIRCLE_X402_STATIC_UPDATE_PRICE || '$0.001',
    frameworkUpdate: process.env.CIRCLE_X402_FRAMEWORK_UPDATE_PRICE || '$0.001',
  },

  // Credits cost per action
  credits: {
    deploy: 0,
    update: 0,
    generate: 1,
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

  if (cfg.nodeEnv === 'production' && !/^[a-f0-9]{64}$/i.test(cfg.encryptionKey)) {
    throw new Error('ENCRYPTION_KEY must be a 32-byte hex string. Generate one with: openssl rand -hex 32')
  }

  if (cfg.circleX402Enabled && !cfg.circleX402SellerAddress) {
    throw new Error('CIRCLE_X402_SELLER_ADDRESS is required when CIRCLE_X402_ENABLED=true')
  }
}
