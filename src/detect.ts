import { FORMATS, OTHER_DOCUMENTS, type DetectContext, type FormatDef, type MatchDetails } from './formats.js';
import { probeXml, type XmlProbe } from './probe.js';

export type Detection =
  | { kind: 'invoice'; format: FormatDef; details: MatchDetails; probe: XmlProbe }
  | { kind: 'other-document'; label: string; probe: XmlProbe }
  | { kind: 'unknown'; reason: string; probe: XmlProbe | null };

export function detectXml(xml: string, ctx: DetectContext = { fromPdf: false }): Detection {
  const probe = probeXml(xml);
  if (!probe) return { kind: 'unknown', reason: 'Not well-formed XML', probe: null };
  return detectProbe(probe, ctx);
}

export function detectProbe(probe: XmlProbe, ctx: DetectContext = { fromPdf: false }): Detection {
  for (const format of FORMATS as readonly FormatDef[]) {
    const details = format.match(probe, ctx);
    if (details) return { kind: 'invoice', format, details, probe };
  }
  const other = OTHER_DOCUMENTS.find((r) => r.test(probe));
  if (other) return { kind: 'other-document', label: `${other.label}: ${probe.rootName}`, probe };
  return { kind: 'unknown', reason: `No rule for {${probe.rootNs}}${probe.rootName}`, probe };
}
