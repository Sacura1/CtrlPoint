import crypto from 'crypto'

const KEY_PREFIX = 'cp_agent_'

export function hashAgentKey(key: string): string {
  return crypto.createHash('sha256').update(key).digest('hex')
}

export function createAgentKey(): { key: string; keyHash: string; keyPrefix: string } {
  const token = crypto.randomBytes(32).toString('base64url')
  const key = `${KEY_PREFIX}${token}`
  return {
    key,
    keyHash: hashAgentKey(key),
    keyPrefix: key.slice(0, 18),
  }
}

export function readAgentKeyHeader(req: { headers: Record<string, string | string[] | undefined> }): string | null {
  const explicit = req.headers['x-ctrlpoint-agent-key']
  if (typeof explicit === 'string' && explicit.trim()) return explicit.trim()

  const auth = req.headers.authorization
  if (typeof auth === 'string') {
    const match = auth.match(/^Bearer\s+(.+)$/i)
    if (match?.[1]?.trim()) return match[1].trim()
  }

  return null
}
