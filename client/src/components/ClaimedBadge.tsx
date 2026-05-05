const CLAIMED_TITLE = 'Ownership claimed: CtrlPoint no longer controls this MNS record, so platform updates and GitHub auto-deploy are disabled.'

export default function ClaimedBadge({ compact = false }: { compact?: boolean }) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full font-semibold flex-shrink-0"
      style={{
        padding: compact ? '1px 6px' : '2px 8px',
        fontSize: compact ? '10px' : '11px',
        background: 'rgba(239,68,68,0.1)',
        border: '1px solid rgba(239,68,68,0.25)',
        color: '#f87171',
      }}
      title={CLAIMED_TITLE}
    >
      Claimed
      <span
        className="inline-flex items-center justify-center rounded-full"
        style={{
          width: compact ? 12 : 14,
          height: compact ? 12 : 14,
          border: '1px solid rgba(248,113,113,0.45)',
          fontSize: compact ? 8 : 9,
          lineHeight: 1,
        }}
        aria-label={CLAIMED_TITLE}
      >
        i
      </span>
    </span>
  )
}

export const claimedOwnershipMessage =
  'You already claimed ownership for this site. CtrlPoint no longer controls its MNS record, so platform updates are disabled.'
