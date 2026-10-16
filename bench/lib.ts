/** Timing, calibration and memory helpers for the benchmarks. */
import { spawnSync } from 'node:child_process';

export interface Case {
  id: string;
  group: string;
  /** Input size in bytes, for the report. */
  bytes: number;
  run: () => Promise<unknown>;
  /** Part of the quick subset the CI gate runs. */
  quick?: boolean;
  /** Minimum measuring time in ms (default 250). */
  budgetMs?: number;
}

export interface Measured {
  id: string;
  group: string;
  bytes: number;
  /** Documents per second. */
  docsPerSec: number;
  /** Median time per document in ms. */
  medianMs: number;
  /** Median time as a multiple of the calibration loop: the number the gate compares. */
  ratio: number;
  /** Peak RSS of a fresh process that runs the case once, in MB (full runs only). */
  peakMB?: number;
}

/**
 * A fixed CPU workload (integer maths, string building, small allocations) timed in the same run.
 * Dividing a case's time by it removes most of the difference between machines.
 */
function calibrationOnce(): number {
  const t = performance.now();
  let acc = 0;
  const parts: string[] = [];
  for (let i = 0; i < 4_000_000; i++) {
    acc = (Math.imul(acc ^ i, 2654435761) + (i >>> 3)) | 0;
    if (i % 400 === 0) parts.push(`${acc}:${i}`);
  }
  const s = parts.join(',');
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0;
  if (h === 42) console.log(h);
  return performance.now() - t;
}

export function calibrate(): number {
  for (let i = 0; i < 3; i++) calibrationOnce();
  const runs = Array.from({ length: 9 }, calibrationOnce).sort((a, b) => a - b);
  return runs[Math.floor(runs.length / 2)];
}

export async function measure(c: Case, calibrationMs: number): Promise<Measured> {
  await c.run(); // warm-up: lazy imports, JIT
  const budget = c.budgetMs ?? 250;
  const times: number[] = [];
  const start = performance.now();
  while (times.length < 3 || performance.now() - start < budget) {
    const t = performance.now();
    await c.run();
    times.push(performance.now() - t);
    if (times.length >= 2000) break;
  }
  times.sort((a, b) => a - b);
  const medianMs = times[Math.floor(times.length / 2)];
  return { id: c.id, group: c.group, bytes: c.bytes, docsPerSec: 1000 / medianMs, medianMs, ratio: medianMs / calibrationMs };
}

/** Peak resident set of a fresh process running one case once (`bun bench/run.ts --mem <id>`). */
export function peakMemoryMB(id: string): number | undefined {
  const r = spawnSync(process.execPath, [`${import.meta.dir}/run.ts`, '--mem', id], { encoding: 'utf8' });
  const m = /PEAK_RSS_MB=([\d.]+)/.exec(r.stdout ?? '');
  return m ? Number(m[1]) : undefined;
}

/** Peak RSS of this process in MB (`resourceUsage().maxRSS` is in kilobytes, in Bun on macOS too). */
export function ownPeakMB(): number {
  return process.resourceUsage().maxRSS / 1024;
}
