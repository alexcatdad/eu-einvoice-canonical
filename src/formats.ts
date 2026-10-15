/**
 * Registry of the XML e-invoice formats you can receive from the 27 EU member
 * states, with detection rules.
 *
 * Rules are tried in order and the first match wins, so national CIUS profiles
 * come before Peppol BIS 3, and Peppol BIS 3 comes before the generic EN 16931
 * fallback. Each format names the parser family that maps it to the canonical
 * model: one UBL parser and one CII parser cover every EN 16931-based format;
 * national schemas get their own parser.
 */
import type { XmlProbe } from './probe.js';

export const NS = {
  ublInvoice: 'urn:oasis:names:specification:ubl:schema:xsd:Invoice-2',
  ublCreditNote: 'urn:oasis:names:specification:ubl:schema:xsd:CreditNote-2',
  cii: 'urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100',
  zugferd1: 'urn:ferd:CrossIndustryDocument:invoice:1p0',
  svefaktura: 'urn:sfti:documents:BasicInvoice:1:0',
  fatturaPA: 'http://ivaservizi.agenziaentrate.gov.it/docs/xsd/fatture/v1.2',
  fatturaSemplificata: 'http://ivaservizi.agenziaentrate.gov.it/docs/xsd/fatture/v1.0',
  eslog2: 'urn:eslog:2.00',
  sbdh: 'http://www.unece.org/cefact/namespaces/StandardBusinessDocumentHeader',
  soap11: 'http://schemas.xmlsoap.org/soap/envelope/',
  soap12: 'http://www.w3.org/2003/05/soap-envelope',
  xmldsig: 'http://www.w3.org/2000/09/xmldsig#',
} as const;

/** Known KSeF schema namespaces. FA(3) has been mandatory since 1 February 2026. */
const KSEF_NS: Record<string, string> = {
  'http://crd.gov.pl/wzor/2023/06/29/12648/': 'FA (2)',
  'http://crd.gov.pl/wzor/2025/06/25/13775/': 'FA (3)',
  'http://crd.gov.pl/wzor/2026/03/06/14189/': 'FA_RR (1)',
};

export type ParserFamily =
  | 'ubl' | 'cii' | 'zugferd1' | 'svefaktura'
  | 'fatturapa' | 'ksef' | 'facturae' | 'isdoc' | 'ebinterface'
  | 'finvoice' | 'teappsxml' | 'e-arve' | 'eslog' | 'mydata';

/**
 * - current: in active use for invoices you will receive.
 * - legacy: superseded but still sent by some senders; parse best-effort.
 * - unverified: detection rule not confirmed against a real file; check before relying on it.
 */
export type FormatStatus = 'current' | 'legacy' | 'unverified';

export interface MatchDetails {
  version?: string;
  profile?: string;
}

export interface FormatDef {
  id: string;
  name: string;
  family: ParserFamily;
  /** ISO country codes, or 'EU' for formats used everywhere. */
  countries: readonly string[];
  status: FormatStatus;
  /** Suggested build order: 1 = EN 16931 syntaxes, 2 = national formats in active use, 3 = legacy. */
  phase: 1 | 2 | 3;
  notes: string;
  match(p: XmlProbe, ctx: DetectContext): MatchDetails | null;
}

export interface DetectContext {
  /** The XML came out of a PDF/A-3 attachment (Factur-X / ZUGFeRD hybrid). */
  fromPdf: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const isUbl = (p: XmlProbe) =>
  (p.rootNs === NS.ublInvoice && p.rootName === 'Invoice') ||
  (p.rootNs === NS.ublCreditNote && p.rootName === 'CreditNote');
const isCii = (p: XmlProbe) => p.rootNs === NS.cii && p.rootName === 'CrossIndustryInvoice';
const cid = (p: XmlProbe) => p.values.ublCustomizationId ?? '';
/** Real files sometimes carry stray whitespace inside the namespace URI (seen in Italian invoices). */
const nsLoose = (p: XmlProbe) => p.rootNs.replace(/\s+/g, '');
const gid = (p: XmlProbe) => p.values.ciiGuidelineId ?? '';
/** The part after '#conformant#' / '#compliant#' chains, used as a profile label. */
const extensionOf = (id: string) => id.split('#').slice(2).filter((s) => !/^(compliant|conformant)$/i.test(s)).join(' + ') || undefined;
/** National extensions chained after the part that matches `base` (e.g. EHF or AGID after the Peppol identifier). */
const extensionAfter = (id: string, base: RegExp) => {
  const parts = id.split('#');
  const i = parts.findIndex((s) => base.test(s));
  return parts.slice(i + 1).filter((s) => !/^(compliant|conformant)$/i.test(s)).join(' + ') || undefined;
};
const enVersion = (id: string) => /urn:cen\.eu:en16931:(\d{4})/.exec(id)?.[1];

function ublRule(re: RegExp, version?: (id: string) => string | undefined) {
  return (p: XmlProbe): MatchDetails | null =>
    isUbl(p) && re.test(cid(p)) ? { version: version?.(cid(p)), profile: extensionOf(cid(p)) } : null;
}
/** Peppol BIS: the profile is only the national extension, if any, not the Peppol identifier itself. */
function peppolRule(re: RegExp) {
  return (p: XmlProbe): MatchDetails | null =>
    isUbl(p) && re.test(cid(p)) ? { version: enVersion(cid(p)), profile: extensionAfter(cid(p), re) } : null;
}
function ciiRule(re: RegExp, version?: (id: string) => string | undefined) {
  return (p: XmlProbe): MatchDetails | null =>
    isCii(p) && re.test(gid(p)) ? { version: version?.(gid(p)), profile: extensionOf(gid(p)) } : null;
}

const FACTURX_PROFILES: [RegExp, string][] = [
  [/:minimum$/i, 'MINIMUM'],
  [/:basicwl$/i, 'BASIC WL'],
  [/:basic$/i, 'BASIC'],
  [/:extended$/i, 'EXTENDED'],
];

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

export const FORMATS = [
  // ---- UBL 2.1, EN 16931 CIUS and extensions --------------------------------
  {
    id: 'xrechnung-ubl', name: 'XRechnung (UBL)', family: 'ubl', countries: ['DE'], status: 'current', phase: 1,
    notes: 'German CIUS. B2G mandatory; B2B receiving obligation since 1 Jan 2025. BT-10 carries the Leitweg-ID.',
    match: ublRule(/xrechnung/i, (id) => /xrechnung_(\d+\.\d+)/.exec(id)?.[1]),
  },
  {
    id: 'nlcius-ubl', name: 'NLCIUS (UBL)', family: 'ubl', countries: ['NL'], status: 'current', phase: 1,
    notes: 'Dutch CIUS (SI-UBL 2.0). Also sent with the G-account extension.',
    match: ublRule(/urn:fdc:nen\.nl:nlcius/i),
  },
  {
    id: 'cius-ro', name: 'RO e-Factura (CIUS-RO)', family: 'ubl', countries: ['RO'], status: 'current', phase: 1,
    notes: 'Downloaded from ANAF SPV as a ZIP holding the invoice and a detached XMLDSig signature file.',
    match: ublRule(/urn:efactura\.mfinante\.ro:CIUS-RO/i, (id) => /CIUS-RO:([\d.]+)/i.exec(id)?.[1]),
  },
  {
    id: 'cius-pt', name: 'CIUS-PT', family: 'ubl', countries: ['PT'], status: 'current', phase: 1,
    notes: 'Portuguese CIUS for public procurement. Carries ATCUD.',
    match: ublRule(/urn:feap\.gov\.pt:CIUS-PT/i, (id) => /CIUS-PT:([\d.]+[\d])/i.exec(id)?.[1]),
  },
  {
    id: 'hr-cius', name: 'HR-CIUS (Fiskalizacija 2.0)', family: 'ubl', countries: ['HR'], status: 'current', phase: 1,
    notes: 'Croatian CIUS + HR extensions, mandatory B2B and B2G since 1 Jan 2026. OIB uses EAS 9934. '
      + 'The official spec spells the identifier inconsistently, so the rule only looks for urn:mfin.gov.',
    match: ublRule(/urn:mfin\.gov\.(hr|en):/i),
  },
  {
    id: 'fr-ctc-ubl', name: 'France CTC (UBL)', family: 'ubl', countries: ['FR'], status: 'unverified', phase: 1,
    notes: 'French reform (XP Z12-012), receiving obligation from 1 Sep 2026. Exact BT-24 string for '
      + 'EXTENDED-CTC-FR not confirmed; plain EN16931 French invoices fall through to en16931-ubl.',
    match: ublRule(/ctc[-_]?fr|cpro\.gouv\.fr/i),
  },
  {
    id: 'oioubl-3', name: 'OIOUBL 3.0', family: 'ubl', countries: ['DK'], status: 'current', phase: 1,
    notes: 'Danish UBL 2.1 profile aligned with Peppol BIS 3.',
    match: ublRule(/urn:fdc:oioubl\.dk/i),
  },
  {
    id: 'pl-pef', name: 'Poland PEF (Peppol BIS 3 + PL extension)', family: 'ubl', countries: ['PL'], status: 'unverified', phase: 1,
    notes: 'Public-procurement invoices via PEF/KSeF. Detected by urn:pl:extended namespaces on the root.',
    match: (p) => (isUbl(p) && p.nsDecls.some((n) => n.startsWith('urn:pl:extended:')) ? { profile: extensionOf(cid(p)) } : null),
  },
  {
    id: 'peppol-bis3', name: 'Peppol BIS Billing 3.0', family: 'ubl', countries: ['EU'], status: 'current', phase: 1,
    notes: 'Default for BE (B2B since 1 Jan 2026), SK (2027), LV, LU, MT, IE, SE, FI, NL, DK, AT/DE/FR B2G and cross-border. '
      + 'Profile shows national extensions (e.g. Italy AGID).',
    match: peppolRule(/urn:fdc:peppol\.eu:2017:poacc:billing:3\.0/i),
  },
  {
    id: 'peppol-bis3-selfbilling', name: 'Peppol BIS Self-Billing 3.0', family: 'ubl', countries: ['EU'], status: 'current', phase: 1,
    notes: 'Self-billed invoices; seller and buyer roles stay as in EN 16931.',
    match: peppolRule(/urn:fdc:peppol\.eu:2017:poacc:selfbilling:3\.0/i),
  },
  {
    id: 'peppol-pint', name: 'Peppol PINT', family: 'ubl', countries: ['EU'], status: 'current', phase: 1,
    notes: 'Peppol International model. Mostly non-EU jurisdictions; accept for cross-border senders.',
    match: (p) => (isUbl(p) && /^urn:peppol:pint:|poacc:(self)?billing:international:/i.test(cid(p))
      ? { profile: /@([\w-]+)/.exec(cid(p))?.[1] ?? /international:(\w+)/.exec(cid(p))?.[1] } : null),
  },
  {
    id: 'ubl-be', name: 'UBL.BE', family: 'ubl', countries: ['BE'], status: 'legacy', phase: 3,
    notes: 'Belgian EN 16931 extension used before the Peppol BIS 3 B2B mandate.',
    match: ublRule(/UBL\.BE/i),
  },
  {
    id: 'en16931-ubl', name: 'EN 16931 (UBL), no CIUS', family: 'ubl', countries: ['EU'], status: 'current', phase: 1,
    notes: 'Bare EN 16931 or an unknown CIUS of it. Accepts the 2017 and 2026 specification identifiers.',
    match: ublRule(/^urn:cen\.eu:en16931:20\d\d/i, enVersion),
  },
  {
    id: 'peppol-bis2', name: 'Peppol BIS 2 / CEN BII (incl. Svefaktura BIS 5A, EHF 2)', family: 'ubl', countries: ['EU'], status: 'legacy', phase: 3,
    notes: 'Pre-EN 16931 Peppol profiles, withdrawn 2019. Same UBL 2.1 syntax; parse best-effort and warn.',
    match: ublRule(/urn:www\.cenbii\.eu:transaction:/i),
  },
  {
    id: 'oioubl-2', name: 'OIOUBL 2.x', family: 'ubl', countries: ['DK'], status: 'legacy', phase: 3,
    notes: 'Danish profile on UBL 2.0 (same namespaces as UBL 2.1). Still widely sent via NemHandel.',
    match: (p) => (isUbl(p) && /^OIOUBL-2/i.test(cid(p)) ? { version: cid(p).replace(/^OIOUBL-/i, '') } : null),
  },
  {
    id: 'ubl-unknown', name: 'UBL 2.x invoice, unknown profile', family: 'ubl', countries: ['EU'], status: 'unverified', phase: 3,
    notes: 'UBL Invoice/CreditNote with a missing or unrecognised CustomizationID. Parse best-effort and warn.',
    match: (p) => (isUbl(p) ? { profile: cid(p) || undefined } : null),
  },

  // ---- UN/CEFACT CII D16B / D22B ------------------------------------------------
  {
    id: 'xrechnung-cii', name: 'XRechnung (CII)', family: 'cii', countries: ['DE'], status: 'current', phase: 1,
    notes: 'German CIUS in CII syntax.',
    match: ciiRule(/xrechnung/i, (id) => /xrechnung_(\d+\.\d+)/.exec(id)?.[1]),
  },
  {
    id: 'nlcius-cii', name: 'NLCIUS (CII)', family: 'cii', countries: ['NL'], status: 'current', phase: 1,
    notes: 'Dutch CIUS in CII syntax.',
    match: ciiRule(/urn:fdc:nen\.nl:nlcius/i),
  },
  {
    id: 'fr-ctc-cii', name: 'France CTC (CII / Factur-X EXTENDED-CTC-FR)', family: 'cii', countries: ['FR'], status: 'unverified', phase: 1,
    notes: 'French reform uses CII D22B. Exact guideline ID not confirmed.',
    match: ciiRule(/ctc[-_]?fr|cpro\.gouv\.fr/i),
  },
  {
    id: 'facturx', name: 'Factur-X / ZUGFeRD 2.x', family: 'cii', countries: ['DE', 'FR'], status: 'current', phase: 1,
    notes: 'Hybrid PDF/A-3 + CII. MINIMUM and BASIC WL carry no lines and are not valid e-invoices in DE; '
      + 'France accepts BASIC WL until Sep 2027. The EN 16931 profile uses the plain EN identifier.',
    match: (p, ctx) => {
      if (!isCii(p)) return null;
      const id = gid(p);
      if (/factur-x\.eu|zugferd\.de/i.test(id)) {
        const profile = FACTURX_PROFILES.find(([re]) => re.test(id))?.[1] ?? 'EN 16931';
        return { profile, version: /zugferd\.de:2p0/i.test(id) ? 'ZUGFeRD 2.0' : 'Factur-X 1.0x / ZUGFeRD 2.1+' };
      }
      if (ctx.fromPdf && /^urn:cen\.eu:en16931:20\d\d$/i.test(id)) return { profile: 'EN 16931', version: 'Factur-X 1.0x / ZUGFeRD 2.1+' };
      return null;
    },
  },
  {
    id: 'en16931-cii', name: 'EN 16931 (CII), no CIUS', family: 'cii', countries: ['EU'], status: 'current', phase: 1,
    notes: 'Bare EN 16931 CII, or an unknown CIUS of it.',
    match: ciiRule(/^urn:cen\.eu:en16931:20\d\d/i, enVersion),
  },
  {
    id: 'cii-unknown', name: 'CII invoice, unknown profile', family: 'cii', countries: ['EU'], status: 'unverified', phase: 3,
    notes: 'CrossIndustryInvoice with an unrecognised guideline ID (includes ZUGFeRD 1 IDs placed in CII D16B files).',
    match: (p) => (isCii(p) ? { profile: gid(p) || undefined } : null),
  },
  {
    id: 'zugferd-1', name: 'ZUGFeRD 1.0', family: 'zugferd1', countries: ['DE'], status: 'legacy', phase: 3,
    notes: 'CII D13B-era CrossIndustryDocument, usually inside a PDF (ZUGFeRD-invoice.xml).',
    match: (p) => (p.rootNs === NS.zugferd1 && p.rootName === 'CrossIndustryDocument'
      ? { profile: /:(basic|comfort|extended)$/i.exec(p.values.zf1GuidelineId ?? '')?.[1]?.toUpperCase() } : null),
  },

  // ---- National schemas ------------------------------------------------------
  {
    id: 'fatturapa', name: 'FatturaPA', family: 'fatturapa', countries: ['IT'], status: 'current', phase: 2,
    notes: 'All Italian domestic B2B/B2G invoices go through SdI. Often a CAdES .p7m; one file can hold several invoices '
      + '(lotto). IdentificativoSdI comes from the SdI metadata file, not the invoice. Child elements are unqualified '
      + '(no namespace), so match them by local name.',
    match: (p) => (nsLoose(p) === NS.fatturaPA && p.rootName === 'FatturaElettronica'
      ? { version: p.rootAttrs.versione, profile: p.values.fatturaTipoDocumento } : null),
  },
  {
    id: 'fatturapa-semplificata', name: 'FatturaPA semplificata', family: 'fatturapa', countries: ['IT'], status: 'current', phase: 3,
    notes: 'Simplified invoice (FSM10) for small amounts.',
    match: (p) => (nsLoose(p) === NS.fatturaSemplificata && p.rootName === 'FatturaElettronicaSemplificata'
      ? { version: p.rootAttrs.versione } : null),
  },
  {
    id: 'ksef', name: 'KSeF FA(2)/FA(3)/FA_RR', family: 'ksef', countries: ['PL'], status: 'current', phase: 2,
    notes: 'Mandatory structured invoice in Poland (large taxpayers from 1 Feb 2026, others from 1 Apr 2026). '
      + 'The KSeF number is assigned by KSeF and comes from the download metadata, not the XML.',
    match: (p) => {
      if (p.rootName !== 'Faktura' || !p.rootNs.startsWith('http://crd.gov.pl/wzor/')) return null;
      const attrs = p.valueAttrs.ksefFormCode ?? {};
      return { version: attrs.kodSystemowy ?? KSEF_NS[p.rootNs] ?? p.values.ksefFormCode, profile: attrs.wersjaSchemy };
    },
  },
  {
    id: 'facturae', name: 'Facturae', family: 'facturae', countries: ['ES'], status: 'current', phase: 2,
    notes: 'Spanish format, mandatory for B2G via FACe; one of the formats allowed under the approved B2B decree. '
      + 'XAdES-signed (.xsig). A file can be a batch (Modality L).',
    match: (p) => {
      if (p.rootName !== 'Facturae' || !/facturae\.(gob\.)?es/i.test(p.rootNs)) return null;
      const fromNs = /v(\d+(?:\.\d+)+)\//.exec(p.rootNs)?.[1] ?? /Facturaev(\d+)_(\d+)_?(\d+)?/.exec(p.rootNs)?.slice(1).filter(Boolean).join('.');
      return { version: p.values.facturaeSchemaVersion ?? fromNs, profile: p.values.facturaeModality === 'L' ? 'batch' : undefined };
    },
  },
  {
    id: 'isdoc', name: 'ISDOC', family: 'isdoc', countries: ['CZ'], status: 'current', phase: 2,
    notes: 'Czech format. .isdoc is XML; .isdocx is a ZIP with the XML and attachments.',
    match: (p) => (p.rootName === 'Invoice' && p.rootNs.startsWith('http://isdoc.cz/namespace/')
      ? { version: p.rootAttrs.version, profile: p.values.isdocDocumentType } : null),
  },
  {
    id: 'ebinterface', name: 'ebInterface', family: 'ebinterface', countries: ['AT'], status: 'current', phase: 2,
    notes: 'Austrian format. 4.3-6.1 accepted; 4.0-4.2 no longer supported since 2022; 7.0 announced for Q4 2026.',
    match: (p) => {
      const m = /^http:\/\/www\.ebinterface\.at\/schema\/(\d+)p(\d+)\/$/.exec(p.rootNs);
      return m && p.rootName === 'Invoice' ? { version: `${m[1]}.${m[2]}` } : null;
    },
  },
  {
    id: 'finvoice', name: 'Finvoice', family: 'finvoice', countries: ['FI'], status: 'current', phase: 2,
    notes: 'Finnish bank-network format. No namespace. Usually shipped after a SOAP envelope in the same file; '
      + 'often ISO-8859-15.',
    match: (p) => (p.rootName === 'Finvoice' && p.rootNs === '' ? { version: p.rootAttrs.Version, profile: p.values.finvoiceTypeCode } : null),
  },
  {
    id: 'teappsxml', name: 'TEAPPSXML', family: 'teappsxml', countries: ['FI'], status: 'current', phase: 3,
    notes: 'Finnish operator format (TietoEVRY).',
    match: (p) => (p.rootName === 'INVOICE_CENTER' ? {} : null),
  },
  {
    id: 'e-arve', name: 'Estonian e-invoice (e-arve)', family: 'e-arve', countries: ['EE'], status: 'current', phase: 2,
    notes: 'No namespace. One file can hold several invoices. Header/Version is "1.2" even for 1.2.EN.',
    match: (p) => (p.rootName === 'E_Invoice' ? { version: p.values.eArveVersion } : null),
  },
  {
    id: 'eslog-2', name: 'eSLOG 2.0', family: 'eslog', countries: ['SI'], status: 'current', phase: 2,
    notes: 'Slovenian EN 16931-aligned format with EDIFACT-style segment names. B2B mandatory from 1 Jan 2028.',
    match: (p) => (p.rootNs === NS.eslog2 && p.rootName === 'Invoice' ? { version: p.rootAttrs.Version ?? '2.00' } : null),
  },
  {
    id: 'eslog-1', name: 'eSLOG 1.6', family: 'eslog', countries: ['SI'], status: 'unverified', phase: 3,
    notes: 'Pre-EN Slovenian format. Root element name not confirmed against a real file.',
    match: (p) => (p.rootName === 'IzdaniRacunEnostavni' ? { version: '1.6' } : null),
  },
  {
    id: 'svefaktura-1', name: 'Svefaktura 1.0', family: 'svefaktura', countries: ['SE'], status: 'legacy', phase: 3,
    notes: 'Withdrawn by SFTI in 2021 but still used B2B via operators.',
    match: (p) => (p.rootNs === NS.svefaktura && p.rootName === 'Invoice' ? { version: '1.0' } : null),
  },
  {
    id: 'gr-mydata', name: 'Greece myDATA invoice XML', family: 'mydata', countries: ['GR'], status: 'current', phase: 3,
    notes: 'AADE myDATA document (InvoicesDoc, namespace http://www.aade.gr/myDATA/invoice/v1.0 in the AADE XSD; checked against '
      + 'AADE\'s published InvoicesDoc schema and sample XML). One file can hold several invoices. Greek B2B mandate phases from '
      + 'Feb 2026 (large) and Oct 2026 (others). Greek EN 16931 invoices are detected by the UBL/CII rules; this rule is for raw myDATA files.',
    match: (p) => (p.rootName === 'InvoicesDoc' && /^https?:\/\/www\.aade\.gr\/myDATA\/invoice\/v\d/i.test(p.rootNs) ? { profile: p.values.myDataInvoiceType } : null),
  },
] as const satisfies readonly FormatDef[];

export type FormatId = (typeof FORMATS)[number]['id'];

// ---------------------------------------------------------------------------
// Documents that are not invoices but turn up in the same inbound channels
// ---------------------------------------------------------------------------

export interface OtherDocumentRule {
  label: string;
  test(p: XmlProbe): boolean;
}

export const OTHER_DOCUMENTS: OtherDocumentRule[] = [
  { label: 'UBL business document (order, despatch advice, response...)', test: (p) => /^urn:(oasis|oioubl):names:specification:(ubl|oioubl):schema:xsd:/.test(p.rootNs) },
  { label: 'UN/CEFACT document other than an invoice (France CDAR status, Order-X...)', test: (p) => /^urn:un:unece:uncefact:data:/.test(p.rootNs) },
  { label: 'SdI notification or metadata (holds IdentificativoSdI)', test: (p) => /agenziaentrate\.gov\.it\/docs\/xsd\/fatture\/messaggi/i.test(p.rootNs) },
  { label: 'KSeF UPO (official receipt)', test: (p) => /upo\.schematy\.mf\.gov\.pl/i.test(p.rootNs) },
  { label: 'Croatian fiscalisation message', test: (p) => /porezna-uprava\.gov\.hr/i.test(p.rootNs) },
  { label: 'Detached XML signature', test: (p) => p.rootNs === NS.xmldsig },
  { label: 'SFTI ObjectEnvelope (Svefaktura attachment)', test: (p) => p.rootNs === 'urn:sfti:documents:ObjectEnvelope:1:0' },
  { label: 'Peppol directory, statistics or tax-data (ViDA) report', test: (p) => /peppol\.eu\/schema\/pd|urn:fdc:peppol:|urn:peppol:schema:/i.test(p.rootNs) },
];

export const FORMATS_BY_ID: Record<FormatId, FormatDef> = Object.fromEntries(FORMATS.map((f) => [f.id, f])) as never;
