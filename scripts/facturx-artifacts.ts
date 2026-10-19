/** Reproducible offline adaptation of the pinned official Factur-X XSLT and its code database. */
export function inlineFacturxCodeDb(stylesheet: string, codeDb: string, filename: string): string {
  const call = `document('${filename}')`;
  if (!stylesheet.includes(call)) throw new Error('Expected pinned Factur-X code database call was not found');
  const root = /<xsl:stylesheet\b[^>]*>/;
  if (!root.test(stylesheet) || stylesheet.includes('__bundled_facturx_codes')) throw new Error('Unexpected Factur-X stylesheet');
  const contents = codeDb.replace(/^\s*<\?xml[^?]*\?>/, '');
  const result = stylesheet
    .replaceAll(call, '$__bundled_facturx_codes')
    .replace(root, (opening) => `${opening}\n<xsl:variable name="__bundled_facturx_codes">${contents}</xsl:variable>`);
  if (/\b(?:select|test|match)="[^"]*\b(?:document|doc|unparsed-text|collection)\s*\(/.test(result))
    throw new Error('Unbundled Factur-X external resource reference');
  return result;
}
