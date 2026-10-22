import { Script } from 'node:vm'

/**
 * One self-contained HTML document per artifact version, after vercel-labs/fx0
 * (lib/design-artifact.ts): checked when the model publishes it, so a broken page comes back
 * as an error the model can fix, and prepared when served, inside a CSP sandbox.
 */

export const MAX_ARTIFACT_BYTES = 1024 * 1024

/** Libraries a page may load as `<script src="lib:<name>"></script>`; inlined when served. */
export const LIBRARIES = ['echarts'] as const
export type Library = (typeof LIBRARIES)[number]

const DOCTYPE = '<!doctype html>'

export type Validation =
  | { ok: true; html: string; bytes: number; libraries: Library[] }
  | { ok: false; error: string }

/** The document as stored: trimmed, with a canonical doctype first. */
export function normalize(html: string): string {
  return html.trim().replace(/^<!doctype\s+html\s*>/i, DOCTYPE)
}

export function validate(raw: string): Validation {
  const html = normalize(raw)
  const bytes = Buffer.byteLength(html, 'utf8')
  if (bytes > MAX_ARTIFACT_BYTES)
    return {
      ok: false,
      error: `页面超过 1 MB（${bytes} 字节）。数据放进 data 引用，不要写进 HTML。`,
    }
  if (!html.startsWith(DOCTYPE))
    return {
      ok: false,
      error: `必须以 <!doctype html> 开头，现在以 ${JSON.stringify(html.slice(0, 24))} 开头。`,
    }
  for (const tag of ['html', 'head', 'body']) {
    const open = html.match(new RegExp(`<${tag}(?:\\s[^>]*)?>`, 'gi'))?.length ?? 0
    const close = html.match(new RegExp(`</${tag}\\s*>`, 'gi'))?.length ?? 0
    if (open !== 1 || close !== 1)
      return {
        ok: false,
        error: `必须恰好有一个 <${tag}> 元素（现在开 ${open} 个、闭 ${close} 个）。`,
      }
  }

  const libraries = new Set<Library>()
  for (const match of html.matchAll(/<script\b([^>]*)>/gi)) {
    const src = attribute(match[1]!, 'src')
    if (src === undefined) continue
    const name = src.startsWith('lib:') ? src.slice(4) : null
    if (!name || !(LIBRARIES as readonly string[]).includes(name)) {
      return {
        ok: false,
        error: `外部脚本不可用：${src}。脚本写成内联；图表库用 <script src="lib:echarts"></script>。`,
      }
    }
    libraries.add(name as Library)
  }
  for (const tag of ['iframe', 'frame', 'object', 'embed', 'base', 'form']) {
    if (new RegExp(`<${tag}\\b`, 'i').test(html))
      return { ok: false, error: `不允许 <${tag}> 元素。` }
  }
  if (/<meta\b[^>]*http-equiv\s*=\s*["']?refresh/i.test(html))
    return { ok: false, error: '不允许 meta refresh。' }
  if (/\b(?:href|src|action)\s*=\s*["']?\s*(?:javascript|vbscript):/i.test(html))
    return { ok: false, error: '不允许 javascript: 链接。' }
  for (const match of html.matchAll(
    /<(?:img|source|video|audio)\b[^>]*\bsrc\s*=\s*["']?([^"'\s>]+)/gi,
  )) {
    if (!match[1]!.startsWith('data:'))
      return {
        ok: false,
        error: `图片和媒体只能用内嵌 data: URL，页面没有网络：${match[1]!.slice(0, 80)}`,
      }
  }
  if (/<link\b[^>]*rel\s*=\s*["']?stylesheet/i.test(html) || /@import\s/i.test(html)) {
    return {
      ok: false,
      error: '外部样式表和 @import 不可用（包括网络字体）；样式写在 <style> 里，字体用系统字体。',
    }
  }
  const syntax = scriptSyntaxError(html)
  if (syntax) return { ok: false, error: syntax }
  return { ok: true, html, bytes, libraries: [...libraries] }
}

/**
 * Compiles (never runs) each inline script, so a typo that would stop every chart on the page
 * comes back to the model with its line, instead of reaching the user as a blank page.
 */
function scriptSyntaxError(html: string): string | null {
  const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)].filter(
    (m) =>
      attribute(m[1]!, 'src') === undefined &&
      !/type\s*=\s*["']?(?!text\/javascript|module)[^"'\s>]/i.test(m[1]!),
  )
  for (const [index, match] of scripts.entries()) {
    const code = match[2]!
    try {
      // oxlint-disable-next-line no-new -- compiling is the check; the script never runs
      new Script(code, { filename: `script-${index + 1}.js` })
    } catch (error) {
      if (!(error instanceof SyntaxError)) continue
      const line = Number(/script-\d+\.js:(\d+)/.exec(String(error.stack))?.[1] ?? 0)
      const excerpt = line ? code.split('\n')[line - 1]?.trim().slice(0, 160) : ''
      return `第 ${index + 1} 段内联脚本有语法错误${line ? `（第 ${line} 行）` : ''}：${error.message}${excerpt ? `\n出错行：${excerpt}` : ''}\n页面脚本会整段失效（图表不显示），修正后再发布。`
    }
  }
  return null
}

function attribute(attributes: string, name: string): string | undefined {
  const match = attributes.match(
    new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'),
  )
  return match ? (match[1] ?? match[2] ?? match[3]) : undefined
}

export interface Edit {
  old_string: string
  new_string: string
}

/** Applies exact replacements in order; each old_string must match exactly once at its turn. */
export function applyEdits(
  html: string,
  edits: Edit[],
): { ok: true; html: string } | { ok: false; error: string } {
  let current = html
  for (const [index, edit] of edits.entries()) {
    const first = current.indexOf(edit.old_string)
    if (edit.old_string === '' || first < 0) {
      return {
        ok: false,
        error: `第 ${index + 1} 处修改：old_string 在当前页面中找不到。先用 artifact_read 读取当前内容。`,
      }
    }
    if (current.indexOf(edit.old_string, first + 1) >= 0) {
      return {
        ok: false,
        error: `第 ${index + 1} 处修改：old_string 出现了多次，加上前后文让它唯一。`,
      }
    }
    current =
      current.slice(0, first) + edit.new_string + current.slice(first + edit.old_string.length)
  }
  return { ok: true, html: current }
}

/** CSP for a served artifact: scripts and styles inline only, no network of any kind. */
export const ARTIFACT_CSP = [
  "default-src 'none'",
  "script-src 'unsafe-inline'",
  "style-src 'unsafe-inline'",
  'img-src data: blob:',
  'font-src data:',
  "connect-src 'none'",
  "frame-src 'none'",
  "worker-src 'none'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ')

/**
 * The same policy as an HTTP header, plus `sandbox`: the page gets an opaque origin even when
 * opened in its own tab, so it can reach neither the app's cookies nor its routes. Popups let
 * https links open in a new, unsandboxed tab.
 */
export const ARTIFACT_CSP_HEADER = `sandbox allow-scripts allow-popups allow-popups-to-escape-sandbox; ${ARTIFACT_CSP}`

export interface DataTable {
  columns: string[]
  rows: Record<string, unknown>[]
}

/**
 * The page as served or downloaded: CSP and bootstrap first in <head> (fx0), then
 * `window.DATA`, then each `lib:` script replaced by the library's source.
 */
export function prepare(
  html: string,
  {
    data,
    libraries,
  }: { data: Record<string, DataTable>; libraries: Partial<Record<Library, string>> },
): string {
  // No WebRTC: CSP does not cover it, and it is the one way left to reach the network (fx0).
  // Runtime errors: a banner in the page, and a message to the preview panel, which offers a fix.
  const bootstrap =
    '<script>for(const n of["RTCPeerConnection","webkitRTCPeerConnection","RTCIceGatherer"]){try{Object.defineProperty(globalThis,n,{value:undefined,writable:false,configurable:false})}catch{}}' +
    'addEventListener("error",e=>{const m=String(e.message||e.error||"脚本错误");try{parent.postMessage({type:"artifact-error",message:m},"*")}catch{}' +
    'const b=document.createElement("div");b.textContent="页面脚本出错："+m;b.style.cssText="position:fixed;left:0;right:0;bottom:0;z-index:2147483647;padding:8px 12px;background:#b42318;color:#fff;font:13px/1.5 sans-serif";(document.body||document.documentElement).append(b)})</script>'
  const dataScript = `<script>window.DATA=${safeJson(data)};</script>`
  const head = `<meta http-equiv="Content-Security-Policy" content="${ARTIFACT_CSP}">${bootstrap}${dataScript}`
  const withHead = html.replace(/<head(\s[^>]*)?>/i, (open) => open + head)
  return withHead.replace(
    /<script\b[^>]*\bsrc\s*=\s*["']?lib:([a-z0-9-]+)["']?[^>]*>\s*<\/script>/gi,
    (whole, name: string) => {
      const source = libraries[name as Library]
      return source === undefined
        ? whole
        : `<script>${source.replaceAll('</script', '<\\/script')}</script>`
    },
  )
}

/** JSON that cannot close the <script> it sits in. */
function safeJson(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replaceAll(String.fromCharCode(0x2028), '\\u2028')
    .replaceAll(String.fromCharCode(0x2029), '\\u2029')
}
