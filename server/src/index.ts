import 'dotenv/config'
import express from 'express'
import cookieParser from 'cookie-parser'
import cors from 'cors'
import path from 'path'
import { cfg, validateConfig } from './config'
import { errorHandler } from './middleware/errorHandler'
import authRoutes from './routes/auth'
import generateRoutes from './routes/generate'
import sitesRoutes from './routes/sites'
import deployRoutes from './routes/deploy'
import billingRoutes from './routes/billing'

validateConfig()

const app = express()

app.use(cors({ origin: cfg.clientUrl, credentials: true }))
app.use((_, res, next) => {
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups')
  next()
})
app.use(cookieParser())

// Raw body for Stripe webhook
app.use('/api/billing/webhook', express.raw({ type: 'application/json' }))
app.use(express.json({ limit: '2mb' }))

// API routes
app.use('/api/auth', authRoutes)
app.use('/api/generate', generateRoutes)
app.use('/api/sites', sitesRoutes)
app.use('/api/deploy', deployRoutes)
app.use('/api/billing', billingRoutes)

// Health check
app.get('/api/health', (_, res) => res.json({ ok: true, env: cfg.nodeEnv }))

// Serve React build in production
if (cfg.nodeEnv === 'production') {
  const clientBuild = path.join(__dirname, '../../client/dist')
  app.use(express.static(clientBuild))
  app.get('*', (_, res) => res.sendFile(path.join(clientBuild, 'index.html')))
}

app.use(errorHandler)

app.listen(cfg.port, () => {
  console.log(`CtrlPoint server running on port ${cfg.port} [${cfg.nodeEnv}]`)
})

export default app
