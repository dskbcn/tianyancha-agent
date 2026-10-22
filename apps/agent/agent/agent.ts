import { defineAgent, defineDynamic } from 'eve'
import { selectModel } from '#lib/models.ts'

/**
 * The model is chosen per message in the web UI. The eve channel (channels/eve.ts) checks the
 * choice against lib/models.ts and records it on the turn's auth as `attributes.model`; this
 * resolver reads it at every step. Bailian is not in the AI Gateway catalogue, so the selection
 * is a live LanguageModel, which eve accepts only from `step.started` (session and turn
 * selections must be gateway id strings). Switching models mid-chat re-reads the conversation
 * uncached, which costs more but is the user's call.
 */
export default defineAgent({
  model: defineDynamic({
    events: {
      'step.started': (_event, ctx) => selectModel(ctx.session.auth.current?.attributes.model),
    },
  }),
  // Every capability is an authored tool; no shell, files or web for the model.
  defaultTools: false,
  compaction: { thresholdPercent: 0.75 },
})
