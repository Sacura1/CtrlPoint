import dotenv from 'dotenv'
import path from 'path'
import fs from 'fs'
dotenv.config({ path: path.resolve(__dirname, '../.env'), override: false }) // never override env vars already set by the host
import express from 'express'
import cookieParser from 'cookie-parser'
import cors from 'cors'
import { cfg, validateConfig } from './config'
import { errorHandler } from './middleware/errorHandler'
import authRoutes from './routes/auth'
import generateRoutes from './routes/generate'
import sitesRoutes from './routes/sites'
import deployRoutes from './routes/deploy'
import billingRoutes from './routes/billing'
import keysRoutes from './routes/keys'
import uploadRoutes from './routes/upload'
import githubRoutes from './routes/github'
import agentRoutes from './routes/agent'
import customDomainRoutes from './routes/customDomains'
import arcDappRoutes from './routes/arcDapps'
import supportRoutes from './routes/support'
import adminRoutes from './routes/admin'
import notificationRoutes from './routes/notifications'
import templateRoutes from './routes/templates'
import { startDeployWorker } from './services/deployWorker'
import { CLAUDE_REASONING_EFFORTS, MODEL_CATALOG, OPENAI_REASONING_EFFORTS, isAllowedModel } from './services/ai'
import { checkProviderHealth, getProviderHealth, startProviderMonitor } from './services/providerMonitor'
import { startCustomDomainMonitor } from './services/customDomainMonitor'
import { startPushReminderWorker } from './services/pushNotifications'
import { startArcBuildWorker } from './services/arcBuildWorker'

validateConfig()

const app = express()

const allowedOriginSet = new Set(cfg.allowedOrigins.map(origin => origin.replace(/\/+$/, '')))

app.use(cors({
  credentials: true,
  origin(origin, callback) {
    if (!origin) return callback(null, true)
    const normalizedOrigin = origin.replace(/\/+$/, '')
    if (allowedOriginSet.has(normalizedOrigin)) return callback(null, true)
    return callback(new Error(`Origin ${origin} not allowed by CORS`))
  },
}))
app.use((_, res, next) => {
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups')
  next()
})
app.use(cookieParser())

// Raw body for webhook signature verification
app.use('/api/billing/webhook', express.raw({ type: 'application/json' }))
app.use('/api/billing/polar/webhook', express.raw({ type: 'application/json' }))
app.use('/api/github/webhook', express.raw({ type: 'application/json' }))
app.use(express.json({ limit: '10mb' }))

// API routes
app.get('/api/config', (_, res) => {
  const configuredModel = cfg.aiProvider === 'openai' ? cfg.openaiModel : cfg.anthropicModel
  res.json({
    enableModelSelection: cfg.enableModelSelection,
    activeModel: isAllowedModel(configuredModel) ? configuredModel : MODEL_CATALOG[0].id,
    models: MODEL_CATALOG,
    reasoningEfforts: {
      openai: OPENAI_REASONING_EFFORTS,
      anthropic: CLAUDE_REASONING_EFFORTS,
    },
  })
})
app.use('/api/auth', authRoutes)
app.use('/api/generate', generateRoutes)
app.use('/api/sites', sitesRoutes)
app.use('/api/deploy', deployRoutes)
app.use('/api/billing', billingRoutes)
app.use('/api/keys', keysRoutes)
app.use('/api/upload', uploadRoutes)
app.use('/api/github', githubRoutes)
app.use('/api/agent', agentRoutes)
app.use('/api/custom-domains', customDomainRoutes)
if (cfg.enableArcBuilder) {
  app.use('/api/arc-dapps', arcDappRoutes)
  app.use('/api/arc', arcDappRoutes)
} else {
  app.use(['/api/arc-dapps', '/api/arc'], (_, res) => {
    res.status(404).json({ error: 'Arc builder is paused.' })
  })
}
app.use('/api/support', supportRoutes)
app.use('/api/notifications', notificationRoutes)
app.use('/api/templates', templateRoutes)
app.use('/api/admin', adminRoutes)

// Health check
app.get('/api/health', (_, res) => res.json({ ok: true, env: cfg.nodeEnv }))
app.get('/api/health/provider', async (req, res) => {
  const fresh = req.query.fresh === 'true'
  const health = fresh ? await checkProviderHealth() : getProviderHealth()
  res.status(health.ok ? 200 : 503).json(health)
})

// Serve React build in production
if (cfg.nodeEnv === 'production') {
  const clientBuild = path.join(__dirname, '../../client/dist')
  const clientIndex = path.join(clientBuild, 'index.html')
  if (fs.existsSync(clientIndex)) {
    app.use(express.static(clientBuild))
    app.get('*', (_, res) => res.sendFile(clientIndex))
  }
}

app.use(errorHandler)

app.listen(cfg.port, () => {
  console.log(`CtrlPoint server running on port ${cfg.port} [${cfg.nodeEnv}]`)
  startDeployWorker()
  startProviderMonitor()
  startCustomDomainMonitor()
  startPushReminderWorker()
  if (cfg.enableArcBuilder) startArcBuildWorker()
})

export default app
