/** Runs convert() off the main thread so a case that blocks the event loop can be terminated at its deadline. */
import { type ConvertOptions, convert, type UnwrapLimits } from '../../src/index.js';

interface Request {
  id: number;
  bytes: Uint8Array;
  filename?: string;
  limits?: Partial<UnwrapLimits>;
  options?: ConvertOptions;
  /** Test hook: block forever instead of converting. */
  hang?: boolean;
}

const scope = self as unknown as { postMessage(message: unknown): void; onmessage: ((e: { data: Request }) => void) | null };

scope.onmessage = async ({ data }) => {
  if (data.hang) for (;;);
  const started = performance.now();
  try {
    const result = await convert(data.bytes, data.filename, data.limits, data.options);
    // JSON, not structured clone: the result is the wire form every property checks anyway.
    scope.postMessage({ id: data.id, ok: true, json: JSON.stringify(result), ms: performance.now() - started });
  } catch (e) {
    scope.postMessage({ id: data.id, ok: false, error: e instanceof Error ? `${e.name}: ${e.message}` : String(e) });
  }
};
