/**
 * Cheap streaming look at an XML document: root element, namespaces and the few
 * header values that identify the format. Stops after the header, so large
 * base64 attachments further down are never fully parsed.
 */
import { SaxesParser, type SaxesTagNS } from 'saxes';

export type ProbeKey =
  | 'ublCustomizationId'
  | 'ublProfileId'
  | 'ublVersionId'
  | 'ciiGuidelineId'
  | 'ciiBusinessProcessId'
  | 'zf1GuidelineId'
  | 'ksefFormCode'
  | 'eArveVersion'
  | 'facturaeSchemaVersion'
  | 'facturaeModality'
  | 'fatturaTipoDocumento'
  | 'isdocDocumentType'
  | 'finvoiceTypeCode'
  | 'myDataInvoiceType'
  | 'myDataRequestedInvoiceType';

const UBL_CBC = 'urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2';

interface Target {
  /** Local names below the root element. */
  path: string[];
  /** Namespace the last element must be in, when the format fixes it. */
  ns?: string;
}

const TARGETS: Record<ProbeKey, Target> = {
  ublCustomizationId: { path: ['CustomizationID'], ns: UBL_CBC },
  ublProfileId: { path: ['ProfileID'], ns: UBL_CBC },
  ublVersionId: { path: ['UBLVersionID'], ns: UBL_CBC },
  ciiGuidelineId: { path: ['ExchangedDocumentContext', 'GuidelineSpecifiedDocumentContextParameter', 'ID'] },
  ciiBusinessProcessId: { path: ['ExchangedDocumentContext', 'BusinessProcessSpecifiedDocumentContextParameter', 'ID'] },
  zf1GuidelineId: { path: ['SpecifiedExchangedDocumentContext', 'GuidelineSpecifiedDocumentContextParameter', 'ID'] },
  ksefFormCode: { path: ['Naglowek', 'KodFormularza'] },
  eArveVersion: { path: ['Header', 'Version'] },
  facturaeSchemaVersion: { path: ['FileHeader', 'SchemaVersion'] },
  facturaeModality: { path: ['FileHeader', 'Modality'] },
  fatturaTipoDocumento: { path: ['FatturaElettronicaBody', 'DatiGenerali', 'DatiGeneraliDocumento', 'TipoDocumento'] },
  isdocDocumentType: { path: ['DocumentType'] },
  finvoiceTypeCode: { path: ['InvoiceDetails', 'InvoiceTypeCode'] },
  myDataInvoiceType: { path: ['invoice', 'invoiceHeader', 'invoiceType'] },
  /** The RequestedDoc wrapper AADE's retrieval services return puts the invoices one level deeper. */
  myDataRequestedInvoiceType: { path: ['invoicesDoc', 'invoice', 'invoiceHeader', 'invoiceType'] },
};
const TARGET_KEYS = Object.keys(TARGETS) as ProbeKey[];
/** Elements deeper than the deepest target path can never match, so they are not counted. */
const MAX_TARGET_DEPTH = Math.max(...TARGET_KEYS.map((k) => TARGETS[k].path.length));
/** Subtrees that can be large and never hold a target (UBL signatures and extensions). */
const SKIPPED_SUBTREES = new Set(['UBLExtensions']);
/** Elements counted (at target depth, outside skipped subtrees) before the probe gives up. */
const MAX_ELEMENTS = 1500;

export interface XmlProbe {
  rootName: string;
  rootNs: string;
  /** Root attributes by local name (versione, Version, version...). */
  rootAttrs: Record<string, string>;
  /** Every namespace URI declared on the root element. */
  nsDecls: string[];
  /** Header values found, trimmed. First occurrence wins. */
  values: Partial<Record<ProbeKey, string>>;
  /** Attributes of the elements at the target paths (e.g. KSeF kodSystemowy). */
  valueAttrs: Partial<Record<ProbeKey, Record<string, string>>>;
  /** The document has a DOCTYPE declaration. Inbound e-invoices never need one; treat as hostile. */
  hasDoctype: boolean;
  /** Parse error, if the document is not well-formed up to the point read. */
  error?: string;
}

class Stop extends Error {}

export function probeXml(xml: string): XmlProbe | null {
  const parser = new SaxesParser({ xmlns: true, position: false });
  const stack: string[] = [];
  let probe: XmlProbe | null = null;
  let capture: { key: ProbeKey; text: string } | null = null;
  let count = 0;
  let hasDoctype = false;

  // saxes does not expand DTD entities or fetch external DTDs; this only records that one was declared.
  parser.on('doctype', () => {
    hasDoctype = true;
  });

  parser.on('opentag', (tag: SaxesTagNS) => {
    if (!probe) {
      const rootAttrs: Record<string, string> = {};
      const nsDecls: string[] = [];
      for (const a of Object.values(tag.attributes)) {
        if (a.prefix === 'xmlns' || a.name === 'xmlns') nsDecls.push(a.value);
        else rootAttrs[a.local] = a.value;
      }
      probe = { rootName: tag.local, rootNs: tag.uri ?? '', rootAttrs, nsDecls, values: {}, valueAttrs: {}, hasDoctype };
      return;
    }
    stack.push(tag.local);
    if (stack.length > MAX_TARGET_DEPTH || SKIPPED_SUBTREES.has(stack[0])) return;
    for (const key of TARGET_KEYS) {
      if (probe.values[key] !== undefined) continue;
      const { path, ns } = TARGETS[key];
      if (path.length === stack.length && path.every((p, i) => p === stack[i]) && (!ns || tag.uri === ns)) {
        capture = { key, text: '' };
        const attrs: Record<string, string> = {};
        for (const a of Object.values(tag.attributes)) attrs[a.local] = a.value;
        probe.valueAttrs[key] = attrs;
      }
    }
    if (++count > MAX_ELEMENTS) throw new Stop();
  });
  parser.on('text', (t) => {
    if (capture) capture.text += t;
  });
  parser.on('cdata', (t) => {
    if (capture) capture.text += t;
  });
  parser.on('closetag', () => {
    if (capture && probe) {
      probe.values[capture.key] = capture.text.trim();
      capture = null;
    }
    if (stack.length === 0) throw new Stop(); // root closed
    stack.pop();
  });

  try {
    parser.write(xml).close();
  } catch (e) {
    if (!(e instanceof Stop)) {
      if (!probe) return null;
      (probe as XmlProbe).error = (e as Error).message;
    }
  }
  return probe;
}
