-- ═══════════════════════════════════════════════════════════════════
-- 006: Canonical Identity Fix — Email Reconciliation + Full Registration
-- ═══════════════════════════════════════════════════════════════════
-- Fixes the root cause: auth.users.email must use normalized phone.
-- All existing @internal.local emails are updated to normalized format.
-- Duplicate auth users (same phone, different format) are merged.
-- Customer registration RPC added for the new registration form.
-- Safe to re-run (idempotent — uses IF NOT EXISTS / ON CONFLICT / DROP).
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
  IF v_clean LIKE '2%' AND length(v_clean) = 12 THEN
    RETURN v_clean;
  END IF;
  RETURN v_clean;
END;
$$;

-- ─── Ensure runtime_identities table exists ──────────────────────
CREATE TABLE IF NOT EXISTS runtime_identities (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone            TEXT,
  normalized_phone TEXT UNIQUE NOT NULL,
  auth_user_id     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  is_active        BOOLEAN DEFAULT true,
  last_login_at    TIMESTAMPTZ DEFAULT now(),
  created_at       TIMESTAMPTZ DEFAULT now(),
  updated_at       TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ri_normalized_phone ON runtime_identities(normalized_phone);
CREATE INDEX IF NOT EXISTS idx_ri_auth_user     ON runtime_identities(auth_user_id);

ALTER TABLE runtime_identities ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ri_select_own ON runtime_identities;
CREATE POLICY ri_select_own ON runtime_identities
  FOR SELECT USING (auth_user_id = auth.uid());

-- ─── Ensure runtime_actors table exists ──────────────────────────
CREATE TABLE IF NOT EXISTS runtime_actors (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  identity_id UUID NOT NULL REFERENCES runtime_identities(id) ON DELETE CASCADE,
  actor_type  TEXT NOT NULL CHECK (actor_type IN ('employee', 'customer', 'executive', 'operational_owner')),
  actor_id    UUID,
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
-- PHASE 1: Fix auth.users.email — normalize all @internal.local emails
-- ═══════════════════════════════════════════════════════════════════
-- This is the ROOT CAUSE fix: all auth user emails must use the
-- canonical 2010xxxxxxxx format so that phone normalization produces
-- the same auth user regardless of input format.
--
-- Handles duplicates by keeping the most recently active auth user
-- per normalized phone and re-linking runtime_identities to it.
-- ═══════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_merged INT := 0;
  v_employee_relinks INT := 0;
  v_customer_relinks INT := 0;
  v_updated INT := 0;
BEGIN
  -- Step 1: Handle duplicate auth users (same normalized phone, different raw emails)
  -- Rank: already correct email → has employee → has customer → last active → created.
  -- Keep rank 1 per normalized phone, merge the rest.
  WITH normed AS (
    SELECT
      au.id,
      au.email,
      _normalize_eg_phone(SPLIT_PART(au.email, '@', 1)) AS norm_phone,
      (EXISTS (SELECT 1 FROM employees e WHERE e.auth_user_id = au.id)) AS has_employee,
      (EXISTS (SELECT 1 FROM customers c WHERE c.auth_user_id = au.id)) AS has_customer,
      au.last_sign_in_at,
      au.created_at
    FROM auth.users au
    WHERE au.email LIKE '%@internal.local'
      AND _normalize_eg_phone(SPLIT_PART(au.email, '@', 1)) != ''
  ),
  ranked AS (
    SELECT *,
      ROW_NUMBER() OVER (
        PARTITION BY norm_phone
        ORDER BY
          (email = CONCAT(norm_phone, '@internal.local')) DESC,
          has_employee DESC,
          has_customer DESC,
          last_sign_in_at DESC NULLS LAST,
          created_at DESC
      ) AS rn
    FROM normed
  ),
  -- Re-link runtime_identities from removed → keeper
  identity_update AS (
    UPDATE runtime_identities ri
    SET auth_user_id = k.id,
        updated_at = now()
    FROM ranked k, ranked r
    WHERE k.norm_phone = r.norm_phone AND k.rn = 1 AND r.rn > 1
      AND ri.auth_user_id = r.id
    RETURNING k.id AS keeper_id, r.id AS removed_id
  ),
  -- Re-link employees from removed → keeper
  employee_update AS (
    UPDATE employees e
    SET auth_user_id = iu.keeper_id
    FROM identity_update iu
    WHERE e.auth_user_id = iu.removed_id
    RETURNING 1
  ),
  -- Re-link customers from removed → keeper
  customer_update AS (
    UPDATE customers c
    SET auth_user_id = iu.keeper_id
    FROM identity_update iu
    WHERE c.auth_user_id = iu.removed_id
    RETURNING 1
  ),
  -- Rename removed auth users' emails to unique placeholders (frees up normalized email)
  rename_exec AS (
    UPDATE auth.users au
    SET email = 'x_removed_' || r.id || '@internal.local',
        raw_app_meta_data = COALESCE(au.raw_app_meta_data, '{}'::jsonb) ||
          jsonb_build_object('original_email', au.email, 'merged_into', k.id::TEXT)
    FROM ranked k, ranked r
    WHERE k.norm_phone = r.norm_phone AND k.rn = 1 AND r.rn > 1
      AND au.id = r.id
    RETURNING 1
  )
  SELECT
    (SELECT COUNT(*) FROM identity_update),
    (SELECT COUNT(*) FROM employee_update),
    (SELECT COUNT(*) FROM customer_update)
  INTO v_merged, v_employee_relinks, v_customer_relinks;

  -- Step 2: Update remaining @internal.local users to normalized format (no conflicts now)
  WITH to_update AS (
    SELECT
      au.id,
      au.email,
      _normalize_eg_phone(SPLIT_PART(au.email, '@', 1)) AS norm_phone
    FROM auth.users au
    WHERE au.email LIKE '%@internal.local'
      AND _normalize_eg_phone(SPLIT_PART(au.email, '@', 1)) != ''
      AND au.email NOT LIKE 'x_removed_%@internal.local'
      AND au.email != CONCAT(_normalize_eg_phone(SPLIT_PART(au.email, '@', 1)), '@internal.local')
  )
  UPDATE auth.users au2
  SET email = CONCAT(tu.norm_phone, '@internal.local'),
      raw_app_meta_data = COALESCE(au2.raw_app_meta_data, '{}'::jsonb) ||
        jsonb_build_object('original_email', tu.email, 'email_normalized', true)
  FROM to_update tu
  WHERE au2.id = tu.id;

  GET DIAGNOSTICS v_updated = ROW_COUNT;

  RAISE NOTICE '[auth-email-fix] Merged % duplicate auth users (re-linked identities, employees, customers)',
    v_merged;
  RAISE NOTICE '[auth-email-fix] Re-linked % employee records, % customer records',
    v_employee_relinks, v_customer_relinks;
  RAISE NOTICE '[auth-email-fix] Updated % auth users to normalized email',
    v_updated;
END;
$$;

-- ═══════════════════════════════════════════════════════════════════
-- PHASE 2: Backfill runtime_identities from all sources
-- ═══════════════════════════════════════════════════════════════════

-- 2A: From employees
INSERT INTO runtime_identities (phone, normalized_phone, auth_user_id, is_active)
SELECT
  e.phone,
  _normalize_eg_phone(e.phone),
  e.auth_user_id,
  COALESCE(e.is_active, true)
FROM employees e
WHERE e.phone IS NOT NULL AND e.phone != ''
  AND _normalize_eg_phone(e.phone) != ''
ON CONFLICT (normalized_phone) DO UPDATE SET
  auth_user_id = COALESCE(runtime_identities.auth_user_id, EXCLUDED.auth_user_id),
  phone        = CASE WHEN runtime_identities.phone IS NULL THEN EXCLUDED.phone ELSE runtime_identities.phone END,
  is_active    = EXCLUDED.is_active,
  updated_at   = now();

-- 2B: From customers
INSERT INTO runtime_identities (phone, normalized_phone, auth_user_id, is_active)
SELECT
  c.phone,
  _normalize_eg_phone(c.phone),
  c.auth_user_id,
  COALESCE(c.is_active, true)
FROM customers c
WHERE c.phone IS NOT NULL AND c.phone != ''
  AND _normalize_eg_phone(c.phone) != ''
ON CONFLICT (normalized_phone) DO UPDATE SET
  auth_user_id = COALESCE(runtime_identities.auth_user_id, EXCLUDED.auth_user_id),
  phone        = CASE WHEN runtime_identities.phone IS NULL THEN EXCLUDED.phone ELSE runtime_identities.phone END,
  is_active    = EXCLUDED.is_active,
  updated_at   = now();

-- 2C: From auth.users metadata
INSERT INTO runtime_identities (phone, normalized_phone, auth_user_id, is_active)
SELECT
  au.raw_user_meta_data->>'phone',
  _normalize_eg_phone(COALESCE(au.raw_user_meta_data->>'phone', SPLIT_PART(au.email, '@', 1))),
  au.id,
  true
FROM auth.users au
LEFT JOIN runtime_identities ri ON ri.auth_user_id = au.id
WHERE ri.id IS NULL
  AND (
    (au.raw_user_meta_data->>'phone' IS NOT NULL AND au.raw_user_meta_data->>'phone' != '')
    OR (au.email LIKE '%@internal.local')
  )
  AND _normalize_eg_phone(COALESCE(au.raw_user_meta_data->>'phone', SPLIT_PART(au.email, '@', 1))) != ''
ON CONFLICT (normalized_phone) DO UPDATE SET
  auth_user_id = COALESCE(runtime_identities.auth_user_id, EXCLUDED.auth_user_id),
  updated_at   = now();

-- 2D: Orphan employees (no auth link yet)
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
-- PHASE 3: Backfill runtime_actors
-- ═══════════════════════════════════════════════════════════════════

-- 3A: Employee actors
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

-- 3B: Customer actors
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
-- PHASE 3C: Customer operational tables (structured addresses + GPS)
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS runtime_customer_profiles (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id      UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  normalized_phone TEXT,
  alternate_phone  TEXT,
  notes            TEXT,
  is_active        BOOLEAN DEFAULT true,
  created_at       TIMESTAMPTZ DEFAULT now(),
  updated_at       TIMESTAMPTZ DEFAULT now(),
  UNIQUE(customer_id)
);

CREATE INDEX IF NOT EXISTS idx_rcp_customer ON runtime_customer_profiles(customer_id);
CREATE INDEX IF NOT EXISTS idx_rcp_norm     ON runtime_customer_profiles(normalized_phone);

ALTER TABLE runtime_customer_profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rcp_select_own ON runtime_customer_profiles;
CREATE POLICY rcp_select_own ON runtime_customer_profiles
  FOR SELECT USING (
    customer_id IN (SELECT c.id FROM customers c WHERE c.auth_user_id = auth.uid())
  );
DROP POLICY IF EXISTS rcp_insert_own ON runtime_customer_profiles;
CREATE POLICY rcp_insert_own ON runtime_customer_profiles
  FOR INSERT WITH CHECK (
    customer_id IN (SELECT c.id FROM customers c WHERE c.auth_user_id = auth.uid())
  );

CREATE TABLE IF NOT EXISTS runtime_addresses (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id     UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  governorate     TEXT NOT NULL,
  region          TEXT NOT NULL,
  address_detail  TEXT,
  latitude        DOUBLE PRECISION,
  longitude       DOUBLE PRECISION,
  is_primary      BOOLEAN DEFAULT true,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_raddr_customer  ON runtime_addresses(customer_id);
CREATE INDEX IF NOT EXISTS idx_raddr_gov       ON runtime_addresses(governorate);
CREATE UNIQUE INDEX IF NOT EXISTS idx_raddr_one_primary ON runtime_addresses(customer_id) WHERE is_primary = true;

ALTER TABLE runtime_addresses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS raddr_select_own ON runtime_addresses;
CREATE POLICY raddr_select_own ON runtime_addresses
  FOR SELECT USING (
    customer_id IN (SELECT c.id FROM customers c WHERE c.auth_user_id = auth.uid())
  );
DROP POLICY IF EXISTS raddr_insert_own ON runtime_addresses;
CREATE POLICY raddr_insert_own ON runtime_addresses
  FOR INSERT WITH CHECK (
    customer_id IN (SELECT c.id FROM customers c WHERE c.auth_user_id = auth.uid())
  );

CREATE TABLE IF NOT EXISTS runtime_locations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id     UUID REFERENCES customers(id) ON DELETE CASCADE,
  address_id      UUID REFERENCES runtime_addresses(id) ON DELETE SET NULL,
  latitude        DOUBLE PRECISION NOT NULL,
  longitude       DOUBLE PRECISION NOT NULL,
  source          TEXT DEFAULT 'registration',
  accuracy        DOUBLE PRECISION,
  captured_at     TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rloc_customer ON runtime_locations(customer_id);
CREATE INDEX IF NOT EXISTS idx_rloc_captured ON runtime_locations(captured_at);

ALTER TABLE runtime_locations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rloc_select_own ON runtime_locations;
CREATE POLICY rloc_select_own ON runtime_locations
  FOR SELECT USING (
    customer_id IN (SELECT c.id FROM customers c WHERE c.auth_user_id = auth.uid())
  );
DROP POLICY IF EXISTS rloc_insert_own ON runtime_locations;
CREATE POLICY rloc_insert_own ON runtime_locations
  FOR INSERT WITH CHECK (
    customer_id IN (SELECT c.id FROM customers c WHERE c.auth_user_id = auth.uid())
  );

-- ═══════════════════════════════════════════════════════════════════
-- PHASE 4: Re-create all RPCs with canonical phone handling
-- ═══════════════════════════════════════════════════════════════════

-- 4A: runtime_login_resolve — the canonical login RPC
-- Called AFTER GoTrue auth. Uses normalized_phone, preserves original phone format.
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
  v_existing_id  UUID;
  v_existing_phone TEXT;
BEGIN
  IF v_auth_user_id IS NULL THEN
    RETURN jsonb_build_object('error', 'not_authenticated');
  END IF;

  -- Check if identity already exists for this normalized_phone
  SELECT id, phone INTO v_existing_id, v_existing_phone
  FROM runtime_identities
  WHERE normalized_phone = p_normalized_phone;

  IF v_existing_id IS NULL THEN
    -- Create new identity with normalized phone
    INSERT INTO runtime_identities (phone, normalized_phone, auth_user_id, last_login_at)
    VALUES (p_normalized_phone, p_normalized_phone, v_auth_user_id, now())
    ON CONFLICT (normalized_phone) DO UPDATE SET
      auth_user_id  = COALESCE(runtime_identities.auth_user_id, EXCLUDED.auth_user_id),
      last_login_at = now(),
      updated_at    = now(),
      is_active     = true;
  ELSE
    -- Update existing identity: link auth, update login time, preserve original phone
    UPDATE runtime_identities
    SET
      auth_user_id  = COALESCE(runtime_identities.auth_user_id, v_auth_user_id),
      last_login_at = now(),
      updated_at    = now(),
      is_active     = true
    WHERE id = v_existing_id;
  END IF;

  -- Get identity
  SELECT jsonb_build_object(
    'id', id, 'normalized_phone', normalized_phone,
    'phone', phone, 'auth_user_id', auth_user_id, 'is_active', is_active
  ) INTO v_identity
  FROM runtime_identities
  WHERE auth_user_id = v_auth_user_id
     OR (v_existing_id IS NOT NULL AND id = v_existing_id);

  -- Get employee record
  SELECT jsonb_build_object(
    'id', e.id, 'employee_code', e.employee_code,
    'full_name', e.full_name, 'phone', e.phone,
    'role_code', e.role_code, 'role_name', e.role_name,
    'capabilities', e.capabilities
  ) INTO v_employee
  FROM employees e
  WHERE e.auth_user_id = v_auth_user_id
  LIMIT 1;

  -- Get customer record
  SELECT jsonb_build_object(
    'id', c.id, 'customer_code', c.customer_code,
    'full_name', c.full_name, 'phone', c.phone
  ) INTO v_customer
  FROM customers c
  WHERE c.auth_user_id = v_auth_user_id
  LIMIT 1;

  -- Get active actors
  SELECT jsonb_agg(jsonb_build_object(
    'actor_type', ra.actor_type, 'actor_id', ra.actor_id
  )) INTO v_actors
  FROM runtime_actors ra
  JOIN runtime_identities ri ON ri.id = ra.identity_id
  WHERE (ri.auth_user_id = v_auth_user_id OR ri.id = v_existing_id)
    AND ra.is_active = true;

  -- Also ensure actor links for this auth user
  IF v_employee IS NOT NULL THEN
    INSERT INTO runtime_actors (identity_id, actor_type, actor_id, is_active)
    SELECT COALESCE(v_existing_id, v_identity->>'id')::UUID, 'employee', v_employee->>'id', true
    WHERE NOT EXISTS (
      SELECT 1 FROM runtime_actors
      WHERE actor_type = 'employee' AND actor_id = (v_employee->>'id')::UUID
    )
    ON CONFLICT (actor_type, actor_id) DO UPDATE SET
      identity_id = COALESCE(v_existing_id, (v_identity->>'id')::UUID),
      updated_at = now();
  END IF;

  IF v_customer IS NOT NULL THEN
    INSERT INTO runtime_actors (identity_id, actor_type, actor_id, is_active)
    SELECT COALESCE(v_existing_id, v_identity->>'id')::UUID, 'customer', v_customer->>'id', true
    WHERE NOT EXISTS (
      SELECT 1 FROM runtime_actors
      WHERE actor_type = 'customer' AND actor_id = (v_customer->>'id')::UUID
    )
    ON CONFLICT (actor_type, actor_id) DO UPDATE SET
      identity_id = COALESCE(v_existing_id, (v_identity->>'id')::UUID),
      updated_at = now();
  END IF;

  -- Re-fetch actors after linking
  SELECT jsonb_agg(jsonb_build_object(
    'actor_type', ra.actor_type, 'actor_id', ra.actor_id
  )) INTO v_actors
  FROM runtime_actors ra
  JOIN runtime_identities ri ON ri.id = ra.identity_id
  WHERE (ri.auth_user_id = v_auth_user_id OR ri.id = v_existing_id)
    AND ra.is_active = true;

  -- Determine active actor
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

-- 4B: runtime_ensure_identity — with original phone preservation
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
    'phone', phone, 'auth_user_id', auth_user_id,
    'is_active', is_active, 'last_login_at', last_login_at
  ) INTO v_result;

  RETURN v_result;
END;
$$;

-- 4C: runtime_current_identity
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
    'phone', ri.phone, 'auth_user_id', ri.auth_user_id, 'is_active', ri.is_active
  ) INTO v_result
  FROM runtime_identities ri
  WHERE ri.auth_user_id = v_auth_user_id;

  RETURN v_result;
END;
$$;

-- 4D: runtime_resolve_identity
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
    'phone', phone, 'auth_user_id', auth_user_id, 'is_active', is_active
  ) INTO v_result
  FROM runtime_identities
  WHERE normalized_phone = v_phone;

  RETURN v_result;
END;
$$;

-- 4E: runtime_current_actors
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

-- 4F: current_customer_record
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
  WHERE c.auth_user_id = v_auth_user_id
  LIMIT 1;

  RETURN v_result;
END;
$$;

-- ═══════════════════════════════════════════════════════════════════
-- PHASE 5: Customer Registration RPC
-- ═══════════════════════════════════════════════════════════════════
-- Called AFTER GoTrue signup. Creates runtime_identity + customer actor + customer record.
-- ═══════════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS runtime_create_customer_registration(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS runtime_create_customer_registration(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION);
CREATE OR REPLACE FUNCTION runtime_create_customer_registration(
  p_normalized_phone  TEXT,
  p_full_name         TEXT,
  p_address           TEXT,
  p_customer_type     TEXT DEFAULT 'retail',
  p_governorate       TEXT DEFAULT NULL,
  p_region            TEXT DEFAULT NULL,
  p_phone_raw         TEXT DEFAULT NULL,
  p_latitude          DOUBLE PRECISION DEFAULT NULL,
  p_longitude         DOUBLE PRECISION DEFAULT NULL,
  p_accuracy          DOUBLE PRECISION DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_auth_user_id   UUID := auth.uid();
  v_identity_id    UUID;
  v_customer_id    UUID;
  v_customer_code  TEXT;
  v_profile_id     UUID;
  v_address_id     UUID;
  v_location_id    UUID;
  v_full_address   TEXT;
  v_result         JSONB;
BEGIN
  IF v_auth_user_id IS NULL THEN
    RETURN jsonb_build_object('error', 'not_authenticated');
  END IF;

  -- 1. Create or update runtime_identity
  INSERT INTO runtime_identities (phone, normalized_phone, auth_user_id, is_active, last_login_at)
  VALUES (
    COALESCE(p_phone_raw, p_normalized_phone),
    p_normalized_phone,
    v_auth_user_id,
    true,
    now()
  )
  ON CONFLICT (normalized_phone) DO UPDATE SET
    auth_user_id  = COALESCE(runtime_identities.auth_user_id, EXCLUDED.auth_user_id),
    phone         = COALESCE(runtime_identities.phone, EXCLUDED.phone),
    last_login_at = now(),
    updated_at    = now(),
    is_active     = true
  RETURNING id INTO v_identity_id;

  -- 2. Build full address string
  v_full_address := COALESCE(p_address, '');
  IF p_governorate IS NOT NULL AND p_region IS NOT NULL THEN
    v_full_address := 'محافظة ' || p_governorate || ' - ' || p_region || ' - ' || v_full_address;
  END IF;

  -- 3. Create customer record with full address
  v_customer_code := 'CUST-' || to_char(now(), 'YYYYMMDD') || '-' ||
    upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));

  INSERT INTO customers (customer_code, full_name, phone, address, customer_type, is_active, auth_user_id)
  VALUES (
    v_customer_code,
    p_full_name,
    COALESCE(p_phone_raw, p_normalized_phone),
    v_full_address,
    p_customer_type,
    true,
    v_auth_user_id
  )
  ON CONFLICT (auth_user_id) DO UPDATE SET
    full_name     = EXCLUDED.full_name,
    phone         = EXCLUDED.phone,
    address       = EXCLUDED.address,
    customer_type = EXCLUDED.customer_type,
    updated_at    = now()
  RETURNING id INTO v_customer_id;

  -- 4. Create customer actor link
  INSERT INTO runtime_actors (identity_id, actor_type, actor_id, is_active)
  VALUES (v_identity_id, 'customer', v_customer_id, true)
  ON CONFLICT (actor_type, actor_id) DO UPDATE SET
    identity_id = EXCLUDED.identity_id,
    updated_at  = now();

  -- 5. Create runtime_customer_profile
  INSERT INTO runtime_customer_profiles (customer_id, normalized_phone, is_active)
  VALUES (v_customer_id, p_normalized_phone, true)
  ON CONFLICT (customer_id) DO UPDATE SET
    normalized_phone = EXCLUDED.normalized_phone,
    updated_at       = now()
  RETURNING id INTO v_profile_id;

  -- 6. Create runtime_address (structured governorate/region/GPS)
  IF p_governorate IS NOT NULL OR p_region IS NOT NULL OR p_latitude IS NOT NULL THEN
    -- Upsert: use the partial unique index on (customer_id) WHERE is_primary = true
    INSERT INTO runtime_addresses (customer_id, governorate, region, address_detail, latitude, longitude, is_primary)
    VALUES (
      v_customer_id,
      COALESCE(p_governorate, ''),
      COALESCE(p_region, ''),
      p_address,
      p_latitude,
      p_longitude,
      true
    )
    ON CONFLICT (customer_id) WHERE is_primary = true
    DO UPDATE SET
      governorate    = COALESCE(EXCLUDED.governorate, runtime_addresses.governorate),
      region         = COALESCE(EXCLUDED.region, runtime_addresses.region),
      address_detail = COALESCE(EXCLUDED.address_detail, runtime_addresses.address_detail),
      latitude       = COALESCE(EXCLUDED.latitude, runtime_addresses.latitude),
      longitude      = COALESCE(EXCLUDED.longitude, runtime_addresses.longitude),
      updated_at     = now()
    RETURNING id INTO v_address_id;
  END IF;

  -- 7. Create runtime_location (GPS capture)
  IF p_latitude IS NOT NULL AND p_longitude IS NOT NULL THEN
    INSERT INTO runtime_locations (customer_id, address_id, latitude, longitude, accuracy, source)
    VALUES (v_customer_id, v_address_id, p_latitude, p_longitude, p_accuracy, 'registration')
    RETURNING id INTO v_location_id;
  END IF;

  -- 8. Build result
  SELECT jsonb_build_object(
    'identity_id',     v_identity_id,
    'customer_id',     v_customer_id,
    'profile_id',      v_profile_id,
    'address_id',      v_address_id,
    'location_id',     v_location_id,
    'customer_code',   v_customer_code,
    'full_name',       p_full_name,
    'normalized_phone', p_normalized_phone,
    'status',          'created',
    'customer', jsonb_build_object(
      'id',             v_customer_id,
      'customer_code',  v_customer_code,
      'full_name',      p_full_name,
      'phone',          COALESCE(p_phone_raw, p_normalized_phone),
      'address',        v_full_address,
      'customer_type',  p_customer_type,
      'governorate',    p_governorate,
      'region',         p_region,
      'latitude',       p_latitude,
      'longitude',      p_longitude
    )
  ) INTO v_result;

  RETURN v_result;
END;
$$;

-- ═══════════════════════════════════════════════════════════════════
-- PHASE 6: Rerunnable backfill RPC
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
  v_actor_emp   INT;
  v_actor_cust  INT;
BEGIN
  -- Employees
  INSERT INTO runtime_identities (phone, normalized_phone, auth_user_id, is_active)
  SELECT e.phone, _normalize_eg_phone(e.phone), e.auth_user_id, true
  FROM employees e
  WHERE e.phone IS NOT NULL AND e.phone != ''
    AND _normalize_eg_phone(e.phone) != ''
  ON CONFLICT (normalized_phone) DO UPDATE SET
    auth_user_id = COALESCE(runtime_identities.auth_user_id, EXCLUDED.auth_user_id),
    phone        = CASE WHEN runtime_identities.phone IS NULL THEN EXCLUDED.phone ELSE runtime_identities.phone END,
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
    phone        = CASE WHEN runtime_identities.phone IS NULL THEN EXCLUDED.phone ELSE runtime_identities.phone END,
    updated_at   = now();
  GET DIAGNOSTICS v_cust_count = ROW_COUNT;

  -- Auth users via metadata/email
  INSERT INTO runtime_identities (phone, normalized_phone, auth_user_id, is_active)
  SELECT
    COALESCE(au.raw_user_meta_data->>'phone', SPLIT_PART(au.email, '@', 1)),
    _normalize_eg_phone(COALESCE(au.raw_user_meta_data->>'phone', SPLIT_PART(au.email, '@', 1))),
    au.id, true
  FROM auth.users au
  LEFT JOIN runtime_identities ri ON ri.auth_user_id = au.id
  WHERE ri.id IS NULL
    AND _normalize_eg_phone(COALESCE(au.raw_user_meta_data->>'phone', SPLIT_PART(au.email, '@', 1))) != ''
  ON CONFLICT (normalized_phone) DO UPDATE SET
    auth_user_id = COALESCE(runtime_identities.auth_user_id, EXCLUDED.auth_user_id),
    updated_at   = now();
  GET DIAGNOSTICS v_auth_count = ROW_COUNT;

  -- Orphan employees (no auth)
  INSERT INTO runtime_identities (phone, normalized_phone, is_active)
  SELECT e.phone, _normalize_eg_phone(e.phone), false
  FROM employees e
  LEFT JOIN runtime_identities ri ON ri.normalized_phone = _normalize_eg_phone(e.phone)
  WHERE ri.id IS NULL AND e.phone IS NOT NULL AND e.phone != ''
  ON CONFLICT (normalized_phone) DO NOTHING;
  GET DIAGNOSTICS v_orphan_count = ROW_COUNT;

  -- Employee actors
  INSERT INTO runtime_actors (identity_id, actor_type, actor_id, is_active)
  SELECT ri.id, 'employee', e.id, COALESCE(e.is_active, true)
  FROM employees e
  JOIN runtime_identities ri ON ri.normalized_phone = _normalize_eg_phone(e.phone)
  LEFT JOIN runtime_actors ra ON ra.actor_type = 'employee' AND ra.actor_id = e.id
  WHERE ra.id IS NULL
  ON CONFLICT (actor_type, actor_id) DO UPDATE SET
    identity_id = EXCLUDED.identity_id,
    updated_at  = now();
  GET DIAGNOSTICS v_actor_emp = ROW_COUNT;

  -- Customer actors
  INSERT INTO runtime_actors (identity_id, actor_type, actor_id, is_active)
  SELECT ri.id, 'customer', c.id, COALESCE(c.is_active, true)
  FROM customers c
  JOIN runtime_identities ri ON ri.normalized_phone = _normalize_eg_phone(c.phone)
  LEFT JOIN runtime_actors ra ON ra.actor_type = 'customer' AND ra.actor_id = c.id
  WHERE ra.id IS NULL
  ON CONFLICT (actor_type, actor_id) DO UPDATE SET
    identity_id = EXCLUDED.identity_id,
    updated_at  = now();
  GET DIAGNOSTICS v_actor_cust = ROW_COUNT;

  RETURN jsonb_build_object(
    'employees_backfilled', v_emp_count,
    'customers_backfilled', v_cust_count,
    'auth_users_backfilled', v_auth_count,
    'orphans_created', v_orphan_count,
    'employee_actors', v_actor_emp,
    'customer_actors', v_actor_cust
  );
END;
$$;

-- ═══════════════════════════════════════════════════════════════════
-- REPORT
-- ═══════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_identities INT;
  v_actors     INT;
  v_auth_ok    INT;
  v_auth_bad   INT;
BEGIN
  SELECT COUNT(*) INTO v_identities FROM runtime_identities;
  SELECT COUNT(*) INTO v_actors FROM runtime_actors;
  SELECT COUNT(*) INTO v_auth_ok FROM auth.users WHERE email LIKE '201%';
  SELECT COUNT(*) INTO v_auth_bad FROM auth.users WHERE email LIKE '%@internal.local' AND email NOT LIKE '201%';

  RAISE NOTICE '═══════════════════════════════════════════';
  RAISE NOTICE '006 MIGRATION COMPLETE';
  RAISE NOTICE '═══════════════════════════════════════════';
  RAISE NOTICE 'runtime_identities: %', v_identities;
  RAISE NOTICE 'runtime_actors:     %', v_actors;
  RAISE NOTICE 'auth.users with canonical email: %', v_auth_ok;
  RAISE NOTICE 'auth.users needing fix:          %', v_auth_bad;
  IF v_auth_bad > 0 THEN
    RAISE NOTICE '⚠ Some auth users still have non-canonical emails.';
    RAISE NOTICE '⚠ They will use the fallback login path until corrected.';
  END IF;
  RAISE NOTICE '═══════════════════════════════════════════';
END;
$$;
