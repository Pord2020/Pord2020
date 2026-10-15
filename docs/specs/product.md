# Pilotlane — product contract

Status: implementation contract for the first functional release. Working brand; trademark and domain availability have not been established. Languages: English and Spanish. Web first, international audiences, adults only, USD reward contracts for the first release. The operator is a natural person in Chile; intended collection is Mercado Pago in CLP and payout is PayPal Payouts in USD, subject to account eligibility.

## Problem and promise

Founders need reliable people to try prerelease apps, follow a study plan, and send useful feedback. Testers need clear work, eligibility, compensation, and a fair review process. Pilotlane matches these groups and tracks that work. It sells genuine research participation, never store approval, ratings, reviews, installs used to manipulate rankings, or a guaranteed production-access decision.

Google assesses a developer's application for production access; there is no supported per-tester "Google approved" signal to unlock money. Opt-in history in Play Console and tester-submitted activity are different evidence types. Keeping an app installed is not observable by an ordinary web application. App Store/TestFlight studies also cannot promise Apple approval.

## Roles and journeys

1. Founder signs up or uses configured Google OIDC, selects founder role, creates a study, specifies app/platform, objective, adult audience, country/age range/optional gender/interests, participant count, net reward, duration, tasks, and a private test invitation URL.
2. The server returns an itemized, versioned quote. Founder reviews and funds through hosted Mercado Pago Checkout Pro. Live studies are funded only after a signed Mercado Pago notification triggers a canonical payment API lookup, with the exact stored CLP amount/currency and mode checked. Never trust a redirect or notification body alone. In sandbox, a separate explicitly labeled simulation funds a study without collecting money.
3. A tester creates a profile and consents to voluntary demographic matching. The server shows matching funded/recruiting studies. Applying to an ineligible, full, unfunded, or own study fails even if its ID is known.
4. Founder reviews applicants and accepts or rejects them. Acceptance reserves a seat transactionally. The accepted tester can see the private invitation; other users cannot. The tester confirms joining, starts their participation, and records daily activity plus structured task feedback.
5. Completion requires the full elapsed period, one distinct check-in for each required UTC day, and all task submissions. Check-ins are self-reported evidence, never described as verified installation. Founder reviews submitted evidence; approval creates a payable reward exactly once.
6. The tester sees pending, approved, disputed, and paid amounts separately. Live payouts require a supported, onboarded recipient and enabled provider. Approval alone never marks a reward paid. A durable outbox and provider idempotency are prerequisites for live disbursements. This first release does not silently activate live payouts without their onboarding/operational gates.
7. Testers can dispute a rejected submission; a submitted study can also be escalated after the review window. Funds are held during disputes. Unfilled/canceled budgets are accounted separately and require a verified refund path, never a balance reset.

## Acceptance criteria / harness

- AUTH: password credentials are salted and hashed; sessions expire and are revocable. User IDs and role headers supplied by clients grant no authority. Cross-origin writes fail. Google tokens require issuer, audience, verified email, nonce, and state validation.
- MATCH: only consenting, adult, matching profiles may apply; duplicate applications fail. All applicants and private invite URLs are owner/participant scoped.
- CAPACITY: concurrent acceptance cannot exceed paid seats. Rejected/waitlisted applications do not reserve a seat.
- FUNDING: unsigned webhooks, wrong currency/amount, expired quotes, repeated event IDs, repeated payment objects, and client redirects cannot double-fund a study.
- WORK: duplicate daily check-ins cannot advance progress. Time and task requirements must be met on the server. Review cannot happen before the tester submits.
- MONEY: balanced append-only journals, no floating-point currency, no double reward, no unfunded payouts, no negative campaign allocation. Provider failures remain pending/failed, never paid.
- PRIVACY: demographic fields are optional; absent demographic information does not match a restricted study. Age/gender filters require consent. Do not collect health status or full birth dates. No minors.
- I18N: English and Spanish share message keys, language preference persists, number/date formatting follows locale, all main flows have accessible labels.
- OPERATIONS: fresh migrations and repeated startup work. `/api/health` checks DB connectivity. Production fails fast without required configuration. Railway has an explicit start command, persistent PostgreSQL, and health checks.

## Explicit release boundaries

Sandbox is a usable end-to-end environment with separate synthetic payment events. Mercado Pago and PayPal API adapters and a payout worker are implemented with controlled-transport tests. Live collection is deliberately disabled pending actual merchant/Payouts approval, exact fees/FX, verified recipients, USD prefunding, and dispute/refund/reversal operations. This is a concrete launch prerequisite rather than a promise of immediate worldwide payout coverage. No real payment can be collected when live payout readiness is disabled.

Store policy verification, live provider accounts, domain/trademark registration, Google OAuth consent, store-console opt-in proof, email delivery, and production deployment authentication are external dependencies. Report their real verification state.
