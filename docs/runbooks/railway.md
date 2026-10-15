# Railway deployment and operations

## Observed deployment state

On 2026-10-15 the official Railway CLI 5.68.0 was downloaded through the environment HTTPS proxy from Railway's official GitHub release, with TLS verification enabled. `railway --version` worked; `railway whoami --json` returned **Unauthorized**. No Railway session/configuration or `RAILWAY_TOKEN` binding was present. No project, database, public domain, or deployment was created. The integrated browser/SSO surface is not exposed to this cloud task. Do not reuse a claimed personal browser login as a server credential.

A `RAILWAY_TOKEN` requirement and required network domains were saved to the cloud environment configuration draft. Draft persistence is separate from runtime activation and environment publication. Store the credential in environment settings, never in chat or Git. A project-scoped Railway token can deploy only into its project; creating a project needs appropriate account/workspace access. After access changes, first rerun the read-only `railway whoami` / linked-project check and inspect the actual error before requesting anything else.

## Target topology

Railway project `pilotlane`, web service `web`, managed PostgreSQL service. The web service uses the private database URL via a Railway reference variable. Use one replica initially; PostgreSQL transaction locks also protect repeated workers/migrations. No Redis or filesystem uploads are required. Do not use embedded storage on an ephemeral Railway filesystem.

The first deployment should be **sandbox**. User-facing languages and global study profiles are available; USD accounting does not imply worldwide merchant/payout eligibility.

## Concrete deployment sequence

Use the existing `/workspace/Pord2020` checkout. The CLI help for `init`, `add`, `variable set`, `up`, and `domain` was inspected. The remote operations below remain unexecuted because authentication is missing.

1. Run `railway whoami --json`. Use a supported secure login/binding if missing; do not extract browser tokens. Select the intended workspace using its real ID/name when the account has more than one.
2. Create or reuse the project. For a new authorized project: `railway init --name pilotlane --workspace <actual-workspace> --json`. Preserve the returned project identity.
3. Add PostgreSQL: `railway add --database postgres --json`. Record the actual database service name. Add the app: `railway add --service web --json`.
4. Set non-secret app variables for `web` with `railway variable set --service web --skip-deploys`: `NODE_ENV=production`, `APP_MODE=sandbox`, `DATABASE_MODE=postgres`, `TRUST_PROXY=1`, `NEXT_TELEMETRY_DISABLED=1`. Set `DATABASE_URL` to Railway's private PostgreSQL **reference expression**, such as `${{Postgres.DATABASE_URL}}` using the actual service name; never print or commit a resolved connection string. Pass reference expressions in single shell quotes to prevent expansion.
5. Generate the actual domain with `railway domain --service web --port 3000 --json`. Set `APP_URL` to its exact HTTPS origin. Set `PORT=3000` to agree with that domain target. If a domain cannot be generated before first deploy, use the Railway-provided public-domain reference variable for `APP_URL` and verify its resolved origin before the functional checks. Do not invent a hostname.
6. `railway up --service web --ci` uploads this checkout and builds using `railway.toml`. It does not imply a healthy deploy merely because upload returns successfully. Inspect deployment state and the build/runtime logs. Never use `--no-gitignore` to upload local secrets/databases.
7. Require an actual HTTP 200 from the public `/api/health`, with `database: connected`; fetch `/en` and `/es` and verify localized content. Confirm a new sandbox account can create and fund a study and that unauthenticated `/api/wallet` is rejected. Repeat the relevant browser smoke test against the real public origin before calling deployment verified.

The Railway start command runs the Node entry point directly so it can receive shutdown signals. `npm start` uses the same entry point for local work. Startup validates `APP_URL`, applies migrations under an advisory transaction lock, closes its migration connection, then starts Next on the Railway port. Source changes require a new build; a PID alone is not readiness.

## Application variables

| Variable                                   | Purpose                                                                                                                                                                                             |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `APP_URL`                                  | Exact public HTTPS origin; required for production startup and origin/redirect checks.                                                                                                              |
| `APP_MODE`                                 | `sandbox` initially. Real checkout is deliberately disabled in the current release.                                                                                                                 |
| `DATABASE_MODE`                            | `postgres` on Railway. `embedded` is explicitly limited to local/sandbox testing.                                                                                                                   |
| `DATABASE_URL`                             | Private PostgreSQL connection reference, configured securely in Railway.                                                                                                                            |
| `TRUST_PROXY`                              | `1` only behind Railway's controlled proxy. The rightmost forwarded address is used for auth throttling; verify proxy behavior before real launch.                                                  |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Optional dedicated Google OAuth application. Exact authorized callback: `<APP_URL>/api/auth/google/callback`. Requires OAuth consent configuration; a personal Google login is not this credential. |
| `MERCADOPAGO_ACCESS_TOKEN`                 | Mercado Pago Chile application credential. No account eligibility is assumed.                                                                                                                       |
| `MERCADOPAGO_WEBHOOK_SECRET`               | Raw runtime secret for local HMAC verification; do not mistake a network-proxy placeholder for this value.                                                                                          |
| `USD_CLP_RATE`                             | Approved, dated CLP-per-USD quote, up to four decimals. No guessed default. Frozen in each payment record with its CLP amount.                                                                      |
| `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET` | PayPal application credentials, separate from PayPal website sign-in.                                                                                                                               |
| `PAYPAL_ENVIRONMENT`                       | `sandbox` until production Payouts access has actually been approved.                                                                                                                               |
| `LIVE_PAYOUTS_READY`                       | Remains `false` until recipient, provider, funding, and operational requirements are verified. It does not enable live collection.                                                                  |

Enter actual app credentials directly in Railway's secure variables. A Codex network-proxy placeholder must not be copied into deployed app configuration or used as a raw local HMAC/client secret. Never dump variable values, credential files, or full environments.

## Chile, Mercado Pago, and PayPal

The operator is a natural person in Chile with Mercado Pago and PayPal accounts. No company, US address, or Stripe account is invented. Personal account existence does not establish marketplace collection permission or PayPal Payouts API access. Verify those account capabilities and applicable tax/KYC requirements with the providers before launch.

Contracts/rewards are USD; Mercado Pago Chile collection is CLP. FX must be approved and shown to a founder before a future live checkout opens. Funds in Mercado Pago are not automatically available to PayPal. A funded study is not proof of sufficient USD PayPal balance. Treasury prefunding, FX costs, payout limits and reconciliation are required. These cannot be solved merely by changing a service-fee percentage.

The PayPal adapter and `npm run payouts:work` implement a durable worker with stable reward/batch IDs, leases, retries, and item-level confirmation. A successful batch creation is only processing. The worker records a paid reward only when the exact recipient, USD amount, reward ID, and item status match. Sandbox data can only use sandbox PayPal. Live worker use additionally requires a verified Google identity on the recipient and the explicit operations gate; an account-linking/email-verification workflow for password-only users remains a launch requirement. Do not enable live payouts to work around a verification error.

For future operation, schedule a separate worker against the same PostgreSQL database. Its filesystem/dependencies are retained; its process must be restarted. Payout provider timeout ambiguity remains pending for retry/reconciliation with the same idempotency identity. Duplicate PayPal batch errors require inspecting the original batch; never generate a replacement batch key to force a retry. Returned/reversed payments need a corresponding reversal operation before live launch.

## Remaining launch work

Fresh verification of provider/store rules and costs; actual merchant/Payouts API eligibility; raw runtime secrets; exact live FX quote and founder consent; PayPal USD treasury; recipient email/account verification for password accounts; automated refunds/cancellations and reversal handling; an operator dispute-resolution workflow; legal/tax and consent documents for the intended service. Until these are completed, `capabilities().livePayments` stays false. No real card/payment collection can be triggered from the UI or checkout endpoint.

## Recovery

Use Railway's PostgreSQL backup/PITR features available on the selected plan and test a restore into a separate database before real money. Do not promise backup coverage before inspecting the actual plan. Deploy forward-compatible migrations before changing code. Recover through a verified snapshot or additive migration; never edit ledger entries or delete money records to resolve an operational error. Replay a provider event with the same identity after fixing its cause. Preserve mismatched/late payments as reconciliation exceptions.

## Latest access checks

At the user's request to handle secrets autonomously, the actual process was rechecked: Railway, Mercado Pago, PayPal and Google app credential variables were absent; managed runtime metadata reported no secrets or outbound identities. The browser-management socket was not present, and no browser-control connector was exposed. A native `railway login --browserless` attempt failed connecting to `https://backboard.railway.com/oauth/device/auth`; it did not issue a device link or create a session. Required domain additions were saved to the draft, not asserted applied.

The configuration tool rejected an attempted extension of the existing `RAILWAY_TOKEN` requirement's destination list, because existing requirements cannot be changed through that additive endpoint. No duplicate requirement was created. The existing binding remains preserved. If the chosen Railway authentication route requires bearer injection at `backboard.railway.com`, its existing requirement must be edited in environment settings to add that hostname. The network-only addition was saved successfully.

A read-only check for reusable GitHub Actions secret names in the selected repository was also denied (`gh api .../actions/secrets`: Forbidden); Git read access alone does not imply GitHub API secret metadata access. No credential values or browser cookies were read or copied. Public PayPal documentation was subsequently reachable and confirms that Payouts requires a business account, separate approval, identity/bank/email checks, and sufficient balance; owning a personal PayPal account is not enough.
