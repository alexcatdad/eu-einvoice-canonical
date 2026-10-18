import { expect, test } from 'bun:test';
import { validateSource } from '../src/index.js';

for (const syntax of ['invoice', 'creditnote']) {
  test(`OIOUBL3 ${syntax} applies its matching native suite and rejects missing profile`, async () => {
    const xml = await Bun.file(new URL(`./validation-fixtures/legacy/oioubl3-${syntax}.xml`, import.meta.url)).text();
    const result = await validateSource({ xml });
    expect(result.bundles.profile).toBe(`oioubl3-${syntax}-3.2.4`);
    expect(result.profile).toBe('passed');
    expect(result.semantic).toBe('passed');
    const negative = xml.replace(/<cbc:ProfileID>[^<]*<\/cbc:ProfileID>/, '');
    const invalid = await validateSource({ xml: negative });
    expect(invalid.profile).toBe('failed');
    expect(invalid.findings.some((f) => f.layer === 'profile' && f.severity === 'fatal')).toBe(true);
  });
}
