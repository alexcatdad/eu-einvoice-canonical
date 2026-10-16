/**
 * The formats overview: a short name for each registry format, and the country-by-country grid. Pure functions with no DOM,
 * so the build can write the grid into the Formats page and the converter can reuse the short names.
 */
import { EU_COUNTRIES, FORMATS, type FormatDef, IMPLEMENTED_FAMILIES } from '../src/index.js';

const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Countries outside the EU that the registry covers. */
export const WORLD_COUNTRIES = ['AE', 'AU', 'JP', 'MY', 'NZ', 'OM', 'SA', 'SG'];

/** Short chip labels; anything not listed falls back to the registry name without its parenthesis. */
export const SHORT_NAMES: Record<string, string> = {
  'xrechnung-ubl': 'XRechnung UBL',
  'xrechnung-cii': 'XRechnung CII',
  'nlcius-ubl': 'NLCIUS UBL',
  'nlcius-cii': 'NLCIUS CII',
  'cius-ro': 'CIUS-RO',
  'cius-pt': 'CIUS-PT',
  'hr-cius': 'HR-CIUS',
  'fr-ctc-ubl': 'France CTC UBL',
  'fr-ctc-cii': 'France CTC CII',
  'oioubl-3': 'OIOUBL 3',
  'oioubl-2': 'OIOUBL 2',
  'pl-pef': 'PEF',
  ksef: 'KSeF',
  'ubl-be': 'UBL.BE',
  facturx: 'Factur-X / ZUGFeRD 2',
  'zugferd-1': 'ZUGFeRD 1',
  fatturapa: 'FatturaPA',
  'fatturapa-semplificata': 'FatturaPA simplified',
  facturae: 'Facturae',
  isdoc: 'ISDOC',
  ebinterface: 'ebInterface',
  'ebinterface-2': 'ebInterface 2',
  finvoice: 'Finvoice',
  teappsxml: 'TEAPPSXML',
  'e-arve': 'e-arve',
  'eslog-2': 'eSLOG 2.0',
  'eslog-1': 'eSLOG 1.6',
  'svefaktura-1': 'Svefaktura 1.0',
  'gr-mydata': 'myDATA',
  'peppol-pint': 'PINT',
  'pint-sg': 'PINT SG',
  'pint-aunz': 'PINT A-NZ',
  'pint-jp': 'PINT JP',
  'pint-my': 'PINT MY',
  'pint-ae': 'PINT AE',
  'pint-om': 'PINT OM',
  'pint-eu': 'PINT EU',
  'zatca-ubl': 'ZATCA UBL',
};

export function shortName(f: FormatDef) {
  return SHORT_NAMES[f.id] ?? f.name.replace(/\s*\(.*?\)\s*/g, ' ').trim();
}

const regions = new Intl.DisplayNames(['en'], { type: 'region' });

/** The country-by-country grid as static English HTML; each chip links to the format's page under `root`. */
export function coverageHtml(root: string): string {
  const implemented = new Set<string>(IMPLEMENTED_FAMILIES);
  const chip = (f: FormatDef) => {
    const ok = implemented.has(f.family);
    return `<li class="fmt ${ok ? 'converts' : 'identifies'}"><a href="${root}docs/formats/${esc(f.id)}.html" title="${esc(f.notes)}">${esc(shortName(f))}<span class="visually-hidden">${ok ? ', converted to canonical JSON' : ', identified, parser still to come'}</span></a></li>`;
  };
  const eu = new Set<string>(EU_COUNTRIES);
  const all = FORMATS as readonly FormatDef[];
  const name = (cc: string) => regions.of(cc) ?? cc;
  const tile = (cc: string, chips: string) =>
    `<li class="country"><p class="country-name"><span class="cc">${cc}</span>${esc(name(cc))}</p><ul>${chips}</ul></li>`;
  const world = all.filter((f) => f.countries.every((cc) => cc !== 'EU' && !eu.has(cc)));
  const national = all.filter((f) => !f.countries.includes('EU'));
  const byName = (a: string, b: string) => name(a).localeCompare(name(b), 'en');
  const euTiles = [...EU_COUNTRIES]
    .sort(byName)
    .map((cc) => {
      const formats = national.filter((f) => f.countries.includes(cc));
      return tile(
        cc,
        formats.length
          ? formats.map(chip).join('')
          : `<li class="fmt converts"><a href="${root}docs/formats/peppol-bis3.html">Peppol BIS 3</a></li>`,
      );
    })
    .join('');
  const worldTiles = [...WORLD_COUNTRIES]
    .sort(byName)
    .map((cc) =>
      tile(
        cc,
        world
          .filter((f) => f.countries.includes(cc))
          .map(chip)
          .join(''),
      ),
    )
    .join('');
  return `<section class="coverage" aria-labelledby="coverage-title">
  <h2 id="coverage-title">What it reads, country by country</h2>
  <p>Every EU country also sends Peppol BIS Billing 3.0, which converts fully. The tiles show each country's own formats; each one links to its page.</p>
  <ul class="legend"><li><span class="swatch converts" aria-hidden="true"></span>Converted to canonical JSON</li><li><span class="swatch identifies" aria-hidden="true"></span>Identified; parser still to come</li></ul>
  <ul class="countries">${euTiles}</ul>
  <h3 id="world-title">Beyond the EU</h3>
  <p>Peppol PINT jurisdictions and Saudi ZATCA, mapped on top of the UBL parser. The PINT Schematron is not bundled, so these get the UBL schema check only.</p>
  <ul class="countries" aria-labelledby="world-title">${worldTiles}</ul>
</section>`;
}
