import { spawn } from 'child_process'
import fs from 'fs/promises'
import path from 'path'
import os from 'os'
import { cfg } from '../config'

const DEWEB_CLI = path.resolve(__dirname, '../../node_modules/@massalabs/deweb-cli/bin/index.js')
const NODE_URL = cfg.massaNodeUrl

export interface UploadResult {
  scAddress: string
}

function runDewebCli(args: string[], env: NodeJS.ProcessEnv): Promise<string> {
  return new Promise((resolve, reject) => {
    console.log(`[deweb-cli] node ${DEWEB_CLI} ${args.join(' ')}`)

    const proc = spawn('node', [DEWEB_CLI, ...args], {
      env: { ...process.env, ...env },
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
    await fs.writeFile(path.join(tmpDir, 'index.html'), html, 'utf-8')

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
