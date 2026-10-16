/** `einvoice duplicates <dir...>`: converts every file, indexes the invoices and reports duplicate groups. */
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { convert, type UnwrapLimits } from '../index.js';
import { sweepFiles } from '../sweep.js';
import { DuplicateIndex, type DuplicateOptions, formatReport } from './index.js';

export interface DuplicatesRunOptions extends DuplicateOptions {
  /** Persist the index here (loaded first if the file exists), so later runs only add new files. */
  indexFile?: string;
  json?: boolean;
  pretty?: boolean;
  limits?: Partial<UnwrapLimits>;
}

export const DUPLICATES_FOUND = 9;

/** Returns 0 (no duplicates), 9 (duplicates found) or 5 (nothing found, but some files could not be converted). */
export async function runDuplicates(
  roots: string[],
  opts: DuplicatesRunOptions,
  print: (line: string) => void,
  warn: (line: string) => void = () => {},
): Promise<number> {
  const { indexFile, json, pretty, limits, ...dupOpts } = opts;
  const index =
    indexFile && existsSync(indexFile) ? DuplicateIndex.fromJSON(readFileSync(indexFile, 'utf8'), dupOpts) : new DuplicateIndex(dupOpts);
  let failed = 0;
  let files = 0;
  for (const root of roots) {
    const list = statSync(root).isDirectory() ? [...sweepFiles(root)].sort() : [root];
    for (const file of list) {
      files++;
      try {
        const r = await convert(new Uint8Array(readFileSync(file)), file, limits);
        if (!r.outcomes.some((o) => o.status === 'ok')) {
          warn(`${file}: no invoice found`);
          failed++;
          continue;
        }
        index.addResult(r, file);
      } catch (e) {
        warn(`${file}: ${(e as Error).message}`);
        failed++;
      }
    }
  }
  if (indexFile) writeFileSync(indexFile, JSON.stringify(index));
  const groups = index.groups();
  const pairings = index.pairings();
  if (json) print(JSON.stringify({ files, invoices: index.size, groups, pairings }, null, pretty ? 2 : undefined));
  else {
    const report = formatReport(groups, pairings);
    if (report) print(report);
    print(`${index.size} invoice(s) from ${files} file(s): ${groups.length} duplicate group(s)`);
  }
  if (groups.length > 0) return DUPLICATES_FOUND;
  return failed > 0 ? 5 : 0;
}
