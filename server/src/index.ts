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
import { startDeployWorker } from './services/deployWorker'
import { CLAUDE_REASONING_EFFORTS, MODEL_CATALOG, OPENAI_REASONING_EFFORTS } from './services/ai'

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
app.use('/api/github/webhook', express.raw({ type: 'application/json' }))
app.use(express.json({ limit: '10mb' }))

// API routes
app.get('/api/config', (_, res) => {
  res.json({
    enableModelSelection: cfg.enableModelSelection,
    activeModel: cfg.aiProvider === 'openai' ? cfg.openaiModel : cfg.anthropicModel,
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

// Health check
app.get('/api/health', (_, res) => res.json({ ok: true, env: cfg.nodeEnv }))

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
})

export default app
