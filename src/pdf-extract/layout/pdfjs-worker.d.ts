/** pdfjs-dist ships no types for its worker module; layout.ts only hands it to pdf.js as the in-thread worker. */
declare module 'pdfjs-dist/build/pdf.worker.mjs' {
  export const WorkerMessageHandler: unknown;
}
