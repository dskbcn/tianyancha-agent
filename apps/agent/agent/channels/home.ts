import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { defineChannel, GET } from 'eve/channels'
import { denied } from '#lib/auth.ts'

/**
 * The web UI's build (apps/web/dist) at `/`, from `WEB_DIR`, so one container on one port serves
 * the whole app with no proxy in front. Behind the same logins as the API, so the browser asks
 * for them on the first page load. In development Vite serves the UI on :5173 instead.
 * Replaces eve's default home page.
 */
const TYPES: Record<string, string> = {
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.json': 'application/json',
}

export default defineChannel({
  routes: [
    GET('/', async (request) => {
      const refused = await denied(request)
      if (refused) return refused
      const root = process.env.WEB_DIR
      if (!root) {
        return new Response(
          'The web UI is served by Vite in development: http://localhost:5173\n',
          {
            status: 404,
          },
        )
      }
      return serve(path.join(root, 'index.html'), 'text/html; charset=utf-8', 'private, no-cache')
    }),
    // Vite writes every asset flat into assets/, with a content hash in the name.
    GET('/assets/:name', async (request, { params }) => {
      const refused = await denied(request)
      if (refused) return refused
      const root = process.env.WEB_DIR
      const name = decodeURIComponent(params.name)
      const type = TYPES[path.extname(name)]
      if (!root || !type || !/^[\w.-]+$/.test(name) || name.startsWith('.')) {
        return new Response('not found', { status: 404 })
      }
      return serve(path.join(root, 'assets', name), type, 'private, max-age=31536000, immutable')
    }),
  ],
})

async function serve(file: string, type: string, cache: string): Promise<Response> {
  try {
    return new Response(await readFile(file), {
      headers: { 'content-type': type, 'cache-control': cache },
    })
  } catch {
    return new Response('not found', { status: 404 })
  }
}
