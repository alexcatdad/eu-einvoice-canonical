import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

type Source = { url: string; sha256: string };
type EvidenceFile = Source & { zipEntry?: string; to: string };
type Sources = {
  download: (url: string) => Promise<{ bytes: Uint8Array; sha256: string }>;
  archive: (url: string) => Promise<Record<string, Uint8Array>>;
};

const evidence = JSON.parse(readFileSync(new URL('../validation/licenses/evidence.json', import.meta.url), 'utf8')) as Record<
  string,
  EvidenceFile[]
>;

/** Keep the selected source closure and licence text beside each compiled artifact. */
export async function addDistributionEvidence(
  id: string,
  files: Record<string, Uint8Array>,
  source: Source[],
  sources: Sources,
): Promise<void> {
  for (const item of evidence[id] ?? []) {
    if (!item.to || item.to.startsWith('/') || item.to.includes('\\') || item.to.split('/').some((part) => !part || part === '..')) {
      throw new Error(`Invalid distribution evidence path: ${item.to}`);
    }
    const downloaded = await sources.download(item.url);
    if (downloaded.sha256 !== item.sha256) throw new Error(`Distribution evidence changed: ${item.url}`);
    const content = item.zipEntry ? (await sources.archive(item.url))[item.zipEntry] : downloaded.bytes;
    if (!content) throw new Error(`Missing distribution evidence: ${item.zipEntry}`);
    const hash = createHash('sha256').update(content).digest('hex');
    if (files[item.to] && createHash('sha256').update(files[item.to]).digest('hex') !== hash) {
      throw new Error(`Distribution evidence collides with artifact: ${id}/${item.to}`);
    }
    files[item.to] = content;
    const original = { url: item.zipEntry ? `${item.url}#${encodeURIComponent(item.zipEntry)}` : item.url, sha256: hash };
    for (const record of [{ url: item.url, sha256: item.sha256 }, original]) {
      const existing = source.find((entry) => entry.url === record.url);
      if (existing && existing.sha256 !== record.sha256) throw new Error(`Distribution evidence source conflict: ${record.url}`);
      if (!existing) source.push(record);
    }
  }
}
