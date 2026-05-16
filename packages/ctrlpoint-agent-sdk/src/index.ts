export type DeployStatus = 'QUEUED' | 'BUILDING' | 'UPLOADING' | 'MNS_REGISTERING' | 'COMPLETE' | 'FAILED'

export interface CtrlPointAgentOptions {
  apiUrl: string
  apiKey: string
  fetchImpl?: typeof fetch
}

export interface DeployBaseOptions {
  mnsName: string
  siteId?: string
  title?: string
  description?: string
}

export interface DeployHtmlOptions extends DeployBaseOptions {
  html: string
}

export interface DeployFileOptions extends DeployBaseOptions {
  file: Blob | ArrayBuffer | Uint8Array
  filename?: string
}

export interface DeployFrameworkOptions extends DeployFileOptions {
  projectRoot?: string
  buildCommand?: string
  outputDir?: string
  buildEnv?: string | Record<string, string>
}

export interface DeployResponse {
  siteId: string
  deploymentId: string
  status: DeployStatus
  statusUrl?: string
  url: string
  scAddress?: string
  creditsCharged: number
  message: string
}

export interface DeploymentResponse {
  deploymentId: string
  siteId: string
  status: DeployStatus
  step: string
  error?: string
  scAddress?: string
  url?: string
  createdAt: string
  updatedAt: string
}

export class CtrlPointAgent {
  private apiUrl: string
  private apiKey: string
  private fetchImpl: typeof fetch

  constructor(options: CtrlPointAgentOptions) {
    if (!options.apiUrl) throw new Error('apiUrl is required.')
    if (!options.apiKey) throw new Error('apiKey is required.')
    this.apiUrl = options.apiUrl.replace(/\/+$/, '')
    this.apiKey = options.apiKey
    this.fetchImpl = options.fetchImpl || fetch
  }

  async capabilities<T = unknown>(): Promise<T> {
    return this.request<T>('/api/agent/capabilities')
  }

  async sites<T = unknown>(): Promise<T> {
    return this.request<T>('/api/agent/sites', { auth: true })
  }

  async deployment(deploymentId: string): Promise<DeploymentResponse> {
    return this.request<DeploymentResponse>(`/api/agent/deployments/${encodeURIComponent(deploymentId)}`, { auth: true })
  }

  async deployHtml(options: DeployHtmlOptions): Promise<DeployResponse> {
    return this.request<DeployResponse>('/api/agent/deploy', {
      auth: true,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(options),
    })
  }

  async deployStaticFile(options: DeployFileOptions): Promise<DeployResponse> {
    return this.deployMultipart(options)
  }

  async deployFramework(options: DeployFrameworkOptions): Promise<DeployResponse> {
    return this.deployMultipart({ ...options, projectType: 'framework' } as DeployFrameworkOptions & { projectType: string })
  }

  async waitForDeployment(deploymentId: string, options: { intervalMs?: number; timeoutMs?: number } = {}): Promise<DeploymentResponse> {
    const intervalMs = options.intervalMs ?? 3000
    const timeoutMs = options.timeoutMs ?? 15 * 60 * 1000
    const started = Date.now()

    while (true) {
      const status = await this.deployment(deploymentId)
      if (status.status === 'COMPLETE' || status.status === 'FAILED') return status
      if (Date.now() - started > timeoutMs) throw new Error(`Timed out waiting for deployment ${deploymentId}.`)
      await new Promise(resolve => setTimeout(resolve, intervalMs))
    }
  }

  private async deployMultipart(options: (DeployFileOptions | DeployFrameworkOptions) & { projectType?: string }): Promise<DeployResponse> {
    const form = new FormData()
    form.set('mnsName', options.mnsName)
    if (options.siteId) form.set('siteId', options.siteId)
    if (options.title) form.set('title', options.title)
    if (options.description) form.set('description', options.description)
    if (options.projectType) form.set('projectType', options.projectType)
    if ('projectRoot' in options && options.projectRoot) form.set('projectRoot', options.projectRoot)
    if ('buildCommand' in options && options.buildCommand) form.set('buildCommand', options.buildCommand)
    if ('outputDir' in options && options.outputDir) form.set('outputDir', options.outputDir)
    if ('buildEnv' in options && options.buildEnv) {
      form.set('buildEnv', typeof options.buildEnv === 'string'
        ? options.buildEnv
        : Object.entries(options.buildEnv).map(([key, value]) => `${key}=${value}`).join('\n'))
    }

    const file = options.file instanceof Blob ? options.file : new Blob([toBlobPart(options.file)])
    form.set('file', file, options.filename || (options.projectType === 'framework' ? 'project.zip' : 'site.zip'))

    return this.request<DeployResponse>('/api/agent/deploy', {
      auth: true,
      method: 'POST',
      body: form,
    })
  }

  private async request<T>(path: string, init: RequestInit & { auth?: boolean } = {}): Promise<T> {
    const headers = new Headers(init.headers)
    if (init.auth) headers.set('Authorization', `Bearer ${this.apiKey}`)

    const res = await this.fetchImpl(`${this.apiUrl}${path}`, { ...init, headers })
    const text = await res.text()
    const data = text ? JSON.parse(text) : null
    if (!res.ok) {
      throw new Error(data?.error || data?.message || `CtrlPoint API request failed with ${res.status}.`)
    }
    return data as T
  }
}

function toBlobPart(file: ArrayBuffer | Uint8Array): BlobPart {
  if (file instanceof ArrayBuffer) return file
  return file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength) as ArrayBuffer
}
