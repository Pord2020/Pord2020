# Provider evidence / verification register

Research date: 2026-10-15. Direct HTTPS reads in the cloud environment returned proxy CONNECT 403 for the destinations below. Necessary network additions were saved in the environment configuration draft. Until a successful read is recorded, these are references to verify, not claims of a fresh policy audit.

| Topic                                                    | Authoritative source                                                    | Implementation consequence                                                                                                                                                                                                                  | Verification                                                                         |
| -------------------------------------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Google personal-account production access / closed tests | https://support.google.com/googleplay/android-developer/answer/14151465 | Baseline reference is at least 12 opted-in testers continuously for 14 days for affected new personal accounts. Requirements depend on account type and current policy. Display an editable study duration/count; never guarantee approval. | Current page blocked by network; must recheck before live launch.                    |
| Store manipulation                                       | https://support.google.com/googleplay/android-developer/answer/9898684  | Pay for honest testing effort and private feedback, never positive reviews, ratings, or ranking manipulation.                                                                                                                               | Current page blocked.                                                                |
| TestFlight                                               | https://developer.apple.com/testflight/                                 | Treat iOS studies as testing; beta review and App Store review remain Apple's decisions.                                                                                                                                                    | Current page not yet read.                                                           |
| Stripe marketplace availability                          | https://docs.stripe.com/connect/cross-border-payouts                    | Merchant country, connected-account countries, KYC, charge model and transfer restrictions must be validated. Chilean user location does not establish Stripe merchant eligibility.                                                         | Current page blocked.                                                                |
| Stripe Connect / processing                              | https://stripe.com/connect/pricing and https://stripe.com/pricing       | Fee defaults are estimates; gate live collection until actual route costs and payout/refund procedures are established.                                                                                                                     | Current page blocked.                                                                |
| Railway deployment                                       | https://docs.railway.com/guides/healthchecks                            | PostgreSQL persistence, startup migrations and readiness endpoint.                                                                                                                                                                          | Current page blocked; config validated locally against installed CLI where possible. |

No official per-tester Google approval API is assumed. Daily web check-ins are self-reported. A store invitation, installation, tester opt-in, ongoing activity, and a production-access approval are distinct facts. Record their provenance separately; never label them interchangeable.

Payment-provider selection is intentionally an adapter boundary. PayPal Payouts or Mercado Pago can be added after actual merchant/recipient availability and onboarding are verified. Google SSO does not authorize creating payment merchant accounts or bypass their identity checks.

## Confirmed operator context

The user confirmed operating in Chile as a natural person, with Mercado Pago and PayPal accounts and no Stripe account. Primary integration choice was updated accordingly. No US company or country/address workaround is assumed. Stripe references above remain relevant only to the user's question/possible future options; they are not the primary implementation.

Authoritative sources to verify before activation:

- Mercado Pago Chile Checkout Pro: https://www.mercadopago.cl/developers/es/docs/checkout-pro/overview
- Mercado Pago signed notifications: https://www.mercadopago.cl/developers/es/docs/your-integrations/notifications/webhooks
- PayPal Payouts access and account requirements: https://developer.paypal.com/docs/payouts/standard/
- PayPal Chile fees: https://www.paypal.com/cl/business/pricing

The implementations use these known API contracts and controlled test transports. Current account access, webhook behavior, tariffs, eligible countries, and live Payouts approval have not been verified. A normal PayPal website account is not evidence of Payouts API enablement.

## Successful current PayPal source read

A subsequent request on 2026-10-15 successfully retrieved HTTP 200 from the canonical page https://developer.paypal.com/payouts/use-payouts/overview (redirected from the original `/docs/payouts/standard/` link). The page states it was updated September 10, 2026. It explicitly requires a PayPal **business account**, requested/approved Payouts access, confirmed identity/email/linked bank account, and sufficient PayPal balance including fees. It notes country-specific limitations. These requirements are now source-verified; this does not verify the user's account or enable API access.

Mercado Pago Chile documentation returned HTTP 403 on the subsequent request. Railway's public backboard root returned HTTP 200, but the CLI device-login endpoint uses `backboard.railway.com/oauth/device/auth` and its request was blocked by the network proxy. `backboard.railway.com` was added to the saved custom-domain draft; runtime activation is unconfirmed.
