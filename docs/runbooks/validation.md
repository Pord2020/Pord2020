# Validation harness

## Required levels

1. `npm run check`: strict TypeScript across the app, services, scripts, and tests. Locale dictionaries must have matching keys.
2. `npm test`: domain rules and actual PostgreSQL semantics through PGlite, including migrations repeated against the same database, constraints, transactions and state machines. Provider HTTP clients use controlled test transports; they do not represent provider-account verification.
3. `npm run build`: actual optimized Next production bundle and route generation.
4. `npm run test:e2e`: a freshly started production server, isolated PostgreSQL directory, Chromium desktop/mobile, English/Spanish discovery, accessibility, founder/tester signup, study creation and quote, synthetic funding, application/acceptance, invitation privacy, daily work, and an attempted early submission that must fail. API checks reject anonymous private reads and cross-origin writes.
5. `npm audit --omit=dev`: registry advisory check of production dependencies. This is not a full security audit.

## Domain scenarios

| Area             | Required negative/positive evidence                                                                                                                    |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Identity         | Salted password storage, normalized email login, wrong password, forged session, revoked session.                                                      |
| Privacy          | Invitations absent from marketplace/detail payloads; no access to another tester's work.                                                               |
| Funding          | Wrong amount/currency rejected; duplicate event/payment does not double-fund; late payment becomes an exception.                                       |
| Chile collection | Signed notification validation and canonical provider lookup; exact frozen CLP receipt retains USD reward obligation.                                  |
| Accounting       | SQL commit rejects unbalanced journals; SQL updates reject mutations of journal entries.                                                               |
| Eligibility      | Missing consent, audience mismatch, unfunded study, duplicate application rejected server-side.                                                        |
| Capacity         | Concurrent acceptances cannot exceed a single paid seat.                                                                                               |
| Participation    | Daily duplicate rejected; task from another study rejected; elapsed study period and daily streak required.                                            |
| Review           | Tester cannot approve themselves; founder review before submission fails; approval creates one reward.                                                 |
| Payouts          | Repeated synthetic payout cannot double-pay; PayPal batch pending is not paid; exact item confirmation is required; timeout retries preserve identity. |
| Disputes         | Rejected work can be disputed without releasing money.                                                                                                 |
| Launch gate      | Live payment/payout calls fail closed with missing operational/provider readiness.                                                                     |

## Honest limits

The clock is injected into internal services for tests only; there is no browser/API time-travel endpoint. A 14-day test scenario is validated at the service/database level, not by claiming fourteen days of real user usage elapsed during onboarding. A web check-in is self-reported, not device installation telemetry. Browser automation uses a fresh Chromium session and cannot access the user's personal SSO sessions.

PGlite executes real PostgreSQL SQL and constraints, but it is not the remote Railway PostgreSQL instance. The production `pg` transport and Railway deployment still need validation against the provisioned database after Railway authentication. Provider tests validate the implemented contracts with fake HTTP responses; real Mercado Pago signatures/receipts and PayPal Payouts access remain unverified until credentials and network access are supplied. Google OIDC has not been tested against a real configured client.

Automated WCAG checks are scoped to the rendered discovery pages. They complement screenshot review and keyboard checks; they do not prove that every possible flow is accessible. Keep test counts, failing checks, and unexecuted checks distinct in handoffs.
