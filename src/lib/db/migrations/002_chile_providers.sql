ALTER TABLE payments DROP CONSTRAINT payments_provider_check;
ALTER TABLE payments ADD CONSTRAINT payments_provider_check CHECK (provider IN ('sandbox','stripe','mercadopago'));
ALTER TABLE payments ADD COLUMN checkout_id text UNIQUE;
ALTER TABLE payments ADD COLUMN collection_currency text NOT NULL DEFAULT 'USD' CHECK (collection_currency IN ('USD','CLP'));
ALTER TABLE payments ADD COLUMN collection_amount_minor integer;
ALTER TABLE payments ADD COLUMN fx_rate_scaled integer;
ALTER TABLE outbox ADD COLUMN lease_until timestamptz;
CREATE INDEX outbox_pending ON outbox(status,created_at);
