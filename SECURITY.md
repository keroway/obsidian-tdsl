# Security Policy

## Supported Versions

| Version | Supported |
| ------- | --------- |
| 0.1.x   | ✓         |

## Reporting a Vulnerability

Please **do not** open a public GitHub issue for security vulnerabilities.

Instead, report them privately via [GitHub Security Advisories](https://github.com/keroway/obsidian-tdsl/security/advisories/new).

Include:
- A description of the vulnerability and its potential impact
- Steps to reproduce
- Suggested fix (optional)

You can expect an initial response within **5 business days** and a resolution or status update within **30 days**.

## Scope

This plugin runs entirely client-side inside Obsidian. It processes `.tdsl` code blocks and renders SVG previews using a WebAssembly module. There is no server component, no network requests at runtime, and no authentication.

Known non-issues:
- `import wikidata` blocks in `.tdsl` are silently skipped inside Obsidian (no network calls are made).
