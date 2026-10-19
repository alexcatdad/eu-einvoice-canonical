/** Worker DOM host; Saxonica's separately shipped runtime remains unmodified. */
import { DOMImplementation, DOMParser, Node, XMLSerializer } from '@xmldom/xmldom';

Object.assign(globalThis, {
  Node,
  DOMParser,
  XMLSerializer,
  window: globalThis,
  document: new DOMImplementation().createDocument('', 'host', null),
});
const host = globalThis as unknown as {
  importScripts: (...urls: string[]) => void;
  SaxonJS: { transform(options: object, mode: string): Promise<{ principalResult: string }> };
  onmessage: (event: MessageEvent) => void;
  postMessage: (message: unknown) => void;
};
host.onmessage = async ({ data }) => {
  try {
    // No uploaded-document resource is allowed to cause a network request.
    host.importScripts('./SaxonJS2.rt.js');
    Object.assign(globalThis, { fetch: () => Promise.reject(new Error('Document network access is disabled')), XMLHttpRequest: undefined });
    const result = await host.SaxonJS.transform(
      { stylesheetInternal: JSON.parse(data.stylesheet), sourceText: data.xml, destination: 'serialized' },
      'async',
    );
    host.postMessage({ value: result.principalResult });
  } catch (error) {
    host.postMessage({ error: error instanceof Error ? error.message : String(error) });
  }
};
