# @ctrlpoint/agent-sdk

Deploy and update CtrlPoint DeWeb sites from agents, scripts, and MCP tools.

```ts
import { CtrlPointAgent } from '@ctrlpoint/agent-sdk'

const ctrlpoint = new CtrlPointAgent({
  apiUrl: 'https://ctrlpoint-api.fly.dev',
  apiKey: process.env.CTRLPOINT_AGENT_KEY!,
})

const deploy = await ctrlpoint.deployHtml({
  mnsName: 'agent-demo-site',
  title: 'Agent Demo',
  html: '<!doctype html><html><head><title>Agent Demo</title></head><body>Live on DeWeb</body></html>',
})

const final = await ctrlpoint.waitForDeployment(deploy.deploymentId)
console.log(final.url)
```

Framework deploy:

```ts
import { readFile } from 'node:fs/promises'

const zip = new Blob([await readFile('./project.zip')])

await ctrlpoint.deployFramework({
  mnsName: 'agent-react-site',
  file: zip,
  filename: 'project.zip',
  buildCommand: 'npm run build',
  outputDir: 'dist',
  buildEnv: {
    VITE_API_URL: 'https://api.example.com',
  },
})
```

To update a site, pass the existing `siteId` or reuse the same `mnsName`.
