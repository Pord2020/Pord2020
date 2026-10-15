CREATE TABLE IF NOT EXISTS schema_migrations (
  version text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE CHECK (email = lower(email)),
  name text NOT NULL,
  password_hash text,
  google_sub text UNIQUE,
  role text NOT NULL CHECK (role IN ('founder', 'tester')),
  locale text NOT NULL DEFAULT 'en' CHECK (locale IN ('en','es')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE sessions (
  token_hash text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sessions_expiry ON sessions(expires_at);
CREATE TABLE oauth_states (
  state_hash text PRIMARY KEY,
  nonce text NOT NULL,
  verifier text NOT NULL,
  role text NOT NULL CHECK (role IN ('founder','tester')),
  locale text NOT NULL CHECK (locale IN ('en','es')),
  expires_at timestamptz NOT NULL
);
CREATE TABLE auth_attempts (
  key text PRIMARY KEY,
  count integer NOT NULL DEFAULT 0,
  window_started_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE tester_profiles (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  country text NOT NULL CHECK (country ~ '^[A-Z]{2}$'),
  age integer NOT NULL CHECK (age BETWEEN 18 AND 100),
  gender text NOT NULL CHECK (gender IN ('woman','man','nonbinary','undisclosed')),
  interests text[] NOT NULL DEFAULT '{}',
  platforms text[] NOT NULL,
  matching_consent boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE studies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  founder_id uuid NOT NULL REFERENCES users(id),
  title text NOT NULL,
  app_name text NOT NULL,
  description text NOT NULL,
  platform text NOT NULL CHECK (platform IN ('android','ios','web')),
  kind text NOT NULL CHECK (kind IN ('closed_test','usability')),
  category text NOT NULL,
  reward_cents integer NOT NULL CHECK (reward_cents BETWEEN 500 AND 50000),
  seats integer NOT NULL CHECK (seats BETWEEN 1 AND 200),
  duration_days integer NOT NULL CHECK (duration_days BETWEEN 1 AND 45),
  countries text[] NOT NULL DEFAULT '{}',
  minimum_age integer NOT NULL DEFAULT 18 CHECK (minimum_age >= 18),
  maximum_age integer NOT NULL DEFAULT 100 CHECK (maximum_age >= minimum_age),
  gender text NOT NULL DEFAULT 'any',
  required_interests text[] NOT NULL DEFAULT '{}',
  invite_url text NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','recruiting','active','completed','canceled')),
  funded_cents integer NOT NULL DEFAULT 0 CHECK (funded_cents >= 0),
  allocated_cents integer NOT NULL DEFAULT 0 CHECK (allocated_cents >= 0 AND allocated_cents <= reward_cents * seats),
  app_mode text NOT NULL CHECK (app_mode IN ('sandbox','live')),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (kind <> 'closed_test' OR (platform = 'android' AND seats >= 12 AND duration_days >= 14))
);
CREATE INDEX studies_marketplace ON studies(status,app_mode,created_at DESC);
CREATE TABLE study_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  study_id uuid NOT NULL REFERENCES studies(id),
  position integer NOT NULL,
  instruction text NOT NULL,
  UNIQUE(study_id,position)
);
CREATE TABLE applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  study_id uuid NOT NULL REFERENCES studies(id),
  tester_id uuid NOT NULL REFERENCES users(id),
  status text NOT NULL DEFAULT 'applied' CHECK (status IN ('applied','accepted','rejected')),
  note text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(study_id,tester_id)
);
CREATE TABLE participations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid NOT NULL UNIQUE REFERENCES applications(id),
  study_id uuid NOT NULL REFERENCES studies(id),
  tester_id uuid NOT NULL REFERENCES users(id),
  status text NOT NULL DEFAULT 'accepted' CHECK (status IN ('accepted','active','submitted','approved','rejected','disputed')),
  started_at timestamptz,
  submitted_at timestamptz,
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(study_id,tester_id)
);
CREATE INDEX participations_owner ON participations(tester_id,status);
CREATE TABLE check_ins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  participation_id uuid NOT NULL REFERENCES participations(id),
  day date NOT NULL,
  note text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(participation_id,day)
);
CREATE TABLE task_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  participation_id uuid NOT NULL REFERENCES participations(id),
  task_id uuid NOT NULL REFERENCES study_tasks(id),
  feedback text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(participation_id,task_id)
);
CREATE TABLE payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  study_id uuid NOT NULL REFERENCES studies(id),
  provider text NOT NULL CHECK (provider IN ('sandbox','stripe')),
  provider_id text UNIQUE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','succeeded','exception')),
  quote jsonb NOT NULL,
  total_cents integer NOT NULL CHECK (total_cents > 0),
  currency text NOT NULL DEFAULT 'USD' CHECK (currency = 'USD'),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX one_successful_payment_per_study ON payments(study_id) WHERE status = 'succeeded';
CREATE TABLE webhook_events (
  provider text NOT NULL,
  event_id text NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(provider,event_id)
);
CREATE TABLE journal_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference text NOT NULL UNIQUE,
  kind text NOT NULL CHECK (kind IN ('funding','reward','payout','refund','reversal')),
  study_id uuid NOT NULL REFERENCES studies(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE journal_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id uuid NOT NULL REFERENCES journal_transactions(id),
  account text NOT NULL,
  amount_cents integer NOT NULL CHECK (amount_cents <> 0)
);
CREATE INDEX journal_by_transaction ON journal_entries(transaction_id);
CREATE FUNCTION prevent_journal_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Journal is append-only';
END;
$$;
CREATE TRIGGER journal_entries_immutable BEFORE UPDATE OR DELETE ON journal_entries FOR EACH ROW EXECUTE FUNCTION prevent_journal_mutation();
CREATE TRIGGER journal_transactions_immutable BEFORE UPDATE OR DELETE ON journal_transactions FOR EACH ROW EXECUTE FUNCTION prevent_journal_mutation();
CREATE FUNCTION check_journal_balance() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE tid uuid;
BEGIN
  IF TG_TABLE_NAME = 'journal_transactions' THEN
    tid := NEW.id;
  ELSE
    tid := NEW.transaction_id;
  END IF;
  IF (SELECT count(*) FROM journal_entries WHERE transaction_id = tid) < 2
     OR (SELECT coalesce(sum(amount_cents),0) FROM journal_entries WHERE transaction_id = tid) <> 0 THEN
    RAISE EXCEPTION 'Unbalanced journal';
  END IF;
  RETURN NULL;
END;
$$;
CREATE CONSTRAINT TRIGGER journal_balance_entries AFTER INSERT ON journal_entries DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_journal_balance();
CREATE CONSTRAINT TRIGGER journal_balance_transactions AFTER INSERT ON journal_transactions DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_journal_balance();
CREATE TABLE rewards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  participation_id uuid NOT NULL UNIQUE REFERENCES participations(id),
  tester_id uuid NOT NULL REFERENCES users(id),
  study_id uuid NOT NULL REFERENCES studies(id),
  amount_cents integer NOT NULL CHECK (amount_cents > 0),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','paid','failed')),
  provider_id text UNIQUE,
  app_mode text NOT NULL CHECK (app_mode IN ('sandbox','live')),
  created_at timestamptz NOT NULL DEFAULT now(),
  paid_at timestamptz
);
CREATE TABLE disputes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  participation_id uuid NOT NULL UNIQUE REFERENCES participations(id),
  tester_id uuid NOT NULL REFERENCES users(id),
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_key text NOT NULL UNIQUE,
  kind text NOT NULL,
  payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','done','failed')),
  attempts integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid REFERENCES users(id),
  action text NOT NULL,
  entity_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
