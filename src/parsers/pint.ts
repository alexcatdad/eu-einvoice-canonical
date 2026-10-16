/**
 * Peppol PINT (Peppol International model) on top of the UBL parser. PINT documents are UBL 2.1
 * invoices and credit notes that follow the EN 16931 UBL binding, so `parseUbl` maps the common part;
 * this module adds what each jurisdiction puts around it, into `extensions` (sg, au/nz, jp, my, ae).
 *
 * Mapping source: the PINT specification pages at docs.peppol.eu/poac (PINT, PINT SG, A-NZ, JP, MY, AE),
 * read for the field locations only. The specifications themselves, their Schematron and their examples
 * are not redistributed here (OpenPEPPOL's copyright statement does not permit it); see validation/NOTICE.
 *
 * GST is handled as a VAT-like scheme: `parseUbl` reads PartyTaxScheme with scheme VAT or GST into
 * `vatId`. Tax category codes are passed through as sent; SG (SR, ZR, ES, OS, NG...) and MY (HVG, LVG,
 * SE, SA, TTX...) use their own code lists rather than UNCL 5305.
 */
import type { Element } from '@xmldom/xmldom';
import type { CanonicalInvoice, Decimal } from '../canonical.js';
import type { Ctx } from './context.js';

export const PINT_VAT_SCHEMES: ReadonlySet<string> = new Set(['VAT', 'GST']);

const PINT_FORMATS = new Set(['peppol-pint', 'pint-sg', 'pint-aunz', 'pint-jp', 'pint-my', 'pint-ae', 'pint-om', 'pint-eu']);
export const isPint = (format: string) => PINT_FORMATS.has(format);

// Electronic address scheme identifiers (EAS) PINT uses for national registers.
const EAS_ABN = '0151';
const EAS_NZBN = '0088';
const EAS_SG_UEN = '0195';
const EAS_AE_TIN = '0235';

/** The eight ProfileExecutionID flags of PINT AE, in position order. */
const AE_TRANSACTION_TYPES = [
  'freeTradeZone',
  'deemedSupply',
  'profitMarginScheme',
  'summaryInvoice',
  'continuousSupply',
  'agentBilling',
  'ecommerce',
  'exports',
] as const;

const QUALIFIED_INVOICE_NUMBER = /^T\d{13}$/;

/** CompanyID of the PartyTaxScheme with this scheme. */
function taxSchemeId(c: Ctx, party: Element | undefined, scheme: string): string | undefined {
  for (const t of c.all(party, 'cac:PartyTaxScheme')) {
    if (c.text(t, 'cac:TaxScheme/cbc:ID') !== scheme) continue;
    const v = c.text(t, 'cbc:CompanyID');
    if (v) return v;
  }
  return undefined;
}

/** First identifier of the party (endpoint, party identification, legal registration) that carries this schemeID. */
function schemedId(c: Ctx, party: Element | undefined, scheme: string): string | undefined {
  const candidates = [
    c.el(party, 'cbc:EndpointID'),
    ...c.all(party, 'cac:PartyIdentification/cbc:ID'),
    c.el(party, 'cac:PartyLegalEntity/cbc:CompanyID'),
  ];
  for (const e of candidates) {
    if (e && c.attr(e, undefined, 'schemeID') === scheme) {
      const v = c.text(e);
      if (v) return v;
    }
  }
  return undefined;
}

const categoriesUsed = (inv: CanonicalInvoice) =>
  [...new Set([...inv.vatBreakdown.map((v) => v.categoryCode), ...inv.lines.flatMap((l) => (l.vat ? [l.vat.categoryCode] : []))])]
    .filter(Boolean)
    .sort();

export function applyPint(c: Ctx, root: Element, inv: CanonicalInvoice, format: string, isCn: boolean): void {
  const seller = c.el(root, 'cac:AccountingSupplierParty/cac:Party');
  const buyer = c.el(root, 'cac:AccountingCustomerParty/cac:Party');
  const ext = inv.extensions;

  if (format === 'pint-sg') {
    ext.sg = {
      sellerUen: schemedId(c, seller, EAS_SG_UEN),
      buyerUen: schemedId(c, buyer, EAS_SG_UEN),
      gstRegistrationNumber: taxSchemeId(c, seller, 'GST'),
      buyerGstRegistrationNumber: taxSchemeId(c, buyer, 'GST'),
      gstCategories: categoriesUsed(inv),
    };
  } else if (format === 'pint-aunz') {
    // One specification for both countries; the seller's country says which one the invoice is from.
    const country = [inv.seller.address?.countryCode, inv.buyer.address?.countryCode].find((cc) => cc === 'AU' || cc === 'NZ');
    const e = {
      abn: schemedId(c, seller, EAS_ABN),
      nzbn: schemedId(c, seller, EAS_NZBN),
      gstRegistrationNumber: taxSchemeId(c, seller, 'GST'),
      buyerAbn: schemedId(c, buyer, EAS_ABN),
      buyerNzbn: schemedId(c, buyer, EAS_NZBN),
      buyerGstRegistrationNumber: taxSchemeId(c, buyer, 'GST'),
      gstCategories: categoriesUsed(inv),
    };
    if (country === 'AU') ext.au = e;
    else if (country === 'NZ') ext.nz = e;
    else c.warn('PINT_AUNZ_COUNTRY', 'Neither seller nor buyer is in AU or NZ; the A-NZ fields were not mapped');
  } else if (format === 'pint-jp') {
    const sellerNo = taxSchemeId(c, seller, 'VAT');
    const buyerNo = taxSchemeId(c, buyer, 'VAT');
    // 'T' + 13 digits. A non-registered business (nontaxinvoice-1@jp-1) has none, so nothing is invented for it.
    ext.jp = {
      qualifiedInvoiceIssuerNumber: sellerNo && QUALIFIED_INVOICE_NUMBER.test(sellerNo) ? sellerNo : undefined,
      buyerRegistrationNumber: buyerNo && QUALIFIED_INVOICE_NUMBER.test(buyerNo) ? buyerNo : undefined,
    };
    if (sellerNo && !QUALIFIED_INVOICE_NUMBER.test(sellerNo))
      c.warn('PINT_JP_REGISTRATION_NUMBER', `Seller tax identifier ${sellerNo} is not a qualified invoice issuer number (T and 13 digits)`);
  } else if (format === 'pint-my') {
    ext.my = malaysia(c, root, inv, seller, buyer);
  } else if (format === 'pint-ae') {
    ext.ae = emirates(c, root, seller, buyer);
    const lineEls = c.all(root, isCn ? 'cac:CreditNoteLine' : 'cac:InvoiceLine');
    lineEls.forEach((el, i) => {
      const line = inv.lines[i];
      if (!line) return;
      const national: Record<string, string> = {};
      const commodity = c.text(el, 'cac:Item/cac:CommodityClassification/cbc:CommodityCode');
      const nature = c.text(el, 'cac:Item/cac:CommodityClassification/cbc:NatureCode');
      if (commodity) national.commodityCode = commodity;
      if (nature) national.natureCode = nature;
      if (Object.keys(national).length) line.national = national;
    });
  }
}

function malaysia(c: Ctx, root: Element, inv: CanonicalInvoice, seller: Element | undefined, buyer: Element | undefined) {
  const refs = c.all(root, 'cac:AdditionalDocumentReference');
  const refId = (type: string) =>
    c.text(
      refs.find((r) => c.text(r, 'cbc:DocumentType') === type),
      'cbc:ID',
    );
  const msic = c.el(seller, 'cbc:IndustryClassificationCode');
  return {
    tin: taxSchemeId(c, seller, 'GST'),
    buyerTin: taxSchemeId(c, buyer, 'GST'),
    sstRegistrationNumber: taxSchemeId(c, seller, 'VAT'),
    buyerSstRegistrationNumber: taxSchemeId(c, buyer, 'VAT'),
    businessRegistrationNumber: inv.seller.legalRegistrationId?.value,
    msicCode: c.text(msic),
    msicDescription: c.attr(msic, undefined, 'name'),
    freeTradeAgreement: refId('FreeTradeAgreement'),
    certifiedExporterNumber: refId('CertEx'),
    customsForm2: refId('K2'),
    customsImportForms: refs.filter((r) => c.text(r, 'cbc:DocumentTypeCode') === '914').flatMap((r) => c.text(r, 'cbc:ID') ?? []),
    originalDocumentUuid: c.text(root, 'cac:BillingReference/cac:InvoiceDocumentReference/cbc:UUID'),
    taxCategories: categoriesUsed(inv),
  };
}

function emirates(c: Ctx, root: Element, seller: Element | undefined, buyer: Element | undefined) {
  const code = c.text(root, 'cbc:ProfileExecutionID');
  const flags = code && /^[01]{8}$/.test(code) ? AE_TRANSACTION_TYPES.filter((_, i) => code[i] === '1') : [];
  if (code && !/^[01]{8}$/.test(code)) c.warn('PINT_AE_TRANSACTION_TYPE', `Invoice transaction type code "${code}" is not eight 0/1 flags`);
  const legal = (party: Element | undefined) => c.el(party, 'cac:PartyLegalEntity/cbc:CompanyID');
  const rate = c.el(root, 'cac:TaxExchangeRate');
  const rateValue = c.dec(rate, 'cbc:CalculationRate');
  return {
    transactionTypeCode: code,
    transactionTypes: [...flags] as string[],
    uuid: c.text(root, 'cbc:UUID'),
    sellerTin: schemedId(c, seller, EAS_AE_TIN) ?? taxSchemeId(c, seller, 'TIN'),
    buyerTin: schemedId(c, buyer, EAS_AE_TIN) ?? taxSchemeId(c, buyer, 'TIN'),
    sellerRegistrationType: c.attr(legal(seller), undefined, 'schemeAgencyID'),
    sellerRegistrationAuthority: c.attr(legal(seller), undefined, 'schemeAgencyName'),
    buyerRegistrationType: c.attr(legal(buyer), undefined, 'schemeAgencyID'),
    buyerRegistrationAuthority: c.attr(legal(buyer), undefined, 'schemeAgencyName'),
    taxExchangeRate:
      rate && rateValue !== undefined
        ? {
            sourceCurrency: c.text(rate, 'cbc:SourceCurrencyCode') ?? '',
            targetCurrency: c.text(rate, 'cbc:TargetCurrencyCode') ?? '',
            rate: rateValue as Decimal,
          }
        : undefined,
    billingFrequency: c.text(root, 'cac:InvoicePeriod/cbc:Description'),
  };
}
