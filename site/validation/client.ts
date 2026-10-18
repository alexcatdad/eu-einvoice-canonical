import type { ValidationSummary } from '../../src/canonical.js';
import type { Detection } from '../../src/detect.js';
import type { ValidationSuite } from '../../src/validation/plan.js';
export interface BrowserValidationJob {
  promise: Promise<ValidationSummary>;
  cancel: () => void;
}
/** One disposable worker scope per document bounds retained XML, schemas and parsed stylesheets. */
export function startValidation(
  xml: string,
  detection: Detection,
  base: string,
  budgetMs = 30_000,
  suite?: ValidationSuite,
): BrowserValidationJob {
  const worker = new Worker(new URL(`${base}validation/runtime/validator.js`, location.origin), { type: 'module' });
  let settled = false;
  let rejectJob: (error: Error) => void;
  const stop = (reason: string) => {
    if (settled) return;
    settled = true;
    worker.postMessage({ cancel: true });
    // The coordinator terminates every engine worker before acknowledging cancellation.
    setTimeout(() => worker.terminate(), 250);
    clearTimeout(timer);
    rejectJob(new Error(reason));
  };
  const timer = setTimeout(() => stop('Local validation exceeded the 30 second time budget. Use the CLI for this document.'), budgetMs);
  const promise = new Promise<ValidationSummary>((resolve, reject) => {
    rejectJob = reject;
    worker.onmessage = ({ data }) => {
      if (data.cancelled) {
        worker.terminate();
        return;
      }
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      worker.terminate();
      if (data.error) reject(new Error(data.error));
      else resolve(data.value);
    };
    worker.onerror = (event) => stop(event.message || 'Local validation worker failed');
    worker.postMessage({ xml, detection: JSON.parse(JSON.stringify(detection)), base: new URL(base, location.origin).href, suite });
  });
  return { promise, cancel: () => stop('Local validation cancelled') };
}
