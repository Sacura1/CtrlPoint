import { Router } from 'express'
import { activeMobileTemplates } from '../data/mobileTemplates'

const router = Router()

router.get('/mobile', (_req, res) => {
  res.json({ templates: activeMobileTemplates() })
})

export default router
