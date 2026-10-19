/**
 * The browser converter. Everything runs locally through the same `convert()` the library exports: files are never
 * uploaded. The published EU trust snapshot is loaded only when the reader switches it on; this converter makes no model requests.
 */
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import {
  type CanonicalInvoice,
  type ConvertOutcome,
  type ConvertResult,
  convert,
  type TrustSnapshot,
  unwrap,
  type ValidationSuite,
} from '../../../src/index.ts';
import { Invoice } from '../../../src/react/index.ts';
import { unavailableSummary } from '../../../src/validation/plan';
import { toCii, toUbl, WriterError } from '../../../src/writers/index.ts';
import { shortName } from '../../coverage';
import { currentLang, initLanguage, initSwitcher, t } from '../../i18n';
import { Button } from '../components/ui/button';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from '../components/ui/dialog';
import { Dropzone } from '../components/ui/dropzone';
import { Toaster, toast } from '../components/ui/sonner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { ChecksPanel } from './Checks';
import { Html, useLang } from './i18n';
import { JsonText } from './Json';
import { LinesTable } from './Lines';
import { CHIP_SAMPLES, EXAMPLE, SAMPLES } from './samples';
import '../../../src/react/invoice.css';

const Annotations = lazy(() => import('./Annotations'));

const ACCEPT = '.xml,.pdf,.p7m,.zip,.xsig,.isdoc,.isdocx,.ubl,.cii,text/xml,application/xml,application/pdf,application/zip';
const BASE = import.meta.env.BASE_URL.replace(/\/?$/, '/');

interface Item {
  outcome: ConvertOutcome;
  invoice?: CanonicalInvoice;
  /** Position of the outcome in the file, for the "Document n" tab. */
  n: number;
}
interface Shown {
  result: ConvertResult;
  filename: string;
  items: Item[];
  isExample: boolean;
}
type View = 'invoice' | 'json' | 'checks' | 'lines';
const VIEW_KEY: Record<View, string> = { invoice: 'view.invoice', json: 'view.json', checks: 'view.checks', lines: 'view.lines' };

/** Long base64 attachments are shortened on screen only; Copy and Download keep them whole. */
function shortenForDisplay(key: string, value: unknown) {
  if (key === 'base64' && typeof value === 'string' && value.length > 240)
    return `${value.slice(0, 120)}${t('json.shortened', { length: value.length })}`;
  return value;
}

function save(data: BlobPart, type: string, name: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([data], { type }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

const fileBase = (id: string) => id.replace(/[^\w.-]+/g, '_');

function stampFor(item: Item): { cls: string; title: string; note: string } {
  const o = item.outcome;
  const det = o.detection;
  const title = det.kind === 'invoice' ? shortName(det.format) : t(det.kind === 'other-document' ? 'stamp.notInvoice' : 'stamp.unknown');
  if (o.status === 'ok') {
    const n = item.invoice!.source.warnings.length;
    return { cls: n ? 'warn' : '', title, note: n ? t('stamp.convertedWarnings', { count: n }) : t('stamp.converted') };
  }
  if (o.status === 'unsupported') return { cls: 'warn', title, note: t(det.kind === 'invoice' ? 'stamp.noParser' : 'stamp.notRecognised') };
  if (o.status === 'not-an-invoice')
    return { cls: 'warn', title, note: det.kind === 'other-document' ? (det.label.split(':')[0] ?? '') : '' };
  return { cls: 'bad', title, note: t('stamp.failed') };
}

export default function Converter() {
  useLang();
  const [shown, setShown] = useState<Shown>();
  const [status, setStatus] = useState<{ reading?: string; notice?: { title: string; detail: string } }>({});
  const [index, setIndex] = useState(0);
  const [view, setView] = useState<View>('invoice');
  const [fresh, setFresh] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [pasted, setPasted] = useState('');
  const [pasteNote, setPasteNote] = useState('');
  const [sample, setSample] = useState('');
  const [trust, setTrust] = useState<{ on: boolean; busy: boolean; snapshot?: TrustSnapshot; status?: () => string; error?: string }>({
    on: false,
    busy: false,
  });
  const [dialog, setDialog] = useState<{ title: string; detail: string }>();
  const [announcement, setAnnouncement] = useState('');
  /** The paste shortcut as this keyboard writes it; set after hydration, since the server cannot know it. */
  const [shortcut, setShortcut] = useState('Ctrl+V');

  const last = useRef<{ bytes: Uint8Array; filename: string; isExample: boolean }>(undefined);
  const resultRef = useRef<HTMLElement>(null);
  const slotRef = useRef<HTMLDivElement>(null);
  const pasteRef = useRef<HTMLTextAreaElement>(null);
  const validationSuiteRef = useRef<ValidationSuite | undefined>(undefined);
  const [validationSuite, setValidationSuite] = useState<ValidationSuite | ''>('');
  const validationJob = useRef<{ cancel: () => void } | undefined>(undefined);
  const runId = useRef(0);
  const [validationBusy, setValidationBusy] = useState(false);
  const [validationState, setValidationState] = useState<string>('');
  const trustRef = useRef<TrustSnapshot | undefined>(undefined);

  useEffect(
    () => () => {
      ++runId.current;
      validationJob.current?.cancel();
    },
    [],
  );

  /** Tells screen readers what just happened; the visible result is not a live region. */
  const announce = useCallback((text: string) => {
    setAnnouncement('');
    setTimeout(() => setAnnouncement(text), 50);
  }, []);

  const run = useCallback(
    async (bytes: Uint8Array, filename: string, isExample = false) => {
      const generation = ++runId.current;
      const suite = validationSuiteRef.current;
      validationJob.current?.cancel();
      validationJob.current = undefined;
      setValidationBusy(false);
      setValidationState('');
      last.current = { bytes, filename, isExample };
      if (!isExample) {
        setStatus({ reading: filename });
        announce(t('result.reading', { name: filename }));
      }
      try {
        const result = await convert(bytes, filename, undefined, { relations: true, euTrust: trustRef.current });
        if (generation !== runId.current) return;
        const items = result.outcomes.flatMap((o, n): Item[] =>
          o.status === 'ok' ? o.invoices.map((invoice) => ({ outcome: o, invoice, n })) : [{ outcome: o, n }],
        );
        setShown({ result, filename, items, isExample });
        setStatus({});
        setIndex(0);
        setView('invoice');
        setFresh(!isExample);
        if (!isExample)
          void (async () => {
            setValidationBusy(true);
            setValidationState(t('val.running'));
            const finishPending = (reason: string) => {
              if (generation !== runId.current) return;
              for (const outcome of result.outcomes) {
                if (outcome.status === 'not-an-invoice' || outcome.validation) continue;
                outcome.validation = unavailableSummary(outcome.detection, reason, suite);
                if (outcome.status === 'ok')
                  for (const invoice of outcome.invoices) {
                    const before = invoice.source.validation;
                    invoice.source.validation = structuredClone(outcome.validation);
                    if (before) {
                      invoice.source.validation.signature = before.signature;
                      invoice.source.validation.findings.push(...before.findings.filter((finding) => finding.layer === 'signature'));
                    }
                  }
              }
              setShown({ result, filename, items, isExample });
            };
            let currentJob: { cancel: () => void } | undefined;
            validationJob.current = {
              cancel: () => {
                currentJob?.cancel();
                finishPending('Local validation cancelled');
              },
            };
            try {
              const [{ startValidation }, extracted] = await Promise.all([import('../../validation/client'), unwrap(bytes, filename)]);
              for (let n = 0; n < result.outcomes.length; n++) {
                if (generation !== runId.current) return;
                const outcome = result.outcomes[n]!;
                if (outcome.status === 'not-an-invoice') continue;
                const job = startValidation(extracted.payloads[n]!.xml, outcome.detection, BASE, undefined, suite);
                currentJob = job;
                const summary = await job.promise;
                if (generation !== runId.current) return;
                outcome.validation = summary;
                if (outcome.status === 'ok')
                  for (const invoice of outcome.invoices) {
                    const before = invoice.source.validation;
                    invoice.source.validation = structuredClone(summary);
                    if (before) {
                      invoice.source.validation.signature = before.signature;
                      invoice.source.validation.findings.push(...before.findings.filter((f) => f.layer === 'signature'));
                    }
                  }
                setShown({ result, filename, items, isExample });
              }
              setValidationState('');
            } catch (error) {
              if (generation === runId.current) {
                const reason = error instanceof Error ? error.message : String(error);
                finishPending(reason);
                setValidationState(reason);
              }
            } finally {
              if (generation === runId.current) {
                validationJob.current = undefined;
                setValidationBusy(false);
              }
            }
          })();
        const first = items[0];
        if (first) {
          const st = stampFor(first);
          announce(t('sr.done', { name: filename, summary: `${st.title}${st.note ? `, ${st.note}` : ''}` }));
        }
        if (!isExample)
          resultRef.current?.scrollIntoView({
            behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
            block: 'start',
          });
      } catch (e) {
        setStatus({ notice: { title: t('notice.readFailedTitle'), detail: (e as Error).message } });
      }
    },
    [announce],
  );

  const runFile = useCallback(async (f: File) => run(new Uint8Array(await f.arrayBuffer()), f.name), [run]);

  const loadSample = useCallback(
    async (name: string, isExample: boolean) => {
      try {
        const res = await fetch(`${BASE}samples/${name}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const bytes = new Uint8Array(await res.arrayBuffer());
        if (isExample && last.current) return;
        await run(bytes, name, isExample);
      } catch (e) {
        if (!isExample)
          setStatus({
            notice: {
              title: t('notice.sampleFailedTitle'),
              detail: t('notice.sampleFailedDetail', { name, reason: (e as Error).message }),
            },
          });
      }
    },
    [run],
  );

  // Start-up: the language, the header's switcher, and the example on the result side.
  useEffect(() => {
    initLanguage();
    initSwitcher();
    void loadSample(EXAMPLE, true);
    if (/Mac|iPhone|iPad/.test(navigator.userAgent)) setShortcut('\u2318V');
  }, [loadSample]);

  // Paste is a first-class input: a paste anywhere on the page converts at once.
  useEffect(() => {
    const onPaste = async (e: ClipboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLInputElement ||
        target instanceof HTMLSelectElement ||
        target?.isContentEditable
      )
        return;
      const file = e.clipboardData?.files?.[0];
      if (file) {
        e.preventDefault();
        await runFile(file);
        return;
      }
      const text = e.clipboardData?.getData('text/plain')?.trim();
      if (text) {
        e.preventDefault();
        setPasted(text);
        await run(new TextEncoder().encode(text), 'pasted.xml');
      }
    };
    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
  }, [run, runFile]);

  // Drag and drop anywhere on the page; the slot shows where it lands (drops on the slot are the dropzone's).
  useEffect(() => {
    let depth = 0;
    const inSlot = (e: Event) => slotRef.current?.contains(e.target as Node) ?? false;
    const enter = (e: DragEvent) => {
      e.preventDefault();
      depth++;
      setDragging(true);
    };
    const leave = () => {
      if (--depth <= 0) {
        depth = 0;
        setDragging(false);
      }
    };
    const over = (e: DragEvent) => e.preventDefault();
    const drop = (e: DragEvent) => {
      e.preventDefault();
      depth = 0;
      setDragging(false);
      if (inSlot(e)) return;
      const f = e.dataTransfer?.files?.[0];
      if (f) void runFile(f);
    };
    window.addEventListener('dragenter', enter);
    window.addEventListener('dragleave', leave);
    window.addEventListener('dragover', over);
    window.addEventListener('drop', drop);
    return () => {
      window.removeEventListener('dragenter', enter);
      window.removeEventListener('dragleave', leave);
      window.removeEventListener('dragover', over);
      window.removeEventListener('drop', drop);
    };
  }, [runFile]);

  const convertPasted = () => {
    const text = pasted.trim();
    if (!text) {
      setPasteNote(t('paste.empty'));
      pasteRef.current?.focus();
      return;
    }
    void run(new TextEncoder().encode(text), 'pasted.xml');
  };

  // EU trusted lists: opt-in, loaded the first time the box is ticked.
  const toggleTrust = async (on: boolean) => {
    if (!on) {
      trustRef.current = undefined;
      setTrust({ on: false, busy: false });
    } else {
      setTrust({ on: true, busy: true });
      try {
        const { loadSiteTrust } = await import('../../trust');
        const site = await loadSiteTrust();
        trustRef.current = site.snapshot;
        const ok = site.snapshot.lists.filter((l) => l.status === 'loaded').length;
        setTrust({
          on: true,
          busy: false,
          snapshot: site.snapshot,
          status: () =>
            t('trust.status', {
              source: t('trust.published'),
              date: site.snapshot.fetchedAt.slice(0, 10),
              ok,
              total: site.snapshot.lists.length,
            }),
        });
      } catch (e) {
        trustRef.current = undefined;
        setTrust({ on: false, busy: false, error: (e as Error).message });
      }
    }
    if (last.current) await run(last.current.bytes, last.current.filename, last.current.isExample);
  };

  return (
    <div className="converter">
      <div className="desk" id="converter" tabIndex={-1}>
        <section className="sheet-in" aria-labelledby="original-title">
          <div className="sheet-head">
            <h2 id="original-title">{t('original.title')}</h2>
            <p className="sheet-sub">{t('original.sub')}</p>
          </div>
          <div ref={slotRef}>
            <Dropzone onFile={(f) => void runFile(f)} accept={ACCEPT} className={dragging ? 'dragging' : undefined}>
              <Html className="slot-text" k="tray.drop" />
              <span className="slot-hint">{t('tray.hint')}</span>
            </Dropzone>
          </div>
          <div className="paste">
            <div className="paste-bar">
              <label htmlFor="pasted" className="paste-title">
                {t('paste.title')}
              </label>
              <span className="paste-size" aria-live="polite">
                {pasteNote || (pasted ? t('paste.size', { size: (new Blob([pasted]).size / 1024).toFixed(1) }) : '')}
              </span>
            </div>
            <textarea
              id="pasted"
              ref={pasteRef}
              spellCheck={false}
              autoComplete="off"
              autoCapitalize="off"
              aria-describedby="paste-hint"
              placeholder={'<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2">…'}
              value={pasted}
              onChange={(e) => {
                setPasted(e.target.value);
                setPasteNote('');
              }}
              onPaste={(e) => {
                // Pasting into the box converts straight away; typing and editing do not.
                // The whole box after the paste lands, not just the pasted fragment (it may replace a selection).
                if (!e.clipboardData.getData('text/plain').trim()) return;
                setTimeout(() => {
                  const text = pasteRef.current?.value.trim();
                  if (text) void run(new TextEncoder().encode(text), 'pasted.xml');
                }, 0);
              }}
            />
            <div className="paste-foot">
              <p className="paste-hint" id="paste-hint">
                {t('paste.hint', { shortcut })}
              </p>
              <div className="paste-actions">
                <Button
                  variant="ghost"
                  onClick={() => {
                    setPasted('');
                    setPasteNote('');
                    pasteRef.current?.focus();
                  }}
                >
                  {t('paste.clear')}
                </Button>
                <Button onClick={convertPasted}>{t('tray.pasteButton')}</Button>
              </div>
            </div>
          </div>
          <fieldset className="samples">
            <legend>{t('tray.sample')}</legend>
            <div className="chips">
              {CHIP_SAMPLES.map((f) => {
                const s = SAMPLES.find((x) => x.file === f);
                return s ? (
                  <Button variant="chip" key={f} onClick={() => void loadSample(f, false)}>
                    {t(s.label)}
                  </Button>
                ) : null;
              })}
            </div>
            <label className="field">
              <span>{t('tray.sampleMore')}</span>
              <select
                value={sample}
                onChange={(e) => {
                  setSample(e.target.value);
                  if (e.target.value) void loadSample(e.target.value, false);
                }}
              >
                <option value="">{t('tray.samplePlaceholder')}</option>
                {SAMPLES.map((s) => (
                  <option value={s.file} key={s.file}>
                    {t(s.label)}
                  </option>
                ))}
              </select>
            </label>
          </fieldset>
          <label className="field validation-suite">
            <span id="validation-suite-label">{t('val.suite')}</span>
            <select
              aria-labelledby="validation-suite-label"
              value={validationSuite}
              onChange={(event) => {
                const suite =
                  event.target.value === 'facturx-1.09.2' ||
                  event.target.value === 'cii-d16b' ||
                  event.target.value === 'e-arve-1.2.EN' ||
                  event.target.value === 'e-arve-1.2' ||
                  event.target.value === 'france-rfe-1.4.0.04' ||
                  event.target.value === 'france-rfe-1.4.0.04-facturx'
                    ? event.target.value
                    : undefined;
                validationSuiteRef.current = suite;
                setValidationSuite(suite ?? '');
                if (last.current) void run(last.current.bytes, last.current.filename, false);
              }}
            >
              <option value="">{t('val.suite.default')}</option>
              <option value="facturx-1.09.2">{t('val.suite.facturx')}</option>
              <option value="cii-d16b">{t('val.suite.ciiD16b')}</option>
              <option value="e-arve-1.2.EN">{t('val.suite.earve')}</option>
              <option value="e-arve-1.2">e-arve 1.2</option>
              <option value="france-rfe-1.4.0.04">France RFE 1.4.0.04 · UBL / CII</option>
              <option value="france-rfe-1.4.0.04-facturx">France RFE 1.4.0.04 · Factur-X 1.09.2</option>
            </select>
          </label>
          <div className="eu-trust">
            <label>
              <input type="checkbox" checked={trust.on} disabled={trust.busy} onChange={(e) => void toggleTrust(e.target.checked)} />{' '}
              <span>{t('trust.label')}</span>
            </label>
            <span className="trust-status" aria-live="polite">
              {trust.busy ? t('trust.loading') : trust.status ? trust.status() : (trust.error ?? t('trust.off'))}
            </span>
          </div>
        </section>

        <div className="perf" aria-hidden="true">
          <i />
          <i />
        </div>

        <section className="out" aria-labelledby="result-title" ref={resultRef}>
          {validationState && (
            <p className="validation-progress" role="status">
              {validationState}{' '}
              {validationBusy && (
                <Button
                  variant="ghost"
                  onClick={() => {
                    validationJob.current?.cancel();
                    ++runId.current;
                    validationJob.current = undefined;
                    setValidationBusy(false);
                    setValidationState(t('val.cancelled'));
                  }}
                >
                  {t('val.cancel')}
                </Button>
              )}
            </p>
          )}
          <Result
            shown={shown}
            status={status}
            index={index}
            setIndex={setIndex}
            view={view}
            setView={setView}
            fresh={fresh}
            onNotice={(title, detail) => setDialog({ title, detail })}
          />
        </section>
      </div>

      <p className="visually-hidden" role="status" aria-live="polite">
        {announcement}
      </p>
      <Toaster />
      <Dialog open={dialog !== undefined} onOpenChange={(open) => !open && setDialog(undefined)}>
        <DialogContent>
          <DialogTitle>{dialog?.title}</DialogTitle>
          <DialogDescription>{dialog?.detail}</DialogDescription>
          <div>
            <DialogClose asChild>
              <Button>OK</Button>
            </DialogClose>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Result(props: {
  shown?: Shown;
  status: { reading?: string; notice?: { title: string; detail: string } };
  index: number;
  setIndex: (i: number) => void;
  view: View;
  setView: (v: View) => void;
  fresh: boolean;
  onNotice: (title: string, detail: string) => void;
}) {
  const { shown, status } = props;
  if (status.notice)
    return (
      <>
        <h2 id="result-title" className="visually-hidden">
          {t('result.heading')}
        </h2>
        <div className="notice">
          <p>
            <strong>{status.notice.title}</strong>
          </p>
          <p>{status.notice.detail}</p>
        </div>
      </>
    );
  if (status.reading || !shown)
    return (
      <>
        <h2 id="result-title" className="visually-hidden">
          {t('result.heading')}
        </h2>
        <p className="empty">{status.reading ? t('result.reading', { name: status.reading }) : t('result.empty')}</p>
      </>
    );
  const { result, filename, items, isExample } = shown;
  const head = (
    <div className="result-head">
      <h2 id="result-title">{t('result.heading')}</h2>
      <p className="sheet-sub">{t('result.sub')}</p>
      <p className="file-name">
        {filename}
        {isExample && <span className="example"> {t('result.example')}</span>}
      </p>
      <p className="file-meta">{t('result.meta', { hash: result.fileSha256.slice(0, 12), count: items.length })}</p>
    </div>
  );
  if (!items.length)
    return (
      <>
        {head}
        <div className="notice">
          <p>
            <strong>{t('result.noInvoice')}</strong>
          </p>
          {result.skipped.length ? (
            result.skipped.map((s) => (
              <p key={`${s.name}:${s.reason}`}>
                {s.name ? `${s.name}: ` : ''}
                {s.reason}
              </p>
            ))
          ) : (
            <p>{t('result.noXml')}</p>
          )}
        </div>
      </>
    );
  const tabLabel = (it: Item) =>
    it.invoice
      ? t(it.invoice.kind === 'creditNote' ? 'tab.creditNote' : 'tab.invoice', { id: it.invoice.id })
      : t('tab.document', { n: it.n + 1 });
  const sheets = (item: Item) => <Sheets {...props} item={item} result={result} filename={filename} />;
  return (
    <>
      {head}
      {items.length > 1 ? (
        <Tabs value={String(props.index)} onValueChange={(v) => props.setIndex(Number(v))}>
          <TabsList className="doc-tabs" aria-label={t('result.heading')}>
            {items.map((it, i) => (
              <TabsTrigger className="doc-tab" value={String(i)} key={tabLabel(it)}>
                {tabLabel(it)}
              </TabsTrigger>
            ))}
          </TabsList>
          {items.map((it, i) => (
            <TabsContent value={String(i)} key={tabLabel(it)} tabIndex={-1}>
              {sheets(it)}
            </TabsContent>
          ))}
        </Tabs>
      ) : (
        sheets(items[0]!)
      )}
    </>
  );
}

function Sheets(props: Parameters<typeof Result>[0] & { item: Item; result: ConvertResult; filename: string }) {
  const { item, result, view, setView } = props;
  const [annotationDraft, setAnnotationDraft] = useState({ invoice: item.invoice, text: '', checked: false });
  if (annotationDraft.invoice !== item.invoice) setAnnotationDraft({ invoice: item.invoice, text: '', checked: false });
  const views: View[] = item.invoice ? ['invoice', 'json', 'checks', 'lines'] : ['invoice', 'json', 'checks'];
  const active = views.includes(view) ? view : 'invoice';
  return (
    <Tabs value={active} onValueChange={(v) => setView(v as View)} className="sheets">
      <TabsList className="view-tabs" aria-label={t('view.label')}>
        {views.map((v) => (
          <TabsTrigger value={v} className={`view-tab t-${v}`} key={v}>
            {t(VIEW_KEY[v])}
          </TabsTrigger>
        ))}
      </TabsList>
      <TabsContent value="invoice" className="panel sheet-invoice">
        <InvoiceSheet item={item} fresh={props.fresh} />
      </TabsContent>
      <TabsContent value="json" className="panel sheet-json">
        <JsonPanel item={item} result={result} filename={props.filename} onNotice={props.onNotice} />
      </TabsContent>
      <TabsContent value="checks" className="panel sheet-checks">
        <ChecksPanel outcome={item.outcome} invoice={item.invoice} result={result} />
      </TabsContent>
      {item.invoice && (
        <TabsContent value="lines" className="panel sheet-lines">
          <div className="lines-view">
            <h3>{t('view.lines')}</h3>
            <LinesTable inv={item.invoice} limit={200} />
            <Suspense fallback={<p>{t('annotation.loading')}</p>}>
              <Annotations
                invoice={item.invoice}
                text={annotationDraft.invoice === item.invoice ? annotationDraft.text : ''}
                checked={annotationDraft.invoice === item.invoice && annotationDraft.checked}
                onDraft={(text, checked) => setAnnotationDraft({ invoice: item.invoice, text, checked })}
                download={(text, suffix) => save(text, 'application/json', `${fileBase(item.invoice!.id)}.${suffix}.json`)}
              />
            </Suspense>
          </div>
        </TabsContent>
      )}
    </Tabs>
  );
}

function InvoiceSheet({ item, fresh }: { item: Item; fresh: boolean }) {
  const o = item.outcome;
  const inv = item.invoice;
  const s = stampFor(item);
  const stamp = (
    <div className={['stamp', s.cls, fresh ? 'fresh' : ''].filter(Boolean).join(' ')}>
      {s.title}
      {s.note && <small>{s.note}</small>}
    </div>
  );
  if (!inv) {
    const reason =
      o.status === 'error'
        ? o.error
        : o.status === 'unsupported'
          ? o.reason
          : o.status === 'not-an-invoice' && o.detection.kind === 'other-document'
            ? o.detection.label
            : '';
    return (
      <article className="sheet">
        <div className="sheet-top">
          <h3 className="doc-title">
            {t(o.status === 'error' ? 'doc.notConverted' : o.status === 'unsupported' ? 'doc.identified' : 'doc.notInvoice')}
          </h3>
          {stamp}
        </div>
        {reason && <p className="reason">{reason}</p>}
      </article>
    );
  }
  return (
    <article className="sheet">
      <div className="stamp-row">{stamp}</div>
      <InvoiceView invoice={inv} />
    </article>
  );
}

/** The library's <Invoice> component, in the site language. */
function InvoiceView({ invoice }: { invoice: CanonicalInvoice }) {
  return <Invoice invoice={invoice} lang={currentLang()} idPrefix="inv" />;
}

function JsonPanel({
  item,
  result,
  filename,
  onNotice,
}: {
  item: Item;
  result: ConvertResult;
  filename: string;
  onNotice: (title: string, detail: string) => void;
}) {
  const [which, setWhich] = useState<'invoice' | 'full'>(item.invoice ? 'invoice' : 'full');
  const data = which === 'invoice' ? item.invoice : { fileSha256: result.fileSha256, ...item.outcome, skipped: result.skipped };
  const inv = item.invoice;
  const write = (target: 'ubl' | 'cii') => {
    if (!inv) return;
    try {
      save(target === 'ubl' ? toUbl(inv) : toCii(inv), 'application/xml', `${fileBase(inv.id)}.${target}.xml`);
      toast(t('toast.written', { format: target.toUpperCase() }));
    } catch (e) {
      if (!(e instanceof WriterError)) throw e;
      onNotice(t('notice.noWriteTitle', { format: target.toUpperCase() }), e.message);
    }
  };
  return (
    <div className="json-panel">
      <div className="json-bar">
        <div className="views">
          {inv ? (
            <>
              <button type="button" aria-pressed={which === 'invoice'} onClick={() => setWhich('invoice')}>
                {t('json.viewInvoice')}
              </button>
              <button type="button" aria-pressed={which === 'full'} onClick={() => setWhich('full')}>
                {t('json.viewFull')}
              </button>
            </>
          ) : (
            <button type="button" aria-pressed="true">
              {t('json.viewDetection')}
            </button>
          )}
        </div>
        <div className="actions">
          <Button
            variant="secondary"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(JSON.stringify(data, null, 2));
                toast(t('toast.copied'));
              } catch {
                toast(t('toast.copyBlocked'));
              }
            }}
          >
            {t('json.copy')}
          </Button>
          <Button
            onClick={() => {
              const base = inv ? fileBase(inv.id) : filename.replace(/\.[^.]+$/, '');
              save(JSON.stringify(data, null, 2), 'application/json', `${base}${which === 'full' ? '.result' : ''}.json`);
              toast(t('toast.downloaded'));
            }}
          >
            {t('json.download')}
          </Button>
          {inv && (
            <>
              <Button variant="ghost" onClick={() => write('ubl')}>
                {t('json.writeUbl')}
              </Button>
              <Button variant="ghost" onClick={() => write('cii')}>
                {t('json.writeCii')}
              </Button>
            </>
          )}
        </div>
      </div>
      {/* biome-ignore lint/a11y/noNoninteractiveTabindex: a scrollable region must be reachable by keyboard */}
      {/* biome-ignore lint/a11y/useSemanticElements: a <pre> keeps the JSON's layout; the group role lets it carry a name */}
      <pre className="json" tabIndex={0} role="group" aria-label={t('json.output')}>
        <JsonText text={JSON.stringify(data, (k, v) => shortenForDisplay(k, v), 2) ?? ''} />
      </pre>
    </div>
  );
}
