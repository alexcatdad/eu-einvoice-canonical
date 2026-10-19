/** Deterministic preprocessing for the pinned 2026-03-13 Croatian authority closure only. */
export function inlineHrSchematron(main: string, codelist: string): string {
  const include = '<include href="codelist/HR-CIUS-EXT-EN16931-UBL-codes.sch"/>';
  if (main.split(include).length !== 2) throw new Error('Unexpected HR include closure');
  const fragment = codelist.replace(/^\uFEFF/, '').replace(/^\s*<\?xml[^?]*\?>/, '');
  if (!/^\s*<pattern\b/.test(fragment)) throw new Error('Unexpected HR codelist root');
  const expanded = main.replace(include, fragment);
  if (/<(?:\w+:)?include\b|abstract\s*=\s*["']true["']|\bis-a\s*=/.test(expanded))
    throw new Error('Unexpected HR include or abstract pattern');
  const assertions = (s: string) => [...s.matchAll(/<(?:\w+:)?assert\b/g)].length;
  if (assertions(expanded) !== assertions(main) + assertions(fragment)) throw new Error('HR assertion count changed');
  return expanded;
}
