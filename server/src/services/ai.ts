import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'
import { cfg } from '../config'
import { GenerateResult } from '../types'
import { AppError } from '../middleware/errorHandler'

let _anthropic: Anthropic | null = null
let _openai: OpenAI | null = null

function anthropic(apiKey?: string) {
  if (apiKey) return new Anthropic({ apiKey })
  if (!_anthropic) _anthropic = new Anthropic({ apiKey: cfg.anthropicKey })
  return _anthropic
}
function openai(apiKey?: string) {
  if (apiKey) return new OpenAI({ apiKey })
  if (!_openai) _openai = new OpenAI({ apiKey: cfg.openaiKey })
  return _openai
}

// ── System prompts ────────────────────────────────────────────────────────────

const CHAT_SYSTEM = `You are CtrlPoint's AI assistant — a friendly, sharp web builder agent.

Your job:
- Chat naturally with users about what they want to build
- Build first. If the user asks for a website/app/page and gives any usable direction, make reasonable product/design assumptions and output the full HTML immediately.
- Ask ONE clarifying question only when the request is impossible to build safely because the core subject or goal is missing.
- Do not ask about style, colors, sections, layout, copy, or features if you can infer a sensible default.
- Keep chat replies short (1-3 sentences max)

When to output HTML (not chat):
- User clearly describes a site/app/page they want built
- User says "build", "create", "make", "generate", "deploy" etc.
- User has given enough detail after a clarifying question
- User gives a short business/category idea such as "make a portfolio", "restaurant site", "landing page for a token", or "news blog". Infer the missing details.

When to chat (not HTML):
- Greetings ("hi", "hello", "hey")
- Vague questions ("what can you do?", "help")
- Feedback/thanks ("looks good", "nice")
- Anything that isn't a build request

OUTPUT FORMAT:
- If chatting: plain text only. No markdown, no code.
- If building: first line must be exactly:
  <!-- META: {"title":"Title here","description":"Description here"} -->
  Then immediately <!DOCTYPE html> on the next line. Nothing else before or after.

HTML RULES (when building):
- All CSS in <style> tag, all JS in <script> before </body>
- NO external dependencies, CDN links, external fonts, or external images
- Use CSS gradients or inline SVG for visuals
- System font stack only
- Must be fully self-contained and work offline
- Modern, responsive, mobile-first design
- Default to static websites. Do not add login, signup, accounts, dashboards, databases, fake backends, server APIs, or admin areas unless the user explicitly asks for them.
- For forms, RSVP, contact, voting, guestbook, or booking requests, use static-safe patterns: mailto links, WhatsApp-style links, localStorage-only state, or clearly local preview behavior. Never pretend data is saved to a server.

QUALITY BAR:
- Think silently before writing the final HTML: identify the user's actual product/domain, the primary audience, the main conversion/action, and the essential screens/sections.
- Build a complete usable first version, not a generic template, but keep it lean. Prefer 3-5 purposeful sections/screens over long generic pages.
- For personal/fun/event pages, prioritize emotion, reveal, interaction, and shareability over business-style feature sections.
- For personal/fun pages, "shareable" means delightful enough to send as a link. Do not add visible platform instructions, "copy text" buttons, "share this with..." copy, "made with" footers, or generic sharing CTAs unless the user explicitly requested those controls.
- Keep visible copy specific and concise. Do not add generic "features", "why choose us", "FAQ", "testimonials", process steps, or explanatory boilerplate unless the user's subject actually needs it.
- Match the visual style to the domain. Avoid default AI-looking purple gradients, vague SaaS cards, generic hero copy, and repeated placeholder text.
- Avoid sameness. Even when users submit common prompts, choose a distinctive layout rhythm, visual direction, content structure, and micro-interactions instead of repeating a familiar template.
- Avoid the common pattern of hero + three cards + features + CTA unless it is clearly appropriate. Vary composition, navigation, section order, typography scale, and interaction model.
- Do not default to a tiny status dot followed by an uppercase eyebrow in the top-left. Do not reuse the same badge-led header, floating card stack, or decorative chrome across unrelated sites.
- Let the subject determine the visual language. A birthday page, restaurant, portfolio, event, game, and developer tool should not look like reskins of one component system.
- Use strong information architecture: clear hierarchy, scannable sections, mobile-first spacing, readable contrast, and buttons/inputs that fit their containers.
- Before final output, silently audit for: valid HTML, closed tags, responsive mobile layout, no clipped text, no external assets, meaningful title/description metadata, and no explanatory text outside the required HTML.
- If the request is small, still make it polished. If the request is ambitious, create the strongest static/interactive HTML version possible within one file.`

const UPDATE_SYSTEM = `You are CtrlPoint's AI web editor. The user has an existing website and wants to change something.

RULES:
- If the message is a clear edit request: output the full updated HTML immediately
- If the message is vague but directionally useful, make the most likely edit and output the full updated HTML.
- Ask one short clarifying question only when the edit target cannot be identified.
- If chatting/feedback: respond briefly in plain text

When outputting HTML:
- First line: <!-- META: {"title":"Title","description":"Description"} -->
- Then immediately <!DOCTYPE html>
- Keep all existing structure unless asked to change it
- No external dependencies

EDIT QUALITY BAR:
- Think silently about the user's intent and the existing page before editing.
- Preserve working features unless the user asks to replace them.
- Make the requested change feel integrated with the existing design, spacing, responsive behavior, and copy.
- Before final output, silently audit for valid HTML, closed tags, mobile layout, no clipped text, and no explanatory text outside the required HTML.`

const ARC_WEB3_SYSTEM = `You are CtrlPoint's Arc Web3 app builder.

Your job:
- Build useful, simple Arc Testnet and USDC-focused web apps from the user's prompt.
- Build first when the request is feasible. Make reasonable assumptions and output a full static HTML app.
- The selected category is an architecture hint, not a template lock. Follow the user's actual product request even when it is more specific or creatively different from the examples.
- Refuse only capabilities that genuinely require unavailable infrastructure or unsafe private-key handling. Do not redirect a valid custom Arc app request into a template merely because it is unfamiliar.

Supported app categories:
- Wallet tools: wallet stats, wallet reputation cards, USDC/native balance checkers, transaction count checks, receipt viewers from a tx hash.
- Payment links: one-off USDC payment request pages with recipient, amount, memo/reference, wallet connection, send transaction, and receipt state.
- Tip jars: creator/support pages where visitors send USDC directly to a wallet and the app shows local receipts and explorer links.
- Split payments: frontend for the generated split-payment contract.
- Voting / polls: wallet voting UI for the generated poll contract.
- Membership: pay-to-access status pages using the generated membership contract.
- Games: browser games like tapping, flappy, quiz, reaction, memory, snake, or chess puzzle with an optional generated leaderboard contract.
- Wallet health: simple wallet stats and readable signals from balance, transaction count, and pasted transaction hashes. Avoid airdrop-style eligibility unless the user explicitly asks for a custom rule checker.
- Simple dashboards that read from Arc RPC or let users paste transaction data.

Unsupported for now:
- Crowdfunding
- Invoices
- Bounties
- Lending, staking, AMMs, bridges, derivatives, yield apps, complex escrow, arbitration, dispute systems, or full NFT marketplaces.
- Any app that needs a backend, database, private API key, hidden server validation, or CtrlPoint after deployment.

Allowed chain details:
- Network: Arc Testnet
- Chain ID: 5042002 (hex 0x4cef52)
- RPC URL: https://rpc.testnet.arc.network
- Explorer base URL: https://testnet.arcscan.app
- Arc is an EVM-compatible Layer 1 and USDC is its native gas token.
- Arc also exposes a standard ERC-20 interface for native USDC at 0x3600000000000000000000000000000000000000 with 6 interface decimals. Use this only when an ERC-20 method is technically required.
- User-facing payment amounts should simply be called USDC. Do not display "USDC ERC-20" as a product label or imply Arc is an ERC-20 token.

Implementation rules:
- Output one complete static HTML file only.
- First line must be exactly:
  <!-- META: {"title":"Title here","description":"Description here"} -->
  Then immediately <!DOCTYPE html> on the next line. Nothing else before or after.
- All CSS in <style>, all JS in <script> before </body>.
- Include <meta name="viewport" content="width=device-width, initial-scale=1.0"> in <head>.
- No external dependencies, CDN links, external fonts, or external images.
- For generated-contract calls, use window.CTRLPOINT_ARC_RUNTIME. It provides connect(), switchChain(), read(functionName,args), write(functionName,args,{value}), decodeUint(hex), decodeBool(hex), and decodeAddress(hex). The optional value must be a 0x-prefixed wei hex string.
- Use window.CTRLPOINT_ARC_PAGE.shareUrl(params) for shareable links. CtrlPoint supplies the project's future public HTTPS URL in preview when available; window.CTRLPOINT_ARC_PAGE.isPreview tells you it is not live yet. Never build a share link from window.location.href when the protocol is about: and never display an about:srcdoc URL.
- Use window.CTRLPOINT_ARC_PAGE.waitForReceipt(txHash) after wallet writes. A successful wallet response is not enough; update the UI only after the receipt status confirms success.
- For native USDC amounts, use window.CTRLPOINT_ARC_PAGE.toNativeUnits(amount), formatNativeUnits(value), and toHex(value). Do not implement floating-point token conversion yourself.
- You may use window.ethereum for direct native payments and fetch JSON-RPC directly. In CtrlPoint preview, also support window.parent.ethereum when same-origin access is available.
- Include wallet connection, chain switch/add flow for Arc Testnet, loading states, errors, empty states, and explorer links.
- Every primary action must enforce its prerequisites in both UI and JavaScript. Disable actions that cannot succeed yet, explain the missing prerequisite briefly, and never present two controls that perform the same wallet-selection step.
- Every async wallet, RPC, and contract action must use a visible loading state plus try/catch/finally error recovery. A rejected wallet request must restore the button and leave the app usable.
- Separate owner/setup workflows from visitor/end-user workflows when they serve different people. Do not place administrative setup controls on a payer, voter, member, player, or recipient screen.
- On mobile browsers without an injected wallet, show a practical message: open this page inside a wallet browser or use desktop with a wallet extension. Do not imply wallet connection is available when window.ethereum is missing.
- Use eth_getBalance for native USDC gas balance, eth_getTransactionCount for transaction count, eth_getTransactionReceipt for tx receipts, eth_call for ERC-20 balanceOf, and eth_sendTransaction for simple native USDC payments when suitable.
- For ERC-20 calls, encode minimal calldata manually in JS. Do not import ethers, viem, web3, or any library.
- Generated dApps must be backend-free after deployment. Do not call CtrlPoint APIs, do not require login, and do not invent a server endpoint.
- Never request or display seed phrases, private keys, raw wallet signatures, or secret recovery information. Do not call eth_sign, personal_sign, or eth_signTypedData from generated dApps.
- Do not use eval, new Function, document.write, or innerHTML for generated/user/onchain content. Build dynamic UI with DOM nodes and textContent.
- For contract-backed categories, read optional deployed contract metadata from window.CTRLPOINT_ARC_CONTRACT when present:
  { address, abi, explorerUrl, contractName, ownerAddress }.
- If window.CTRLPOINT_ARC_CONTRACT is missing, show a clear setup state that says the contract will be deployed during publishing. Do not fail or hide the app.
- Prefer no-contract apps when possible. If the user asks for contract behavior but no contract address/ABI exists, produce either a safe demo/local version or a concise chat response explaining the contract requirement and suggest the closest supported no-contract version.
- If a user asks for "wallet age", "first transaction", full transaction history, or top contracts, explain in the UI that full historical indexing requires an indexer/explorer API, and still provide the best RPC-only stats available.
- If a request requires a smart contract and matches one of the CtrlPoint contract-backed categories, build the frontend against window.CTRLPOINT_ARC_CONTRACT and show setup state until publishing deploys the contract.
- Do not claim that a contract has been deployed unless window.CTRLPOINT_ARC_CONTRACT is present at runtime.
- Do not handle mainnet funds. Use Arc Testnet copy throughout.
- Do not expose implementation notes in the product UI. Avoid copy such as "runs fully in the browser", "no backend", "no private keys", RPC limitations, token standards, or contract architecture unless the user explicitly asks for technical documentation.
- Network state belongs near wallet connection or transaction status. Do not add a permanent "Arc Testnet / USDC" badge, decorative chain label, or developer disclaimer to the main header.

Quality bar:
- The app should feel like a real product users can try immediately, not a generic demo.
- Strong mobile layout, readable cards/tables, clear states, good copy, and practical controls.
- Keep visible copy lean and app-specific. Do not add generic educational sections like "Arc notes", "Useful details", chain explainers, implementation notes, or documentation-style panels unless the user explicitly asks for documentation.
- Default screens should focus on the user's chosen app workflow: connect/paste wallet, primary action, results, receipts/status, and explorer links.
- Avoid default purple AI styling, generic fintech dashboards, repeated status-dot eyebrows, and the same card composition across apps.
- Choose a visual direction from the actual product: a payment request can feel like a focused invoice or receipt, a game should feel playful, a membership pass can feel collectible, and a wallet tool can be compact and analytical.
- Use different composition, type scale, density, shape language, and interaction patterns between unrelated products. Do not merely change colors.
- Before final output, silently audit for valid HTML, closed tags, responsive layout, no clipped text, no external assets, and working JS syntax.`

// ── Core AI call ──────────────────────────────────────────────────────────────

export interface ChatMessage { role: 'user' | 'assistant'; content: string }
export interface AIUsage {
  inputTokens: number
  outputTokens: number
  totalTokens: number
}

const DEFAULT_MAX_OUTPUT_TOKENS = 16_384
const EXTENDED_MAX_OUTPUT_TOKENS = 64_000
const HTML_MAX_OUTPUT_TOKENS = 16_384
const HTML_CONTINUATION_MAX_OUTPUT_TOKENS = 16_384
const HTML_CONTINUATION_ATTEMPTS = 3
const HTML_CONTINUATION_CONTEXT_CHARS = 48_000
const HTML_GENERATION_DEADLINE_MS = 8 * 60 * 1000
const AI_REQUEST_TIMEOUT_MS = 4 * 60 * 1000

export const OPENAI_REASONING_EFFORTS = [
  { id: 'low', label: 'Low', sub: 'Faster, lower-cost reasoning' },
  { id: 'medium', label: 'Medium', sub: 'Balanced reasoning' },
  { id: 'high', label: 'High', sub: 'Deeper reasoning' },
  { id: 'xhigh', label: 'XHigh', sub: 'Hardest OpenAI tasks' },
] as const

export const CLAUDE_REASONING_EFFORTS = [
  { id: 'low', label: 'Low', sub: 'Most efficient' },
  { id: 'medium', label: 'Medium', sub: 'Balanced token savings' },
  { id: 'high', label: 'High', sub: 'Claude default depth' },
  { id: 'xhigh', label: 'XHigh', sub: 'Long agentic work' },
  { id: 'max', label: 'Max', sub: 'Absolute maximum capability' },
] as const

export const REASONING_EFFORTS = [
  ...OPENAI_REASONING_EFFORTS,
  CLAUDE_REASONING_EFFORTS[4],
] as const
export type ReasoningEffort = typeof REASONING_EFFORTS[number]['id']

export const MODEL_CATALOG = [
  { id: 'gpt-5.5', label: 'GPT-5.5', full: 'GPT-5.5', sub: 'Best GPT for complex builds', provider: 'OpenAI', cost: 3, supportsReasoning: true, reasoningEfforts: ['low', 'medium', 'high', 'xhigh'] },
  { id: 'gpt-5.4', label: 'GPT-5.4', full: 'GPT-5.4', sub: 'Strong GPT at lower cost', provider: 'OpenAI', cost: 2, supportsReasoning: true, reasoningEfforts: ['low', 'medium', 'high', 'xhigh'] },
  { id: 'gpt-5.4-mini', label: 'GPT-5.4 mini', full: 'GPT-5.4 mini', sub: 'Affordable GPT option', provider: 'OpenAI', cost: 2, supportsReasoning: true, reasoningEfforts: ['low', 'medium', 'high', 'xhigh'] },
  { id: 'claude-opus-4-7', label: 'Opus 4.7', full: 'Claude Opus 4.7', sub: 'Best Claude for hard work', provider: 'Anthropic', cost: 5, supportsReasoning: true, reasoningEfforts: ['low', 'medium', 'high', 'xhigh', 'max'] },
  { id: 'claude-sonnet-4-6', label: 'Sonnet 4.6', full: 'Claude Sonnet 4.6', sub: 'Balanced Claude option', provider: 'Anthropic', cost: 2, supportsReasoning: true, reasoningEfforts: ['low', 'medium', 'high', 'max'] },
] as const

const ALLOWED_MODELS = MODEL_CATALOG.map(m => m.id)
export type AllowedModel = typeof ALLOWED_MODELS[number]

export function isAllowedModel(m: unknown): m is AllowedModel {
  return typeof m === 'string' && (ALLOWED_MODELS as readonly string[]).includes(m)
}

export function isReasoningEffort(value: unknown): value is ReasoningEffort {
  return typeof value === 'string' && (REASONING_EFFORTS as readonly { id: string }[]).some(effort => effort.id === value)
}

export interface UserKeys {
  openaiKey?: string
  anthropicKey?: string
}

export type ArcWeb3Category =
  | 'wallet-tools'
  | 'payment-links'
  | 'tip-jar'
  | 'split-payments'
  | 'voting-polls'
  | 'membership'
  | 'games'
  | 'eligibility'
  | 'dashboards'
  | 'custom'

const ARC_CATEGORY_INSTRUCTIONS: Record<ArcWeb3Category, string> = {
  'wallet-tools': `CATEGORY: Wallet Tools
- Build wallet stats, balance checker, tx count, tx receipt viewer, or reputation card apps.
- Use Arc RPC only. Do not pretend to have full historical indexing.
- If asked for wallet age, first tx, top contracts, or total USDC volume, clearly explain the RPC-only limitation in the UI and provide best available RPC stats.`,
  'payment-links': `CATEGORY: Payment Links
- Build one-off USDC payment request pages backed by the supplied CtrlPoint payment-request contract.
- The app has exactly two mutually exclusive modes:
  1. CREATOR MODE when the URL does not contain a complete payment request.
  2. CHECKOUT MODE when the URL contains valid to, amount, memo, and id parameters.
- CREATOR MODE:
  - Start with one clear "Connect wallet" action.
  - After connection, show the connected address as the payment recipient. Do not show a second "use connected wallet" button and do not ask the user to copy their wallet into another field.
  - Keep "Create payment link" disabled until a wallet is connected and amount plus memo are valid.
  - When clicked, create a random stable id with crypto.getRandomValues, then use window.CTRLPOINT_ARC_PAGE.shareUrl({to: connectedAddress, amount, memo, id}).
  - Show the finished link with copy and native share actions. Do not claim the request is stored in a database.
- CHECKOUT MODE:
  - Hide the entire creator form and all create-link controls.
  - Show a focused checkout containing the requested amount, memo, shortened recipient, payment status, one wallet connection/payment action, and a receipt area.
  - If no wallet is connected, the primary button says "Connect wallet to pay". After connection it says "Pay {amount} USDC".
- Derive the bytes32 request ID with await window.CTRLPOINT_ARC_PAGE.requestId(idFromUrl).
- Use only functions present in the supplied ABI. The standard contract exposes pay(requestId, recipient, expectedAmount), isPaid(requestId), paymentPayer(requestId), paymentRecipient(requestId), paymentAmount(requestId), and paymentPaidAt(requestId).
- Send payment through window.CTRLPOINT_ARC_RUNTIME.write('pay', [requestId, recipient, nativeAmount], { value: window.CTRLPOINT_ARC_PAGE.toHex(nativeAmount) }), wait for the transaction receipt, confirm receipt.status is successful, then read isPaid(requestId) from the contract.
- On page load and after payment, automatically read the onchain status. Show paid state, payer, amount, time, transaction/explorer link when available. Never ask the payer or requester to manually confirm payment.
- Treat an empty eth_call response as not paid while the contract is not deployed in preview; do not pass "0x" directly to BigInt.
- Include clear pending/success/error states and concise receipt details. Do not add implementation disclaimers, architecture notes, duplicate wallet actions, or developer controls.`,
  'tip-jar': `CATEGORY: Tip Jar
- Build exactly two modes using a public URL parameter named to:
  1. SETUP MODE when no valid to address exists. Connect the creator wallet and generate the public tip URL with CTRLPOINT_ARC_PAGE.shareUrl({to: connectedAddress}).
  2. SUPPORTER MODE when to contains a valid recipient. Hide setup controls and show suggested amounts, custom amount, wallet connect/pay, receipt state, and explorer link.
- Keep send disabled until a wallet is connected, the recipient is valid, and the amount is valid.
- Send native USDC with eth_sendTransaction, convert values with CTRLPOINT_ARC_PAGE.toNativeUnits/toHex, and confirm with CTRLPOINT_ARC_PAGE.waitForReceipt.
- Do not create subscriptions or recurring billing.`,
  'split-payments': `CATEGORY: Split Payments
- This category uses CtrlPoint's fixed reviewed split-payment contract.
- OWNER SETUP: only show configuration controls when the connected address matches CTRLPOINT_ARC_CONTRACT.ownerAddress. Collect 2-20 recipient rows, validate every address and positive percentage, and require exactly 100%.
- Save configuration by calling beginConfiguration(), then addRecipient(address, shareBps) once per row with confirmed receipts, then finalizeConfiguration(). Show step progress and stop on the first failed transaction.
- PAYER VIEW: read configured(), recipientCount(), recipients(index), sharesBps(index), and totalPaid(). Show the finalized distribution and a single amount/pay action.
- Keep pay disabled until the contract is configured, wallet is connected, and amount is valid. Call pay() with native USDC value and wait for a successful receipt.
- Never expose owner configuration controls to ordinary payers and never allow payment while configuration is incomplete.
- If contract metadata is missing, still render the full UI with a setup state that says the contract is deployed during publishing.
- Match every contract call to the ABI supplied in the generation prompt.`,
  'voting-polls': `CATEGORY: Voting / Polls
- This category uses CtrlPoint's fixed reviewed poll contract.
- OWNER SETUP: only the connected contract owner may add 2-12 options before opening. Encode each label with CTRLPOINT_ARC_PAGE.textToBytes32(), call addOption(bytes32) per option, wait for each receipt, then call openPoll().
- VOTER VIEW: read pollOpen(), pollClosed(), optionCount(), options(index), votes(index), and hasVoted(address). Decode labels with CTRLPOINT_ARC_PAGE.bytes32ToText().
- Keep Vote disabled until wallet connection, an open poll, a selected valid option, and hasVoted is false. Wait for the vote receipt, then refresh live counts.
- Show closePoll() only to the connected owner. Hide all owner setup actions from ordinary voters.
- If contract metadata is missing, show a setup state that says the poll contract is deployed during publishing, while still letting the user preview the UI.
- Do not claim secure onchain voting unless contract metadata is present at runtime.`,
  membership: `CATEGORY: Membership
- This category uses CtrlPoint's fixed reviewed membership contract.
- OWNER MANAGEMENT: only the connected owner may set price and duration with setPlan(price,durationSeconds) or withdraw collected funds. Validate both values and require explicit confirmation before withdrawal.
- MEMBER VIEW: read price(), durationSeconds(), active(address), and memberUntil(address). Show plan details and the connected wallet's current status.
- Keep Join disabled until wallet connection and a configured non-zero price. Call join() with exactly the current native USDC price, wait for the receipt, then refresh status.
- Keep owner management visually separate from the member checkout and hide owner-only controls from other wallets.
- If contract metadata is missing, show a setup state that says the membership contract is deployed during publishing.
- Keep it simple: pay USDC for access/pass status. No recurring billing or backend access control.`,
  games: `CATEGORY: Games
- Build a browser game such as tapping, reaction, flappy, quiz, memory, snake, or chess puzzle.
- The game must be fully playable locally before a wallet is connected. Use real pointer/keyboard controls, start/restart states, scoring, game-over state, and responsive canvas or DOM gameplay.
- This category uses CtrlPoint's fixed community leaderboard contract and may collect an owner-configured native USDC entry fee.
- Read entryFee() and entered(roundId,address). Keep Enter round disabled until wallet connection, and call enter() with exactly the current fee before allowing an onchain score submission.
- Never provide a text field or developer control for manually entering a score. Enable Submit score only after a completed game produced a positive score and a wallet is connected.
- Call submitScore(score), wait for a successful receipt, then read roundId(), bestScore(roundId,address), playerCount(roundId), and playerAt(roundId,index).
- Show setEntryFee(), resetRound(), and withdraw() only to the connected owner. Explain clearly that entry payments go to the organizer and are not automatically awarded based on browser-submitted scores.
- Label results as a community leaderboard; never claim scores are cheat-proof, server-verified, or suitable for automatic score-based prize payouts.
- If contract metadata is missing, use a local preview leaderboard and show a setup state that says the leaderboard contract is deployed during publishing.
- Do not use CtrlPoint backend, server signatures, hidden score validation, automatic prizes, or real-money fairness claims.`,
  eligibility: `CATEGORY: Wallet Health
- Build a simple wallet health/stats app, not an airdrop checker.
- Default UI should be: connect wallet, paste wallet address fallback, show native USDC balance, transaction count, explorer links, and a small set of readable signals.
- Do not add "minimum balance", "minimum transaction count", threshold inputs, pass/fail eligibility, or "check eligibility" buttons unless the user's prompt explicitly asks for configurable rules.
- If custom rules are explicitly requested, label them as user-defined rules, not Arc eligibility or airdrop eligibility.
- Use Arc RPC only; no backend and no indexer-only claims.`,
  dashboards: `CATEGORY: Simple Dashboards
- Build Arc dashboards that read RPC data, show manually configured wallets/contracts, compare multiple wallets, or accept pasted tx hashes/data.
- Good dashboard options include a multi-wallet monitor and a transaction/receipt operations dashboard.
- This category is frontend-only and does not use a CtrlPoint contract template.
- No private APIs, backend storage, indexer-only claims, or hidden services.`,
  custom: `CATEGORY: Custom dApp
- Build the product described by the user rather than reshaping it into another CtrlPoint category.
- A prompt-specific contract is generated and compiled for this project. Use only functions present in the supplied ABI.
- Separate owner/admin actions from ordinary user actions, enforce wallet and state prerequisites, confirm every transaction receipt, and read current state back from the contract.
- Keep the contract and interface focused on the requested workflow. Do not add unrelated token, governance, marketplace, staking, or payment features.
- This remains an Arc Testnet product. Never claim a custom generated contract has received an external security audit.`,
}

function supportsReasoning(model: string): boolean {
  return MODEL_CATALOG.some(option => option.id === model && option.supportsReasoning)
}

function modelAllowsReasoningEffort(model: string, reasoningEffort?: ReasoningEffort): reasoningEffort is ReasoningEffort {
  if (!reasoningEffort) return false
  const option = MODEL_CATALOG.find(option => option.id === model)
  return !!option?.supportsReasoning && (option.reasoningEfforts as readonly string[]).includes(reasoningEffort)
}

function logAiKeySource(provider: 'openai' | 'anthropic', model: string, usingUserKey: boolean, reasoningEffort?: ReasoningEffort) {
  console.info('[AI] request', {
    provider,
    model,
    keySource: usingUserKey ? 'user' : 'platform',
    reasoningEffort: reasoningEffort ?? 'none',
  })
}

function logEmptyAiResponse(params: {
  provider: 'openai' | 'anthropic'
  model: string
  finishReason?: unknown
  stopReason?: unknown
  usage?: unknown
  contentTypes?: string[]
}) {
  console.warn('[AI] empty response', params)
}

function openAiContentToText(content: unknown): string {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content.map(part => {
    if (typeof part === 'string') return part
    if (part && typeof part === 'object' && 'text' in part && typeof (part as any).text === 'string') return (part as any).text
    return ''
  }).join('')
}

function classifyApiError(err: any, usingUserKey: boolean, provider: 'openai' | 'anthropic'): never {
  const status = err?.status ?? err?.statusCode ?? err?.error?.status
  const code = err?.code ?? err?.error?.code ?? err?.error?.type
  const msg: string = err?.message ?? ''
  const isUserKey = usingUserKey
  const providerName = provider === 'openai' ? 'OpenAI' : 'Anthropic'

  if (status === 401 || code === 'invalid_api_key' || code === 'authentication_error') {
    throw new AppError(isUserKey ? 401 : 503, isUserKey
      ? `Your ${providerName} API key is invalid or has been revoked. Update it in API Keys settings.`
      : `Platform AI key misconfigured. Please contact support.`)
  }
  if (status === 429 || code === 'insufficient_quota' || code === 'rate_limit_exceeded' || msg.includes('quota') || msg.includes('credits')) {
    throw new AppError(isUserKey ? 402 : 429, isUserKey
      ? `Your ${providerName} API key has run out of credits. Top up your account or remove the key to use platform credits.`
      : `Platform AI rate limit reached. Please try again in a moment.`)
  }
  if (status === 400 || status === 404 || code === 'model_not_found' || msg.includes('model')) {
    const modelName = err?.error?.message?.match(/model `([^`]+)`/)?.[1] || err?.param || 'selected model'
    throw new AppError(400, isUserKey
      ? `${modelName} is not available for your ${providerName} API key. This usually means the key's project or organization does not have access to that model yet, or your API account is below the required paid usage tier. Choose another model or check model access in your ${providerName} dashboard.`
      : `${modelName} is not available on the platform ${providerName} account. Choose another model or contact support.`)
  }
  if (code === 'ETIMEDOUT' || code === 'ECONNRESET' || err?.name === 'APIConnectionTimeoutError' || /timed?\s*out|timeout/i.test(msg)) {
    throw new AppError(504, `${providerName} took too long to respond. The partial generation was preserved when possible; please retry.`)
  }
  throw err
}

function maxTokensForReasoning(reasoningEffort?: ReasoningEffort): number {
  return reasoningEffort === 'xhigh' || reasoningEffort === 'max'
    ? EXTENDED_MAX_OUTPUT_TOKENS
    : DEFAULT_MAX_OUTPUT_TOKENS
}

function creativeVariationSystem(system: string): string {
  const seed = Math.random().toString(36).slice(2, 10)
  const directions = [
    'editorial, asymmetric, typography-led, restrained motion',
    'single-purpose mobile microsite, playful reveal, compact sections',
    'event poster, bold countdown energy, tactile controls',
    'personal keepsake, warm photography framing, intimate copy',
    'premium product, dense but elegant, only when the request is business-oriented',
    'studio-grade, tactile cards, strong spacing, warm human copy',
    'technical but approachable, crisp grids, practical feature storytelling',
    'bold portfolio, case-study first, cinematic section transitions',
    'minimal luxury, high contrast, precise detail, subtle interaction',
    'scrapbook collage, layered notes, handwritten-feeling rhythm using system fonts',
  ]
  const direction = directions[Math.floor(Math.random() * directions.length)]
  return `${system}

CREATIVE VARIATION:
- Internal seed: ${seed}
- Direction: ${direction}
- Use this only to vary layout, copy, section order, interaction details, and visual treatment.
- Do not mention the seed or direction in the output.`
}

interface AIProviderResult {
  raw: string
  usage?: AIUsage
  truncated?: boolean
  stopReason?: string | null
}

async function callAI(
  system: string,
  messages: ChatMessage[],
  modelOverride?: AllowedModel,
  userKeys?: UserKeys,
  reasoningEffort?: ReasoningEffort,
  maxOutputTokens?: number,
  timeoutMs = AI_REQUEST_TIMEOUT_MS,
): Promise<AIProviderResult> {
  const useOpenAI = modelOverride
    ? modelOverride.startsWith('gpt-')
    : cfg.aiProvider === 'openai'
  const model = modelOverride ?? (useOpenAI ? cfg.openaiModel : cfg.anthropicModel)
  const effectiveReasoningEffort = modelAllowsReasoningEffort(model, reasoningEffort) ? reasoningEffort : undefined

  if (useOpenAI) {
    try {
      logAiKeySource('openai', model, !!userKeys?.openaiKey, effectiveReasoningEffort)
      const res = await openai(userKeys?.openaiKey).chat.completions.create(
        {
          model,
          max_completion_tokens: maxOutputTokens ?? maxTokensForReasoning(effectiveReasoningEffort),
          ...(effectiveReasoningEffort ? { reasoning_effort: effectiveReasoningEffort as any } : {}),
          messages: [{ role: 'system', content: system }, ...messages],
        },
        { timeout: timeoutMs, maxRetries: 0 },
      )
      const choice = res.choices[0]
      const raw = openAiContentToText(choice?.message?.content)
      if (!raw.trim()) {
        logEmptyAiResponse({
          provider: 'openai',
          model,
          finishReason: choice?.finish_reason,
          usage: res.usage,
        })
      }
      return {
        raw,
        truncated: choice?.finish_reason === 'length',
        stopReason: choice?.finish_reason,
        usage: res.usage ? {
          inputTokens: res.usage.prompt_tokens ?? 0,
          outputTokens: res.usage.completion_tokens ?? 0,
          totalTokens: res.usage.total_tokens ?? ((res.usage.prompt_tokens ?? 0) + (res.usage.completion_tokens ?? 0)),
        } : undefined,
      }
    } catch (err: any) {
      return classifyApiError(err, !!userKeys?.openaiKey, 'openai')
    }
  } else {
    let raw = ''
    let inputTokens = 0
    let outputTokens = 0
    let stopReason: string | null = null
    try {
      logAiKeySource('anthropic', model, !!userKeys?.anthropicKey, effectiveReasoningEffort)
      const events = await anthropic(userKeys?.anthropicKey).messages.create({
        model,
        max_tokens: maxOutputTokens ?? maxTokensForReasoning(effectiveReasoningEffort),
        ...(effectiveReasoningEffort ? {
          thinking: { type: 'adaptive' as const },
          output_config: { effort: effectiveReasoningEffort },
        } : {}),
        system,
        messages,
        stream: true,
      } as any, { timeout: timeoutMs, maxRetries: 0 }) as any
      for await (const event of events) {
        if (event.type === 'message_start') {
          inputTokens = event.message?.usage?.input_tokens ?? inputTokens
          outputTokens = event.message?.usage?.output_tokens ?? outputTokens
        } else if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
          raw += event.delta.text || ''
        } else if (event.type === 'message_delta') {
          outputTokens = event.usage?.output_tokens ?? outputTokens
          stopReason = event.delta?.stop_reason ?? stopReason
        }
      }
      if (!raw.trim()) {
        logEmptyAiResponse({
          provider: 'anthropic',
          model,
          stopReason,
          usage: { input_tokens: inputTokens, output_tokens: outputTokens },
        })
      }
      return {
        raw,
        truncated: stopReason === 'max_tokens',
        stopReason,
        usage: {
          inputTokens,
          outputTokens,
          totalTokens: inputTokens + outputTokens,
        },
      }
    } catch (err: any) {
      if (raw.trim()) {
        outputTokens = Math.max(outputTokens, Math.ceil(raw.length / 4))
        console.warn('[AI] Anthropic stream ended early; preserving partial output', {
          model,
          outputChars: raw.length,
          inputTokens,
          outputTokens,
          error: err?.name || err?.message || String(err),
        })
        return {
          raw,
          truncated: true,
          stopReason: 'stream_error',
          usage: {
            inputTokens,
            outputTokens,
            totalTokens: inputTokens + outputTokens,
          },
        }
      }
      return classifyApiError(err, !!userKeys?.anthropicKey, 'anthropic')
    }
  }
}

function addUsage(total: AIUsage, usage?: AIUsage) {
  if (!usage) return total
  total.inputTokens += usage.inputTokens
  total.outputTokens += usage.outputTokens
  total.totalTokens += usage.totalTokens
  return total
}

function normalizeHtmlContinuation(raw: string) {
  let continuation = raw
  continuation = continuation.replace(/^\s*```(?:html)?[ \t]*\r?\n?/i, '').replace(/\r?\n?```[ \t]*$/i, '')
  continuation = continuation.replace(/^\s*(?:continuation|continued html|remaining html)\s*:?[ \t]*\r?\n?/i, '')
  return continuation
}

export function mergeHtmlContinuation(partial: string, rawContinuation: string) {
  const continuation = normalizeHtmlContinuation(rawContinuation)
  if (!continuation) return partial

  // A provider may ignore the continuation instruction and return a complete replacement.
  if (/<!doctype\s+html/i.test(continuation) && /<\/html>/i.test(continuation)) {
    return continuation
  }

  const maxOverlap = Math.min(partial.length, continuation.length, 1024)
  for (let overlapLength = maxOverlap; overlapLength > 0; overlapLength -= 1) {
    if (partial.endsWith(continuation.slice(0, overlapLength))) {
      return partial + continuation.slice(overlapLength)
    }
  }

  return `${partial}${continuation}`
}

// ── Response parsing ──────────────────────────────────────────────────────────

export interface AIResponse {
  type: 'chat' | 'site'
  text?: string        // for chat replies
  html?: string        // for site generation
  title?: string
  description?: string
  usage?: AIUsage
}

export function validateArcDappHtml(html: string, category: ArcWeb3Category, abi: any[] = []): string[] {
  const errors: string[] = []
  const contractCategories = new Set<ArcWeb3Category>(['payment-links', 'split-payments', 'voting-polls', 'membership', 'games', 'custom'])
  const requirePatterns = (rules: Array<{ pattern: RegExp; message: string }>) => {
    for (const rule of rules) {
      if (!rule.pattern.test(html)) errors.push(rule.message)
    }
  }
  const runtimeCall = (kind: 'read' | 'write', name: string) =>
    new RegExp(`CTRLPOINT_ARC_RUNTIME\\.${kind}\\s*\\(\\s*['"]${name}['"]`)

  if (abi.length > 0) {
    const functions = new Set(
      abi.filter(item => item?.type === 'function').map(item => String(item.name || '')),
    )
    const calls = html.matchAll(/CTRLPOINT_ARC_RUNTIME\.(?:read|write)\s*\(\s*['"]([^'"]+)['"]/g)
    for (const call of calls) {
      if (!functions.has(call[1])) errors.push(`The generated interface calls ${call[1]}(), which is not present in the contract ABI.`)
    }
  }

  if (/about:srcdoc/i.test(html)) errors.push('Never create or display an about:srcdoc URL.')
  if (/\beval\s*\(|new\s+Function\s*\(|document\.write\s*\(/i.test(html)) {
    errors.push('Remove dynamic code execution and document.write from the generated dApp.')
  }
  if (/\.innerHTML\s*=|insertAdjacentHTML\s*\(/i.test(html)) {
    errors.push('Build dynamic content with safe DOM nodes and textContent instead of HTML injection.')
  }
  if (/\b(?:seed phrase|recovery phrase|private key)\b|(?:eth_sign|personal_sign|eth_signTypedData)/i.test(html)) {
    errors.push('Generated dApps must never request wallet secrets or arbitrary signatures.')
  }
  if (!/(?:\btry\s*\{[\s\S]*?\bcatch\s*\(|\.catch\s*\()/.test(html)) {
    errors.push('Handle rejected wallet, RPC, and contract requests with visible recoverable errors.')
  }
  if (/runs fully in the browser|no backend(?:,| or)|private keys?\.?/i.test(html)) {
    errors.push('Remove implementation disclaimers from the visible product UI.')
  }
  if (category === 'payment-links') {
    const required = [
      { pattern: /CTRLPOINT_ARC_PAGE\.shareUrl/, message: 'Create public links with CTRLPOINT_ARC_PAGE.shareUrl().' },
      { pattern: /CTRLPOINT_ARC_PAGE\.requestId/, message: 'Derive the onchain request ID with CTRLPOINT_ARC_PAGE.requestId().' },
      { pattern: /CTRLPOINT_ARC_PAGE\.toNativeUnits/, message: 'Convert amounts with CTRLPOINT_ARC_PAGE.toNativeUnits().' },
      { pattern: /CTRLPOINT_ARC_RUNTIME\.write/, message: 'Submit payment through CTRLPOINT_ARC_RUNTIME.write().' },
      { pattern: /CTRLPOINT_ARC_RUNTIME\.read/, message: 'Read paid status from the contract.' },
      { pattern: /(?:URLSearchParams|\.searchParams)/, message: 'Switch between creator and checkout modes using URL parameters.' },
      { pattern: /\.get\(['"]to['"]\)/, message: 'Read the checkout recipient from the payment URL.' },
      { pattern: /\.get\(['"]amount['"]\)/, message: 'Read the checkout amount from the payment URL.' },
      { pattern: /\.get\(['"]memo['"]\)/, message: 'Read the checkout memo from the payment URL.' },
      { pattern: /\.get\(['"]id['"]\)/, message: 'Read the stable request id from the payment URL.' },
      { pattern: /crypto\.getRandomValues/, message: 'Create a stable random request id in creator mode.' },
      { pattern: /(?:disabled\s*=|\.disabled\s*=)/, message: 'Keep create and payment actions disabled until their prerequisites are ready.' },
    ]
    requirePatterns(required)
    if (/use connected wallet/i.test(html)) {
      errors.push('Remove the redundant "use connected wallet" control; the connected account is the recipient.')
    }
    if (/confirm(?:ed|ation)? is browser-side|manually confirm|share the receipt (?:url|hash)/i.test(html)) {
      errors.push('Payment confirmation must be automatic and onchain, never manual.')
    }
  }
  if (category === 'tip-jar') {
    requirePatterns([
      { pattern: /CTRLPOINT_ARC_PAGE\.shareUrl/, message: 'Create the public tip URL with CTRLPOINT_ARC_PAGE.shareUrl().' },
      { pattern: /\.get\(['"]to['"]\)/, message: 'Read the recipient from the public tip URL.' },
      { pattern: /CTRLPOINT_ARC_PAGE\.toNativeUnits/, message: 'Convert tip amounts with CTRLPOINT_ARC_PAGE.toNativeUnits().' },
      { pattern: /CTRLPOINT_ARC_PAGE\.toHex/, message: 'Encode the native USDC value with CTRLPOINT_ARC_PAGE.toHex().' },
      { pattern: /eth_sendTransaction/, message: 'Send tips through the connected wallet with eth_sendTransaction.' },
      { pattern: /CTRLPOINT_ARC_PAGE\.waitForReceipt/, message: 'Wait for a confirmed tip receipt.' },
      { pattern: /(?:disabled\s*=|\.disabled\s*=)/, message: 'Disable tip actions until wallet, recipient, and amount are ready.' },
    ])
  }
  if (category === 'split-payments') {
    requirePatterns([
      { pattern: /CTRLPOINT_ARC_CONTRACT\.ownerAddress/, message: 'Separate owner configuration using the connected contract owner address.' },
      { pattern: runtimeCall('write', 'beginConfiguration'), message: 'Start split configuration with beginConfiguration().' },
      { pattern: runtimeCall('write', 'addRecipient'), message: 'Add each validated recipient with addRecipient().' },
      { pattern: runtimeCall('write', 'finalizeConfiguration'), message: 'Finalize only a complete 100% split.' },
      { pattern: runtimeCall('write', 'pay'), message: 'Send payer funds through the split contract pay() action.' },
      { pattern: runtimeCall('read', 'configured'), message: 'Read whether the split is configured before allowing payment.' },
      { pattern: runtimeCall('read', 'recipientCount'), message: 'Read the finalized recipient count.' },
      { pattern: runtimeCall('read', 'recipients'), message: 'Read finalized recipient addresses.' },
      { pattern: runtimeCall('read', 'sharesBps'), message: 'Read finalized recipient shares.' },
      { pattern: /CTRLPOINT_ARC_PAGE\.waitForReceipt/, message: 'Wait for every split configuration and payment receipt.' },
      { pattern: /(?:disabled\s*=|\.disabled\s*=)/, message: 'Disable split actions until their prerequisites are ready.' },
    ])
  }
  if (category === 'voting-polls') {
    requirePatterns([
      { pattern: /CTRLPOINT_ARC_CONTRACT\.ownerAddress/, message: 'Separate poll-owner setup from the voter experience.' },
      { pattern: /CTRLPOINT_ARC_PAGE\.textToBytes32/, message: 'Encode poll labels with CTRLPOINT_ARC_PAGE.textToBytes32().' },
      { pattern: /CTRLPOINT_ARC_PAGE\.bytes32ToText/, message: 'Decode onchain poll labels with CTRLPOINT_ARC_PAGE.bytes32ToText().' },
      { pattern: runtimeCall('write', 'addOption'), message: 'Configure poll choices with addOption().' },
      { pattern: runtimeCall('write', 'openPoll'), message: 'Open the configured poll with openPoll().' },
      { pattern: runtimeCall('write', 'vote'), message: 'Submit votes through the poll contract.' },
      { pattern: runtimeCall('write', 'closePoll'), message: 'Expose closePoll() only to the owner.' },
      { pattern: runtimeCall('read', 'optionCount'), message: 'Read the live option count.' },
      { pattern: runtimeCall('read', 'options'), message: 'Read onchain option labels.' },
      { pattern: runtimeCall('read', 'votes'), message: 'Read live vote totals.' },
      { pattern: runtimeCall('read', 'hasVoted'), message: 'Prevent wallets from voting twice in the UI.' },
      { pattern: /CTRLPOINT_ARC_PAGE\.waitForReceipt/, message: 'Wait for poll transaction receipts before updating state.' },
      { pattern: /(?:disabled\s*=|\.disabled\s*=)/, message: 'Disable voting actions until the poll and wallet are ready.' },
    ])
  }
  if (category === 'membership') {
    requirePatterns([
      { pattern: /CTRLPOINT_ARC_CONTRACT\.ownerAddress/, message: 'Separate membership owner management from member checkout.' },
      { pattern: runtimeCall('write', 'setPlan'), message: 'Configure the membership plan through setPlan().' },
      { pattern: runtimeCall('write', 'join'), message: 'Join through the membership contract.' },
      { pattern: runtimeCall('write', 'withdraw'), message: 'Keep withdrawal available only in confirmed owner management.' },
      { pattern: runtimeCall('read', 'price'), message: 'Read the current membership price.' },
      { pattern: runtimeCall('read', 'durationSeconds'), message: 'Read the current membership duration.' },
      { pattern: runtimeCall('read', 'active'), message: 'Read the connected wallet membership status.' },
      { pattern: runtimeCall('read', 'memberUntil'), message: 'Read the membership expiry time.' },
      { pattern: /CTRLPOINT_ARC_PAGE\.waitForReceipt/, message: 'Wait for membership transaction receipts before updating state.' },
      { pattern: /(?:disabled\s*=|\.disabled\s*=)/, message: 'Disable membership actions until their prerequisites are ready.' },
    ])
  }
  if (category === 'games') {
    requirePatterns([
      { pattern: /CTRLPOINT_ARC_CONTRACT\.ownerAddress/, message: 'Show round management only to the connected contract owner.' },
      { pattern: runtimeCall('write', 'submitScore'), message: 'Submit completed game scores through the leaderboard contract.' },
      { pattern: runtimeCall('write', 'enter'), message: 'Enter the current game round through the leaderboard contract.' },
      { pattern: runtimeCall('write', 'setEntryFee'), message: 'Allow only the owner to configure the game entry fee.' },
      { pattern: runtimeCall('write', 'resetRound'), message: 'Keep round reset available only to the owner.' },
      { pattern: runtimeCall('write', 'withdraw'), message: 'Allow only the owner to withdraw collected entry payments.' },
      { pattern: runtimeCall('read', 'roundId'), message: 'Read the active leaderboard round.' },
      { pattern: runtimeCall('read', 'entryFee'), message: 'Read the current USDC entry fee.' },
      { pattern: runtimeCall('read', 'entered'), message: 'Check that the connected wallet entered the current round.' },
      { pattern: runtimeCall('read', 'bestScore'), message: 'Read wallet best scores from the contract.' },
      { pattern: runtimeCall('read', 'playerCount'), message: 'Read the number of leaderboard players.' },
      { pattern: runtimeCall('read', 'playerAt'), message: 'Read leaderboard player addresses.' },
      { pattern: /CTRLPOINT_ARC_PAGE\.waitForReceipt/, message: 'Wait for score submission receipts before showing success.' },
      { pattern: /(?:disabled\s*=|\.disabled\s*=)/, message: 'Disable score submission until a game is complete and wallet is connected.' },
      { pattern: /(?:pointerdown|pointerup|keydown|click)/i, message: 'Implement actual playable controls rather than a static game mock.' },
    ])
    if (/automatic(?:ally)?\s+(?:award|pay|distribute)|winner\s+(?:payout|payment)|prize\s*(?:pool|fund)/i.test(html)) {
      errors.push('Games must not automatically award funds based on browser-submitted scores.')
    }
    if (/cheat[- ]?proof|server[- ]verified|provably fair/i.test(html)) {
      errors.push('Do not claim client-submitted game scores are cheat-proof or server-verified.')
    }
    if (/<input[^>]+(?:name|id|placeholder)=["'][^"']*score/i.test(html)) {
      errors.push('Players must not manually type leaderboard scores.')
    }
  }
  if (category === 'custom') {
    requirePatterns([
      { pattern: /CTRLPOINT_ARC_CONTRACT/, message: 'Read the generated custom contract metadata from CTRLPOINT_ARC_CONTRACT.' },
      { pattern: /CTRLPOINT_ARC_RUNTIME\.connect/, message: 'Connect a wallet before custom contract actions.' },
      { pattern: /CTRLPOINT_ARC_RUNTIME\.write/, message: 'Implement the custom dApp primary action through the generated contract.' },
      { pattern: /CTRLPOINT_ARC_RUNTIME\.read/, message: 'Read the custom contract state instead of showing local-only results.' },
      { pattern: /CTRLPOINT_ARC_PAGE\.waitForReceipt/, message: 'Wait for custom contract transaction receipts before showing success.' },
      { pattern: /(?:disabled\s*=|\.disabled\s*=)/, message: 'Disable custom contract actions until their prerequisites are ready.' },
    ])
  }
  if (contractCategories.has(category)) {
    if (!/CTRLPOINT_ARC_CONTRACT/.test(html)) errors.push('Read deployed contract metadata from CTRLPOINT_ARC_CONTRACT.')
    if (!/CTRLPOINT_ARC_RUNTIME\.connect/.test(html)) errors.push('Connect the wallet before contract actions.')
    if (!/CTRLPOINT_ARC_RUNTIME\.write/.test(html)) errors.push('Use the generated contract runtime for the primary onchain action.')
    if (!/CTRLPOINT_ARC_RUNTIME\.read/.test(html)) errors.push('Read live contract state instead of showing local-only status.')
  }
  if (['wallet-tools', 'eligibility'].includes(category)) {
    requirePatterns([
      { pattern: /eth_getBalance/, message: 'Read the wallet native USDC balance from Arc RPC.' },
      { pattern: /eth_getTransactionCount/, message: 'Read the wallet transaction count from Arc RPC.' },
      { pattern: /0x\[a-fA-F0-9\].*40|a-fA-F0-9\]\{40\}/, message: 'Validate pasted EVM wallet addresses before querying RPC.' },
      { pattern: /(?:disabled\s*=|\.disabled\s*=)/, message: 'Disable wallet lookup actions while input is invalid or a request is running.' },
    ])
  }
  if (category === 'dashboards') {
    requirePatterns([
      { pattern: /CTRLPOINT_ARC_PAGE\.rpc/, message: 'Use the shared Arc RPC helper for dashboard data.' },
      { pattern: /eth_getBalance|eth_getTransactionCount|eth_getTransactionReceipt|eth_call/, message: 'Load real Arc RPC data for the dashboard.' },
      { pattern: /(?:disabled\s*=|\.disabled\s*=)/, message: 'Disable dashboard refresh actions while inputs are invalid or loading.' },
    ])
  }
  if (['wallet-tools', 'tip-jar', 'eligibility', 'dashboards'].includes(category)
    && !/(CTRLPOINT_ARC_PAGE\.rpc|eth_getBalance|eth_getTransaction|eth_sendTransaction|window\.ethereum)/.test(html)) {
    errors.push('Implement the requested Arc wallet or RPC behavior instead of a static mock.')
  }
  return errors
}

function parseResponse(raw: string): AIResponse {
  let trimmed = raw.trim()

  if (!trimmed) {
    return { type: 'chat', text: 'The AI provider returned an empty response. Please retry the generation.' }
  }

  const fencedHtml = trimmed.match(/```(?:html)?\s*([\s\S]*?)```/i)
  if (fencedHtml?.[1] && /<!doctype\s+html|<html[\s>]/i.test(fencedHtml[1])) {
    trimmed = fencedHtml[1].trim()
  }

  // Find HTML anywhere in the response (AI sometimes adds preamble text)
  const metaMatchInFull = /<!--\s*META:\s*(\{[\s\S]*?\})\s*-->/i.exec(trimmed)
  const metaIdx = metaMatchInFull?.index ?? -1
  const docMatch = /<!doctype\s+html/i.exec(trimmed)
  const htmlMatch = /<html[\s>]/i.exec(trimmed)
  const doctypeIdx = docMatch?.index ?? -1
  const htmlTagIdx = htmlMatch?.index ?? -1
  const candidates = [metaIdx, doctypeIdx, htmlTagIdx].filter(idx => idx >= 0)
  const htmlStart = candidates.length > 0 ? Math.min(...candidates) : -1

  if (htmlStart !== -1) {
    const htmlBlock = trimmed.slice(htmlStart)
    const metaMatch = htmlBlock.match(/<!--\s*META:\s*(\{[\s\S]*?\})\s*-->/i)
    let title = 'My Site'
    let description = ''
    if (metaMatch) {
      try {
        const meta = JSON.parse(metaMatch[1])
        title = (meta.title || 'My Site').slice(0, 50)
        description = (meta.description || '').slice(0, 250)
      } catch {}
    }
    let html = htmlBlock.replace(/<!--\s*META:\s*\{[\s\S]*?\}\s*-->\n?/i, '').trim()

    if (!/<!doctype\s+html/i.test(html) && /<html[\s>]/i.test(html)) {
      html = `<!DOCTYPE html>\n${html}`
    }
    if (!/<\/html>/i.test(html) && /<\/body>/i.test(html)) {
      html = `${html}\n</html>`
    }

    if (!/<!doctype\s+html/i.test(html) || !/<html[\s>]/i.test(html) || !/<\/html>/i.test(html)) {
      return { type: 'chat', text: 'The AI provider returned incomplete HTML. Please retry the generation.' }
    }

    return { type: 'site', html, title, description }
  }

  return { type: 'chat', text: trimmed }
}

function isIncompleteHtmlResponse(response: AIResponse) {
  return response.type === 'chat'
    && /AI provider returned incomplete HTML/i.test(response.text || '')
}

async function callAIForHtml(
  system: string,
  messages: ChatMessage[],
  model?: AllowedModel,
  userKeys?: UserKeys,
  reasoningEffort?: ReasoningEffort,
): Promise<AIResponse> {
  const deadline = Date.now() + HTML_GENERATION_DEADLINE_MS
  const requestTimeout = () => Math.max(1_000, Math.min(AI_REQUEST_TIMEOUT_MS, deadline - Date.now()))
  let result = await callAI(
    system,
    messages,
    model,
    userKeys,
    reasoningEffort,
    HTML_MAX_OUTPUT_TOKENS,
    requestTimeout(),
  )
  const usage: AIUsage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 }
  addUsage(usage, result.usage)
  let assembled = result.raw
  let parsed = parseResponse(assembled)

  for (let attempt = 0; attempt < HTML_CONTINUATION_ATTEMPTS && isIncompleteHtmlResponse(parsed); attempt += 1) {
    if (deadline - Date.now() < 2_000) break
    console.info('[AI] continuing incomplete HTML', {
      attempt: attempt + 1,
      stopReason: result.stopReason ?? 'unknown',
      outputChars: assembled.length,
    })
    const tail = assembled.slice(-HTML_CONTINUATION_CONTEXT_CHARS)
    result = await callAI(
      system,
      [
        ...messages,
        { role: 'assistant', content: tail },
        {
          role: 'user',
          content: 'Continue the same HTML document exactly where it stopped. Return only the missing suffix. Do not repeat the META comment, doctype, html, head, or body opening tags. Do not use markdown fences or commentary. Finish the current CSS or JavaScript safely and close every open tag.',
        },
      ],
      model,
      userKeys,
      undefined,
      HTML_CONTINUATION_MAX_OUTPUT_TOKENS,
      requestTimeout(),
    )
    addUsage(usage, result.usage)
    assembled = mergeHtmlContinuation(assembled, result.raw)
    parsed = parseResponse(assembled)
  }

  return { ...parsed, usage }
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function chat(history: ChatMessage[], model?: AllowedModel, userKeys?: UserKeys, reasoningEffort?: ReasoningEffort): Promise<AIResponse> {
  const result = await callAI(creativeVariationSystem(CHAT_SYSTEM), history, model, userKeys, reasoningEffort)
  return { ...parseResponse(result.raw), usage: result.usage }
}

function arcCategorySystem(category: ArcWeb3Category) {
  return `${ARC_WEB3_SYSTEM}

${ARC_CATEGORY_INSTRUCTIONS[category]}

CATEGORY GUIDANCE:
- Use the category to choose suitable wallet, contract, and RPC primitives.
- Preserve the user's requested product and interaction model instead of forcing it into a stock example.`
}

export async function arcWeb3Chat(history: ChatMessage[], category: ArcWeb3Category, model?: AllowedModel, userKeys?: UserKeys, reasoningEffort?: ReasoningEffort): Promise<AIResponse> {
  const categorySystem = arcCategorySystem(category)
  return callAIForHtml(creativeVariationSystem(categorySystem), history, model, userKeys, reasoningEffort)
}

export async function updateArcSiteChat(
  existingCode: string,
  history: ChatMessage[],
  category: ArcWeb3Category,
  model?: AllowedModel,
  userKeys?: UserKeys,
  reasoningEffort?: ReasoningEffort,
): Promise<AIResponse> {
  const system = `${arcCategorySystem(category)}

EDIT MODE:
- Apply the requested change to the existing dApp and return the complete updated HTML.
- Preserve working wallet, contract, receipt verification, share-link, and responsive behavior unless the user explicitly asks to replace it.
- Do not replace an onchain status check with localStorage, a manual confirmation button, or explanatory placeholder copy.

CURRENT DAPP CODE:
${existingCode}`
  return callAIForHtml(system, history, model, userKeys, reasoningEffort)
}

export interface ArcContractGeneration {
  contractName: string
  summary: string
  sourceCode: string
  usage?: AIUsage
}

const ARC_CONTRACT_SYSTEM = `You generate a single, compact Solidity contract for an Arc Testnet dApp.

Return JSON only with this exact shape:
{"contractName":"PascalCaseName","summary":"One plain-English sentence","sourceCode":"full Solidity source"}

Contract requirements:
- Solidity pragma ^0.8.20.
- No imports, libraries, proxies, assembly, delegatecall, selfdestruct, tx.origin, or upgrade mechanism.
- Exactly one deployable contract.
- The constructor must accept exactly one argument: address owner_.
- Store owner_ in a public owner variable, reject address(0), and use owner authorization for administrative actions.
- User-facing external functions must use only static arguments that CtrlPoint's runtime can encode: address, uint/int, bool, or bytes32. Avoid string, bytes, tuple, or array inputs in browser-facing actions.
- Expose simple view getters with address, uint/int, bool, or bytes32 outputs. Avoid returning dynamic arrays or structs to the generated frontend.
- Values known from the prompt, such as poll choices or game rules, may be constants in the contract.
- Include clear events and custom errors or concise require messages.
- Keep loops bounded by small arrays supplied at setup time.
- For native USDC transfers, use checks-effects-interactions and a nonReentrant guard. Do not use Solidity transfer() or send().
- Do not promise financial safety, randomness, privacy, or fraud resistance that the contract cannot provide.
- Do not include markdown fences or prose outside the JSON.`

function parseArcContract(raw: string): Omit<ArcContractGeneration, 'usage'> {
  const trimmed = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '')
  let parsed: any
  try {
    parsed = JSON.parse(trimmed)
  } catch {
    const start = trimmed.indexOf('{')
    const end = trimmed.lastIndexOf('}')
    if (start < 0 || end <= start) throw new AppError(502, 'The AI provider returned an invalid contract specification.')
    try {
      parsed = JSON.parse(trimmed.slice(start, end + 1))
    } catch {
      throw new AppError(502, 'The AI provider returned an invalid contract specification.')
    }
  }
  const contractName = String(parsed.contractName || '').trim()
  const summary = String(parsed.summary || '').trim()
  const sourceCode = String(parsed.sourceCode || '').trim()
  if (!contractName || !summary || !sourceCode) {
    throw new AppError(502, 'The AI provider returned an incomplete contract specification.')
  }
  return {
    contractName: contractName.slice(0, 64),
    summary: summary.slice(0, 300),
    sourceCode,
  }
}

export async function generateArcContract(
  prompt: string,
  category: ArcWeb3Category,
  model?: AllowedModel,
  userKeys?: UserKeys,
  reasoningEffort?: ReasoningEffort,
): Promise<ArcContractGeneration> {
  const result = await callAI(
    ARC_CONTRACT_SYSTEM,
    [{
      role: 'user',
      content: `Category: ${category}\nUser request: ${prompt}\nGenerate only the minimum contract needed for this product.`,
    }],
    model,
    userKeys,
    reasoningEffort,
    12_000,
  )
  return { ...parseArcContract(result.raw), usage: result.usage }
}

export async function updateSiteChat(existingCode: string, history: ChatMessage[], model?: AllowedModel, userKeys?: UserKeys, reasoningEffort?: ReasoningEffort): Promise<AIResponse> {
  const systemWithCode = UPDATE_SYSTEM + `\n\nCURRENT SITE CODE:\n${existingCode}`
  const result = await callAI(systemWithCode, history, model, userKeys, reasoningEffort)
  return { ...parseResponse(result.raw), usage: result.usage }
}

export function activeProvider(): string {
  return cfg.aiProvider === 'openai' ? cfg.openaiModel : cfg.anthropicModel
}

// Legacy exports kept for compatibility
export async function generateSite(prompt: string): Promise<GenerateResult> {
  const res = await chat([{ role: 'user', content: prompt }])
  if (res.type === 'site') return { html: res.html!, title: res.title!, description: res.description! }
  throw new Error(res.text || 'Could not generate site from that prompt.')
}

export async function updateSite(existingCode: string, changeRequest: string): Promise<GenerateResult> {
  const res = await updateSiteChat(existingCode, [{ role: 'user', content: changeRequest }])
  if (res.type === 'site') return { html: res.html!, title: res.title!, description: res.description! }
  throw new Error(res.text || 'Could not apply changes.')
}
