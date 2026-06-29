import { Account, JsonRpcProvider, MNS } from '@massalabs/massa-web3'
import { cfg } from '../config'

export const MIN_SPONSORED_MNS_NAME_LENGTH = 6
const NANO_MAS_PER_MAS = 1_000_000_000n
const MNS_STORAGE_BUFFER_NANO_MAS = 100_000_000n

async function getProvider() {
  const account = await Account.fromPrivateKey(cfg.massaSecretKey)
  return cfg.massaNetwork === 'buildnet'
    ? JsonRpcProvider.buildnet(account)
    : JsonRpcProvider.mainnet(account)
}

// Read-only provider for MNS lookups — uses throwaway account if platform key not set
async function getReadProvider() {
  let account: Account
  try {
    account = await Account.fromPrivateKey(cfg.massaSecretKey)
  } catch {
    account = await Account.generate()
  }
  return cfg.massaNetwork === 'buildnet'
    ? JsonRpcProvider.buildnet(account)
    : JsonRpcProvider.mainnet(account)
}

function validateMnsName(name: string): string | null {
  if (name.length < 2 || name.length > 100) return 'Name must be 2–100 characters.'
  if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(name) && !/^[a-z0-9]$/.test(name))
    return 'Name can only contain lowercase letters, numbers, and hyphens, and cannot start or end with a hyphen.'
  return null
}

export function mnsRegistrationMasCost(name: string): number {
  if (name.length <= 2) return 10_000
  if (name.length === 3) return 1_000
  if (name.length === 4) return 100
  if (name.length === 5) return 10
  return 1
}

export function mnsRegistrationCreditCost(name: string): number {
  if (name.length >= MIN_SPONSORED_MNS_NAME_LENGTH) return 0

  const masUsdPrice = Number.isFinite(cfg.mnsMasUsdPrice) && cfg.mnsMasUsdPrice > 0 ? cfg.mnsMasUsdPrice : 0.0033
  const creditUsdValue = Number.isFinite(cfg.mnsCreditUsdValue) && cfg.mnsCreditUsdValue > 0 ? cfg.mnsCreditUsdValue : 0.25
  const marginMultiplier =
    Number.isFinite(cfg.mnsCreditMarginMultiplier) && cfg.mnsCreditMarginMultiplier > 0
      ? cfg.mnsCreditMarginMultiplier
      : 2

  const usdCost = mnsRegistrationMasCost(name) * masUsdPrice * marginMultiplier
  return Math.max(1, Math.ceil(usdCost / creditUsdValue))
}

export function mnsRegistrationMessage(name: string): string {
  const creditCost = mnsRegistrationCreditCost(name)
  if (creditCost <= 0) return `${MIN_SPONSORED_MNS_NAME_LENGTH}+ character MNS names are free right now.`
  return `Short MNS names cost ${creditCost.toLocaleString()} credit${creditCost === 1 ? '' : 's'}. ${MIN_SPONSORED_MNS_NAME_LENGTH}+ character names stay free.`
}

export async function checkMnsAvailable(name: string): Promise<boolean> {
  const validationError = validateMnsName(name)
  if (validationError) throw new Error(validationError)

  console.log(`[mns] Checking availability of "${name}" on ${cfg.massaNetwork}...`)
  const provider = await getReadProvider()
  const mns = await (cfg.massaNetwork === 'buildnet' ? MNS.buildnet(provider) : MNS.mainnet(provider))

  try {
    const result = await mns.resolve(name)
    const available = !result
    console.log(`[mns] "${name}" is ${available ? 'available' : 'TAKEN'} (resolved: ${result})`)
    return available
  } catch (err: any) {
    console.log(`[mns] resolve threw for "${name}" — treating as available. Error: ${err?.message}`)
    return true
  }
}

export async function registerMns(
  name: string,
  scAddress: string,
  ownerAddress?: string,
  onProgress?: (step: string) => void
): Promise<void> {
  const validationError = validateMnsName(name)
  if (validationError) throw new Error(validationError)

  const provider = await getProvider()
  const mns = await (cfg.massaNetwork === 'buildnet' ? MNS.buildnet(provider) : MNS.mainnet(provider))

  // Register under platform address (platform pays, platform owns for now)
  onProgress?.('Registering MNS domain...')
  const platformAddress = (await Account.fromPrivateKey(cfg.massaSecretKey)).address.toString()
  // MNS alloc requires the registration fee plus a small storage buffer.
  const coins = BigInt(mnsRegistrationMasCost(name)) * NANO_MAS_PER_MAS + MNS_STORAGE_BUFFER_NANO_MAS
  const allocOp = await mns.alloc(name, platformAddress, { coins })
  await allocOp.waitFinalExecution()

  // Point MNS to the deployed website SC
  onProgress?.('Pointing domain to your site...')
  const updateOp = await mns.updateTarget(name, scAddress)
  await updateOp.waitFinalExecution()
}

export async function transferMnsOwnership(
  name: string,
  toAddress: string
): Promise<void> {
  const provider = await getProvider()
  const mns = await (cfg.massaNetwork === 'buildnet' ? MNS.buildnet(provider) : MNS.mainnet(provider))
  const platformAddress = (await Account.fromPrivateKey(cfg.massaSecretKey)).address.toString()

  const op = await mns.transferFrom(name, platformAddress, toAddress)
  await op.waitFinalExecution()
}

export async function getPlatformMasBalance(): Promise<bigint> {
  const provider = await getProvider()
  const account = await Account.fromPrivateKey(cfg.massaSecretKey)
  const balance = await provider.balanceOf([account.address.toString()])
  return balance[0]?.balance ?? BigInt(0)
}

export { validateMnsName }
