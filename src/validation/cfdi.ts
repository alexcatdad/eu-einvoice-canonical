import { SaxesParser } from 'saxes';

const CFDI = new Set(['http://www.sat.gob.mx/cfd/3', 'http://www.sat.gob.mx/cfd/4']);
const TIMBRE = 'http://www.sat.gob.mx/TimbreFiscalDigital';
class UnsupportedExtension extends Error {}
/** The packaged CFDI closure includes only core3.3/4.0 plus TimbreFiscalDigital1.1, not arbitrary SAT complements or private Addenda schemas. */
export function unsupportedCfdiExtension(xml: string): boolean {
  const parser = new SaxesParser({ xmlns: true, position: false });
  let unsupported = false;
  parser.on('opentag', (tag) => {
    if (CFDI.has(tag.uri) || tag.uri === TIMBRE) return;
    unsupported = true;
    throw new UnsupportedExtension();
  });
  try {
    parser.write(xml).close();
  } catch {
    /* Malformed XML is handled by the normal parse/schema checks. */
  }
  return unsupported;
}
