import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
import { prepare, type DataTable, type Library } from '@tianyancha-agent/artifacts'
import { outputRoot, safe } from '#lib/db.ts'

/**
 * Artifacts live next to a session's query results:
 *   OUTPUT_DIR/<sessionId>/artifacts/<id>/meta.json, v1.html, v2.html, …
 * Each version keeps the raw page the model wrote and the data it names; DATA and libraries are
 * added when the page is served (lib/artifacts prepare), so the stored page stays small.
 */
export interface ArtifactMeta {
  id: string
  title: string
  kind: string
  versions: { version: number; createdAt: string; bytes: number; data: Record<string, string> }[]
}

function dir(sessionId: string, id?: string): string {
  const base = path.join(outputRoot(), safe(sessionId), 'artifacts')
  return id ? path.join(base, safe(id)) : base
}

export async function readMeta(sessionId: string, id: string): Promise<ArtifactMeta | null> {
  try {
    return JSON.parse(await readFile(path.join(dir(sessionId, id), 'meta.json'), 'utf8')) as ArtifactMeta
  } catch {
    return null
  }
}

export async function readVersion(sessionId: string, id: string, version: number): Promise<string | null> {
  try {
    return await readFile(path.join(dir(sessionId, id), `v${version}.html`), 'utf8')
  } catch {
    return null
  }
}

export async function saveVersion(
  sessionId: string,
  meta: Omit<ArtifactMeta, 'versions'> & { versions?: ArtifactMeta['versions'] },
  html: string,
  data: Record<string, string>,
): Promise<ArtifactMeta> {
  const versions = meta.versions ?? []
  const version = (versions.at(-1)?.version ?? 0) + 1
  const target = dir(sessionId, meta.id)
  await mkdir(target, { recursive: true })
  await writeFile(path.join(target, `v${version}.html`), html)
  const next: ArtifactMeta = {
    id: meta.id,
    title: meta.title,
    kind: meta.kind,
    versions: [...versions, { version, createdAt: new Date().toISOString(), bytes: Buffer.byteLength(html), data }],
  }
  await writeFile(path.join(target, 'meta.json'), JSON.stringify(next, null, 2))
  return next
}

export function newArtifactId(): string {
  return `a${Date.now().toString(36).slice(-5)}${Math.random().toString(36).slice(2, 5)}`
}

/** Saved query results this session can hand to an artifact, by file name (the CSV name works too). */
export async function availableData(sessionId: string): Promise<string[]> {
  try {
    const names = await readdir(path.join(outputRoot(), safe(sessionId)))
    return names.filter((n) => n.endsWith('.json')).map((n) => n.replace(/\.json$/, '.csv'))
  } catch {
    return []
  }
}

/** Loads `alias → result file` as `alias → { columns, rows }`; throws naming what is missing. */
export async function loadData(sessionId: string, refs: Record<string, string>): Promise<Record<string, DataTable>> {
  const out: Record<string, DataTable> = {}
  for (const [alias, file] of Object.entries(refs)) {
    const json = path.basename(file).replace(/\.csv$/, '') + '.json'
    try {
      out[alias] = JSON.parse(await readFile(path.join(outputRoot(), safe(sessionId), json), 'utf8')) as DataTable
    } catch {
      const known = await availableData(sessionId)
      throw new Error(
        `找不到数据 ${file}（别名 ${alias}）。本会话可用的结果：${known.length ? known.join('、') : '（还没有查询结果，先用 company_sql / company_find 查询）'}`,
      )
    }
  }
  return out
}

const require = createRequire(import.meta.url)
const libraryCache = new Map<Library, string>()

/** Library sources, read once from node_modules. Pinned versions: see apps/agent/package.json. */
async function librarySources(names: Iterable<Library>): Promise<Partial<Record<Library, string>>> {
  const out: Partial<Record<Library, string>> = {}
  for (const name of names) {
    if (!libraryCache.has(name)) {
      const file = { echarts: 'echarts/dist/echarts.min.js' }[name]
      libraryCache.set(name, await readFile(require.resolve(file), 'utf8'))
    }
    out[name] = libraryCache.get(name)!
  }
  return out
}

/** The page as the browser gets it: with DATA and inlined libraries. */
export async function preparedPage(sessionId: string, id: string, version: number): Promise<{ html: string; meta: ArtifactMeta } | null> {
  const meta = await readMeta(sessionId, id)
  const entry = meta?.versions.find((v) => v.version === version)
  const raw = await readVersion(sessionId, id, version)
  if (!meta || !entry || raw === null) return null
  const libraries = [...raw.matchAll(/src\s*=\s*["']?lib:([a-z0-9-]+)/gi)].map((m) => m[1] as Library)
  const html = prepare(raw, { data: await loadData(sessionId, entry.data), libraries: await librarySources(libraries) })
  return { html, meta }
}

export function artifactUrls(sessionId: string, id: string, version: number) {
  const base = `/artifacts/${encodeURIComponent(safe(sessionId))}/${encodeURIComponent(safe(id))}/${version}`
  return { url: base, downloadUrl: `${base}?download=1` }
}

/**
 * A page that reads DATA must declare where it comes from. Without this the model writes a
 * hand-copied fallback dataset, which nothing checks (seen 2026-10-22).
 */
export async function missingData(sessionId: string, html: string, refs: Record<string, string>): Promise<string | null> {
  if (Object.keys(refs).length > 0 || !/\bDATA\b/.test(html)) return null
  const known = await availableData(sessionId)
  return (
    '页面读取了 DATA，但 data 参数为空。用 data 把别名映射到查询结果文件，例如 {"monthly":"<结果文件名>"}；' +
    `不要在页面里写备用数据。本会话可用的结果：${known.length ? known.join('、') : '（还没有，先查询）'}`
  )
}
