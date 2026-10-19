import { expect, test } from 'bun:test';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gzipSync } from 'fflate';
import { oioubl2SvrlWrapper } from '../scripts/oioubl2-report.js';
import { validateSource } from '../src/index.js';

for (const [name, report] of Object.entries({
  'unexpected root': '<UnexpectedReport/>',
  'nested unrecognized report': '<Schematron><Information><Error>hidden failure</Error></Information></Schematron>',
  '2.02 warning':
    '<Schematron><Information>Checking OIOUBL-2.02 Invoice, FC 2010-09-15, Version 1.2</Information><Error context="Invoice"><Pattern>synthetic-warning</Pattern><Description>[W-INV003]Synthetic warning</Description><Xpath>/Invoice/TaxRepresentativeParty</Xpath></Error></Schematron>',
  '2.02 mixed severities':
    '<Schematron><Information>Checking OIOUBL-2.02 Invoice</Information><Error><Pattern>synthetic-warning</Pattern><Description>[W-INV003]Synthetic warning</Description><Xpath>/Invoice/TaxRepresentativeParty</Xpath></Error><Error><Pattern>synthetic-fatal</Pattern><Description>[F-LIB001]Synthetic fatal</Description><Xpath>/Invoice/UBLVersionID</Xpath></Error></Schematron>',
  '2.02 unknown severity':
    '<Schematron><Information>Checking OIOUBL-2.02 Invoice</Information><Error><Pattern>synthetic-unknown</Pattern><Description>[I-INV003]Unqualified severity</Description><Xpath>/Invoice</Xpath></Error></Schematron>',
  '2.02 missing severity':
    '<Schematron><Information>Checking OIOUBL-2.02 Invoice</Information><Error><Pattern>synthetic-unknown</Pattern><Description>Missing severity</Description><Xpath>/Invoice</Xpath></Error></Schematron>',
})) {
  test(`OIOUBL2 report handling: ${name}`, async () => {
    const directory = mkdtempSync(join(tmpdir(), 'oioubl2-report-'));
    try {
      // Synthetic vendor output is compiled through the same importing wrapper as the packaged rule set.
      writeFileSync(
        join(directory, 'oioubl2-original.xslt'),
        `<xsl:stylesheet xmlns:xsl="http://www.w3.org/1999/XSL/Transform" version="2.0"><xsl:template match="/">${report}</xsl:template></xsl:stylesheet>`,
      );
      writeFileSync(
        join(directory, 'wrapper.xslt'),
        oioubl2SvrlWrapper('oioubl2-original.xslt', name.startsWith('2.02') ? 'prefixed' : 'fatal'),
      );
      const compiled = Bun.spawnSync(
        [
          'node',
          '--stack_size=32768',
          join(import.meta.dir, '../node_modules/xslt3/xslt3.js'),
          `-xsl:${join(directory, 'wrapper.xslt')}`,
          `-export:${join(directory, 'fixture.sef.json')}`,
          '-nogo',
        ],
        { stdout: 'pipe', stderr: 'pipe' },
      );
      expect(compiled.exitCode).toBe(0);
      const bytes = gzipSync(readFileSync(join(directory, 'fixture.sef.json')), { mtime: 0 });
      const sha256 = new Bun.CryptoHasher('sha256').update(bytes).digest('hex');
      const xml = await Bun.file(new URL('./validation-fixtures/legacy/oioubl2-invoice.xml', import.meta.url)).text();
      const summary = await validateSource(
        { xml },
        {
          bundles: {
            read: async (id, path) => {
              const file = Bun.file(new URL(`../validation/bundles/${id}/${path}`, import.meta.url));
              if (id !== 'oioubl2-invoice-1.15.2') return new Uint8Array(await file.arrayBuffer());
              if (path === 'manifest.json') {
                const manifest = await file.json();
                const stylesheet = manifest.files.find((file: { path: string }) => file.path === manifest.entry);
                stylesheet.sha256 = sha256;
                stylesheet.bytes = bytes.length;
                return new TextEncoder().encode(JSON.stringify(manifest));
              }
              if (path.endsWith('.sef.json.gz')) return bytes;
              return new Uint8Array(await file.arrayBuffer());
            },
          },
        },
      );
      if (name === '2.02 warning') {
        expect(summary.profile).toBe('passed');
        expect(summary.result).toBe('valid');
        expect(summary.findings).toContainEqual({
          layer: 'profile',
          severity: 'warning',
          ruleId: 'W-INV003',
          message: 'Synthetic warning',
          path: '/Invoice/TaxRepresentativeParty',
        });
      } else if (name === '2.02 mixed severities') {
        expect(summary.profile).toBe('failed');
        expect(summary.result).toBe('invalid');
        expect(
          summary.findings.filter((finding) => finding.layer === 'profile').map((finding) => [finding.ruleId, finding.severity]),
        ).toEqual([
          ['W-INV003', 'warning'],
          ['F-LIB001', 'fatal'],
        ]);
      } else {
        expect(summary.profile).toBe('unavailable');
        expect(summary.result).not.toBe('valid');
      }
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
}
