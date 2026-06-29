import { spawn } from 'child_process'
import fs from 'fs/promises'
import fsSync from 'fs'
import path from 'path'
import os from 'os'
import { cfg } from '../config'

const DEWEB_CLI = path.resolve(__dirname, '../../node_modules/@massalabs/deweb-cli/bin/index.js')
const MASSA_OPERATION_PATCH_CANDIDATES = [
  path.resolve(__dirname, './massaOperationPatch.js'),
  path.resolve(process.cwd(), 'src/services/massaOperationPatch.js'),
]
const MASSA_OPERATION_PATCH = MASSA_OPERATION_PATCH_CANDIDATES.find(candidate => fsSync.existsSync(candidate))
const NODE_URL = cfg.massaNodeUrl

export interface UploadResult {
  scAddress: string
}

const MASSA_BADGE_HIDER_MARKER = 'ctrlpoint-massa-badge-hider'
const MASSA_BADGE_HIDER = `<style id="${MASSA_BADGE_HIDER_MARKER}">#massaBox{display:none!important}</style><script id="${MASSA_BADGE_HIDER_MARKER}-script">try{localStorage.setItem("massaBoxClosed","true")}catch(e){}document.addEventListener("DOMContentLoaded",function(){var e=document.getElementById("massaBox");if(e)e.style.display="none"})</script>`

function hideMassaBadge(html: string): string {
  if (!html || html.includes(MASSA_BADGE_HIDER_MARKER)) return html
  if (/<\/head>/i.test(html)) return html.replace(/<\/head>/i, `${MASSA_BADGE_HIDER}</head>`)
  if (/<html[^>]*>/i.test(html)) return html.replace(/<html[^>]*>/i, match => `${match}<head>${MASSA_BADGE_HIDER}</head>`)
  return `${MASSA_BADGE_HIDER}${html}`
}

function runDewebCli(args: string[], env: NodeJS.ProcessEnv): Promise<string> {
  return new Promise((resolve, reject) => {
    console.log(`[deweb-cli] node ${DEWEB_CLI} ${args.join(' ')}`)

    const proc = spawn('node', [DEWEB_CLI, '--accept_disclaimer', ...args], {
      env: {
        ...process.env,
        MASSA_OPERATION_WAIT_TIMEOUT_MS: process.env.MASSA_OPERATION_WAIT_TIMEOUT_MS || '300000',
        MASSA_OPERATION_WAIT_PERIOD_MS: process.env.MASSA_OPERATION_WAIT_PERIOD_MS || '1000',
        NODE_OPTIONS: [process.env.NODE_OPTIONS, MASSA_OPERATION_PATCH ? `--require ${MASSA_OPERATION_PATCH}` : ''].filter(Boolean).join(' '),
        ...env,
      },
      timeout: 600_000, // 10 min max
    })

    let stdout = ''
    let stderr = ''

    proc.stdout.on('data', (d: Buffer) => {
      const line = d.toString()
      stdout += line
      process.stdout.write(`[deweb-cli] ${line}`)
    })
    proc.stderr.on('data', (d: Buffer) => {
      const line = d.toString()
      stderr += line
      process.stderr.write(`[deweb-cli:err] ${line}`)
    })

    proc.on('close', (code) => {
      console.log(`[deweb-cli] exited with code ${code}`)
      if (code === 0) {
        resolve(stdout)
      } else {
        const msg = stderr.includes('insufficient funds')
          ? 'Platform wallet has insufficient MAS. Please contact support.'
          : stderr.includes('Operation not found')
          ? 'Massa could not confirm the deployment operation after submission. This is usually a network/RPC confirmation issue. Please retry in a few minutes; if it keeps happening, contact support.'
          : stderr.includes('already exists')
          ? 'A site with this address already exists.'
          : `Upload failed: ${stderr.slice(0, 300)}`
        reject(new Error(msg))
      }
    })

    proc.on('error', (err) => {
      reject(new Error(`Failed to start upload process: ${err.message}`))
    })
  })
}

function parseScAddress(output: string): string {
  const match = output.match(/AS[A-Za-z0-9]{50,}/m)
  if (!match) {
    console.log('[deweb-cli] Full stdout for SC address parsing:\n' + output)
    throw new Error('Could not parse smart contract address from deploy output.')
  }
  return match[0]
}

async function ensureSpaFallback(dirPath: string) {
  const indexPath = path.join(dirPath, 'index.html')
  const fallbackPath = path.join(dirPath, '404.html')
  try {
    await fs.access(indexPath)
    await fs.access(fallbackPath)
  } catch (err: any) {
    if (err?.path === fallbackPath) {
      await fs.copyFile(indexPath, fallbackPath)
    }
  }
}

async function injectMassaBadgeHiderIntoDirectory(dirPath: string) {
  const entries = await fs.readdir(dirPath, { withFileTypes: true })
  await Promise.all(entries.map(async entry => {
    const entryPath = path.join(dirPath, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) return
      await injectMassaBadgeHiderIntoDirectory(entryPath)
      return
    }
    if (!entry.isFile() || !entry.name.toLowerCase().endsWith('.html')) return
    const html = await fs.readFile(entryPath, 'utf-8')
    const next = hideMassaBadge(html)
    if (next !== html) await fs.writeFile(entryPath, next, 'utf-8')
  }))
}

const PRUNED_UPLOAD_DIRS = new Set([
  'node_modules',
  '.git',
  '.cache',
  '.turbo',
  '.next',
  '.nuxt',
])

async function pruneUploadDirectory(dirPath: string) {
  const entries = await fs.readdir(dirPath, { withFileTypes: true })
  await Promise.all(entries.map(async entry => {
    const entryPath = path.join(dirPath, entry.name)
    if (entry.isDirectory()) {
      if (PRUNED_UPLOAD_DIRS.has(entry.name)) {
        await fs.rm(entryPath, { recursive: true, force: true })
        return
      }
      await pruneUploadDirectory(entryPath)
      return
    }
    if (!entry.isFile()) return
    if (entry.name.endsWith('.map')) {
      await fs.rm(entryPath, { force: true })
    }
  }))
}

export async function uploadDirectory(
  dirPath: string,
  title: string,
  description: string,
  existingScAddress?: string,
  onProgress?: (step: string) => void
): Promise<UploadResult> {
  // Write metadata config into the directory
  const config = {
    node_url: NODE_URL,
    chunk_size: 64000,
    metadata: {
      title: title.slice(0, 50),
      description: description.slice(0, 250),
      keywords: ['ctrlpoint', 'deweb'],
    },
  }
  await fs.writeFile(path.join(dirPath, 'website.json'), JSON.stringify(config), 'utf-8')
  await ensureSpaFallback(dirPath)
  await pruneUploadDirectory(dirPath)
  await injectMassaBadgeHiderIntoDirectory(dirPath)

  onProgress?.('Uploading to Massa chain...')

  const args = ['upload', dirPath, '--node_url', NODE_URL, '--yes']
  if (existingScAddress) args.push('--address', existingScAddress)

  const output = await runDewebCli(args, { SECRET_KEY: cfg.massaSecretKey })
  return { scAddress: parseScAddress(output) }
}

export async function uploadSite(
  html: string,
  title: string,
  description: string,
  existingScAddress?: string,
  onProgress?: (step: string) => void
): Promise<UploadResult> {
  // Write site to temp directory
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ctrlpoint-'))

  try {
    onProgress?.('Writing site files...')
    await fs.writeFile(path.join(tmpDir, 'index.html'), hideMassaBadge(html), 'utf-8')

    // Write metadata config
    const config = {
      node_url: NODE_URL,
      chunk_size: 64000,
      metadata: {
        title: title.slice(0, 50),
        description: description.slice(0, 250),
        keywords: ['ctrlpoint', 'deweb'],
      },
    }
    await fs.writeFile(path.join(tmpDir, 'website.json'), JSON.stringify(config), 'utf-8')

    onProgress?.('Uploading to Massa chain...')

    const args = ['upload', tmpDir, '--node_url', NODE_URL, '--yes']
    if (existingScAddress) {
      args.push('--address', existingScAddress)
    }

    const env: NodeJS.ProcessEnv = {
      SECRET_KEY: cfg.massaSecretKey,
    }

    const output = await runDewebCli(args, env)
    const scAddress = parseScAddress(output)

    return { scAddress }
  } finally {
    // Always clean up temp dir
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {})
  }
}
