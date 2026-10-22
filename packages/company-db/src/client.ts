import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'

export interface CompanyDbConfig {
  url: string
  apiKey: string
  /** MCP calls in flight at once. More trips the server's statement timeout (spike 0.3). */
  concurrency: number
}

/** A tool result the server marked `isError`: a message for the model, not a transport fault. */
export class CompanyDbError extends Error {
  override name = 'CompanyDbError'
}

/**
 * One MCP connection per process, opened lazily. A lost session (the server drops it after
 * some failures, spike 0.1) is reconnected once and the call retried; a tool error never is.
 */
export class CompanyDb {
  #config: CompanyDbConfig
  #client: Promise<Client> | undefined
  #free: number
  #waiters: Array<() => void> = []

  constructor(config: CompanyDbConfig) {
    this.#config = config
    this.#free = config.concurrency
  }

  async call(
    name: string,
    args: Record<string, unknown>,
    { timeoutMs = 120_000, signal }: { timeoutMs?: number; signal?: AbortSignal } = {},
  ): Promise<unknown> {
    await this.#acquire()
    try {
      try {
        return await this.#callOnce(name, args, timeoutMs, signal)
      } catch (error) {
        if (error instanceof CompanyDbError || signal?.aborted) throw error
        await this.#reset()
        return await this.#callOnce(name, args, timeoutMs, signal)
      }
    } finally {
      this.#release()
    }
  }

  async close(): Promise<void> {
    await this.#reset()
  }

  async #callOnce(
    name: string,
    args: Record<string, unknown>,
    timeoutMs: number,
    signal: AbortSignal | undefined,
  ): Promise<unknown> {
    const client = await this.#connect()
    const result = await client.callTool({ name, arguments: args }, undefined, {
      timeout: timeoutMs,
      signal,
    })
    const text = Array.isArray(result.content)
      ? result.content.map((part) => (part.type === 'text' ? part.text : '')).join('')
      : ''
    if (result.isError) throw new CompanyDbError(cleanError(text) || `${name} failed`)
    return result.structuredContent ?? JSON.parse(text)
  }

  #connect(): Promise<Client> {
    this.#client ??= (async () => {
      const client = new Client({ name: 'tianyancha-agent', version: '0.0.0' })
      const transport = new StreamableHTTPClientTransport(new URL(this.#config.url), {
        requestInit: { headers: { 'X-API-Key': this.#config.apiKey } },
      })
      await client.connect(transport)
      return client
    })().catch((error: unknown) => {
      this.#client = undefined
      throw error
    })
    return this.#client
  }

  async #reset(): Promise<void> {
    const pending = this.#client
    this.#client = undefined
    await pending?.then((client) => client.close()).catch(() => {})
  }

  #acquire(): Promise<void> {
    if (this.#free > 0) {
      this.#free--
      return Promise.resolve()
    }
    return new Promise((resolve) => this.#waiters.push(resolve))
  }

  #release(): void {
    const next = this.#waiters.shift()
    if (next) next()
    else this.#free++
  }
}

/** Server errors carry sqlglot's terminal underline codes (ESC[4m … ESC[0m); drop them. */
export function cleanError(text: string): string {
  // oxlint-disable-next-line no-control-regex -- matching ESC is the point
  return text.replace(/\x1b\[[0-9;]*m/g, '').trim()
}
