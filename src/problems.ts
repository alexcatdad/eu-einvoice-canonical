/**
 * The error categories of the conversion API (RFC 9457 problem types). They are the command line's exit codes 2 to 7,
 * so a script and a service client see the same categories. The type URIs resolve to the "problems" page of the site.
 */
export const PROBLEM_BASE = 'https://alexcatdad.github.io/eu-einvoice-canonical/problems/';

export const PROBLEMS = {
  'unsafe-or-malformed': {
    exitCode: 2,
    title: 'Unsafe or malformed input',
    statuses: [400, 413],
    summary: 'Not XML, a DOCTYPE, an unreadable archive or PDF, or a size or count limit exceeded (413).',
  },
  unsupported: {
    exitCode: 3,
    title: 'Unsupported format',
    statuses: [422],
    summary: 'Well-formed, but not an invoice format this converter reads (including well-formed non-invoice XML).',
  },
  'validation-failed': {
    exitCode: 4,
    title: 'Validation failed',
    statuses: [422],
    summary: 'The invoices converted, but the requested validation reported failures. The result is in the problem.',
  },
  partial: {
    exitCode: 5,
    title: 'Partially converted',
    statuses: [422],
    summary: 'Some documents in the file converted and some did not. The result is in the problem.',
  },
  'validator-unavailable': {
    exitCode: 6,
    title: 'Validator unavailable',
    statuses: [503],
    summary: 'Validation, or the trusted-list snapshot for euTrust, was requested and cannot run on this server.',
  },
  internal: {
    exitCode: 7,
    title: 'Internal error',
    statuses: [500],
    summary: 'A bug in the converter. Report it with the file hash from the response.',
  },
} as const;

export type ProblemSlug = keyof typeof PROBLEMS;

export const problemType = (slug: ProblemSlug): string => `${PROBLEM_BASE}#${slug}`;
