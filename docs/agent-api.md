# CtrlPoint Agent Deploy API

The Agent Deploy API lets automation tools deploy and update CtrlPoint sites without a browser session.

## Auth

Create an agent key from a logged-in CtrlPoint account:

```bash
curl -X POST "$API_URL/api/agent/keys" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $USER_JWT" \
  -d '{"name":"build-agent"}'
```

Use the returned key once; only its prefix is stored after creation.

```bash
Authorization: Bearer cp_agent_...
```

or:

```bash
X-CtrlPoint-Agent-Key: cp_agent_...
```

## Capabilities

```bash
curl "$API_URL/api/agent/capabilities"
```

The route is public and machine-readable so agents can inspect accepted source types, update rules, and MNS constraints.

## Static Deploy

Deploy raw HTML:

```bash
curl -X POST "$API_URL/api/agent/deploy" \
  -H "Idempotency-Key: agent-task-123" \
  -H "Authorization: Bearer $CTRLPOINT_AGENT_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "mnsName": "my-agent-site",
    "title": "My Agent Site",
    "description": "Created by an AI agent",
    "html": "<!doctype html><html><head><title>My Agent Site</title></head><body>Hello</body></html>"
  }'
```

Deploy a `.html` or static `.zip` artifact:

```bash
curl -X POST "$API_URL/api/agent/deploy" \
  -H "Idempotency-Key: agent-task-124" \
  -H "Authorization: Bearer $CTRLPOINT_AGENT_KEY" \
  -F "mnsName=my-agent-site" \
  -F "title=My Agent Site" \
  -F "file=@dist.zip"
```

Static deploys return `202` with a `deploymentId`. Poll:

```bash
curl "$API_URL/api/agent/deployments/$DEPLOYMENT_ID" \
  -H "Authorization: Bearer $CTRLPOINT_AGENT_KEY"
```

For x402 wallet-paid deploys, the same status URL can be polled without an agent key. The `deploymentId` is unguessable and the response only includes deployment status, error, URL, and contract address.

## Framework Deploy

Send a zipped project containing `package.json`. CtrlPoint installs dependencies, runs the build command, uploads the output directory, and returns when the deployment finishes.

```bash
curl -X POST "$API_URL/api/agent/deploy" \
  -H "Idempotency-Key: agent-task-125" \
  -H "Authorization: Bearer $CTRLPOINT_AGENT_KEY" \
  -F "projectType=framework" \
  -F "mnsName=my-react-site" \
  -F "title=My React Site" \
  -F "projectRoot=." \
  -F "buildCommand=npm run build" \
  -F "outputDir=dist" \
  -F "buildEnv=VITE_API_URL=https://api.example.com" \
  -F "file=@project.zip"
```

Supported package managers are npm, pnpm, and yarn based on lockfiles.

## Updates

Update an existing site by passing either `siteId` or the same `mnsName`.

```bash
curl -X POST "$API_URL/api/agent/update" \
  -H "Idempotency-Key: agent-update-001" \
  -H "Authorization: Bearer $CTRLPOINT_AGENT_KEY" \
  -F "siteId=$SITE_ID" \
  -F "mnsName=my-agent-site" \
  -F "file=@new-dist.zip"
```

For framework updates, use:

```bash
curl -X POST "$API_URL/api/agent/update/framework" \
  -H "Idempotency-Key: agent-update-002" \
  -H "Authorization: Bearer $CTRLPOINT_AGENT_KEY" \
  -F "siteId=$SITE_ID" \
  -F "buildCommand=npm run build" \
  -F "outputDir=dist" \
  -F "file=@updated-project.zip"
```

Updates keep the same MNS name and smart-contract target. Short-name MNS credits are only charged on the initial deploy.

## Discovery

Agents should start with:

```bash
curl "$API_URL/api/agent/capabilities"
```

For structured registration and tool generation:

```bash
curl "$API_URL/api/agent/manifest"
curl "$API_URL/api/agent/openapi.json"
```

These public endpoints describe supported source types, deploy/update endpoints, prices, MNS rules, idempotency behavior, and example payloads.

## Idempotency

Every deploy/update request should include:

```bash
Idempotency-Key: stable-task-or-deploy-id
```

The key is scoped to the payer identity:

- For x402: payer wallet + network.
- For CtrlPoint API keys: account owner.

Same key and same request returns the original deployment response. Same key with a different file/body returns `409`. This prevents duplicate deployments when an agent retries after a timeout.

## Credit Rules

6+ character MNS names are free right now. Shorter names charge the same credits as their MAS registration cost:

- 5 characters: 10 credits
- 4 characters: 100 credits
- 3 characters: 1,000 credits
- 2 characters: 10,000 credits

If the account has insufficient credits, the API returns `402`.

## Circle x402 / Gateway Payments

When `CIRCLE_X402_ENABLED=true`, agents can call deploy endpoints without a CtrlPoint account or agent key. CtrlPoint returns `402 Payment Required`; the agent pays with Circle Gateway/x402 and retries with the payment proof.

Required server env:

```bash
CIRCLE_X402_ENABLED=true
CIRCLE_X402_SELLER_ADDRESS=0xYourSellerWallet
CIRCLE_X402_FACILITATOR_URL=https://gateway-api.circle.com
CIRCLE_X402_STATIC_DEPLOY_PRICE=$0.01
CIRCLE_X402_FRAMEWORK_DEPLOY_PRICE=$0.01
CIRCLE_X402_STATIC_UPDATE_PRICE=$0.001
CIRCLE_X402_FRAMEWORK_UPDATE_PRICE=$0.001
```

For Arc Testnet:

```bash
CIRCLE_X402_FACILITATOR_URL=https://gateway-api-testnet.circle.com
CIRCLE_X402_NETWORKS=eip155:5042002
```

Paid endpoints for Marketplace listing:

- `POST /api/agent/deploy` for new HTML/static zip deploys.
- `POST /api/agent/deploy/framework` for new framework project zip deploys.
- `POST /api/agent/update` for cheap HTML/static updates.
- `POST /api/agent/update/framework` for cheap framework updates.

Wallet-paid deploys require 6+ character MNS names right now. Short MNS names use CtrlPoint credits and require an authenticated CtrlPoint account.

Example buyer flow with Circle Gateway:

```ts
import { GatewayClient } from '@circle-fin/x402-batching/client'

const client = new GatewayClient({
  chain: 'arcTestnet',
  privateKey: process.env.AGENT_WALLET_PRIVATE_KEY as `0x${string}`,
})

const form = new FormData()
form.set('mnsName', 'agent-demo-site')
form.set('title', 'Agent Demo')
form.set('projectType', 'framework')
form.set('buildCommand', 'npm run build')
form.set('outputDir', 'dist')
form.set('file', projectZipBlob, 'project.zip')

const { data, status } = await client.pay(
  'https://ctrlpoint-api.fly.dev/api/agent/deploy/framework',
  {
    method: 'POST',
    headers: { 'Idempotency-Key': 'agent-task-124' },
    body: form,
  }
)
```

The same payer wallet maps to the same internal CtrlPoint owner, so it can update its own sites later by passing `siteId` or the same `mnsName`.
