import { expect, test } from 'bun:test';
import { validateSource } from '../src/index.js';

for (const syntax of ['invoice', 'creditnote']) {
  test(`OIOUBL2.1 ${syntax} executes native errors and rejects an invalid tax scheme name`, async () => {
    const xml = await Bun.file(new URL(`./validation-fixtures/legacy/oioubl2-${syntax}.xml`, import.meta.url)).text();
    const result = await validateSource({ xml });
    expect(result.bundles.profile).toBe(`oioubl2-${syntax}-1.15.2`);
    expect(result.profile).toBe('passed');
    const negative = xml.replace('<cbc:Name>Moms</cbc:Name>', '<cbc:Name>NotVAT</cbc:Name>');
    const invalid = await validateSource({ xml: negative });
    expect(invalid.profile).toBe('failed');
    expect(invalid.findings.some((f) => f.layer === 'profile' && f.ruleId === 'F-LIB198' && f.severity === 'fatal')).toBe(true);
  });
}
