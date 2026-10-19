/** Isolate Saxon diagnostics: its exception logger can include received source values. */
import { parentPort, workerData } from 'node:worker_threads';
import SaxonJS from 'saxon-js';

async function run() {
  try {
    const result = await SaxonJS.transform(
      { stylesheetInternal: workerData.stylesheet, sourceText: workerData.xml, destination: 'serialized' },
      'async',
    );
    parentPort!.postMessage({ svrl: result.principalResult });
  } catch {
    parentPort!.postMessage({ error: 'Schematron transformation failed' });
  }
}
void run();
