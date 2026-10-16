# Security policy

## Reporting a vulnerability

Please report vulnerabilities privately through GitHub private vulnerability reporting:
<https://github.com/alexcatdad/eu-einvoice-canonical/security/advisories/new>

Do not open a public issue or pull request for a suspected vulnerability. Include the affected version or commit, a minimal reproduction (an input file is ideal, and a hostile one is fine to attach there) and the impact you see. You can expect an acknowledgement within 7 days and a status update within 30 days. Fixes are coordinated with you and credited in the advisory unless you prefer otherwise.

## Supported versions

Only the latest release (the highest `v*` tag, currently the 1.x line) and `main` receive security fixes. Older releases are not patched; upgrade instead.

## Scope

In scope:
- The library (`src/`), the `einvoice` CLI and its release binaries, the reference HTTP server (`einvoice serve`, the Dockerfile image) and the MCP server.
- Hostile-input handling: crashes, hangs, unbounded memory or CPU, ZIP/PDF/XML bombs, XXE or DOCTYPE handling, path traversal, and bypass of the size and depth limits.
- Signature and trust-list verification logic (CAdES/XAdES, EU trusted lists) that accepts something it should reject.
- The release and CI pipeline: tampered artifacts, missing or forged attestations, workflow injection.

Out of scope:
- Findings that need an already-compromised host, or a deliberately raised limit.
- Denial of service through traffic volume against a server you deploy; the reference server has no authentication or rate limiting by design and belongs behind your own gateway.
- Mapping or conformance errors in a format parser that are not security relevant (open a normal issue).
- Vulnerabilities in third-party dependencies with no reachable path in this project (report those upstream; Dependabot tracks them here).
