/**
 * The browser converter. Everything runs locally through the same `convert()` the library exports: files are never
 * uploaded. The only outside requests are the ones the reader switches on (the EU trusted lists, a language model).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  applyModelLabels,
  BAS_EXAMPLE_MAPPING,
  buildJournalEntry,
  type CanonicalInvoice,
  type ConvertOutcome,
  type ConvertResult,
  convert,
  JournalError,
  type TrustSnapshot,
  toCii,
  toSie4,
  toUbl,
  WriterError,
} from '../../../src/index.ts';
import { Invoice } from '../../../src/react/index.ts';
import { shortName } from '../../coverage';
import { currentLang, initLanguage, initSwitcher, t } from '../../i18n';
import { type EngineSpec, geminiNanoAvailability, loadEngine } from '../../model';
import { Button } from '../components/ui/button';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from '../components/ui/dialog';
import { Dropzone } from '../components/ui/dropzone';
import { Toaster, toast } from '../components/ui/sonner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { ChecksPanel } from './Checks';
import { Html, useLang } from './i18n';
import { JsonText } from './Json';
import { LinesTable, ModelPanel, type ModelState } from './Lines';
import { CHIP_SAMPLES, EXAMPLE, SAMPLES } from './samples';
import '../../../src/react/invoice.css';

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

type Snapshot = ReturnType<typeof snapshotOf>;
const snapshotOf = (inv: CanonicalInvoice) =>
  structuredClone({ lineRoles: inv.lineRoles, relations: inv.relations, derived: inv.source.derived, warnings: inv.source.warnings });

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
  const [model, setModel] = useState<ModelState>();
  const [engine, setEngine] = useState('qwen3-1.7b');
  const [nanoStatus, setNanoStatus] = useState<string>();
  /** Bumped when the model changes an invoice in place, so the sheets redraw. */
  const [, setRevision] = useState(0);
  const [announcement, setAnnouncement] = useState('');
  /** The paste shortcut as this keyboard writes it; set after hydration, since the server cannot know it. */
  const [shortcut, setShortcut] = useState('Ctrl+V');

  const last = useRef<{ bytes: Uint8Array; filename: string; isExample: boolean }>(undefined);
  const resultRef = useRef<HTMLElement>(null);
  const slotRef = useRef<HTMLDivElement>(null);
  const pasteRef = useRef<HTMLTextAreaElement>(null);
  const trustRef = useRef<TrustSnapshot | undefined>(undefined);
  const modelBase = useRef(new WeakMap<CanonicalInvoice, Snapshot>());

  /** Tells screen readers what just happened; the visible result is not a live region. */
  const announce = useCallback((text: string) => {
    setAnnouncement('');
    setTimeout(() => setAnnouncement(text), 50);
  }, []);

  const run = useCallback(
    async (bytes: Uint8Array, filename: string, isExample = false) => {
      last.current = { bytes, filename, isExample };
      if (!isExample) {
        setStatus({ reading: filename });
        announce(t('result.reading', { name: filename }));
      }
      try {
        const result = await convert(bytes, filename, undefined, { relations: true, euTrust: trustRef.current });
        const items = result.outcomes.flatMap((o, n): Item[] =>
          o.status === 'ok' ? o.invoices.map((invoice) => ({ outcome: o, invoice, n })) : [{ outcome: o, n }],
        );
        setShown({ result, filename, items, isExample });
        setStatus({});
        setIndex(0);
        setView('invoice');
        setFresh(!isExample);
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
        await run(new Uint8Array(await res.arrayBuffer()), name, isExample);
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
    void geminiNanoAvailability().then(setNanoStatus);
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
              source: t(site.source === 'live' ? 'trust.live' : 'trust.published'),
              date: site.snapshot.fetchedAt.slice(0, 10),
              ok,
              total: site.snapshot.lists.length,
            }) + (site.note ? ` ${site.note}.` : ''),
        });
      } catch (e) {
        trustRef.current = undefined;
        setTrust({ on: false, busy: false, error: (e as Error).message });
      }
    }
    if (last.current) await run(last.current.bytes, last.current.filename, last.current.isExample);
  };

  const runModel = async (inv: CanonicalInvoice, spec: EngineSpec) => {
    const started = performance.now();
    const prior = model?.inv === inv ? model : undefined;
    const before = snapshotOf(inv);
    if (!modelBase.current.has(inv)) modelBase.current.set(inv, before);
    const base = modelBase.current.get(inv)!;
    const restoreTo = (snap: Snapshot) => () => {
      inv.lineRoles = structuredClone(snap.lineRoles);
      inv.relations = structuredClone(snap.relations);
      inv.source.derived = structuredClone(snap.derived);
      inv.source.warnings = structuredClone(snap.warnings);
    };
    const fail = (reason: string) => {
      restoreTo(before)();
      setModel({ inv, phase: 'error', text: t('model.failed', { reason }), undo: prior?.undo });
      setRevision((r) => r + 1);
    };
    setModel({ inv, phase: 'busy', text: t('model.loading', { model: spec.label }), undo: prior?.undo });
    try {
      const loaded = await loadEngine(spec, (text, fraction) => setModel({ inv, phase: 'busy', text, fraction, undo: prior?.undo }));
      setModel({ inv, phase: 'busy', text: t('model.labelling'), undo: prior?.undo });
      await applyModelLabels(inv, loaded.labeller);
      await loaded.dispose();
      const failed = inv.source.warnings.find(
        (w) => w.code === 'LINE-MODEL-FAILED' && !before.warnings.some((b) => b.code === w.code && b.message === w.message),
      );
      if (failed) return fail(failed.message.replace(/^The language model failed: /, ''));
      const seconds = ((performance.now() - started) / 1000).toFixed(1);
      const labels = Object.keys(inv.lineRoles ?? {}).filter((id) => inv.lineRoles?.[id] !== before.lineRoles?.[id]).length;
      const links = (inv.relations?.length ?? 0) - (before.relations?.length ?? 0);
      setModel({
        inv,
        phase: 'done',
        text: labels || links ? t('model.done', { seconds, labels, links }) : t('model.nothing', { seconds }),
        undo: labels || links || prior?.undo ? restoreTo(base) : undefined,
      });
      setRevision((r) => r + 1);
    } catch (e) {
      fail((e as Error).message);
    }
  };

  const dismissModel = (inv: CanonicalInvoice) => {
    if (model?.inv !== inv) return;
    model.undo?.();
    modelBase.current.delete(inv);
    setModel({ inv, phase: 'idle', text: t('model.removed') });
    setRevision((r) => r + 1);
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
                const text = e.clipboardData.getData('text/plain').trim();
                if (text) setTimeout(() => void run(new TextEncoder().encode(text), 'pasted.xml'), 0);
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
          <Result
            shown={shown}
            status={status}
            index={index}
            setIndex={setIndex}
            view={view}
            setView={setView}
            fresh={fresh}
            onNotice={(title, detail) => setDialog({ title, detail })}
            model={model}
            engine={engine}
            nanoStatus={nanoStatus}
            onEngine={setEngine}
            onRunModel={(inv, spec) => void runModel(inv, spec)}
            onDismissModel={dismissModel}
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
  model?: ModelState;
  engine: string;
  nanoStatus?: string;
  onEngine: (id: string) => void;
  onRunModel: (inv: CanonicalInvoice, spec: EngineSpec) => void;
  onDismissModel: (inv: CanonicalInvoice) => void;
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
            {item.invoice.lines.length > 0 && (
              <ModelPanel
                state={props.model?.inv === item.invoice ? props.model : undefined}
                engine={props.engine}
                nanoStatus={props.nanoStatus}
                onEngine={props.onEngine}
                onRun={(spec) => props.onRunModel(item.invoice!, spec)}
                onDismiss={() => props.onDismissModel(item.invoice!)}
              />
            )}
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
              <Button
                variant="ghost"
                onClick={() => {
                  try {
                    const sie = toSie4([buildJournalEntry(inv, BAS_EXAMPLE_MAPPING)], { currency: inv.currency });
                    save(sie.bytes as BlobPart, 'application/octet-stream', `${fileBase(inv.id)}.se`);
                    toast(t('toast.journal'));
                  } catch (e) {
                    if (!(e instanceof JournalError)) throw e;
                    onNotice(t('notice.noJournalTitle'), e.message);
                  }
                }}
              >
                {t('json.journal')}
              </Button>
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
      {inv && <Html as="p" className="journal-note" k="json.journalNote" />}
      {/* biome-ignore lint/a11y/noNoninteractiveTabindex: a scrollable region must be reachable by keyboard */}
      {/* biome-ignore lint/a11y/useSemanticElements: a <pre> keeps the JSON's layout; the group role lets it carry a name */}
      <pre className="json" tabIndex={0} role="group" aria-label={t('json.output')}>
        <JsonText text={JSON.stringify(data, (k, v) => shortenForDisplay(k, v), 2) ?? ''} />
      </pre>
    </div>
  );
}
