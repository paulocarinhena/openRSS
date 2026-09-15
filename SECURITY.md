# Security Policy

## Supported versions

openRSS is a rolling-release project — only the latest commit on `main` (and the latest published Docker image / GHCR tag) is supported. There are no maintained older versions.

## Reporting a vulnerability

Please **do not** open a public issue for security vulnerabilities.

Report privately using [GitHub Security Advisories](https://github.com/paulocarinhena/openRSS/security/advisories/new) for this repository. You'll get an initial response within a few days, and we'll coordinate a fix and disclosure timeline with you.

## Scope

openRSS is self-hosted: each deployment's API keys, `APP_SECRET`, and database are controlled by the person running it. This policy covers vulnerabilities in the application code itself (e.g. auth bypass, injection, SSRF in feed/AI provider handling, secret exposure) — not misconfiguration of a specific deployment.
