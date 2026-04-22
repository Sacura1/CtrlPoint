import { Account, JsonRpcProvider, MNS } from '@massalabs/massa-web3'
import { cfg } from '../config'

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
  // MNS alloc requires coins sent with the call to cover domain storage (~1.04 MAS)
  const allocOp = await mns.alloc(name, platformAddress, { coins: 1100000000n })
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
  return balance[0]?.finalBalance ?? BigInt(0)
}

export { validateMnsName }
