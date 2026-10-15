# Economics v1 · USD cents

The founder's example, 20 × $15, creates a $300 obligation. A flat $30 fee would also have to cover collection, payouts, support, foreign exchange, reversals and fraud. Ten percent cannot be promised profitable without those costs.

## Initial configurable policy

The displayed tester reward is net, not reduced by our service fee.

- Reward budget = participants × reward cents.
- Service fee = max(20% of reward budget, $12).
- Estimated payout reserve = 2% of budget + $0.25 per participant.
- Risk reserve = 3% of budget.
- Collection estimate = gross-up for 4.9% + $0.30 on the entire charged amount.
- Charge = ceil((budget + service + payout reserve + risk reserve + $0.30) / (1 − 0.049)).

Use integer basis points and integer ceilings throughout, including the gross-up. For 20 × $15: rewards $300, service $60, payout reserve $11, risk reserve $9, estimated collection $19.90, total $399.90. This is an initial conservative pricing assumption, not a statement that any processor has quoted these rates or that every country can be served. The quote exposes every line before funding. Minimum reward $5, maximum $500 per participant, maximum 200 seats per study for this release.

## Chile collection and currency

The operator confirmed Chile, as a natural person with Mercado Pago and PayPal accounts. The quoted contract is USD. Mercado Pago Chile collection uses CLP, rounded up to whole pesos with a frozen operator-approved rate. No default exchange rate is invented. Actual provider charges, IVA treatment, PayPal currency conversion and cross-provider treasury costs are unverified and must replace estimates before live collection. Mercado Pago funds do not automatically fund a PayPal payout; maintain sufficient USD PayPal balance and reconcile both providers separately.

## Guardrails

Version and persist the quote with a 30-minute acceptance deadline. Payments received after the deadline remain an operational exception instead of silently creating unpriced work. Before accepting live funds, match provider capabilities, verified merchant country, settlement currency, available recipient countries, fees, taxes and FX. Provider costs above reserve, chargebacks, support, taxes and fixed hosting can still cause losses; a fee formula cannot eliminate them. Live mode therefore requires an explicit launch gate after validation. Do not describe reserved amounts as earned profit. Unused reserves/refunds require a defined settlement operation.

## Accounting

Funding journal: debit processor clearing with total received; credit study reward liability with the full reward budget; credit fee/reserve/collection clearing accounts with the other lines. Approval reclassifies the specific reward from study liability to tester payable. Payout only reduces tester payable after confirmed provider success; sandbox settlement is explicitly synthetic. Transactions must balance to zero; amounts and account names are immutable. All external actions carry stable idempotency keys and have a durable operation record.

Refunds, disputes, chargebacks and live payout completion require corresponding balanced reversal/settlement entries. The first release gates live collection until these operations are staffed and provider-verified; it does not implement a pretend bank escrow. Funds are collected by a regulated provider under its applicable marketplace model.
