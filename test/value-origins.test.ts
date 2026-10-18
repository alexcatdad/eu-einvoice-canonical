import { expect, test } from 'bun:test';
import assert from 'node:assert/strict';
import { buildLineAnnotationInput, convert } from '../src/index.js';
import { fixture, parseOne, utf8 } from './helpers.js';

test('conversion identifies a text-only CII amount as defaulted without changing its value', async () => {
  const first = '<ram:IncludedSupplyChainTradeLineItem>';
  const note = `${first}<ram:AssociatedDocumentLineDocument><ram:LineID>NOTE</ram:LineID><ram:IncludedNote><ram:Content>Installation details</ram:Content></ram:IncludedNote></ram:AssociatedDocumentLineDocument></ram:IncludedSupplyChainTradeLineItem>`;
  const xml = new TextDecoder().decode(fixture('en16931-cii.xml')).replace(first, note + first);
  const result = await convert(utf8(xml), 'synthetic.xml');
  const outcome = result.outcomes[0];
  if (outcome.status !== 'ok') throw new Error(JSON.stringify(outcome));
  const invoice = outcome.invoices[0];
  assert.equal(invoice.lines[0].netAmount, '0');
  expect(invoice.source).toHaveProperty('valueOrigins./lines/0/netAmount', 'defaulted');
});

test('UBL and Svefaktura also identify assumed document types as defaults', async () => {
  for (const file of ['peppol-bis3-invoice.xml', 'svefaktura-1.0.xml']) {
    const xml = new TextDecoder(file.startsWith('svefaktura') ? 'iso-8859-1' : 'utf-8')
      .decode(fixture(file))
      .replace(/encoding="[^"]+"/, 'encoding="UTF-8"')
      .replace(/<(?:cbc:)?InvoiceTypeCode>380<\/(?:cbc:)?InvoiceTypeCode>/, '');
    const invoice = await parseOne(utf8(xml), 'synthetic.xml');
    expect(invoice.source.valueOrigins?.['/typeCode']).toBe('defaulted');
  }
});

test('KSeF RR line amounts distinguish an absent amount from an explicit zero', async () => {
  const src = new TextDecoder().decode(fixture('ksef-fa-rr.xml'));
  const absent = await parseOne(utf8(src.replace(/<P_8>[^<]+<\/P_8>/, '')), 'synthetic.xml');
  expect(absent.source.valueOrigins?.['/lines/0/netAmount']).toBe('defaulted');
  const stated = await parseOne(utf8(src.replace(/<P_8>[^<]+<\/P_8>/, '<P_8>0.00</P_8>')), 'synthetic.xml');
  expect(stated.source.valueOrigins?.['/lines/0/netAmount']).toBe('source');
});

test('Finvoice sub-lines distinguish an absent amount from an explicit zero', async () => {
  const xml = new TextDecoder('iso-8859-1')
    .decode(fixture('finvoice-invoice.xml'))
    .replace(/encoding="[^"]+"/, 'encoding="UTF-8"')
    .replace(
      '</InvoiceRow>',
      '<SubInvoiceRow><SubArticleName>Details</SubArticleName></SubInvoiceRow><SubInvoiceRow><SubArticleName>Included item</SubArticleName><SubRowVatExcludedAmount>0,00</SubRowVatExcludedAmount></SubInvoiceRow></InvoiceRow>',
    );
  const invoice = await parseOne(utf8(xml), 'synthetic.xml');
  expect(invoice.source.valueOrigins?.['/lines/0/subLines/0/netAmount']).toBe('defaulted');
  expect(invoice.source.valueOrigins?.['/lines/0/subLines/1/netAmount']).toBe('source');
});

test('derived Finvoice amounts follow canonical line indexes after informational rows are omitted', async () => {
  const xml = new TextDecoder('iso-8859-1')
    .decode(fixture('finvoice-invoice.xml'))
    .replace(/encoding="[^"]+"/, 'encoding="UTF-8"')
    .replace(
      '<InvoiceRow>',
      '<InvoiceRow><SubInvoiceRow><SubArticleName>Information only</SubArticleName></SubInvoiceRow></InvoiceRow><InvoiceRow>',
    )
    .replace(/<RowVatExcludedAmount\b[^>]*>800,00<\/RowVatExcludedAmount>/, '');
  const invoice = await parseOne(utf8(xml), 'synthetic.xml');
  assert.equal(invoice.lines[0].netAmount, '800.00');
  expect(invoice.source.valueOrigins?.['/lines/0/netAmount']).toBe('derived');
  expect(invoice.source.valueOrigins?.['/lines/1/netAmount']).not.toBe('derived');
});

test('an assumed CII document type is defaulted rather than source-supplied or calculated', async () => {
  const xml = new TextDecoder().decode(fixture('en16931-cii.xml')).replace('<ram:TypeCode>380</ram:TypeCode>', '');
  const invoice = await parseOne(utf8(xml), 'synthetic.xml');
  expect(invoice.typeCode).toBe('380');
  expect(invoice.source.valueOrigins?.['/typeCode']).toBe('defaulted');
});

test('the LLM input accepts a traced text-only line and preserves its defaulted origin', async () => {
  const first = '<ram:IncludedSupplyChainTradeLineItem>';
  const note = `${first}<ram:AssociatedDocumentLineDocument><ram:LineID>NOTE</ram:LineID><ram:IncludedNote><ram:Content>Installation details</ram:Content></ram:IncludedNote></ram:AssociatedDocumentLineDocument></ram:IncludedSupplyChainTradeLineItem>`;
  const xml = new TextDecoder().decode(fixture('en16931-cii.xml')).replace(first, note + first);
  const invoice = await parseOne(utf8(xml), 'synthetic.xml');
  const snapshot = JSON.stringify(invoice);
  const input = buildLineAnnotationInput(invoice);
  expect(input.source).toHaveProperty('valueOrigins./lines/0/netAmount', 'defaulted');
  expect(input.lines[0].id).toBe('NOTE');
  expect(input.source.warnings).toContainEqual({
    code: 'TEXT_LINE',
    message: 'Line NOTE carries only a note and no amounts; its amount is recorded as 0',
    field: '/lines/0/netAmount',
  });
  expect(JSON.stringify(input)).not.toContain('<ram:');
  expect(JSON.stringify(invoice)).toBe(snapshot);
});

test('origin metadata names existing canonical scalar values, not descriptive derivation paths', async () => {
  const invoice = await parseOne('svefaktura-1.0.xml');
  expect(invoice.source.derived.some((entry) => entry.field === '/payments/meansCode')).toBe(true);
  expect(invoice.source.valueOrigins).not.toHaveProperty('/payments/meansCode');
});

test('calculated totals expose their derived origin with the existing derivation explanation', async () => {
  const invoice = await parseOne('fatturapa-b2b.xml');
  expect(invoice.source.derived.some((entry) => entry.field === '/totals/taxExclusive')).toBe(true);
  expect(invoice.source.valueOrigins?.['/totals/taxExclusive']).toBe('derived');
});

test('explicit zero remains source-supplied across UBL, CII, Svefaktura and ZUGFeRD 1', async () => {
  for (const file of ['peppol-bis3-invoice.xml', 'en16931-cii.xml', 'svefaktura-1.0.xml', 'zugferd1-comfort.xml']) {
    const xml = new TextDecoder()
      .decode(fixture(file))
      .replace(/(<(?:cbc:LineExtensionAmount|ram:LineTotalAmount)\b[^>]*>)[^<]+/g, '$10.00');
    const invoice = await parseOne(utf8(xml), 'synthetic.xml');
    assert.equal(invoice.lines[0].netAmount, '0.00');
    expect(invoice.source.valueOrigins?.['/lines/0/netAmount']).toBe('source');
  }
});

test('conversion identifies a ZUGFeRD 1 text-only amount as defaulted', async () => {
  const first = '<ram:IncludedSupplyChainTradeLineItem>';
  const note = `${first}<ram:AssociatedDocumentLineDocument><ram:LineID>NOTE</ram:LineID><ram:IncludedNote><ram:Content>Installation details</ram:Content></ram:IncludedNote></ram:AssociatedDocumentLineDocument><ram:SpecifiedSupplyChainTradeSettlement /></ram:IncludedSupplyChainTradeLineItem>`;
  const xml = new TextDecoder().decode(fixture('zugferd1-comfort.xml')).replace(first, note + first);
  const invoice = await parseOne(utf8(xml), 'synthetic.xml');
  expect(invoice.source.valueOrigins?.['/lines/0/netAmount']).toBe('defaulted');
});
