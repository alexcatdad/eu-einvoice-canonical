import type { AccountMapping } from './journal.js';

/**
 * EXAMPLE mapping onto the Swedish BAS chart, for the SIE export and the demo site.
 * It shows the shape of a mapping and is not advice on how to book anything: check every account against
 * your own chart and your accountant's rules, and override what does not fit.
 */
export const BAS_EXAMPLE_MAPPING: AccountMapping = {
  payable: '2440',
  inputVat: '2641',
  defaultExpense: '4010',
  expense: [
    { account: '6540', match: { classification: { listId: 'CPV', code: '72' } } },
    { account: '5410', match: { classification: { listId: 'CPV', code: '30' } } },
    { account: '6110', match: { classification: { listId: 'CPV', code: '22' } } },
  ],
  reverseCharge: { inputVat: '2645', outputVat: '2614', rate: '25' },
  withholding: '2890',
  splitPaymentVat: '2650',
  rounding: '3740',
  prepaid: '1680',
  otherTaxes: '6990',
  settlement: '6990',
  accountNames: {
    '1680': 'Andra kortfristiga fordringar',
    '2440': 'Leverantörsskulder',
    '2614': 'Utgående moms omvänd skattskyldighet, 25 %',
    '2641': 'Debiterad ingående moms',
    '2645': 'Beräknad ingående moms på förvärv från utlandet',
    '2650': 'Redovisningskonto för moms',
    '2890': 'Övriga kortfristiga skulder',
    '3740': 'Öres- och kronutjämning',
    '4010': 'Inköp material och varor',
    '5410': 'Förbrukningsinventarier',
    '6110': 'Kontorsmaterial',
    '6540': 'IT-tjänster',
    '6990': 'Övriga externa kostnader',
  },
};
