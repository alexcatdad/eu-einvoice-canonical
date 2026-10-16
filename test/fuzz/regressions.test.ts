/** Minimal inputs for every bug the fuzzer found. Each must give an ordinary outcome, never a throw or an internal error. */
import { describe, expect, test } from 'bun:test';
import { withinXmlDepth } from '../../src/envelope.js';
import { convert } from '../../src/index.js';
import { fixture, utf8 } from '../helpers.js';
import { checkCase } from './properties.js';

const text = (name: string) => new TextDecoder().decode(fixture(name));

describe('fuzz regressions', () => {
  test('a CFDI tax rate that is not a number is a parse error, not an internal error', async () => {
    const xml = text('cfdi-40-ingreso-iva-retenciones.xml').replace('TasaOCuota="0.160000"', 'TasaOCuota="x"');
    const r = await convert(utf8(xml), 'cfdi.xml');
    const o = r.outcomes[0];
    expect(o.status).toBe('error');
    if (o.status === 'error') expect(o.error).toMatch(/not a decimal/i);
    await checkCase({ label: 'cfdi rate', bytes: utf8(xml) });
  });

  test('mismatched closing tags after a readable header are a parse error, not an internal error', async () => {
    const xml = text('fatturapa-b2b.xml').replace(/<\/(?:\w+:)?FatturaElettronicaHeader>/, '</Oops>');
    const r = await convert(utf8(xml), 'x.xml');
    const o = r.outcomes[0];
    expect(o.status).toBe('error');
    if (o.status === 'error') expect(o.error).toMatch(/not well-formed/);
    await checkCase({ label: 'mismatched tags', bytes: utf8(xml) });
  });

  test('a malformed document inside SBDH or SOAP does not make convert() throw', async () => {
    for (const [open, close] of [
      [
        '<sh:StandardBusinessDocument xmlns:sh="http://www.unece.org/cefact/namespaces/StandardBusinessDocumentHeader">',
        '</sh:StandardBusinessDocument>',
      ],
      ['<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body>', '</s:Body></s:Envelope>'],
    ]) {
      const bytes = utf8(`${open}<a><b></a>${close}`);
      await checkCase({ label: 'wrapped garbage', bytes });
    }
  });

  test('a document nested 100 000 elements deep is refused quickly instead of taking over a minute', async () => {
    const n = 100_000;
    const xml = `<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2">${'<a>'.repeat(n)}${'</a>'.repeat(n)}</Invoice>`;
    const started = performance.now();
    const r = await convert(utf8(xml), 'deep.xml');
    expect(performance.now() - started).toBeLessThan(2000);
    expect(r.outcomes).toEqual([]);
    expect(r.skipped[0].reason).toMatch(/nested deeper than 256/);
  });

  test('the depth scan counts real start tags only', () => {
    expect(withinXmlDepth('<a><b/><c></c></a>', 2)).toBe(true);
    expect(withinXmlDepth('<a><b><c/></b></a>', 2)).toBe(true);
    expect(withinXmlDepth('<a><b><c></c></b></a>', 2)).toBe(false);
    // Tags in comments, CDATA and attribute values are text.
    expect(withinXmlDepth('<a x="<b><c><d>"><!-- <b><c><d> --><![CDATA[<b><c><d>]]><?pi <b><c> ?></a>', 1)).toBe(true);
    expect(withinXmlDepth('<a x=">"><b y=\'>\'><c/></b></a>', 2)).toBe(true);
    expect(withinXmlDepth('<a><b', 5)).toBe(true);
  });
});
