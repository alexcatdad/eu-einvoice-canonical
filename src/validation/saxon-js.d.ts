declare module 'saxon-js' {
  interface TransformOptions {
    stylesheetInternal?: unknown;
    sourceText?: string;
    destination?: 'serialized' | 'document' | 'application' | 'replaceBody' | 'appendToBody' | 'prependToBody' | 'raw' | 'file' | 'stdout';
    [key: string]: unknown;
  }
  interface TransformResult {
    principalResult: string;
    [key: string]: unknown;
  }
  const SaxonJS: {
    transform(options: TransformOptions, mode: 'async'): Promise<TransformResult>;
    transform(options: TransformOptions, mode?: 'sync'): TransformResult;
  };
  export default SaxonJS;
}
