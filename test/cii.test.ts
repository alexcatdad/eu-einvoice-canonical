import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { fixture, parseOne, utf8 } from './helpers.js';

/** The XRechnung CII fixture with the less common CII structures added, to exercise the rest of the CII mapping. */
function richCii(): Uint8Array {
  let xml = new TextDecoder().decode(fixture('xrechnung-cii.xml'));
  const add = (anchor: string, insert: string, before = false) => {
    if (!xml.includes(anchor)) throw new Error(`anchor not found: ${anchor}`);
    xml = xml.replace(anchor, before ? insert + anchor : anchor + insert);
  };
  // No TypeCode: defaults to 380 and is recorded as derived.
  xml = xml.replace('<ram:TypeCode>380</ram:TypeCode>', '');
  add(
    '</ram:ContractReferencedDocument>',
    `<ram:AdditionalReferencedDocument><ram:IssuerAssignedID>OBJ-9</ram:IssuerAssignedID><ram:TypeCode>130</ram:TypeCode><ram:ReferenceTypeCode>AAB</ram:ReferenceTypeCode></ram:AdditionalReferencedDocument>
     <ram:AdditionalReferencedDocument><ram:IssuerAssignedID>ATT-1</ram:IssuerAssignedID><ram:TypeCode>916</ram:TypeCode><ram:Name>Timesheet</ram:Name><ram:AttachmentBinaryObject mimeCode="text/plain" filename="ts.txt">SGVs
       bG8=</ram:AttachmentBinaryObject></ram:AdditionalReferencedDocument>
     <ram:AdditionalReferencedDocument><ram:IssuerAssignedID>ATT-2</ram:IssuerAssignedID><ram:TypeCode>916</ram:TypeCode><ram:URIID>https://example.test/doc.pdf</ram:URIID></ram:AdditionalReferencedDocument>
     <ram:AdditionalReferencedDocument><ram:IssuerAssignedID>ATT-3</ram:IssuerAssignedID><ram:TypeCode>916</ram:TypeCode></ram:AdditionalReferencedDocument>
     <ram:SellerTaxRepresentativeTradeParty><ram:Name>Steuervertreter GmbH</ram:Name><ram:PostalTradeAddress><ram:CityName>Köln</ram:CityName><ram:CountryID>DE</ram:CountryID></ram:PostalTradeAddress><ram:SpecifiedTaxRegistration><ram:ID schemeID="VA">DE999999999</ram:ID></ram:SpecifiedTaxRegistration></ram:SellerTaxRepresentativeTradeParty>`,
  );
  add(
    '<ram:InvoiceCurrencyCode>EUR</ram:InvoiceCurrencyCode>',
    `<ram:CreditorReferenceID>DE98ZZZ09999999999</ram:CreditorReferenceID>
     <ram:PayeeTradeParty><ram:ID>PAYEE-1</ram:ID><ram:Name>Factoring AG</ram:Name><ram:SpecifiedLegalOrganization><ram:ID schemeID="0204">HRB 999</ram:ID></ram:SpecifiedLegalOrganization></ram:PayeeTradeParty>`,
    true,
  );
  add(
    '</ram:SpecifiedTradeSettlementPaymentMeans>',
    `<ram:SpecifiedTradeSettlementPaymentMeans><ram:TypeCode>48</ram:TypeCode><ram:ApplicableTradeSettlementFinancialCard><ram:ID>1234</ram:ID><ram:CardholderName>M Muster</ram:CardholderName></ram:ApplicableTradeSettlementFinancialCard></ram:SpecifiedTradeSettlementPaymentMeans>
     <ram:SpecifiedTradeSettlementPaymentMeans><ram:TypeCode>59</ram:TypeCode><ram:PayerPartyDebtorFinancialAccount><ram:IBANID>DE75512108001245126199</ram:IBANID></ram:PayerPartyDebtorFinancialAccount></ram:SpecifiedTradeSettlementPaymentMeans>
     <ram:SpecifiedTradeAllowanceCharge><ram:ChargeIndicator><udt:Indicator>false</udt:Indicator></ram:ChargeIndicator><ram:CalculationPercent>5</ram:CalculationPercent><ram:BasisAmount>100.00</ram:BasisAmount><ram:ActualAmount>5.00</ram:ActualAmount><ram:ReasonCode>95</ram:ReasonCode><ram:Reason>Rabatt</ram:Reason><ram:CategoryTradeTax><ram:TypeCode>VAT</ram:TypeCode><ram:CategoryCode>S</ram:CategoryCode><ram:RateApplicablePercent>7</ram:RateApplicablePercent></ram:CategoryTradeTax></ram:SpecifiedTradeAllowanceCharge>
     <ram:SpecifiedTradeAllowanceCharge><ram:ChargeIndicator><udt:Indicator>true</udt:Indicator></ram:ChargeIndicator><ram:ActualAmount>5.00</ram:ActualAmount><ram:Reason>Versand</ram:Reason><ram:CategoryTradeTax><ram:TypeCode>VAT</ram:TypeCode><ram:CategoryCode>S</ram:CategoryCode><ram:RateApplicablePercent>7</ram:RateApplicablePercent></ram:CategoryTradeTax></ram:SpecifiedTradeAllowanceCharge>`,
  );
  add(
    '<ram:Description>Zahlbar innerhalb von 28 Tagen ohne Abzug.</ram:Description>',
    '<ram:DirectDebitMandateID>MANDATE-7</ram:DirectDebitMandateID>',
  );
  add(
    '<ram:Description>Ergonomisch, schwarz</ram:Description>',
    '<ram:DesignatedProductClassification><ram:ClassCode listID="STI" listVersionID="2024">56101504</ram:ClassCode></ram:DesignatedProductClassification>',
  );
  add(
    '<ram:SpecifiedTradeSettlementLineMonetarySummation><ram:LineTotalAmount>600.00</ram:LineTotalAmount>',
    '<ram:AdditionalReferencedDocument><ram:IssuerAssignedID>METER-1</ram:IssuerAssignedID><ram:TypeCode>130</ram:TypeCode><ram:ReferenceTypeCode>AFL</ram:ReferenceTypeCode></ram:AdditionalReferencedDocument>',
    true,
  );
  return utf8(xml);
}

describe('CII: less common structures', async () => {
  const inv = await parseOne(richCii(), 'rich.xml');

  test('a missing TypeCode defaults to 380 and is recorded', () => {
    assert.equal(inv.typeCode, '380');
    assert.equal(inv.kind, 'invoice');
    assert.ok(inv.source.derived.some((d) => d.field === '/typeCode'));
  });

  test('invoiced object reference keeps its scheme', () => {
    assert.deepEqual(inv.invoicedObjectId, { value: 'OBJ-9', schemeId: 'AAB' });
  });

  test('attachments: embedded, external and reference-only', () => {
    assert.deepEqual(inv.attachments, [
      { kind: 'embedded', id: 'ATT-1', description: 'Timesheet', mimeCode: 'text/plain', filename: 'ts.txt', base64: 'SGVsbG8=' },
      { kind: 'external', id: 'ATT-2', uri: 'https://example.test/doc.pdf' },
      { kind: 'reference', id: 'ATT-3', typeCode: '916' },
    ]);
  });

  test('payee and tax representative', () => {
    assert.deepEqual(inv.payee, {
      name: 'Factoring AG',
      identifier: { value: 'PAYEE-1' },
      legalRegistrationId: { value: 'HRB 999', schemeId: '0204' },
    });
    assert.deepEqual(inv.taxRepresentative, {
      name: 'Steuervertreter GmbH',
      vatId: 'DE999999999',
      address: { city: 'Köln', countryCode: 'DE' },
    });
  });

  test('card and SEPA direct debit payments', () => {
    const card = inv.payments.find((p) => p.meansCode === '48');
    assert.deepEqual(card?.card, { primaryAccountNumber: '1234', holderName: 'M Muster' });
    const dd = inv.payments.find((p) => p.meansCode === '59');
    assert.deepEqual(dd?.directDebit, {
      mandateId: 'MANDATE-7',
      creditorId: 'DE98ZZZ09999999999',
      debitedAccountId: 'DE75512108001245126199',
    });
  });

  test('document-level allowance and charge keep their VAT', () => {
    assert.deepEqual(inv.allowances, [
      { amount: '5.00', baseAmount: '100.00', percentage: '5', reason: 'Rabatt', reasonCode: '95', vat: { categoryCode: 'S', rate: '7' } },
    ]);
    assert.deepEqual(inv.charges, [{ amount: '5.00', reason: 'Versand', vat: { categoryCode: 'S', rate: '7' } }]);
  });

  test('line object reference and item classification', () => {
    const l1 = inv.lines[0];
    assert.deepEqual(l1.objectId, { value: 'METER-1', schemeId: 'AFL' });
    assert.deepEqual(l1.item.classifications, [{ code: '56101504', listId: 'STI', listVersion: '2024' }]);
  });
});
