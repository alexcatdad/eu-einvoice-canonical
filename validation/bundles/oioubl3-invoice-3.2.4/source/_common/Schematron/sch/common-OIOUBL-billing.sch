<pattern xmlns="http://purl.oclc.org/dsdl/schematron" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">

        <title> Danish spcific Common rules</title>

        <!-- Parameters -->


        <let name="profile" value="
                        if (/*/cbc:ProfileID and
                        (matches(normalize-space(/*/cbc:ProfileID), 'urn:fdc:oioubl.dk:bis:billing_with_response:3') or
                        matches(normalize-space(/*/cbc:ProfileID), 'urn:fdc:oioubl.dk:bis:billing_private_without_response:3')))
                        
                        then
                                tokenize(normalize-space(/*/cbc:ProfileID), ':')[7]
                        
                        else
                                'Unknown'" />


        <rule context="ubl-creditnote:CreditNote">

                <assert id="OIOUBL-BIL-016" test="number(normalize-space(cac:LegalMonetaryTotal/cbc:PayableAmount)) &gt; 0" flag="fatal">PayableAmount must be greater than 0 - Value found: '<value-of
                                select="cac:LegalMonetaryTotal/cbc:PayableAmount" />'</assert>
        </rule>


        <rule context="ubl-invoice:Invoice/cac:PaymentMeans | ubl-creditnote:CreditNote/cac:PaymentMeans">

                <assert id="OIOUBL-BIL-005" test="normalize-space(cbc:PaymentMeansCode) = $UNCL4461" flag="fatal"
                        >For Danish suppliers the following Payment means codes are
                        allowed: 1, 10, 31, 42, 48, 49, 50, 58, 59, 93 and 97</assert>


        </rule>


        <rule context="ubl-invoice:Invoice/cbc:CustomizationID">
                <assert id="OIOUBL-BIL-020" test=". = 'urn:fdc:oioubl.dk:trns:billing:invoice:3.0'" flag="fatal">For Invoice the CustomizationID must be
                        'urn:fdc:oioubl.dk:trns:billing:invoice:3.0' - Value found: '<value-of select="." />'</assert>
        </rule>


        <rule context="ubl-creditnote:CreditNote/cbc:CustomizationID">
                <assert id="OIOUBL-BIL-022" test=". = 'urn:fdc:oioubl.dk:trns:billing:creditnote:3.0'" flag="fatal">For CreditNote the CustomizationID must be
                        'urn:fdc:oioubl.dk:trns:billing:creditnote:3.0' - Value found: '<value-of select="." />'</assert>

        </rule>


        <rule context="cbc:UBLVersionID">
                <assert id="OIOUBL-BIL-019" test=". = 2.1" flag="fatal">The value of UBLVersionID must be equal to 2.1 - Value
                        found: '<value-of select="." />'</assert>
        </rule>

        <rule context="cbc:ProfileID">
                <assert id="OIOUBL-BIL-023" test="
                                . = 'urn:fdc:oioubl.dk:bis:billing_with_response:3'
                                or . = 'urn:fdc:oioubl.dk:bis:billing_private_without_response:3'
                                or . = 'urn:fdc:oioubl.dk:bis:reminder_with_response:3'
                                or . = 'urn:fdc:oioubl.dk:bis:reminder_private_without_response:3'
                                or . = 'urn:fdc:oioubl.dk:bis:billing_proforma_with_response:3'
                                or . = 'urn:fdc:oioubl.dk:bis:selfbilling_with_response:3'" flag="fatal">The ProfileID must be qual either
                        'urn:fdc:oioubl.dk:bis:billing_with_response:3' or
                        'urn:fdc:oioubl.dk:bis:billing_private_without_response:3' or
                        'urn:fdc:oioubl.dk:bis:reminder_with_response:3' or
                        'urn:fdc:oioubl.dk:bis:reminder_private_without_response:3' or
                        'urn:fdc:oioubl.dk:bis:billing_proforma_with_response:3' or
                        'urn:fdc:oioubl.dk:bis:selfbilling_with_response:3' - Value found: '<value-of select="." />' </assert>
        </rule>


        <rule context="cbc:InvoiceTypeCode">
                <assert id="OIOUBL-BIL-017" test="
                                $profile != '01' or (some $code in $UNCL1001-inv
                                        satisfies normalize-space(text()) = $code)" flag="fatal">Invoice type code MUST be set according to the
                        profile.</assert>


                <assert id="OIOUBL-BIL-132" test="
                                (. = '325' and ../cbc:ProfileID = 'urn:fdc:oioubl.dk:bis:billing_proforma_with_response:3')
                                or (. != '325' and ../cbc:ProfileID != 'urn:fdc:oioubl.dk:bis:billing_proforma_with_response:3')" flag="fatal">
                        InvoiceTypeCode can only be 325 if ProfileID is
                        'urn:fdc:oioubl.dk:bis:billing_proforma_with_response:3', and vice versa.
                        
                        Values found:
                        - InvoiceTypeCode: <value-of select="." />
                        - Profile: <value-of select="../cbc:ProfileID" />
                </assert>


                <assert id="OIOUBL-BIL-133" test="not(. = '325' and ../cbc:DueDate)" flag="fatal">
                        When InvoiceTypeCode is 325, the element cbc:DueDate must not exist.
                        
                        Values found:
                        - InvoiceTypeCode: <value-of select="." />
                        - DueDate: <value-of select="../cbc:DueDate" />
                </assert>


                <assert id="OIOUBL-BIL-134"
                        test="(
                        (. = '71' and 
                        (../cbc:ProfileID = 'urn:fdc:oioubl.dk:bis:reminder_with_response:3' or 
                        ../cbc:ProfileID = 'urn:fdc:oioubl.dk:bis:reminder_private_without_response:3'))
                        or
                        ((../cbc:ProfileID != 'urn:fdc:oioubl.dk:bis:reminder_with_response:3' and 
                        ../cbc:ProfileID != 'urn:fdc:oioubl.dk:bis:reminder_private_without_response:3') 
                        and . != '71')
                        )"
                        flag="fatal">
                        InvoiceTypeCode can only be 71 if ProfileID is
                        'urn:fdc:oioubl.dk:bis:reminder_with_response:3', and vice versa.
                        
                        Values found:
                        - InvoiceTypeCode: <value-of select="." />
                        - Profile: <value-of select="../cbc:ProfileID" />
                </assert>
                
                <assert 
                        id="OIOUBL-BIL-136" 
                        test="(. = '389' and ../cbc:ProfileID = 'urn:fdc:oioubl.dk:bis:selfbilling_with_response:3') 
                        or (. != '389' and ../cbc:ProfileID != 'urn:fdc:oioubl.dk:bis:selfbilling_with_response:3')"
                        flag="fatal">
                        InvoiceTypeCode can only be 389 if ProfileID is
                        'urn:fdc:oioubl.dk:bis:selfbilling_with_response:3', and vice versa.
                        
                        Values found:
                        - InvoiceTypeCode: <value-of select="."/>
                        - Profile: <value-of select="../cbc:ProfileID"/>
                </assert>
                
                <assert 
                        id="OIOUBL-BIL-138" 
                        test=". != '393' or ../cac:PayeeParty"
                        flag="fatal">
                        InvoiceTypeCode equals '393' requires the presence of cac:PayeeParty.
                        
                        Values found:
                        - InvoiceTypeCode: <value-of select="."/>
                        - PayeeParty present: <value-of select="exists(../cac:PayeeParty)"/>
                </assert>
        
        </rule>


        <rule context="cbc:CreditNoteTypeCode">
                <assert id="OIOUBL-BIL-018" test="
                                $profile != '01' or (some $code in $UNCL1001-cn
                                        satisfies normalize-space(text()) = $code)" flag="fatal">Credit note type code MUST be set according to the
                        profile.</assert>
                              
                <assert 
                        id="OIOUBL-BIL-137" 
                        test="(. = '261' and ../cbc:ProfileID = 'urn:fdc:oioubl.dk:bis:selfbilling_with_response:3') 
                        or (. != '261' and ../cbc:ProfileID != 'urn:fdc:oioubl.dk:bis:selfbilling_with_response:3')"
                        flag="fatal">
                        CreditNoteTypeCode can only be 261 if ProfileID is
                        'urn:fdc:oioubl.dk:bis:selfbilling_with_response:3', and vice versa.
                        
                        Values found:
                        - CreditNoteTypeCode: <value-of select="."/>
                        - Profile: <value-of select="../cbc:ProfileID"/>
                </assert>
                
                <assert 
                        id="OIOUBL-BIL-139" 
                        test=". != '396' or ../cac:PayeeParty"
                        flag="fatal">
                        CreditNoteTypeCode equals '396' requires the presence of cac:PayeeParty.
                        
                        Values found:
                        - CreditNoteTypeCode: <value-of select="."/>
                        - PayeeParty present: <value-of select="exists(../cac:PayeeParty)"/>
                </assert>
                
        </rule>


        <rule context="
                        cac:LegalMonetaryTotal/cbc:LineExtensionAmount |
                        cac:LegalMonetaryTotal/cbc:TaxInclusiveAmount |
                        cac:LegalMonetaryTotal/cbc:PayableAmount">

                <assert id="OIOUBL-BIL-098" test="not(starts-with(text(), '-'))" flag="fatal">The value of '<value-of select="name()" />'must not be negative - Value found: '<value-of select="."
                         />' </assert>
        </rule>


        <rule context="cac:AccountingCustomerParty/cac:Party/cac:PartyLegalEntity">

                <assert id="OIOUBL-BIL-100" test="not(cbc:CompanyID[@schemeID = '0237'])" flag="fatal">The element 'CompanyID' must not use schemeID='0237' under
                        'AccountingCustomerParty'</assert>
        </rule>


        <rule context="cbc:CreditedQuantity[@unitCode] | cbc:InvoicedQuantity[@unitCode] | cac:Price/cbc:BaseQuantity[@unitCode] | cac:Item/cbc:PackQuantity[@unitCode]">
                <assert id="OIOUBL-BIL-106" test="
                                some $code in $UNECERec20-11e
                                        satisfies @unitCode = $code" flag="fatal">
                        The value in '@unitCode' is not valid. It must be one from the codellist UNECERec20 - Value found: '<value-of select="@unitCode" />' 
                </assert>
        </rule>

        <rule context="ubl-invoice:Invoice">
                <assert id="OIOUBL-BIL-135" test="not(cbc:InvoiceTypeCode = '71') or cac:BillingReference" flag="fatal">
                        cac:BillingReference must be present.
                </assert>
        </rule>


        <rule context="cac:InvoiceLine | cac:CreditNoteLine">

                <assert id="OIOUBL-BIL-101" test="count(cac:Delivery/cbc:ActualDeliveryDate) = 0 or count(../cac:Delivery/cbc:ActualDeliveryDate) = 0" flag="fatal"
                        >Only use Delivery/ActualDeliveryDate if not specified on header level (Invoice/Delivery or CreditNote/Delivery)</assert>

                <assert id="OIOUBL-BIL-102" test="count(cac:Delivery/cac:DeliveryLocation) = 0 or count(../cac:Delivery/cac:DeliveryLocation) = 0" flag="fatal"
                        >Only use Delivery/DeliveryLocation if not specified on header level (Invoice/Delivery or CreditNote/Delivery)</assert>

                <assert id="OIOUBL-BIL-103" test="count(cac:Delivery/cac:DeliveryParty) = 0 or count(../cac:Delivery/cac:DeliveryParty) = 0" flag="fatal"
                        >Only use Delivery/DeliveryParty if not specified on header level (Invoice/Delivery or CreditNote/Delivery)</assert>

                <assert id="OIOUBL-BIL-107" test="not(position() &lt; 5000 and cbc:ID = preceding-sibling::cac:InvoiceLine[position() &lt; 5000]/cbc:ID)" flag="fatal">
                        The ID of each InvoiceLine must be unique, but the validation is only applied to the first 5000 lines.
                </assert>

                <assert id="OIOUBL-BIL-108" test="not(position() &lt; 5000 and cbc:ID = preceding-sibling::cac:CreditNoteLine[position() &lt; 5000]/cbc:ID)" flag="fatal">
                        The ID of each CreditNoteLine must be unique, but the validation is only applied to the first 5000 lines.
                </assert>

                <assert id="OIOUBL-BIL-105" test="not(matches((cbc:InvoicedQuantity, cbc:CreditedQuantity)[normalize-space()], '^0+(\.0+)?$'))" flag="fatal">
                        InvoicedQuantity/CreditNoteQuantity must not be 0
                        Value found: <value-of select="cbc:InvoicedQuantity | cbc:CreditedQuantity" />
                </assert>



                <assert id="OIOUBL-BIL-130" test="not(cac:OrderLineReference) or /*/cac:OrderReference" flag="fatal"
                        >Invoice/OrderReference is mandatory when OrderLineReference class is present
                </assert>


                <assert id="OIOUBL-BIL-131" test="cac:TaxTotal" flag="fatal">One or more TaxTotal classes must be present on line level
                </assert>

                <assert id="OIOUBL-BIL-144"
                        test="number(cbc:LineExtensionAmount) * sum(cac:TaxTotal/cac:TaxSubtotal/cbc:TaxableAmount) &gt;= 0"
                        flag="fatal">
                        The LineExtensionAmount and the sum of TaxableAmount for this line must not have opposite signs.
                        Value found for LineExtensionAmount: <value-of select="cbc:LineExtensionAmount"/>
                        Value found for sum of TaxableAmount: <value-of select="sum(cac:TaxTotal/cac:TaxSubtotal/cbc:TaxableAmount)"/>
                </assert>


        </rule>


        <rule context="cac:TaxExchangeRate">
                <assert id="OIOUBL-BIL-111" test="cbc:CalculationRate &gt; 0 and matches(cbc:CalculationRate, '^\d+(\.\d{1,6})?$')" flag="fatal"
                        >CalculationRate must be greater than zero and have maximum 6 decimal places</assert>
                

                <assert id="OIOUBL-BIL-112" test="cbc:MathematicOperatorCode = 'multiply' or cbc:MathematicOperatorCode = 'divide'" flag="fatal"
                        >MathematicOperatorCode must be either 'multiply' or 'divide'</assert>
        </rule>


        <rule context="cac:TaxTotal/cac:TaxSubtotal">

                <assert id="OIOUBL-BIL-115" test="exists(cac:TaxCategory[cac:TaxScheme/normalize-space(upper-case(cbc:ID)) = 'VAT']/cbc:ID)" flag="fatal">
                        Each VAT breakdown shall be defined through a VAT category code
                </assert>
        </rule>

        <rule context="cac:BillingReference">

                <assert id="OIOUBL-BIL-141" test="not(../cbc:ProfileID = 'urn:fdc:oioubl.dk:bis:reminder_with_response:3' or ../cbc:ProfileID = 'urn:fdc:oioubl.dk:bis:reminder_private_without_response:3') or (number(normalize-space(cac:InvoiceDocumentReference/cbc:VersionID)) = 0 or number(normalize-space(cac:InvoiceDocumentReference/cbc:VersionID)) &gt; 0)" flag="fatal">
                        When document profile is 'urn:fdc:oioubl.dk:bis:reminder_with_response:3' or 'urn:fdc:oioubl.dk:bis:reminder_private_without_response:3', BillingReference/InvoiceDocumentReference/VersionID must be hold a numeric value greater or equal to 0, value found: <value-of select="cac:InvoiceDocumentReference/cbc:VersionID" />
                </assert>
        </rule>

        <let name="uniqueVersionIdCount" value="count(distinct-values(//cac:BillingReference/cac:InvoiceDocumentReference/cbc:VersionID))"/>
        <let name="totalVersionIdCount" value="count(//cac:BillingReference/cac:InvoiceDocumentReference/cbc:VersionID)"/>

        <rule context="cac:BillingReference/cac:InvoiceDocumentReference/cbc:VersionID">
                <assert id="OIOUBL-BIL-142" test="not(/*/cbc:ProfileID = 'urn:fdc:oioubl.dk:bis:reminder_with_response:3' or /*/cbc:ProfileID = 'urn:fdc:oioubl.dk:bis:reminder_private_without_response:3') or $uniqueVersionIdCount = 1" flag="fatal">
                        All BillingReference/InvoiceDocumentReference/VersionID elements must have the same value.
                </assert>

                <assert id="OIOUBL-BIL-143" test="(/*/cbc:ProfileID = 'urn:fdc:oioubl.dk:bis:reminder_with_response:3' or /*/cbc:ProfileID = 'urn:fdc:oioubl.dk:bis:reminder_private_without_response:3') or $totalVersionIdCount = 0" flag="fatal">
                        BillingReference/InvoiceDocumentReference/VersionID element can only be used with the following profiles:  'urn:fdc:oioubl.dk:bis:reminder_with_response:3' 'or urn:fdc:oioubl.dk:bis:reminder_private_without_response:3'
                </assert>
        </rule>

        <rule context="cac:TaxTotal/cac:TaxSubtotal/cac:TaxCategory/cbc:ID">

                <assert id="OIOUBL-BIL-145" test="not(/*/cbc:ProfileID = 'urn:fdc:oioubl.dk:bis:billing_private_without_response:3' or /*/cbc:ProfileID = 'urn:fdc:oioubl.dk:bis:reminder_private_without_response:3') or . = 'O'" flag="fatal">
                        TaxTotal/TaxSubtotal/TaxCategory/ID must have value O when profile is 'urn:fdc:oioubl.dk:bis:billing_private_without_response:3' or 'urn:fdc:oioubl.dk:bis:reminder_private_without_response:3'. Value found: <value-of select="." />
                </assert>
        </rule>


        <!-- *************************************
         Code lists
        *************************************  -->

        <let
            name="UNCL1001-inv"
            value="tokenize('71 82 102 218 219 325 326 331 380 382 383 384 386 388 390 393 395 553 575 623 780 817 870 875 876 877', '\s')"/>

        <let
            name="UNCL1001-cn"
            value="tokenize('81 83 308 381 396 532', '\s')"/>

        <let
            name="UNCL4461"
            value="tokenize('1 10 31 42 48 49 50 58 59 93 97', '\s')"/>

</pattern>
