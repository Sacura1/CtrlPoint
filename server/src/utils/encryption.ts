import crypto from 'crypto'
import { cfg } from '../config'

export function encrypt(text: string): { encryptedKey: string; iv: string } {
  const iv = crypto.randomBytes(12)
  const key = Buffer.from(cfg.encryptionKey, 'hex')
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return {
    encryptedKey: Buffer.concat([encrypted, tag]).toString('base64'),
    iv: iv.toString('base64'),
  }
}

export function decrypt(encryptedKey: string, iv: string): string {
  const key = Buffer.from(cfg.encryptionKey, 'hex')
  const ivBuf = Buffer.from(iv, 'base64')
  const encBuf = Buffer.from(encryptedKey, 'base64')
  const tag = encBuf.slice(-16)
  const data = encBuf.slice(0, -16)
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, ivBuf)
  decipher.setAuthTag(tag)
  return decipher.update(data) + decipher.final('utf8')
}
