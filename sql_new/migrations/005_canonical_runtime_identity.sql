-- ═══════════════════════════════════════════════════════════════════
-- 005: Canonical Runtime Identity — Backfill + Actor Layer + Customer
-- ═══════════════════════════════════════════════════════════════════
-- This migration is SAFE to run multiple times (idempotent).
-- It does NOT drop or destroy any existing data.
-- ═══════════════════════════════════════════════════════════════════

-- ─── Helper: Normalize Egyptian phone server-side ────────────────
DROP FUNCTION IF EXISTS _normalize_eg_phone(TEXT);
CREATE OR REPLACE FUNCTION _normalize_eg_phone(p_phone TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_clean TEXT;
BEGIN
  v_clean := regexp_replace(COALESCE(p_phone, ''), '[^0-9]', '', 'g');
  IF v_clean LIKE '01%' AND length(v_clean) = 11 THEN
    RETURN '2' || v_clean;
  END IF;
  IF v_clean LIKE '201%' AND length(v_clean) = 12 THEN
    RETURN v_clean;
  END IF;
  RETURN v_clean;
END;
$$;

-- ─── Ensure runtime_identities table exists (idempotent) ─────────
CREATE TABLE IF NOT EXISTS runtime_identities (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone           TEXT,
  normalized_phone TEXT UNIQUE NOT NULL,
  auth_user_id    UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  is_active       BOOLEAN DEFAULT true,
  last_login_at   TIMESTAMPTZ DEFAULT now(),
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ri_normalized_phone ON runtime_identities(normalized_phone);
CREATE INDEX IF NOT EXISTS idx_ri_auth_user     ON runtime_identities(auth_user_id);

ALTER TABLE runtime_identities ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ri_select_own ON runtime_identities;
CREATE POLICY ri_select_own ON runtime_identities
  FOR SELECT USING (auth_user_id = auth.uid());

-- ═══════════════════════════════════════════════════════════════════
-- PHASE 1A: Backfill from employees
-- ═══════════════════════════════════════════════════════════════════
INSERT INTO runtime_identities (phone, normalized_phone, auth_user_id, is_active)
SELECT
  e.phone,
  _normalize_eg_phone(e.phone),
  e.auth_user_id,
  (e.is_active OR e.auth_user_id IS NOT NULL)
FROM employees e
WHERE e.phone IS NOT NULL AND e.phone != ''
  AND _normalize_eg_phone(e.phone) != ''
ON CONFLICT (normalized_phone) DO UPDATE SET
  auth_user_id = COALESCE(runtime_identities.auth_user_id, EXCLUDED.auth_user_id),
  phone        = COALESCE(runtime_identities.phone, EXCLUDED.phone),
  is_active    = EXCLUDED.is_active,
  updated_at   = now();

-- ═══════════════════════════════════════════════════════════════════
-- PHASE 1B: Backfill from customers
-- ═══════════════════════════════════════════════════════════════════
INSERT INTO runtime_identities (phone, normalized_phone, auth_user_id, is_active)
SELECT
  c.phone,
  _normalize_eg_phone(c.phone),
  c.auth_user_id,
  (c.is_active OR c.auth_user_id IS NOT NULL)
FROM customers c
WHERE c.phone IS NOT NULL AND c.phone != ''
  AND _normalize_eg_phone(c.phone) != ''
ON CONFLICT (normalized_phone) DO UPDATE SET
  auth_user_id = COALESCE(runtime_identities.auth_user_id, EXCLUDED.auth_user_id),
  phone        = COALESCE(runtime_identities.phone, EXCLUDED.phone),
  is_active    = EXCLUDED.is_active,
  updated_at   = now();

-- ═══════════════════════════════════════════════════════════════════
-- PHASE 1C: Backfill from auth.users (users with no phone in employees/customers)
-- Extract phone from raw_email (e.g., 01002082831@internal.local → 01002082831)
-- ═══════════════════════════════════════════════════════════════════
INSERT INTO runtime_identities (phone, normalized_phone, auth_user_id, is_active)
SELECT
  au.raw_user_meta_data->>'phone',
  _normalize_eg_phone(au.raw_user_meta_data->>'phone'),
  au.id,
  true
FROM auth.users au
LEFT JOIN runtime_identities ri ON ri.auth_user_id = au.id
WHERE ri.id IS NULL
  AND au.raw_user_meta_data->>'phone' IS NOT NULL
  AND au.raw_user_meta_data->>'phone' != ''
ON CONFLICT (normalized_phone) DO UPDATE SET
  auth_user_id = COALESCE(runtime_identities.auth_user_id, EXCLUDED.auth_user_id),
  updated_at   = now();

-- ═══════════════════════════════════════════════════════════════════
-- PHASE 1D: Try to extract phone from auth email (fallback)
-- Handles email = "01002082831@internal.local" → "01002082831"
-- ═══════════════════════════════════════════════════════════════════
INSERT INTO runtime_identities (phone, normalized_phone, auth_user_id, is_active)
SELECT
  split_part(au.email, '@', 1),
  _normalize_eg_phone(split_part(au.email, '@', 1)),
  au.id,
  true
FROM auth.users au
LEFT JOIN runtime_identities ri ON ri.auth_user_id = au.id
WHERE ri.id IS NULL
  AND au.email IS NOT NULL
  AND au.email LIKE '%@internal.local'
  AND _normalize_eg_phone(split_part(au.email, '@', 1)) != ''
ON CONFLICT (normalized_phone) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════
-- PHASE 1E: Ensure employees without any auth link get an identity anyway
-- These users will appear when an admin links them or when they login
-- ═══════════════════════════════════════════════════════════════════
INSERT INTO runtime_identities (phone, normalized_phone, is_active)
SELECT
  e.phone,
  _normalize_eg_phone(e.phone),
  false
FROM employees e
LEFT JOIN runtime_identities ri ON ri.normalized_phone = _normalize_eg_phone(e.phone)
WHERE ri.id IS NULL
  AND e.phone IS NOT NULL AND e.phone != ''
  AND _normalize_eg_phone(e.phone) != ''
ON CONFLICT (normalized_phone) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════
-- REPORT: Identity backfill summary
-- ═══════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_total     INT;
  v_with_auth INT;
  v_orphan    INT;
  v_employee  INT;
  v_customer  INT;
BEGIN
  SELECT count(*) INTO v_total   FROM runtime_identities;
  SELECT count(*) INTO v_with_auth FROM runtime_identities WHERE auth_user_id IS NOT NULL;
  SELECT count(*) INTO v_orphan  FROM runtime_identities WHERE auth_user_id IS NULL;
  RAISE NOTICE '[identity-backfill] runtime_identities: total=%, with_auth=%, orphan=%', v_total, v_with_auth, v_orphan;
  RAISE NOTICE '[identity-backfill] DONE. % identities created/updated.', v_total;
END;
$$;

-- ═══════════════════════════════════════════════════════════════════
-- PHASE 4: runtime_actors table
-- ═══════════════════════════════════════════════════════════════════
-- An identity can have multiple actors (employee, customer, executive...).
-- Each actor links to the actual entity record.
-- ═══════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS runtime_actors (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  identity_id UUID NOT NULL REFERENCES runtime_identities(id) ON DELETE CASCADE,
  actor_type  TEXT NOT NULL CHECK (actor_type IN ('employee', 'customer', 'executive', 'operational_owner')),
  actor_id    UUID,  -- polymorphic FK to employees.id, customers.id, etc.
  is_active   BOOLEAN DEFAULT true,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now(),
  UNIQUE(actor_type, actor_id)
);

CREATE INDEX IF NOT EXISTS idx_ra_identity   ON runtime_actors(identity_id);
CREATE INDEX IF NOT EXISTS idx_ra_actor      ON runtime_actors(actor_type, actor_id);

ALTER TABLE runtime_actors ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ra_select_own ON runtime_actors;
CREATE POLICY ra_select_own ON runtime_actors
  FOR SELECT USING (
    identity_id IN (SELECT id FROM runtime_identities WHERE auth_user_id = auth.uid())
  );

-- ═══════════════════════════════════════════════════════════════════
-- PHASE 4A: Backfill runtime_actors from employees
-- ═══════════════════════════════════════════════════════════════════
INSERT INTO runtime_actors (identity_id, actor_type, actor_id, is_active)
SELECT
  ri.id,
  'employee',
  e.id,
  COALESCE(e.is_active, true)
FROM employees e
JOIN runtime_identities ri ON ri.normalized_phone = _normalize_eg_phone(e.phone)
LEFT JOIN runtime_actors ra ON ra.actor_type = 'employee' AND ra.actor_id = e.id
WHERE ra.id IS NULL
ON CONFLICT (actor_type, actor_id) DO UPDATE SET
  identity_id = EXCLUDED.identity_id,
  is_active   = EXCLUDED.is_active,
  updated_at  = now();

-- ═══════════════════════════════════════════════════════════════════
-- PHASE 4B: Backfill runtime_actors from customers
-- ═══════════════════════════════════════════════════════════════════
INSERT INTO runtime_actors (identity_id, actor_type, actor_id, is_active)
SELECT
  ri.id,
  'customer',
  c.id,
  COALESCE(c.is_active, true)
FROM customers c
JOIN runtime_identities ri ON ri.normalized_phone = _normalize_eg_phone(c.phone)
LEFT JOIN runtime_actors ra ON ra.actor_type = 'customer' AND ra.actor_id = c.id
WHERE ra.id IS NULL
ON CONFLICT (actor_type, actor_id) DO UPDATE SET
  identity_id = EXCLUDED.identity_id,
  is_active   = EXCLUDED.is_active,
  updated_at  = now();

-- ═══════════════════════════════════════════════════════════════════
-- RPC: Get all actors for current identity
-- ═══════════════════════════════════════════════════════════════════
DROP FUNCTION IF EXISTS runtime_current_actors();
CREATE OR REPLACE FUNCTION runtime_current_actors()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_auth_user_id UUID := auth.uid();
  v_result       JSONB;
BEGIN
  IF v_auth_user_id IS NULL THEN
    RETURN jsonb_build_array();
  END IF;

  SELECT jsonb_agg(jsonb_build_object(
    'id',          ra.id,
    'actor_type',  ra.actor_type,
    'actor_id',    ra.actor_id,
    'is_active',   ra.is_active
  )) INTO v_result
  FROM runtime_actors ra
  JOIN runtime_identities ri ON ri.id = ra.identity_id
  WHERE ri.auth_user_id = v_auth_user_id AND ra.is_active = true;

  RETURN COALESCE(v_result, jsonb_build_array());
END;
$$;

-- ═══════════════════════════════════════════════════════════════════
-- RPC: Backfill all identities (can be re-run safely)
-- ═══════════════════════════════════════════════════════════════════
DROP FUNCTION IF EXISTS runtime_backfill_identities();
CREATE OR REPLACE FUNCTION runtime_backfill_identities()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_emp_count   INT;
  v_cust_count  INT;
  v_auth_count  INT;
  v_orphan_count INT;
BEGIN
  -- Employees
  INSERT INTO runtime_identities (phone, normalized_phone, auth_user_id, is_active)
  SELECT e.phone, _normalize_eg_phone(e.phone), e.auth_user_id, true
  FROM employees e
  WHERE e.phone IS NOT NULL AND e.phone != ''
    AND _normalize_eg_phone(e.phone) != ''
  ON CONFLICT (normalized_phone) DO UPDATE SET
    auth_user_id = COALESCE(runtime_identities.auth_user_id, EXCLUDED.auth_user_id),
    updated_at   = now();
  GET DIAGNOSTICS v_emp_count = ROW_COUNT;

  -- Customers
  INSERT INTO runtime_identities (phone, normalized_phone, auth_user_id, is_active)
  SELECT c.phone, _normalize_eg_phone(c.phone), c.auth_user_id, true
  FROM customers c
  WHERE c.phone IS NOT NULL AND c.phone != ''
    AND _normalize_eg_phone(c.phone) != ''
  ON CONFLICT (normalized_phone) DO UPDATE SET
    auth_user_id = COALESCE(runtime_identities.auth_user_id, EXCLUDED.auth_user_id),
    updated_at   = now();
  GET DIAGNOSTICS v_cust_count = ROW_COUNT;

  -- Auth users via metadata
  INSERT INTO runtime_identities (phone, normalized_phone, auth_user_id, is_active)
  SELECT au.raw_user_meta_data->>'phone', _normalize_eg_phone(au.raw_user_meta_data->>'phone'), au.id, true
  FROM auth.users au
  LEFT JOIN runtime_identities ri ON ri.auth_user_id = au.id
  WHERE ri.id IS NULL
    AND au.raw_user_meta_data->>'phone' IS NOT NULL
  ON CONFLICT (normalized_phone) DO UPDATE SET
    auth_user_id = COALESCE(runtime_identities.auth_user_id, EXCLUDED.auth_user_id),
    updated_at   = now();
  GET DIAGNOSTICS v_auth_count = ROW_COUNT;

  -- Orphans: employees without auth
  INSERT INTO runtime_identities (phone, normalized_phone, is_active)
  SELECT e.phone, _normalize_eg_phone(e.phone), false
  FROM employees e
  LEFT JOIN runtime_identities ri ON ri.normalized_phone = _normalize_eg_phone(e.phone)
  WHERE ri.id IS NULL AND e.phone IS NOT NULL AND e.phone != ''
  ON CONFLICT (normalized_phone) DO NOTHING;
  GET DIAGNOSTICS v_orphan_count = ROW_COUNT;

  -- Actors
  INSERT INTO runtime_actors (identity_id, actor_type, actor_id, is_active)
  SELECT ri.id, 'employee', e.id, COALESCE(e.is_active, true)
  FROM employees e
  JOIN runtime_identities ri ON ri.normalized_phone = _normalize_eg_phone(e.phone)
  LEFT JOIN runtime_actors ra ON ra.actor_type = 'employee' AND ra.actor_id = e.id
  WHERE ra.id IS NULL
  ON CONFLICT (actor_type, actor_id) DO UPDATE SET identity_id = EXCLUDED.identity_id, updated_at = now();

  INSERT INTO runtime_actors (identity_id, actor_type, actor_id, is_active)
  SELECT ri.id, 'customer', c.id, COALESCE(c.is_active, true)
  FROM customers c
  JOIN runtime_identities ri ON ri.normalized_phone = _normalize_eg_phone(c.phone)
  LEFT JOIN runtime_actors ra ON ra.actor_type = 'customer' AND ra.actor_id = c.id
  WHERE ra.id IS NULL
  ON CONFLICT (actor_type, actor_id) DO UPDATE SET identity_id = EXCLUDED.identity_id, updated_at = now();

  RETURN jsonb_build_object(
    'employees_backfilled', v_emp_count,
    'customers_backfilled', v_cust_count,
    'auth_users_backfilled', v_auth_count,
    'orphans_created', v_orphan_count
  );
END;
$$;

-- ═══════════════════════════════════════════════════════════════════
-- PHASE 5: Customer Runtime RPC
-- ═══════════════════════════════════════════════════════════════════
DROP FUNCTION IF EXISTS current_customer_record();
CREATE OR REPLACE FUNCTION current_customer_record()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_auth_user_id UUID := auth.uid();
  v_result       JSONB;
BEGIN
  IF v_auth_user_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT jsonb_build_object(
    'id',            c.id,
    'customer_code', c.customer_code,
    'full_name',     c.full_name,
    'phone',         c.phone,
    'address',       c.address,
    'is_active',     c.is_active,
    'customer_type', c.customer_type,
    'tier_id',       c.tier_id
  ) INTO v_result
  FROM customers c
  WHERE c.auth_user_id = v_auth_user_id;

  RETURN v_result;
END;
$$;

-- ═══════════════════════════════════════════════════════════════════
-- UPDATED LOGIN RPC: resolve identity + return all actor options
-- Called AFTER supabase auth login. Returns identity + actors.
-- ═══════════════════════════════════════════════════════════════════
DROP FUNCTION IF EXISTS runtime_login_resolve(TEXT);
CREATE OR REPLACE FUNCTION runtime_login_resolve(p_normalized_phone TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_auth_user_id UUID := auth.uid();
  v_identity     JSONB;
  v_actors       JSONB;
  v_employee     JSONB;
  v_customer     JSONB;
  v_active_actor JSONB;
BEGIN
  IF v_auth_user_id IS NULL THEN
    RETURN jsonb_build_object('error', 'not_authenticated');
  END IF;

  -- Ensure identity exists
  IF p_normalized_phone IS NOT NULL THEN
    INSERT INTO runtime_identities (phone, normalized_phone, auth_user_id, last_login_at)
    VALUES (p_normalized_phone, p_normalized_phone, v_auth_user_id, now())
    ON CONFLICT (normalized_phone) DO UPDATE SET
      auth_user_id  = COALESCE(runtime_identities.auth_user_id, EXCLUDED.auth_user_id),
      last_login_at = now(),
      updated_at    = now(),
      is_active     = true;
  END IF;

  -- Get identity
  SELECT jsonb_build_object(
    'id', id, 'normalized_phone', normalized_phone,
    'auth_user_id', auth_user_id, 'is_active', is_active
  ) INTO v_identity
  FROM runtime_identities
  WHERE auth_user_id = v_auth_user_id;

  -- Get employee record if exists
  SELECT jsonb_build_object(
    'id', e.id, 'employee_code', e.employee_code,
    'full_name', e.full_name, 'phone', e.phone,
    'role_code', e.role_code, 'role_name', e.role_name,
    'capabilities', e.capabilities
  ) INTO v_employee
  FROM employees e
  WHERE e.auth_user_id = v_auth_user_id;

  -- Get customer record if exists
  SELECT jsonb_build_object(
    'id', c.id, 'customer_code', c.customer_code,
    'full_name', c.full_name, 'phone', c.phone
  ) INTO v_customer
  FROM customers c
  WHERE c.auth_user_id = v_auth_user_id;

  -- Get active actors
  SELECT jsonb_agg(jsonb_build_object(
    'actor_type', ra.actor_type, 'actor_id', ra.actor_id
  )) INTO v_actors
  FROM runtime_actors ra
  JOIN runtime_identities ri ON ri.id = ra.identity_id
  WHERE ri.auth_user_id = v_auth_user_id AND ra.is_active = true;

  -- Determine active actor (employee wins if both)
  IF v_employee IS NOT NULL THEN
    v_active_actor := jsonb_build_object('type', 'employee', 'record', v_employee);
  ELSIF v_customer IS NOT NULL THEN
    v_active_actor := jsonb_build_object('type', 'customer', 'record', v_customer);
  END IF;

  RETURN jsonb_build_object(
    'identity',      v_identity,
    'actors',        COALESCE(v_actors, jsonb_build_array()),
    'active_actor',  v_active_actor,
    'employee',      v_employee,
    'customer',      v_customer
  );
END;
$$;

-- ═══════════════════════════════════════════════════════════════════
-- RE-CREATE ensure + resolve RPCs with updated logic
-- ═══════════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS runtime_ensure_identity(TEXT);
CREATE OR REPLACE FUNCTION runtime_ensure_identity(p_normalized_phone TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_auth_user_id UUID := auth.uid();
  v_result       JSONB;
BEGIN
  IF v_auth_user_id IS NULL THEN
    RETURN jsonb_build_object('error', 'not_authenticated');
  END IF;

  INSERT INTO runtime_identities (phone, normalized_phone, auth_user_id, last_login_at)
  VALUES (p_normalized_phone, p_normalized_phone, v_auth_user_id, now())
  ON CONFLICT (normalized_phone) DO UPDATE SET
    auth_user_id  = COALESCE(runtime_identities.auth_user_id, EXCLUDED.auth_user_id),
    last_login_at = now(),
    updated_at    = now(),
    is_active     = true
  RETURNING jsonb_build_object(
    'id', id, 'normalized_phone', normalized_phone,
    'auth_user_id', auth_user_id, 'is_active', is_active,
    'last_login_at', last_login_at
  ) INTO v_result;

  RETURN v_result;
END;
$$;

DROP FUNCTION IF EXISTS runtime_resolve_identity(TEXT);
CREATE OR REPLACE FUNCTION runtime_resolve_identity(p_phone TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_phone  TEXT := _normalize_eg_phone(p_phone);
  v_result JSONB;
BEGIN
  SELECT jsonb_build_object(
    'id', id, 'normalized_phone', normalized_phone,
    'auth_user_id', auth_user_id, 'is_active', is_active
  ) INTO v_result
  FROM runtime_identities
  WHERE normalized_phone = v_phone OR phone = v_phone;

  RETURN v_result;
END;
$$;

DROP FUNCTION IF EXISTS runtime_current_identity();
CREATE OR REPLACE FUNCTION runtime_current_identity()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_auth_user_id UUID := auth.uid();
  v_result       JSONB;
BEGIN
  IF v_auth_user_id IS NULL THEN
    RETURN jsonb_build_object('error', 'not_authenticated');
  END IF;

  SELECT jsonb_build_object(
    'id', ri.id, 'normalized_phone', ri.normalized_phone,
    'auth_user_id', ri.auth_user_id, 'is_active', ri.is_active
  ) INTO v_result
  FROM runtime_identities ri
  WHERE ri.auth_user_id = v_auth_user_id;

  RETURN v_result;
END;
$$;
