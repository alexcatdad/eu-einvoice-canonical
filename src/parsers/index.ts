/**
 * One parser per syntax family. Each takes the XML of one detected document and
 * returns one or more canonical invoices (FatturaPA lots, Facturae batches and
 * e-arve files can hold several).
 *
 * Implemented: ubl, cii, svefaktura, facturae. The national families are stubs; build order
 * and mapping notes are in the README.
 */
import type { CanonicalInvoice } from '../canonical.js';
import type { XmlPayload } from '../envelope.js';
import type { FormatDef, MatchDetails, ParserFamily } from '../formats.js';
import { parseCii } from './cii.js';
import { parseFacturae } from './facturae.js';
import { parseFatturaPa } from './fatturapa.js';
import { parseSvefaktura } from './svefaktura.js';
import { parseUbl } from './ubl.js';

export { ParseError } from './context.js';

export interface ParseInput {
  payload: XmlPayload;
  format: FormatDef;
  details: MatchDetails;
  /** SHA-256 of the file as received (shared by every document in it). */
  fileSha256: string;
}

export type Parser = (input: ParseInput) => CanonicalInvoice[];

export class NotImplementedError extends Error {
  constructor(public readonly family: ParserFamily) {
    super(`No parser yet for the '${family}' family`);
  }
}

const STUBS = new WeakSet<Parser>();
const stub = (family: ParserFamily): Parser => {
  const p: Parser = () => { throw new NotImplementedError(family); };
  STUBS.add(p);
  return p;
};

export const PARSERS: Record<ParserFamily, Parser> = {
  ubl: parseUbl,                  // Peppol BIS 3, XRechnung UBL, NLCIUS, CIUS-RO/PT, HR-CIUS, OIOUBL 2/3, BIS 2, PINT
  cii: parseCii,                  // Factur-X/ZUGFeRD 2, XRechnung CII, NLCIUS CII, France CII (D16B and D22B)
  svefaktura: parseSvefaktura,
  zugferd1: stub('zugferd1'),
  fatturapa: parseFatturaPa,      // FatturaPA 1.2.x (FPR12/FPA12), semplificata FSM10
  ksef: stub('ksef'),
  facturae: parseFacturae,        // Facturae 3.2, 3.2.1, 3.2.2
  isdoc: stub('isdoc'),
  ebinterface: stub('ebinterface'),
  finvoice: stub('finvoice'),
  teappsxml: stub('teappsxml'),
  'e-arve': stub('e-arve'),
  eslog: stub('eslog'),
  mydata: stub('mydata'),
};

/** Families with a real parser (derived from the registry, so it stays right as stubs are replaced). */
export const IMPLEMENTED_FAMILIES: readonly ParserFamily[] =
  (Object.keys(PARSERS) as ParserFamily[]).filter((f) => !STUBS.has(PARSERS[f]));
