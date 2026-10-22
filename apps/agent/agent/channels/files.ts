import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { defineChannel, GET } from 'eve/channels'
import { denied } from '#lib/auth.ts'
import { outputRoot, safe } from '#lib/db.ts'

/**
 * Downloads for the CSV files tools write under OUTPUT_DIR/<sessionId>/, behind the same auth
 * as the chat. Names are re-sanitised, so a path can never leave the output directory.
 */
export default defineChannel({
  routes: [
    GET('/files/:sessionId/:name', async (request, { params }) => {
      const refused = await denied(request)
      if (refused) return refused
      const name = decodeURIComponent(params.name)
      if (!name.endsWith('.csv') || safe(name.slice(0, -4)) !== name.slice(0, -4)) {
        return new Response('not found', { status: 404 })
      }
      const file = path.join(outputRoot(), safe(decodeURIComponent(params.sessionId)), name)
      try {
        return new Response(await readFile(file), {
          headers: {
            'content-type': 'text/csv; charset=utf-8',
            'content-disposition': `attachment; filename*=UTF-8''${encodeURIComponent(name)}`,
            'cache-control': 'private, no-store',
          },
        })
      } catch {
        return new Response('not found', { status: 404 })
      }
    }),
  ],
})
