import type { EveDynamicToolPart, EveMessage } from 'eve/react'
import { createContext, useContext } from 'react'

/** What artifact_publish / artifact_edit return (apps/agent/agent/tools/artifact_*.ts). */
export interface ArtifactOutput {
  kind: 'artifact'
  id: string
  title: string
  artifactKind: string
  version: number
  bytes: number
  url: string
  downloadUrl: string
}

export interface ArtifactVersion extends ArtifactOutput {
  callId: string
}

export interface ArtifactEntry {
  id: string
  title: string
  artifactKind: string
  versions: ArtifactVersion[]
}

export const ARTIFACT_TOOLS = new Set(['artifact_publish', 'artifact_edit', 'artifact_read'])

export function isArtifactOutput(value: unknown): value is ArtifactOutput {
  return typeof value === 'object' && value !== null && (value as { kind?: unknown }).kind === 'artifact'
}

/** Every artifact the conversation produced, with its versions in order. */
export function collectArtifacts(messages: readonly EveMessage[]): Map<string, ArtifactEntry> {
  const out = new Map<string, ArtifactEntry>()
  for (const message of messages) {
    for (const part of message.parts) {
      if (part.type !== 'dynamic-tool' || part.state !== 'output-available' || part.partial) continue
      if (!isArtifactOutput(part.output)) continue
      const o = part.output
      const entry = out.get(o.id) ?? { id: o.id, title: o.title, artifactKind: o.artifactKind, versions: [] }
      entry.title = o.title
      if (!entry.versions.some((v) => v.version === o.version)) entry.versions.push({ ...o, callId: part.toolCallId })
      out.set(o.id, entry)
    }
  }
  return out
}

/** An artifact_publish call whose HTML is still being written. */
export function draftParts(messages: readonly EveMessage[]): EveDynamicToolPart[] {
  const last = messages.at(-1)
  if (!last || last.role !== 'assistant') return []
  return last.parts.filter(
    (p): p is EveDynamicToolPart =>
      p.type === 'dynamic-tool' &&
      p.toolName === 'artifact_publish' &&
      (p.state === 'input-streaming' || p.state === 'input-available'),
  )
}

/** The `html` string so far, out of tool input JSON that may stop mid-string or mid-escape. */
export function partialHtml(inputText: string | undefined): string | null {
  if (!inputText) return null
  const key = inputText.search(/"html"\s*:\s*"/)
  if (key < 0) return null
  const start = inputText.indexOf('"', inputText.indexOf(':', key)) + 1
  let i = start
  for (; i < inputText.length; i++) {
    if (inputText[i] === '\\') i++
    else if (inputText[i] === '"') break
  }
  let body = inputText.slice(start, Math.min(i, inputText.length))
  // Drop an escape cut in half: a lone backslash, or \u with fewer than four hex digits.
  body = body.replace(/\\(u[0-9a-fA-F]{0,3})?$/, '')
  try {
    return JSON.parse(`"${body}"`) as string
  } catch {
    return null
  }
}

/** A draft for the no-script preview frame: the page as far as it is written, with a CSP that runs nothing. */
export function draftDocument(html: string): string {
  const csp = "default-src 'none'; script-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:"
  const meta = `<meta http-equiv="Content-Security-Policy" content="${csp}">`
  return /<head[^>]*>/i.test(html) ? html.replace(/<head([^>]*)>/i, `<head$1>${meta}`) : meta + html
}

export type PanelTarget = { mode: 'artifact'; id: string; version?: number } | { mode: 'draft'; callId: string }

export const ArtifactPanelContext = createContext<{ open: (target: PanelTarget) => void }>({ open: () => {} })
export const useArtifactPanel = () => useContext(ArtifactPanelContext)
