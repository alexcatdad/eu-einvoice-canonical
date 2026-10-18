<pattern xmlns="http://purl.oclc.org/dsdl/schematron"
        xmlns:xsl="http://www.w3.org/1999/XSL/Transform">

        <title>Danish OIOUBL 3 - Common</title>

        <rule context="//*[not(*) and not(normalize-space())]">
                <assert id="PEPPOL-EN16931-R008" test="false()" flag="fatal">Document MUST not
                        contain empty elements.</assert>
        </rule>

</pattern>
