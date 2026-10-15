/**
 * One parser per syntax family. Each takes the XML of one detected document and
 * returns one or more canonical invoices (FatturaPA lots, Facturae batches and
 * e-arve files can hold several).
 *
 * Implemented: ubl, cii, svefaktura, zugferd1, teappsxml, mydata. The national families are stubs; build order
 * and mapping notes are in the README.
 */
import type { CanonicalInvoice } from '../canonical.js';
import type { XmlPayload } from '../envelope.js';
import type { FormatDef, MatchDetails, ParserFamily } from '../formats.js';
import { parseCii } from './cii.js';
import { parseMydata } from './mydata.js';
import { parseSvefaktura } from './svefaktura.js';
import { parseTeappsxml } from './teappsxml.js';
import { parseUbl } from './ubl.js';
import { parseZugferd1 } from './zugferd1.js';

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

const stub = (family: ParserFamily): Parser => () => { throw new NotImplementedError(family); };

export const PARSERS: Record<ParserFamily, Parser> = {
  ubl: parseUbl,                  // Peppol BIS 3, XRechnung UBL, NLCIUS, CIUS-RO/PT, HR-CIUS, OIOUBL 2/3, BIS 2, PINT
  cii: parseCii,                  // Factur-X/ZUGFeRD 2, XRechnung CII, NLCIUS CII, France CII (D16B and D22B)
  svefaktura: parseSvefaktura,
  zugferd1: parseZugferd1,        // ZUGFeRD 1.0 CrossIndustryDocument
  fatturapa: stub('fatturapa'),
  ksef: stub('ksef'),
  facturae: stub('facturae'),
  isdoc: stub('isdoc'),
  ebinterface: stub('ebinterface'),
  finvoice: stub('finvoice'),
  teappsxml: parseTeappsxml,      // Finnish TEAPPSXML (INVOICE_CENTER)
  'e-arve': stub('e-arve'),
  eslog: stub('eslog'),
  mydata: parseMydata,            // Greek AADE myDATA InvoicesDoc
};

export const IMPLEMENTED_FAMILIES: readonly ParserFamily[] = ['ubl', 'cii', 'svefaktura', 'zugferd1', 'teappsxml', 'mydata'];
