import type { ArcWeb3Category } from '../../api'

export const ARC_CATEGORIES: Array<{
  id: ArcWeb3Category
  label: string
  description: string
  contract: boolean
  icon: React.ReactNode
}> = [
  {
    id: 'custom',
    label: 'Custom dApp',
    description: 'Describe a unique Arc product with a purpose-built contract.',
    contract: true,
    icon: <><path d="M12 3v3M12 18v3M3 12h3M18 12h3"/><path d="m5.6 5.6 2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1"/><circle cx="12" cy="12" r="4"/></>,
  },
  {
    id: 'payment-links',
    label: 'Payment link',
    description: 'Request USDC with automatic onchain payment status.',
    contract: true,
    icon: <><path d="M10 13a5 5 0 0 0 7.1.1l2-2a5 5 0 0 0-7.1-7.1l-1.1 1.1"/><path d="M14 11a5 5 0 0 0-7.1-.1l-2 2A5 5 0 0 0 12 20l1.1-1.1"/></>,
  },
  {
    id: 'split-payments',
    label: 'Split payments',
    description: 'Route incoming payments across fixed recipients.',
    contract: true,
    icon: <><path d="M12 3v5"/><path d="m8 5 4-2 4 2"/><path d="M5 10v4"/><path d="M19 10v4"/><path d="M12 8 5 10l7 2 7-2-7-2Z"/><path d="M3 18h4M17 18h4M10 16h4"/></>,
  },
  {
    id: 'voting-polls',
    label: 'Voting',
    description: 'Create an onchain poll with clear live results.',
    contract: true,
    icon: <><path d="m9 11 2 2 4-5"/><path d="M5 3h14v18H5z"/><path d="M8 17h8"/></>,
  },
  {
    id: 'membership',
    label: 'Membership',
    description: 'Issue a simple paid pass and verify active access.',
    contract: true,
    icon: <><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M7 9h5M7 13h3M16 12a2 2 0 1 0 0-4 2 2 0 0 0 0 4Zm-3 4c.6-1.5 1.6-2 3-2s2.4.5 3 2"/></>,
  },
  {
    id: 'games',
    label: 'Onchain game',
    description: 'Build a playable browser game with a score contract.',
    contract: true,
    icon: <><path d="M8 6h8l4 4v7a3 3 0 0 1-5 2l-1-1h-4l-1 1a3 3 0 0 1-5-2v-7l4-4Z"/><path d="M8 12h4M10 10v4M16 11h.01M18 13h.01"/></>,
  },
  {
    id: 'wallet-tools',
    label: 'Wallet tool',
    description: 'Balances, receipts, wallet signals, and ArcScan links.',
    contract: false,
    icon: <><path d="M4 6h14a2 2 0 0 1 2 2v10H6a3 3 0 0 1-3-3V7a3 3 0 0 1 3-3h11"/><path d="M15 11h6v4h-6a2 2 0 0 1 0-4Z"/></>,
  },
  {
    id: 'tip-jar',
    label: 'Tip jar',
    description: 'A shareable creator page for direct USDC support.',
    contract: false,
    icon: <><path d="M5 8h14l-1 12H6L5 8Z"/><path d="M8 8V6a4 4 0 0 1 8 0v2"/><path d="M12 12v4M10 14h4"/></>,
  },
  {
    id: 'dashboards',
    label: 'Arc dashboard',
    description: 'Monitor wallets, contracts, and transaction receipts.',
    contract: false,
    icon: <><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="4" rx="1"/><rect x="14" y="11" width="7" height="10" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/></>,
  },
]

export const ARC_BUSY_STATUSES = new Set([
  'QUEUED',
  'QUEUED_EDIT',
  'PLANNING',
  'GENERATING_CONTRACT',
  'VALIDATING_CONTRACT',
  'GENERATING_FRONTEND',
  'DEPLOYING_CONTRACT',
])

export function categoryLabel(category: string) {
  return ARC_CATEGORIES.find(item => item.id === category)?.label || 'Arc dApp'
}

export function categoryUsesContract(category: string) {
  return ARC_CATEGORIES.some(item => item.id === category && item.contract)
}

export function ArcCategoryIcon({ children }: { children: React.ReactNode }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  )
}
