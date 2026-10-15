/**
 * Optional in-browser language models for labelling lines. Nothing here runs unless the user asks,
 * and nothing is bundled: WebLLM is imported from a CDN at that moment, the weights come from its
 * model host, and Gemini Nano is Chrome's own Prompt API. Never used in CI.
 */
import { LABEL_SCHEMA, type ModelLabeller } from '../src/index.js';

export interface EngineSpec {
  id: string;
  label: string;
  kind: 'webllm' | 'gemini-nano';
  /** WebLLM prebuilt model id. */
  model?: string;
}

/** Qwen3 1.7B is the smallest that can be expected to cope with Swedish; 0.6B is included to show where it falls over. */
export const ENGINES: EngineSpec[] = [
  { id: 'qwen3-1.7b', label: 'WebLLM, Qwen3 1.7B', kind: 'webllm', model: 'Qwen3-1.7B-q4f16_1-MLC' },
  { id: 'qwen3-0.6b', label: 'WebLLM, Qwen3 0.6B', kind: 'webllm', model: 'Qwen3-0.6B-q4f16_1-MLC' },
  { id: 'qwen3-4b', label: 'WebLLM, Qwen3 4B', kind: 'webllm', model: 'Qwen3-4B-q4f16_1-MLC' },
  { id: 'gemini-nano', label: 'Chrome built-in, Gemini Nano', kind: 'gemini-nano' },
];

/** Pinned so a CDN update cannot change what the page runs. */
const WEBLLM_SPECIFIER = ['https://esm.run', '@mlc-ai/web-llm@0.2.79'].join('/');

export interface LoadedEngine {
  labeller: ModelLabeller;
  dispose(): Promise<void>;
  /** Engine-reported statistics, when it has any. */
  stats?(): Promise<string>;
}

export type Progress = (text: string, fraction?: number) => void;

interface PromptSession { prompt(text: string, options?: unknown): Promise<string>; destroy?(): void }
interface PromptApi {
  availability(): Promise<string>;
  create(options?: unknown): Promise<PromptSession>;
}
const promptApi = (): PromptApi | undefined => (globalThis as unknown as { LanguageModel?: PromptApi }).LanguageModel;

/** 'available', 'downloadable', 'downloading' or 'unavailable'. */
export async function geminiNanoAvailability(): Promise<string> {
  try { return (await promptApi()?.availability()) ?? 'unavailable'; } catch { return 'unavailable'; }
}

export async function loadEngine(spec: EngineSpec, progress: Progress): Promise<LoadedEngine> {
  if (spec.kind === 'gemini-nano') {
    const api = promptApi();
    if (!api) throw new Error('This browser has no Prompt API (LanguageModel). Chrome 138+ on desktop, with Gemini Nano enabled.');
    const session = await api.create({
      monitor(m: EventTarget) {
        m.addEventListener('downloadprogress', (e) => { const f = (e as unknown as { loaded: number }).loaded; progress(`Downloading Gemini Nano ${Math.round(f * 100)} %`, f); });
      },
    });
    return {
      labeller: (_input, prompt, schema) => session.prompt(prompt, { responseConstraint: schema }),
      dispose: async () => session.destroy?.(),
    };
  }

  type Engine = {
    chat: { completions: { create(req: unknown): Promise<{ choices: { message: { content: string | null } }[] }> } };
    runtimeStatsText(): Promise<string>;
    unload(): Promise<void>;
  };
  const webllm = await import(/* @vite-ignore */ WEBLLM_SPECIFIER) as { CreateMLCEngine(model: string, config: unknown): Promise<Engine> };
  const engine = await webllm.CreateMLCEngine(spec.model!, {
    initProgressCallback: (r: { text: string; progress: number }) => progress(r.text, r.progress),
  });
  return {
    labeller: async (_input, prompt, schema) => {
      const reply = await engine.chat.completions.create({
        messages: [{ role: 'user', content: prompt }],
        temperature: 0,
        max_tokens: 1024,
        response_format: { type: 'json_object', schema: JSON.stringify(schema ?? LABEL_SCHEMA) },
        extra_body: { enable_thinking: false },
      });
      return reply.choices[0]?.message.content ?? '';
    },
    dispose: () => engine.unload(),
    stats: () => engine.runtimeStatsText(),
  };
}
