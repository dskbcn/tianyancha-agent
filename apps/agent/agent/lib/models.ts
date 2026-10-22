import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import { defaultSettingsMiddleware, wrapLanguageModel, type LanguageModel } from 'ai'

/**
 * The Bailian models a user may pick. All four made a correct tool call in a smoke test on
 * 2026-10-22; only the two DeepSeek models have been through the golden set (spike 0.3).
 * ALIYUN_BAILIAN_MODELS (comma-separated ids) narrows or extends the list; an id not described
 * below is offered under its own name.
 */
const DESCRIBED: Record<string, { label: string; note: string; evaluated: boolean }> = {
  'deepseek-v4.1-flash-1017': { label: 'DeepSeek V4.1 Flash', note: '快，默认', evaluated: true },
  'deepseek-v4-pro-0813': { label: 'DeepSeek V4 Pro', note: '更强的推理，稍慢', evaluated: true },
  'qwen3.8-max': { label: 'Qwen 3.8 Max', note: '通义旗舰', evaluated: false },
  'qwen3.7-plus': { label: 'Qwen 3.7 Plus', note: '通义均衡', evaluated: false },
}

export const DEFAULT_MODEL = process.env.ALIYUN_BAILIAN_MODEL ?? 'deepseek-v4.1-flash-1017'

export function modelCatalog() {
  const ids = (process.env.ALIYUN_BAILIAN_MODELS ?? Object.keys(DESCRIBED).join(','))
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean)
  if (!ids.includes(DEFAULT_MODEL)) ids.unshift(DEFAULT_MODEL)
  return {
    default: DEFAULT_MODEL,
    models: ids.map((id) => ({
      id,
      ...(DESCRIBED[id] ?? { label: id, note: '', evaluated: false }),
    })),
  }
}

export function isOffered(id: unknown): id is string {
  return typeof id === 'string' && modelCatalog().models.some((m) => m.id === id)
}

const bailian = createOpenAICompatible({
  name: 'bailian',
  baseURL: `${process.env.ALIYUN_BAILIAN_API_HOST ?? 'https://dashscope.aliyuncs.com'}/compatible-mode/v1`,
  apiKey: process.env.ALIYUN_BAILIAN_API_KEY,
})

// Bailian reports max_input_tokens 129,024 for every model above (GET /compatible-mode/v1/models/<id>).
const CONTEXT_WINDOW = Number(process.env.ALIYUN_BAILIAN_CONTEXT_WINDOW ?? 129_024)
// Without max_tokens Bailian falls back to a short default (default_envs.max_output_tokens: 8192),
// which would cut an HTML artifact off mid-page. Measured 2026-10-22: flash writes 44k+ tokens.
const MAX_OUTPUT_TOKENS = Number(process.env.ALIYUN_BAILIAN_MAX_OUTPUT_TOKENS ?? 65_536)

const instances = new Map<string, LanguageModel>()

/** The model selection for one step: the chosen model when it is offered, else the default. */
export function selectModel(chosen: unknown) {
  const id = isOffered(chosen) ? chosen : DEFAULT_MODEL
  let model = instances.get(id)
  if (!model) {
    model = wrapLanguageModel({
      model: bailian.chatModel(id),
      middleware: defaultSettingsMiddleware({ settings: { maxOutputTokens: MAX_OUTPUT_TOKENS } }),
    })
    instances.set(id, model)
  }
  return { model, modelContextWindowTokens: CONTEXT_WINDOW, reasoning: 'provider-default' as const }
}
