/** Minimal inputs for every bug the fuzzer found. Each must give an ordinary outcome, never a throw or an internal error. */
import { describe, expect, test } from 'bun:test';
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
});
