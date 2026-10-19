/** Preserve the official OIOUBL2 validator and translate its documented Error report into SVRL. */
export function oioubl2SvrlWrapper(originalFile = 'oioubl2-original.xslt', severity: 'fatal' | 'prefixed' = 'fatal'): string {
  if (!/^[A-Za-z0-9._-]+$/.test(originalFile)) throw new Error('OIOUBL2 import must be a local basename');
  const severityGuard =
    severity === 'prefixed'
      ? `    <xsl:if test="$report/Schematron/Error[not(matches(normalize-space(Description), '^\\[[FW]-[A-Z]+[0-9]+\\]'))]">
      <xsl:message terminate="yes">Unexpected OIOUBL2 severity prefix</xsl:message>
    </xsl:if>
`
      : '';
  const flag = severity === 'prefixed' ? "{if (starts-with(normalize-space(Description), '[W-')) then 'warning' else 'fatal'}" : 'fatal';
  return `<?xml version="1.0" encoding="UTF-8"?>
<xsl:stylesheet version="2.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform" xmlns:svrl="http://purl.oclc.org/dsdl/svrl">
  <xsl:import href="${originalFile}"/>
  <xsl:output method="xml" omit-xml-declaration="yes"/>
  <xsl:template match="/" priority="1000">
    <xsl:variable name="report"><xsl:apply-imports/></xsl:variable>
    <xsl:if test="count($report/*) != 1 or not($report/Schematron) or count($report/Schematron/Information) != 1 or not(normalize-space($report/Schematron/Information)) or $report/Schematron/@* or $report/Schematron/Information/* or $report/Schematron/Information/@* or $report/Schematron/*[not(self::Information or self::Error)] or $report/Schematron/text()[normalize-space(.)] or $report/Schematron/Error/@*[name() != 'context'] or $report/Schematron/Error/text()[normalize-space(.)] or $report/Schematron/Error/*/* or $report/Schematron/Error[count(Pattern) != 1 or count(Description) != 1 or count(Xpath) != 1 or not(normalize-space(Description)) or not(normalize-space(Xpath)) or *[not(self::Pattern or self::Description or self::Xpath)]]">
      <xsl:message terminate="yes">Unexpected OIOUBL2 validation report shape</xsl:message>
    </xsl:if>
${severityGuard}    <svrl:schematron-output>
      <xsl:for-each select="$report/Schematron/Error">
        <svrl:failed-assert flag="${flag}" test="{Pattern}" location="{normalize-space(Xpath)}">
          <svrl:text><xsl:value-of select="normalize-space(Description)"/></svrl:text>
        </svrl:failed-assert>
      </xsl:for-each>
    </svrl:schematron-output>
  </xsl:template>
</xsl:stylesheet>`;
}
