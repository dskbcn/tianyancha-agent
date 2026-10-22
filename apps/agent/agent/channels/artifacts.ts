import { ARTIFACT_CSP_HEADER } from '@tianyancha-agent/artifacts'
import { defineChannel, GET } from 'eve/channels'
import { routeAuth } from 'eve/channels/auth'
import { preparedPage } from '#lib/artifacts.ts'
import { routePolicy } from '#lib/auth.ts'

/**
 * Serves an artifact version with its data and libraries, behind the chat's auth. The CSP header
 * sandboxes the page into an opaque origin wherever it opens (preview iframe or its own tab), so
 * model-written scripts cannot reach the app or the network. `?download=1` returns the same page
 * as a standalone file.
 */
export default defineChannel({
  routes: [
    GET('/artifacts/:sessionId/:id/:version', async (request, { params }) => {
      await routeAuth(request, routePolicy('tianyancha-agent'))
      const version = Number(params.version)
      if (!Number.isInteger(version) || version < 1) return new Response('not found', { status: 404 })
      let page
      try {
        page = await preparedPage(decodeURIComponent(params.sessionId), decodeURIComponent(params.id), version)
      } catch (error) {
        return new Response(`artifact data unavailable: ${(error as Error).message}`, { status: 410 })
      }
      if (!page) return new Response('not found', { status: 404 })
      const download = new URL(request.url).searchParams.has('download')
      const filename = `${page.meta.title.replace(/[\\/:*?"<>|]+/g, '_')}-v${version}.html`
      return new Response(page.html, {
        headers: {
          'content-type': 'text/html; charset=utf-8',
          'content-security-policy': ARTIFACT_CSP_HEADER,
          'x-content-type-options': 'nosniff',
          'referrer-policy': 'no-referrer',
          // Revalidate: the page is prepared at request time (injected reporter, libraries), so a
          // cached copy can be stale even though the stored version never changes.
          'cache-control': 'private, no-cache',
          ...(download ? { 'content-disposition': `attachment; filename*=UTF-8''${encodeURIComponent(filename)}` } : {}),
        },
      })
    }),
  ],
})
