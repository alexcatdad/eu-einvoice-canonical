import { SaxesParser } from 'saxes';

const EXT = 'urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2';
const HR = 'urn:mfin.gov.hr:schema:xsd:HRExtensionAggregateComponents-1';
const SIG = 'urn:oasis:names:specification:ubl:schema:xsd:CommonSignatureComponents-2';
/** A lax UBL extension wildcard does not establish coverage of arbitrary extension contracts. */
export function unsupportedUblExtension(xml: string, schema?: string): boolean {
  const parser = new SaxesParser({ xmlns: true, position: false });
  let depth = 0;
  let extensionDepth: number | undefined;
  let unsupported = false;
  parser.on('opentag', (tag) => {
    depth++;
    if (tag.uri === EXT && tag.local === 'ExtensionContent') extensionDepth = depth;
    else if (extensionDepth !== undefined && depth === extensionDepth + 1) {
      const signature =
        (schema === 'xsd-ubl-2.1' || schema === 'xsd-hr-cius-ubl-20260415') && tag.uri === SIG && tag.local === 'UBLDocumentSignatures';
      const croatian = schema === 'xsd-hr-cius-ubl-20260415' && tag.uri === HR && tag.local === 'HRFISK20Data';
      if (!signature && !croatian) unsupported = true;
    }
  });
  parser.on('closetag', () => {
    if (depth === extensionDepth) extensionDepth = undefined;
    depth--;
  });
  try {
    parser.write(xml).close();
  } catch {
    // Parse and schema checks report malformed XML independently.
  }
  return unsupported;
}
