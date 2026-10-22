import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import { defaultSettingsMiddleware, wrapLanguageModel } from 'ai'
import { defineAgent } from 'eve'

/**
 * `eve build` evaluates this module at build time and bakes the resolved model into the
 * manifest (weixin-article-agent, README "Model"), so the Bailian provider is unconditional.
 * Host, key and model id are still read at runtime; the context window is baked.
 */
const bailian = createOpenAICompatible({
  name: 'bailian',
  baseURL: `${process.env.ALIYUN_BAILIAN_API_HOST ?? 'https://dashscope.aliyuncs.com'}/compatible-mode/v1`,
  apiKey: process.env.ALIYUN_BAILIAN_API_KEY,
})

// Spike 0.3: flash and pro both scored 15/15; flash is faster and lighter.
const MODEL_ID = process.env.ALIYUN_BAILIAN_MODEL ?? 'deepseek-v4.1-flash-1017'
// Bailian reports max_input_tokens on GET /compatible-mode/v1/models/<model>.
const CONTEXT_WINDOW = Number(process.env.ALIYUN_BAILIAN_CONTEXT_WINDOW ?? 129_024)

// Without max_tokens Bailian falls back to a short default (default_envs.max_output_tokens: 8192),
// which would cut an HTML artifact off mid-page. Measured 2026-10-22: flash writes 44k+ tokens.
const MAX_OUTPUT_TOKENS = Number(process.env.ALIYUN_BAILIAN_MAX_OUTPUT_TOKENS ?? 65_536)

export default defineAgent({
  model: wrapLanguageModel({
    model: bailian.chatModel(MODEL_ID),
    middleware: defaultSettingsMiddleware({ settings: { maxOutputTokens: MAX_OUTPUT_TOKENS } }),
  }),
  modelContextWindowTokens: CONTEXT_WINDOW,
  reasoning: 'provider-default',
  // Every capability is an authored tool; no shell, files or web for the model.
  defaultTools: false,
  compaction: { thresholdPercent: 0.75 },
})
