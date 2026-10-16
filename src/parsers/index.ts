/**
 * One parser per syntax family. Each takes the XML of one detected document and
 * returns one or more canonical invoices (FatturaPA lots, Facturae batches and
 * e-arve files can hold several).
 *
 * Every family is implemented (see IMPLEMENTED_FAMILIES below);
 * build order and mapping notes are in the README.
 */
import type { CanonicalInvoice } from '../canonical.js';
import type { XmlPayload } from '../envelope.js';
import type { FormatDef, MatchDetails, ParserFamily } from '../formats.js';
import { parseCfdi } from './cfdi.js';
import { parseCii } from './cii.js';
import { parseEarve } from './earve.js';
import { parseEbinterface } from './ebinterface.js';
import { parseEslog } from './eslog.js';
import { parseFacturae } from './facturae.js';
import { parseFatturaPa } from './fatturapa.js';
import { parseFinvoice } from './finvoice.js';
import { parseIsdoc } from './isdoc.js';
import { parseKsef } from './ksef.js';
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
  /** Fill `source.provenance` (canonical path -> source XPath). Off by default to keep the output small. */
  provenance?: boolean;
}

export type Parser = (input: ParseInput) => CanonicalInvoice[];

export class NotImplementedError extends Error {
  constructor(
    public readonly family: ParserFamily,
    reason?: string,
  ) {
    super(reason ?? `No parser yet for the '${family}' family`);
  }
}

export const PARSERS: Record<ParserFamily, Parser> = {
  ubl: parseUbl, // Peppol BIS 3, XRechnung UBL, NLCIUS, CIUS-RO/PT, HR-CIUS, OIOUBL 2/3, BIS 2, PINT
  cii: parseCii, // Factur-X/ZUGFeRD 2, XRechnung CII, NLCIUS CII, France CII (D16B and D22B)
  svefaktura: parseSvefaktura,
  zugferd1: parseZugferd1, // ZUGFeRD 1.0 CrossIndustryDocument
  fatturapa: parseFatturaPa, // FatturaPA 1.2.x (FPR12/FPA12), semplificata FSM10
  ksef: parseKsef, // KSeF FA(2), FA(3), FA_RR
  facturae: parseFacturae, // Facturae 3.2, 3.2.1, 3.2.2
  isdoc: parseIsdoc, // ISDOC 5.2+ and 6.x (Czechia)
  ebinterface: parseEbinterface, // ebInterface 3.0 to 6.1 (Austria); 1.0-2.2 unsupported
  finvoice: parseFinvoice, // Finvoice 3.0 (Finland)
  teappsxml: parseTeappsxml, // Finnish TEAPPSXML (INVOICE_CENTER)
  'e-arve': parseEarve, // Estonian e-invoice 1.2 / 1.2.EN
  eslog: parseEslog, // eSLOG 2.0 (Slovenia)
  mydata: parseMydata, // Greek AADE myDATA InvoicesDoc
  cfdi: parseCfdi, // Mexican CFDI 4.0 and 3.3 (ingreso, egreso)
};

/** Families with a real parser (derived from the registry, so it stays right as stubs are replaced). */
/**
 * Families with a real parser. Every family has one today; a new family can start as a parser that
 * throws NotImplementedError, and should then be left out of this list.
 */
export const IMPLEMENTED_FAMILIES: readonly ParserFamily[] = Object.keys(PARSERS) as ParserFamily[];
