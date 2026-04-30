import { Router, Response } from 'express'
import multer from 'multer'
import AdmZip from 'adm-zip'
import path from 'path'
import { requireAuth } from '../middleware/auth'
import { AppError } from '../middleware/errorHandler'
import { AuthRequest } from '../types'

const router = Router()

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 }, // 25MB
  fileFilter(_, file, cb) {
    const ok = file.originalname.endsWith('.html') || file.originalname.endsWith('.zip')
    cb(ok ? null : new Error('Only .html and .zip files are supported.') as any, ok)
  },
})

function parseTitle(html: string): string {
  const m = html.match(/<title[^>]*>([^<]+)<\/title>/i)
  return m ? m[1].trim().slice(0, 80) : 'Uploaded Site'
}

// True framework files that need a build step — can't be inlined
function needsBuild(filename: string): boolean {
  return /\.(jsx|tsx|vue|svelte|ts)$/.test(filename) && !filename.endsWith('.d.ts')
}

// Build a flat map of entryName → Buffer from zip entries, stripping a common root folder if present
function buildFileMap(zip: AdmZip): Record<string, Buffer> {
  const entries = zip.getEntries().filter(e => !e.isDirectory)
  const map: Record<string, Buffer> = {}

  // Detect common root prefix (e.g. all entries start with "dist/")
  const names = entries.map(e => e.entryName)
  const firstSlash = names[0]?.indexOf('/')
  const prefix = firstSlash && firstSlash > 0 ? names[0].slice(0, firstSlash + 1) : ''
  const hasCommonRoot = prefix && names.every(n => n.startsWith(prefix))

  for (const entry of entries) {
    const key = hasCommonRoot ? entry.entryName.slice(prefix.length) : entry.entryName
    if (key) map[key] = entry.getData()
  }
  return map
}

// Inline CSS and JS references into the HTML to produce a single self-contained file
function inlineAssets(html: string, files: Record<string, Buffer>, baseDir: string): string {
  // Inline <link rel="stylesheet" href="...">
  html = html.replace(/<link[^>]+rel=["']stylesheet["'][^>]*href=["']([^"']+)["'][^>]*\/?>/gi, (match, href) => {
    if (href.startsWith('http') || href.startsWith('//') || href.startsWith('data:')) return match
    const filePath = path.posix.join(baseDir, href).replace(/^\//, '')
    const content = files[filePath] ?? files[href.replace(/^\//, '')]
    if (!content) return match
    return `<style>${content.toString('utf8')}</style>`
  })

  // Also handle <link href="..." rel="stylesheet"> (href before rel)
  html = html.replace(/<link[^>]+href=["']([^"']+)["'][^>]*rel=["']stylesheet["'][^>]*\/?>/gi, (match, href) => {
    if (href.startsWith('http') || href.startsWith('//') || href.startsWith('data:')) return match
    const filePath = path.posix.join(baseDir, href).replace(/^\//, '')
    const content = files[filePath] ?? files[href.replace(/^\//, '')]
    if (!content) return match
    return `<style>${content.toString('utf8')}</style>`
  })

  // Inline <script src="...">
  html = html.replace(/<script([^>]*)\bsrc=["']([^"']+)["']([^>]*)><\/script>/gi, (match, before, src, after) => {
    if (src.startsWith('http') || src.startsWith('//') || src.startsWith('data:')) return match
    const filePath = path.posix.join(baseDir, src).replace(/^\//, '')
    const content = files[filePath] ?? files[src.replace(/^\//, '')]
    if (!content) return match
    // Preserve type attribute if present
    const typeMatch = (before + after).match(/type=["']([^"']+)["']/)
    const typeAttr = typeMatch ? ` type="${typeMatch[1]}"` : ''
    return `<script${typeAttr}>${content.toString('utf8')}</script>`
  })

  return html
}

router.post('/', requireAuth, upload.single('file'), async (req: AuthRequest, res: Response, next) => {
  try {
    if (!req.file) throw new AppError(400, 'No file uploaded.')

    const { originalname, buffer, mimetype } = req.file

    // ── Single HTML file ──────────────────────────────────────────────────────
    if (originalname.endsWith('.html') || mimetype === 'text/html') {
      const html = buffer.toString('utf8')
      if (!html.includes('<!DOCTYPE') && !html.includes('<html'))
        throw new AppError(400, 'File does not appear to be a valid HTML document.')
      return res.json({ html, title: parseTitle(html), multiFile: false })
    }

    // ── Zip file ──────────────────────────────────────────────────────────────
    if (originalname.endsWith('.zip')) {
      let zip: AdmZip
      try { zip = new AdmZip(buffer) } catch {
        throw new AppError(400, 'Could not read zip file. Make sure it is a valid zip archive.')
      }

      const files = buildFileMap(zip)
      const fileNames = Object.keys(files)

      // Reject if it needs a build step
      const frameworkFile = fileNames.find(needsBuild)
      if (frameworkFile) {
        return res.json({
          multiFile: true,
          message: 'This project needs a build step (React, Vue, etc.). Use "Deploy a GitHub Repo" instead — connect your repo and we\'ll build and deploy it automatically on every push.',
        })
      }

      // Find index.html
      const indexKey = fileNames.find(n => n === 'index.html' || n.endsWith('/index.html') && n.split('/').length === 2)
        ?? fileNames.find(n => n.toLowerCase().endsWith('index.html'))
      if (!indexKey) throw new AppError(400, 'No index.html found in zip. Make sure your zip contains index.html at the root.')

      const baseDir = path.posix.dirname(indexKey)
      let html = files[indexKey].toString('utf8')

      // Inline CSS/JS assets so it deploys as a single self-contained file
      const hasCssOrJs = fileNames.some(n => /\.(css|js)$/.test(n))
      if (hasCssOrJs) {
        html = inlineAssets(html, files, baseDir)
      }

      return res.json({ html, title: parseTitle(html), multiFile: false })
    }

    throw new AppError(400, 'Unsupported file type. Upload a .html or .zip file.')
  } catch (err) { next(err) }
})

export default router
