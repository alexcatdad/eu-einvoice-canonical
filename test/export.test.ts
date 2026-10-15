import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { encodeCp437 } from '../src/export/cp437.js';
import {
  type AccountMapping,
  BAS_EXAMPLE_MAPPING,
  buildJournalEntry,
  type JournalEntry,
  JournalError,
  journalToCsv,
  journalToJson,
  parseAccountMapping,
  toSie4,
} from '../src/index.js';
import { add, cmp, isZero, sub, sum } from '../src/values.js';
import { parseOne } from './helpers.js';

const expectedPath = (name: string) => fileURLToPath(new URL(`./export/expected/${name}`, import.meta.url));
const PROGRAM = { name: 'einvoice-test', version: '1.0' };

/** Debits equal credits, every line is one-sided, and the totals add up. */
function assertBalanced(e: JournalEntry) {
  assert.equal(cmp(e.totalDebit, e.totalCredit), 0, `${e.invoiceId} debits ${e.totalDebit} credits ${e.totalCredit}`);
  assert.equal(cmp(sum(e.lines.map((l) => l.debit)), sum(e.lines.map((l) => l.credit))), 0);
  for (const l of e.lines) assert.ok(l.debit === '0.00' || l.credit === '0.00', `${l.account} is on both sides`);
}
const amountOn = (e: JournalEntry, account: string, role?: string) =>
  sum(e.lines.filter((l) => l.account === account && (!role || l.role === role)).map((l) => sub(l.debit, l.credit)));

async function entry(file: string, mapping: AccountMapping = BAS_EXAMPLE_MAPPING, options = {}) {
  const inv = await parseOne(file);
  return { inv, e: buildJournalEntry(inv, mapping, options) };
}

describe('journal entry: Peppol invoice with allowance, charge, prepaid and rounding', async () => {
  const { e } = await entry('peppol-bis3-invoice.xml');

  test('balances; accounts payable equals payable', () => {
    assertBalanced(e);
    assert.equal(amountOn(e, '2440'), '-3091.00');
  });
  test('expenses net of the allowance and charge, input VAT per breakdown, rounding and prepaid on their own accounts', () => {
    assert.equal(amountOn(e, '4010'), '2910.00');
    assert.equal(amountOn(e, '2641'), '680.70');
    assert.equal(amountOn(e, '3740'), '0.30');
    assert.equal(amountOn(e, '1680'), '-500.00');
  });
  test('header', () => {
    assert.equal(e.date, '2026-10-15');
    assert.equal(e.currency, 'SEK');
    assert.equal(e.dueDate, '2026-11-14');
    assert.equal(e.supplier.vatId, 'SE556000000101');
    assert.deepEqual(e.notes, []);
    assert.equal(e.lines.find((l) => l.account === '2440')?.accountName, 'Leverantörsskulder');
  });
});

describe('journal entry: credit notes reverse', async () => {
  test('Peppol credit note: expenses and VAT are credited, payable is debited', async () => {
    const { e } = await entry('peppol-bis3-creditnote.xml');
    assertBalanced(e);
    assert.equal(amountOn(e, '4010'), '-200.00');
    assert.equal(amountOn(e, '2641'), '-50.00');
    assert.equal(amountOn(e, '2440'), '250.00');
    assert.equal(e.kind, 'creditNote');
  });
  test('a credit note that keeps negative source amounts is not reversed twice', async () => {
    const { e } = await entry('finvoice-credit.xml');
    assertBalanced(e);
    assert.equal(amountOn(e, '4010'), '-20.00');
    assert.equal(amountOn(e, '2440'), '22.00');
    assert.ok(e.notes.some((n) => /negative source amounts/.test(n)));
  });
  test('a negative 380 invoice credits the expense', async () => {
    const { e } = await entry('peppol-negative-invoice.xml');
    assertBalanced(e);
    assert.ok(amountOn(e, '4010').startsWith('-'));
    assert.ok(!amountOn(e, '2440').startsWith('-'));
  });
});

describe('journal entry: reverse charge', async () => {
  const { e } = await entry('peppol-bis3-reverse-charge.xml');

  test('books input and output VAT at the mapped rate; payable is the net amount', () => {
    assertBalanced(e);
    assert.equal(amountOn(e, '2645'), '2500.00');
    assert.equal(amountOn(e, '2614'), '-2500.00');
    assert.equal(amountOn(e, '2440'), '-10000.00');
    assert.equal(amountOn(e, '6540'), '10000.00');
    assert.ok(e.notes.some((n) => /rate from the account mapping/.test(n)));
  });
  test('item classification picks the expense account', () => {
    assert.equal(e.lines[0].account, '6540');
  });
  test('without reverseCharge in the mapping it refuses and says what is missing', async () => {
    const { reverseCharge: _, ...rest } = BAS_EXAMPLE_MAPPING;
    await assert.rejects(entry('peppol-bis3-reverse-charge.xml', rest as AccountMapping), /reverse charge.*reverseCharge/);
  });
  test('without a rate it refuses rather than inventing one', async () => {
    await assert.rejects(
      entry('peppol-bis3-reverse-charge.xml', { ...BAS_EXAMPLE_MAPPING, reverseCharge: { inputVat: '2645', outputVat: '2614' } }),
      /states no VAT rate; set reverseCharge.rate/,
    );
  });
  test('a rate stated on the invoice wins over the mapping', async () => {
    const inv = await parseOne('peppol-bis3-reverse-charge.xml');
    inv.vatBreakdown[0].rate = '6' as never;
    const x = buildJournalEntry(inv, BAS_EXAMPLE_MAPPING);
    assert.equal(amountOn(x, '2645'), '600.00');
    assert.deepEqual(x.notes, []);
  });
  test('other categories can be listed as reverse charge', async () => {
    const inv = await parseOne('peppol-bis3-reverse-charge.xml');
    inv.vatBreakdown[0].categoryCode = 'K' as never;
    assert.equal(amountOn(buildJournalEntry(inv, BAS_EXAMPLE_MAPPING), '2645'), '0');
    const x = buildJournalEntry(inv, {
      ...BAS_EXAMPLE_MAPPING,
      reverseCharge: { ...BAS_EXAMPLE_MAPPING.reverseCharge!, categories: ['AE', 'K'] },
    });
    assert.equal(amountOn(x, '2645'), '2500.00');
  });
});

describe('journal entry: FatturaPA', async () => {
  test('ritenuta: the withholding is credited, payable is what remains', async () => {
    const { e } = await entry('fatturapa-ritenuta-cassa-bollo.xml');
    assertBalanced(e);
    assert.equal(amountOn(e, '2890'), '-208.00');
    assert.equal(amountOn(e, '2440'), '-1062.80');
    assert.equal(amountOn(e, '2641'), '228.80');
    assert.equal(amountOn(e, '4010'), '1042.00');
    assert.equal(e.currency, 'EUR');
  });
  test('withholding accounts per scheme, with a default', async () => {
    const m = { ...BAS_EXAMPLE_MAPPING, withholding: { 'IT:RT01': '2701', default: '2702' } };
    assert.equal(amountOn((await entry('fatturapa-ritenuta-cassa-bollo.xml', m)).e, '2701'), '-208.00');
    const only = { ...BAS_EXAMPLE_MAPPING, withholding: { 'ES:IRPF': '2701' } };
    await assert.rejects(entry('fatturapa-ritenuta-cassa-bollo.xml', only), /withholding tax \(scheme IT:RT01/);
    const none = { ...BAS_EXAMPLE_MAPPING, withholding: undefined };
    await assert.rejects(entry('fatturapa-ritenuta-cassa-bollo.xml', none), JournalError);
  });
  test('only the total stated: booked to the default withholding account', async () => {
    const inv = await parseOne('fatturapa-ritenuta-cassa-bollo.xml');
    inv.withholdings = [];
    const x = buildJournalEntry(inv, { ...BAS_EXAMPLE_MAPPING, withholding: { default: '2703' } });
    assert.equal(amountOn(x, '2703'), '-208.00');
  });
  test('split payment: the VAT is credited to its own account, payable excludes it', async () => {
    const { e } = await entry('fatturapa-split-payment.xml');
    assertBalanced(e);
    assert.equal(amountOn(e, '2641'), '220.00');
    assert.equal(amountOn(e, '2650'), '-220.00');
    assert.equal(amountOn(e, '2440'), '-1000.00');
    const { splitPaymentVat: _, ...rest } = BAS_EXAMPLE_MAPPING;
    await assert.rejects(entry('fatturapa-split-payment.xml', rest as AccountMapping), /splitPaymentVat/);
  });
});

describe('journal entry: KSeF corrections', async () => {
  test('an increase (delta lines) is an invoice; the settlement difference needs its own account', async () => {
    const { e } = await entry('ksef-fa3-kor-delta-increase.xml');
    assertBalanced(e);
    assert.equal(amountOn(e, '4010'), '100.00');
    assert.equal(amountOn(e, '2641'), '23.00');
    assert.equal(amountOn(e, '2440'), '-125.00');
    assert.equal(amountOn(e, '6990'), '2.00');
    assert.ok(e.notes.some((n) => /PL-SETTLEMENT/.test(n)));
    const { settlement: _, ...rest } = BAS_EXAMPLE_MAPPING;
    await assert.rejects(
      entry('ksef-fa3-kor-delta-increase.xml', rest as AccountMapping),
      /does not balance.*difference 2\.00.*settlement/s,
    );
  });
  test('a decrease (before/after lines) is a credit note booked per VAT category from the differences', async () => {
    const { e } = await entry('ksef-fa3-kor-before-after.xml');
    assertBalanced(e);
    assert.equal(e.currency, 'PLN');
    assert.equal(amountOn(e, '4010'), '-300.00');
    assert.equal(amountOn(e, '2641'), '-54.00');
    assert.equal(amountOn(e, '2440'), '354.00');
    assert.ok(e.notes.some((n) => /per VAT category/.test(n)));
  });
});

describe('journal entry: other sources', () => {
  test('Svefaktura with charge and rounding', async () => {
    const { e } = await entry('svefaktura-1.0.xml');
    assertBalanced(e);
    assert.equal(amountOn(e, '2440'), '-4525.00');
    assert.equal(amountOn(e, '3740'), '0.44');
  });
  test('Svefaktura credit note without VAT', async () => {
    const { e } = await entry('svefaktura-1.0-credit.xml');
    assertBalanced(e);
    assert.equal(e.lines.length, 2);
  });
  test('Factur-X MINIMUM: no lines and no breakdown, VAT from the total', async () => {
    const { e } = await entry('facturx-minimum.xml');
    assertBalanced(e);
    assert.equal(amountOn(e, '4010'), '100.00');
    assert.equal(amountOn(e, '2641'), '20.00');
    assert.equal(amountOn(e, '2440'), '-120.00');
  });
  test('Facturae recargo de equivalencia sits on top of the total and needs an account', async () => {
    const m = { ...BAS_EXAMPLE_MAPPING, otherTaxes: { 'ES:RE': '6991' }, rounding: '3740' };
    await assert.rejects(entry('facturae-322-recargo.xml', { ...m, rounding: undefined }), /does not balance|rounding/);
    const { e } = await entry('facturae-322-recargo.xml', m, { roundingTolerance: '0.01' });
    assertBalanced(e);
    assert.equal(amountOn(e, '6991'), '44.22');
    assert.ok(e.notes.some((n) => /rounding tolerance/.test(n)));
    await assert.rejects(entry('facturae-322-recargo.xml', { ...m, otherTaxes: undefined }, { roundingTolerance: '0.01' }), /other taxes/);
  });
  test('line amounts that do not add up to the totals are refused with the difference', async () => {
    await assert.rejects(entry('facturae-322-recargo.xml', { ...BAS_EXAMPLE_MAPPING, otherTaxes: '6991' }), (err: unknown) => {
      assert.ok(err instanceof JournalError);
      assert.equal(err.code, 'unbalanced');
      assert.match(err.message, /debits .* credits .* difference 0\.00322/);
      return true;
    });
  });
});

describe('account mapping rules', () => {
  const base: AccountMapping = {
    payable: '2440',
    inputVat: '2641',
    expense: [],
    defaultExpense: '4010',
    rounding: '3740',
    prepaid: '1680',
  };

  test('rules match on line id, VAT category and rate, seller and classification; first match wins', async () => {
    const m: AccountMapping = {
      ...base,
      expense: [
        { account: '5000', match: { lineId: '1' } },
        { account: '5100', match: { seller: 'se 556000-000101', vatCategory: 'S', rate: '12.00' } },
        { account: '5200', match: { classification: [{ code: '4411', listId: 'sti' }] } },
        { account: '5300', match: { vatCategory: ['S'], rate: ['25.0'] } },
      ],
    };
    const { e } = await entry('peppol-bis3-invoice.xml', m, { granularity: 'line' });
    assertBalanced(e);
    const byLine = (id: string) => e.lines.find((l) => l.lineIds?.includes(id))?.account;
    assert.equal(byLine('1'), '5000');
    assert.equal(byLine('3'), '5100');
    assert.equal(byLine('2'), '5300');
    assert.equal(byLine('4'), '5300');
    const x = await entry('peppol-bis3-invoice.xml', {
      ...base,
      expense: [{ account: '5200', match: { classification: { code: '4411' } } }],
    });
    assert.equal(amountOn(x.e, '5200'), '250.00');
    const miss = await entry('peppol-bis3-invoice.xml', {
      ...base,
      expense: [{ account: '5200', match: { classification: { code: '4411', listId: 'CPV' } } }],
    });
    assert.equal(amountOn(miss.e, '5200'), '0');
  });

  test('input VAT per rate, with a default', async () => {
    const m: AccountMapping = { ...base, inputVat: { default: '2640', byRate: { '25.00': '2641', '12': '2642' } } };
    const { e } = await entry('peppol-bis3-invoice.xml', m);
    assertBalanced(e);
    assert.equal(amountOn(e, '2641'), '637.50');
    assert.equal(amountOn(e, '2642'), '43.20');
    const d = await entry('peppol-bis3-invoice.xml', { ...base, inputVat: { default: '2640' } });
    assert.equal(amountOn(d.e, '2640'), '680.70');
  });

  test('document allowances and charges can have their own accounts', async () => {
    const { e } = await entry('peppol-bis3-invoice.xml', { ...BAS_EXAMPLE_MAPPING, allowances: '4090', charges: '4091' });
    assertBalanced(e);
    assert.equal(amountOn(e, '4090'), '-100.00');
    assert.equal(amountOn(e, '4091'), '50.00');
    assert.equal(amountOn(e, '4010'), '2960.00');
  });

  test('the accounting reference can be the account, when asked for', async () => {
    const off = await entry('peppol-bis3-invoice.xml');
    assert.equal(amountOn(off.e, '6110'), '0');
    const { e } = await entry('peppol-bis3-invoice.xml', { ...BAS_EXAMPLE_MAPPING, useAccountingRef: true });
    assertBalanced(e);
    assert.equal(amountOn(e, '6110'), '2910.00');
  });

  test('a missing account for something the invoice needs is named', async () => {
    const { rounding: _, ...rest } = BAS_EXAMPLE_MAPPING;
    await assert.rejects(entry('peppol-bis3-invoice.xml', rest as AccountMapping), /rounding \(BT-114\)/);
    const { prepaid: __, ...rest2 } = BAS_EXAMPLE_MAPPING;
    await assert.rejects(entry('peppol-bis3-invoice.xml', rest2 as AccountMapping), /prepaid/);
    await assert.rejects(entry('peppol-bis3-invoice.xml', { ...base, defaultExpense: '' }), /expenses/);
  });

  test('the builder refuses an inconsistent invoice and says by how much', async () => {
    const inv = await parseOne('peppol-bis3-invoice.xml');
    inv.totals.payable = '3092.00' as never;
    assert.throws(
      () => buildJournalEntry(inv, BAS_EXAMPLE_MAPPING),
      (err: unknown) =>
        err instanceof JournalError && err.code === 'unbalanced' && /debits 3691\.00, credits 3692\.00, difference 1\.00/.test(err.message),
    );
  });

  test('a small residual goes to the rounding account only within the tolerance', async () => {
    const inv = await parseOne('peppol-bis3-invoice.xml');
    inv.totals.payable = '3091.01' as never;
    assert.throws(() => buildJournalEntry(inv, BAS_EXAMPLE_MAPPING));
    const e = buildJournalEntry(inv, BAS_EXAMPLE_MAPPING, { roundingTolerance: '0.01' });
    assertBalanced(e);
    assert.equal(amountOn(e, '3740'), '0.31');
  });
});

describe('parseAccountMapping', () => {
  const ok = { payable: '2440', inputVat: '2641', defaultExpense: '4010' };
  test('accepts the example and a minimal mapping', () => {
    assert.deepEqual(parseAccountMapping(JSON.parse(JSON.stringify(BAS_EXAMPLE_MAPPING))), BAS_EXAMPLE_MAPPING);
    assert.deepEqual(parseAccountMapping(ok), { expense: [], ...ok });
    parseAccountMapping({ ...ok, inputVat: { default: '2641', byRate: { '25': '2641' } }, withholding: { default: '27' } });
  });
  test('rejects what cannot be a mapping', () => {
    const bad: [unknown, RegExp][] = [
      [null, /JSON object/],
      [[], /JSON object/],
      [{ ...ok, payable: undefined }, /"payable" is required/],
      [{ ...ok, payable: 2440 }, /"payable" must be an account number as a string/],
      [{ ...ok, defaultExpense: '' }, /defaultExpense/],
      [{ ...ok, inputVat: undefined }, /"inputVat" is required/],
      [{ ...ok, inputVat: { byRate: {} } }, /inputVat.default/],
      [{ ...ok, inputVat: { default: '1', byRate: { '25': 1 } } }, /byRate/],
      [{ ...ok, withholding: [] }, /withholding/],
      [{ ...ok, otherTaxes: { a: 1 } }, /otherTaxes/],
      [{ ...ok, expense: 'x' }, /"expense" must be an array/],
      [{ ...ok, expense: [{}] }, /"account"/],
      [{ ...ok, reverseCharge: { inputVat: '1' } }, /reverseCharge/],
    ];
    for (const [value, re] of bad) assert.throws(() => parseAccountMapping(value), re);
  });
});

describe('SIE 4 export', () => {
  const cases: [string, string][] = [
    ['peppol-bis3-invoice.xml', 'SEK'],
    ['svefaktura-1.0.xml', 'SEK'],
    ['peppol-bis3-creditnote.xml', 'SEK'],
    ['peppol-bis3-reverse-charge.xml', 'SEK'],
    ['fatturapa-ritenuta-cassa-bollo.xml', 'EUR'],
    ['fatturapa-split-payment.xml', 'EUR'],
    ['ksef-fa3-kor-delta-increase.xml', 'EUR'],
    ['ksef-fa3-kor-before-after.xml', 'PLN'],
  ];
  for (const [file, currency] of cases)
    test(`${file} byte-matches the checked-in file`, async () => {
      const { e } = await entry(file);
      assertBalanced(e);
      const sie = toSie4([e], { generated: '2026-10-16', currency, program: PROGRAM });
      const expected = new Uint8Array(readFileSync(expectedPath(`${file.replace(/\.xml$/, '')}.se`)));
      assert.deepEqual(sie.bytes, expected);
      // Polish names lose their accents in CP437; the file says so instead of failing.
      assert.equal(sie.warnings.length > 0, file.startsWith('ksef'));
    });

  test('structure: header, one #VER per entry with numbering, #TRANS amounts sum to zero', async () => {
    const a = (await entry('peppol-bis3-invoice.xml')).e;
    const b = (await entry('peppol-bis3-creditnote.xml')).e;
    const { text } = toSie4([a, b], { generated: '2026-01-02', series: 'X', firstNumber: 7, program: PROGRAM });
    const lines = text.split('\r\n');
    assert.equal(lines.at(-1), '');
    assert.ok(
      lines
        .slice(0, 8)
        .join('|')
        .startsWith(
          '#FLAGGA 0|#PROGRAM "einvoice-test" 1.0|#FORMAT PC8|#GEN 20260102|#SIETYP 4|#FNAMN "Uppsala kommun"|#ORGNR 212000-0001|#VALUTA SEK',
        ),
    );
    const vers = lines.filter((l) => l.startsWith('#VER'));
    assert.equal(vers.length, 2);
    assert.ok(vers[0].startsWith('#VER "X" "7" 20261015 '));
    assert.ok(vers[1].startsWith('#VER "X" "8" 20261020 '));
    let total = '0';
    let open = 0;
    for (const l of lines) {
      if (l === '{') open++;
      if (l === '}') {
        open--;
        assert.ok(isZero(total));
        total = '0';
      }
      const m = /^#TRANS \d+ \{\} (-?[\d.]+) /.exec(l);
      if (m) total = add(total, m[1]);
    }
    assert.equal(open, 0);
  });

  test('the company can be given; a missing organisation number is left out, never made up', async () => {
    const e = (await entry('svefaktura-1.0.xml')).e;
    const text = toSie4([e], {
      generated: '2026-01-02',
      company: { name: 'Mitt "Bolag" \\ AB', orgNumber: '556000-0000' },
      program: PROGRAM,
    }).text;
    assert.ok(text.includes('#FNAMN "Mitt \\"Bolag\\" \\\\ AB"\r\n#ORGNR 556000-0000'));
    assert.ok(!toSie4([e], { generated: '2026-01-02' }).text.includes('#ORGNR'));
  });

  test('an entry in another currency is refused', async () => {
    const e = (await entry('fatturapa-split-payment.xml')).e;
    assert.throws(() => toSie4([e]), /ledger currency is SEK.*no exchange rate is invented/s);
  });

  test('other refusals', async () => {
    const e = (await entry('svefaktura-1.0.xml')).e;
    assert.throws(() => toSie4([]), /No journal entries/);
    assert.throws(() => toSie4([e], { generated: '16/10/2026' }), /Not a date/);
    assert.throws(() => toSie4([{ ...e, lines: e.lines.slice(1) }]), /sum to zero/);
  });

  test('default generated date is today', async () => {
    const e = (await entry('svefaktura-1.0.xml')).e;
    const today = new Date().toISOString().slice(0, 10).replaceAll('-', '');
    assert.ok(toSie4([e]).text.includes(`#GEN ${today}`));
  });

  test('characters outside CP437 are reported', async () => {
    const e = (await entry('svefaktura-1.0.xml')).e;
    const sie = toSie4([{ ...e, text: 'Łódź – zażółć' }], { generated: '2026-01-02' });
    assert.ok(sie.warnings.length > 0);
    assert.ok(sie.warnings.some((w) => w.includes('Ł')));
  });
});

describe('CP437', () => {
  test('Swedish letters and common symbols', () => {
    const { bytes, replaced } = encodeCp437('åäöÅÄÖéü€');
    assert.deepEqual([...bytes.slice(0, 8)], [0x86, 0x84, 0x94, 0x8f, 0x8e, 0x99, 0x82, 0x81]);
    assert.deepEqual(replaced, ['€']);
    assert.equal(bytes.at(-1), 0x3f);
  });
  test('ASCII, line ends and control characters', () => {
    assert.deepEqual([...encodeCp437('A\r\n\tB\u007f').bytes], [0x41, 0x0d, 0x0a, 0x20, 0x42, 0x20]);
  });
  test('unknown accented letters lose the accent', () => {
    const r = encodeCp437('Ł ś č');
    assert.equal(new TextDecoder().decode(r.bytes), '? s c');
    assert.deepEqual(r.replaced, ['Ł', 'ś', 'č']);
  });
  test('box drawing and no-break space are in the table', () => {
    assert.deepEqual([...encodeCp437('─ ').bytes], [0xc4, 0xff]);
  });
});

describe('journal JSON and CSV', async () => {
  const entries = [(await entry('peppol-bis3-invoice.xml')).e, (await entry('fatturapa-split-payment.xml')).e];

  test('JSON round-trips the entries', () => {
    assert.deepEqual(JSON.parse(journalToJson(entries)), JSON.parse(JSON.stringify(entries)));
    assert.ok(journalToJson(entries, true).includes('\n  '));
  });
  test('CSV: header, one row per line, entry numbers, CR LF', () => {
    const rows = journalToCsv(entries).split('\r\n');
    assert.equal(rows[0], 'entry,date,invoice,kind,currency,supplier,account,account_name,debit,credit,role,text,vat_category,vat_rate');
    assert.equal(rows.length, 1 + entries[0].lines.length + entries[1].lines.length + 1);
    assert.equal(rows.at(-1), '');
    assert.ok(rows[1].startsWith('1,2026-10-15,INV-2026-1042,invoice,SEK,Snickeri Exempel AB,4010,'));
    assert.ok(rows[1 + entries[0].lines.length].startsWith('2,2026-10-22,2026/0160,invoice,EUR,'));
  });
  test('CSV quoting and formula guard', () => {
    const e: JournalEntry = {
      ...entries[0],
      invoiceId: '=1+1',
      supplier: { name: 'A, "B"' },
      lines: [{ ...entries[0].lines[0], text: '-cmd\nline' }],
    };
    const row = journalToCsv([e]).split('\r\n').slice(1).join('\r\n');
    assert.ok(row.includes(`'=1+1`));
    assert.ok(row.includes('"A, ""B"""'));
    assert.ok(row.includes(`"'-cmd\nline"`));
  });
});
