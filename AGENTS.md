# Pilotlane engineering harness

The active product is Pilotlane, an international marketplace for paid, genuine app testing. The former WhatsApp project brief is preserved at `docs/archive/whatsapp-assistant.md` and is not the current product specification.

## Sources of truth

- Product and acceptance criteria: `docs/specs/product.md`.
- Domain invariants, APIs, architecture: `docs/specs/architecture.md`.
- Money and fee policy: `docs/specs/economics.md`.
- Operational limitations and deployment: `docs/runbooks/railway.md`.
- External-policy evidence and verification status: `docs/research/provider-policies.md`.

## Workflow

Use the existing checkout. Cloud tasks are already isolated; do not create a Git worktree unless explicitly requested. Read these specs before changing domain behavior. Implement backend and database invariants before the interface. Keep `en` and `es` message keys in parity. Use system fonts and restrained macOS-inspired surfaces; no generated illustrations, fake analytics, or fabricated testimonials.

Use Node 24 and `npm ci`. Run `npm run check`, `npm test`, `npm run build`, and `npm run test:e2e` for relevant changes. Integration tests use actual embedded PostgreSQL through PGlite. Production uses PostgreSQL via `DATABASE_URL`; embedded storage is for local/sandbox use only. Never describe skipped checks as passed.

All amounts are integer USD cents. Derive quotes on the server. Financial mutations require transactions, ownership checks, row locks, append-only balanced journal entries, and idempotency. A client redirect never funds a campaign. Google production approval is not a tester payment condition. The operator is a natural person in Chile: primary payment ports are Mercado Pago (CLP collection) and PayPal Payouts (USD rewards); do not assume a Stripe merchant account or automatic cross-provider funding. Payment, Google SSO, and payout providers must fail closed when not configured. Sandbox transactions must be clearly labeled and never call live payment APIs.

Never commit secrets, local databases, browser profiles, build outputs, or live customer data. Check authorization on the server, not just in the UI. Reject cross-origin state-changing requests. Return sanitized errors; avoid recording passwords, tokens, raw webhook payloads, or private tester details in logs.
