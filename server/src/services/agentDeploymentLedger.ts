import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import solc from 'solc'
import { createPublicClient, createWalletClient, defineChain, encodeFunctionData, http } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import prisma from '../lib/prisma'
import { cfg } from '../config'

type CompiledLedger = {
  abi: any[]
  bytecode: `0x${string}`
  sourceCode: string
  contractName: string
}

let compiledCache: CompiledLedger | null = null

function normalizePrivateKey(value: string): `0x${string}` {
  const key = value.trim()
  if (!key) throw new Error('ARC_DEPLOYER_PRIVATE_KEY is not configured.')
  return (key.startsWith('0x') ? key : `0x${key}`) as `0x${string}`
}

function arcChain() {
  return defineChain({
    id: cfg.arc.chainId,
    name: 'Arc Testnet',
    nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 },
    rpcUrls: { default: { http: [cfg.arc.rpcUrl] } },
    blockExplorers: { default: { name: 'ArcScan', url: cfg.arc.explorerUrl } },
  })
}

function proofEnabled() {
  return Boolean(cfg.arc.agentLedgerAddress && cfg.arc.deployerPrivateKey)
}

export function sha256Hex(value: string | null | undefined): `0x${string}` {
  return `0x${crypto.createHash('sha256').update(value || '').digest('hex')}` as `0x${string}`
}

function txHashBytes(value: string | null | undefined): `0x${string}` {
  const normalized = (value || '').trim()
  return /^0x[a-fA-F0-9]{64}$/.test(normalized) ? normalized as `0x${string}` : sha256Hex(normalized)
}

export function x402AmountToRawUnits(value: string | null | undefined): bigint {
  const raw = (value || '').trim()
  if (!raw) return 0n
  const match = raw.match(/([0-9]+(?:\.[0-9]+)?)/)
  if (!match) return 0n
  const amount = match[1]
  if (!raw.includes('$') && /^[0-9]+$/.test(amount)) return BigInt(amount)
  const [whole, fraction = ''] = amount.split('.')
  const paddedFraction = `${fraction}000000`.slice(0, 6)
  return BigInt(whole || '0') * 1_000_000n + BigInt(paddedFraction || '0')
}

function artifactHash(scAddress: string | null | undefined, mnsName: string | null | undefined): `0x${string}` {
  return sha256Hex(`${mnsName || ''}:${scAddress || ''}`)
}

export function compileAgentDeploymentLedger(): CompiledLedger {
  if (compiledCache) return compiledCache
  const contractName = 'AgentDeploymentLedger'
  const sourcePath = path.join(__dirname, '..', '..', 'contracts', `${contractName}.sol`)
  const sourceCode = fs.readFileSync(sourcePath, 'utf8')
  const input = {
    language: 'Solidity',
    sources: { [`${contractName}.sol`]: { content: sourceCode } },
    settings: {
      optimizer: { enabled: true, runs: 200 },
      outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object'] } },
    },
  }
  const output = JSON.parse(solc.compile(JSON.stringify(input)))
  const errors = (output.errors || []).filter((error: any) => error.severity === 'error')
  if (errors.length > 0) throw new Error(errors[0].formattedMessage || errors[0].message)
  const compiled = output.contracts?.[`${contractName}.sol`]?.[contractName]
  if (!compiled?.abi || !compiled?.evm?.bytecode?.object) throw new Error('Agent ledger compile output was incomplete.')
  compiledCache = {
    abi: compiled.abi,
    bytecode: `0x${compiled.evm.bytecode.object}`,
    sourceCode,
    contractName,
  }
  return compiledCache
}

export async function deployAgentDeploymentLedger(ownerAddress?: string) {
  const compiled = compileAgentDeploymentLedger()
  const account = privateKeyToAccount(normalizePrivateKey(cfg.arc.deployerPrivateKey))
  const chain = arcChain()
  const transport = http(cfg.arc.rpcUrl)
  const wallet = createWalletClient({ account, chain, transport })
  const publicClient = createPublicClient({ chain, transport })
  const hash = await wallet.deployContract({
    abi: compiled.abi,
    bytecode: compiled.bytecode,
    args: [ownerAddress || account.address],
  })
  const receipt = await publicClient.waitForTransactionReceipt({ hash })
  if (!receipt.contractAddress) throw new Error('Agent ledger deployed but no contract address was returned.')
  return {
    contractAddress: receipt.contractAddress,
    deployTxHash: hash,
    explorerUrl: `${cfg.arc.explorerUrl}/address/${receipt.contractAddress}`,
    abi: compiled.abi,
    sourceCode: compiled.sourceCode,
    contractName: compiled.contractName,
  }
}

export async function recordAgentDeploymentProof(deploymentId: string) {
  if (!proofEnabled()) return null
  const request = await prisma.agentRequest.findFirst({
    where: { deploymentId },
    include: {
      user: true,
    },
  })
  if (!request || request.agentProofTxHash) return null
  if (!request.paymentPayer || !request.paymentAmount) return null

  const deployment = await prisma.deployment.findUnique({
    where: { id: deploymentId },
    include: { site: true },
  })
  if (!deployment?.site) return null

  const compiled = compileAgentDeploymentLedger()
  const account = privateKeyToAccount(normalizePrivateKey(cfg.arc.deployerPrivateKey))
  const chain = arcChain()
  const transport = http(cfg.arc.rpcUrl)
  const wallet = createWalletClient({ account, chain, transport })
  const publicClient = createPublicClient({ chain, transport })
  const contractAddress = cfg.arc.agentLedgerAddress as `0x${string}`
  const deploymentHash = sha256Hex(deployment.id)
  const paidData = encodeFunctionData({
    abi: compiled.abi,
    functionName: 'recordPaid',
      args: [
        deploymentHash,
        request.paymentPayer as `0x${string}`,
        x402AmountToRawUnits(request.paymentAmount),
        sha256Hex(request.requestHash),
        txHashBytes(request.paymentTx),
      deployment.site.mnsName,
      Math.floor(request.createdAt.getTime() / 1000),
    ],
  })
  const deliveredData = encodeFunctionData({
    abi: compiled.abi,
    functionName: 'markDelivered',
    args: [
      deploymentHash,
      artifactHash(deployment.scAddress, deployment.site.mnsName),
      deployment.site.mnsName,
    ],
  })

  try {
    const paidTx = await wallet.sendTransaction({ account, to: contractAddress, data: paidData, chain })
    await publicClient.waitForTransactionReceipt({ hash: paidTx })
    const deliveredTx = await wallet.sendTransaction({ account, to: contractAddress, data: deliveredData, chain })
    await publicClient.waitForTransactionReceipt({ hash: deliveredTx })
    await prisma.agentRequest.update({
      where: { id: request.id },
      data: {
        agentProofTxHash: deliveredTx,
        agentProofContract: contractAddress,
        agentProofError: null,
      },
    })
    return deliveredTx
  } catch (err: any) {
    await prisma.agentRequest.update({
      where: { id: request.id },
      data: {
        agentProofContract: contractAddress,
        agentProofError: String(err?.message || 'Agent proof write failed.').slice(0, 500),
      },
    }).catch(() => {})
    throw err
  }
}
