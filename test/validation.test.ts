import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, test } from 'node:test';
import { type CanonicalInvoice, convert, type ValidationSummary } from '../src/index.js';
import { defaultReader } from '../src/validation/bundles.js';
import { countLines } from '../src/validation/index.js';
import { fixture, utf8 } from './helpers.js';

const VALID = new URL('./validation-fixtures/peppol-valid-invoice.xml', import.meta.url);
const validXml = readFileSync(VALID, 'utf8');
/** The first test to run loads the SaxonJS stylesheets; give every validation test room. */
const slow = (name: string, fn: () => Promise<void>) => test(name, { timeout: 60_000 }, fn);

async function validated(
  bytes: Uint8Array,
  name = 'x.xml',
  validation?: Parameters<typeof convert>[3],
): Promise<{ invoice: CanonicalInvoice; v: ValidationSummary }> {
  const result = await convert(bytes, name, undefined, { validate: true, ...validation });
  const outcome = result.outcomes[0];
  if (outcome.status !== 'ok') throw new Error(`not converted: ${outcome.status}`);
  const invoice = outcome.invoices[0];
  return { invoice, v: invoice.source.validation! };
}

function matches(actual: unknown, expected: Record<string, unknown>) {
  for (const [k, e] of Object.entries(expected)) assert.deepEqual((actual as Record<string, unknown>)[k], e, k);
}

const ruleIds = (v: ValidationSummary, layer: string) =>
  v.findings.filter((f) => f.layer === layer && f.severity === 'fatal').map((f) => f.ruleId);

describe('validation', () => {
  slow('a valid Peppol invoice passes every layer', async () => {
    const { v } = await validated(utf8(validXml));
    matches(v, { parse: 'passed', schema: 'passed', semantic: 'passed', profile: 'passed', signature: 'not-run', clearance: 'not-run' });
    assert.deepEqual(v.bundles, { schema: 'xsd-ubl-2.1', semantic: 'en16931-ubl-1.3.16', profile: 'peppol-bis3-3.0.21-ubl' });
    assert.deepEqual(
      v.findings.filter((f) => f.severity === 'fatal'),
      [],
    );
  });

  test('validation is opt-in', async () => {
    const result = await convert(utf8(validXml), 'x.xml');
    const outcome = result.outcomes[0];
    // Without `validate`, only the signature layer (always checked) may be filled in.
    assert.equal(outcome.status, 'ok');
    if (outcome.status !== 'ok') return;
    const v = outcome.invoices[0].source.validation;
    for (const layer of ['schema', 'semantic', 'profile'] as const) assert.equal(v?.[layer] ?? 'not-run', 'not-run', layer);
    assert.deepEqual(v?.bundles ?? {}, {});
  });

  slow('a wrong total fails the EN 16931 layer with BR-CO-15 and a location', async () => {
    const xml = validXml.replace('<cbc:TaxInclusiveAmount currencyID="SEK">250.00', '<cbc:TaxInclusiveAmount currencyID="SEK">260.00');
    const { v } = await validated(utf8(xml));
    assert.equal(v.schema, 'passed');
    assert.equal(v.semantic, 'failed');
    assert.ok(ruleIds(v, 'semantic').includes('BR-CO-15'), String('BR-CO-15'));
    const finding = v.findings.find((f) => f.ruleId === 'BR-CO-15')!;
    assert.ok(finding.message.includes('Invoice total amount with VAT'), String('Invoice total amount with VAT'));
    assert.ok(finding.path?.includes('Invoice'), String('Invoice'));
  });

  slow('a bad specification identifier fails the Peppol layer with PEPPOL-EN16931-R004', async () => {
    const xml = validXml
      .replace('2017#compliant#urn:fdc:peppol', '2017#conformant#urn:fdc:peppol')
      .replace('<cbc:CustomizationID>', '<cbc:UBLVersionID>2.1</cbc:UBLVersionID><cbc:CustomizationID>');
    const { v } = await validated(utf8(xml));
    assert.equal(v.schema, 'passed');
    assert.equal(v.profile, 'failed');
    assert.ok(ruleIds(v, 'profile').includes('PEPPOL-EN16931-R004'), String('PEPPOL-EN16931-R004'));
  });

  slow('an element in the wrong order fails the schema layer only', async () => {
    const xml = validXml
      .replace('<cbc:DueDate>2026-11-14</cbc:DueDate>\n', '')
      .replace('<cbc:IssueDate>', '<cbc:DueDate>2026-11-14</cbc:DueDate>\n  <cbc:IssueDate>');
    assert.notEqual(xml, validXml);
    const { v } = await validated(utf8(xml));
    assert.equal(v.schema, 'failed');
    assert.equal(v.semantic, 'passed');
    assert.equal(v.profile, 'passed');
    assert.ok(v.findings.filter((f) => f.layer === 'schema' && f.severity === 'fatal').length > 0);
    assert.deepEqual(
      v.findings.filter((f) => f.layer !== 'schema' && f.severity === 'fatal'),
      [],
    );
  });

  slow('CII invoices run the CII schema, EN 16931 and XRechnung bundles', async () => {
    const { v } = await validated(fixture('xrechnung-cii.xml'), 'xrechnung-cii.xml');
    matches(v, { schema: 'passed', semantic: 'passed', profile: 'passed' });
    assert.deepEqual(v.bundles, { schema: 'xsd-cii-d16b', semantic: 'en16931-cii-1.3.17', profile: 'xrechnung-3.0.2-cii' });
  });

  slow('a CII schema violation is reported against the CII schema', async () => {
    const xml = new TextDecoder().decode(fixture('xrechnung-cii.xml')).replace('<ram:ID>', '<ram:Bogus/><ram:ID>');
    const { v } = await validated(utf8(xml), 'xrechnung-cii.xml');
    assert.equal(v.schema, 'failed');
  });

  slow('warnings do not fail a layer', async () => {
    const { v } = await validated(fixture('xrechnung-ubl.xml'), 'xrechnung-ubl.xml');
    assert.equal(v.profile, 'passed');
    assert.equal(v.bundles.profile, 'xrechnung-3.0.2-ubl');
  });

  slow('Schematron is skipped above maxSchematronLines, the schema still runs', async () => {
    const lines = countLines(validXml);
    assert.ok(lines >= 1);
    const { v } = await validated(utf8(validXml), 'valid.xml', { validation: { maxSchematronLines: lines - 1 } });
    matches(v, { schema: 'passed', semantic: 'not-run', profile: 'not-run' });
    assert.deepEqual(v.bundles, { schema: 'xsd-ubl-2.1', semantic: 'en16931-ubl-1.3.16', profile: 'peppol-bis3-3.0.21-ubl' });
    assert.equal(v.result, 'incomplete');
    assert.ok(v.findings.some((f) => f.layer === 'semantic' && f.severity === 'info' && /maxSchematronLines/.test(f.message)));
    const atLimit = (await validated(utf8(validXml), 'valid.xml', { validation: { maxSchematronLines: lines } })).v;
    matches(atLimit, { semantic: 'passed', profile: 'passed' });
  });

  test('countLines counts UBL and CII line elements by namespace and stops past the limit', () => {
    const cac = 'xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"';
    const ram = 'xmlns:ram="urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100"';
    assert.equal(countLines(`<Invoice ${cac}><cac:InvoiceLine><x/></cac:InvoiceLine><cac:InvoiceLine/></Invoice>`), 2);
    assert.equal(
      countLines(
        `<CreditNote xmlns:é="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"><é:CreditNoteLine/></CreditNote>`,
      ),
      1,
    );
    assert.equal(
      countLines(`<rsm:X xmlns:rsm="r" ${ram}><ram:IncludedSupplyChainTradeLineItem>a</ram:IncludedSupplyChainTradeLineItem></rsm:X>`),
      1,
    );
    // Comments, CDATA, lookalike names and other namespaces do not count.
    assert.equal(
      countLines(
        `<Invoice ${cac}><!-- <cac:InvoiceLine> --><![CDATA[<cac:InvoiceLine>]]><cac:InvoiceLineReference/><InvoiceLine/></Invoice>`,
      ),
      0,
    );
    assert.equal(countLines(`<Invoice ${cac}>${'<cac:InvoiceLine/>'.repeat(50)}</Invoice>`, 3), 4);
    assert.equal(countLines(`<Invoice ${cac}><cac:InvoiceLine/><cac:InvoiceLine>`), 2);
  });

  slow('unavailable profile coverage is explicit and tolerant Svefaktura fixtures are not conforming', async () => {
    const minimum = (await validated(fixture('facturx-minimum.xml'), 'facturx-minimum.xml')).v;
    matches(minimum, { schema: 'not-run', semantic: 'not-run', profile: 'not-run' });
    assert.deepEqual(minimum.bundles, {});
    assert.equal(minimum.result, 'incomplete');
    assert.equal(minimum.reasons?.profile, 'unsupported');
    const sve = await convert(fixture('svefaktura-1.0.xml'), 'svefaktura-1.0.xml', undefined, { validate: true });
    const o = sve.outcomes[0];
    const v = o.status === 'ok' ? o.invoices[0].source.validation! : undefined;
    matches(v, { schema: 'failed', semantic: 'not-run', profile: 'passed', result: 'invalid' });
    assert.equal(v?.bundles.schema, 'xsd-svefaktura-1.0-20081227');
  });

  slow('validators that cannot run are unavailable, not failed', async () => {
    const { v } = await validated(utf8(validXml), 'x.xml', {
      validation: {
        bundles: {
          read: async () => {
            throw new Error('offline');
          },
        },
      },
    });
    matches(v, { parse: 'passed', schema: 'unavailable', semantic: 'unavailable', profile: 'unavailable' });
    assert.ok(v.findings.every((f) => f.severity === 'info' && /unavailable/i.test(f.message)));
    assert.equal(
      v.findings.some((f) => f.severity === 'fatal'),
      false,
    );
  });

  slow('a bundle file that does not match its manifest hash is unavailable', async () => {
    const real = defaultReader();
    const { v } = await validated(utf8(validXml), 'x.xml', {
      validation: {
        bundles: {
          read: async (id, path) => {
            const bytes = await real(id, path);
            if (!path.endsWith('.sef.json.gz')) return bytes;
            const copy = bytes.slice();
            copy[copy.length - 12] ^= 0xff;
            return copy;
          },
        },
      },
    });
    assert.equal(v.schema, 'passed');
    assert.equal(v.semantic, 'unavailable');
    assert.equal(v.profile, 'unavailable');
    assert.ok(v.findings.find((f) => f.layer === 'semantic')?.message.includes('manifest hash'), String('manifest hash'));
  });

  slow('every invoice of a validated file carries the summary', async () => {
    const { invoice } = await validated(utf8(validXml));
    assert.equal(invoice.source.validation?.bundles.schema, 'xsd-ubl-2.1');
  });
});

describe('validation keeps the signature layer', () => {
  test('a signed invoice keeps its signature status and findings when validate is on', async () => {
    const bytes = fixture('IT01234567890_FPR12.xml.p7m');
    const plain = await convert(bytes, 'signed.xml.p7m');
    const validated = await convert(bytes, 'signed.xml.p7m', undefined, { validate: true });
    const a = plain.outcomes[0];
    const b = validated.outcomes[0];
    assert.equal(a.status, 'ok');
    assert.equal(b.status, 'ok');
    if (a.status !== 'ok' || b.status !== 'ok') return;
    const before = a.invoices[0].source.validation!;
    const after = b.invoices[0].source.validation!;
    assert.notEqual(before.signature, 'not-run');
    assert.equal(after.signature, before.signature);
    assert.deepEqual(
      after.findings.filter((f) => f.layer === 'signature'),
      before.findings.filter((f) => f.layer === 'signature'),
    );
  });
});
