-- ═══════════════════════════════════════════════════════════════════
-- 007: Full Local Runtime User System
-- ═══════════════════════════════════════════════════════════════════
-- Replaces auth.users as the canonical identity source.
-- Uses pgcrypto (bcrypt) for password hashing.
-- runtime_users is the ONLY canonical user identity.
-- auth.users becomes a temporary JWT provider only.
-- Safe to re-run (idempotent — IF NOT EXISTS / DROP IF EXISTS / ON CONFLICT).
-- ═══════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════
-- ENABLE pgcrypto (bcrypt support)
-- ═══════════════════════════════════════════════════════════════════
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ═══════════════════════════════════════════════════════════════════
-- HELPER: Normalize Egyptian phone server-side
-- ═══════════════════════════════════════════════════════════════════
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
  IF length(v_clean) = 11 THEN
    RETURN '2' || v_clean;
  END IF;
  RETURN v_clean;
END;
$$;

-- ═══════════════════════════════════════════════════════════════════
-- TABLE: runtime_users — Canonical user identity
-- ═══════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS runtime_users (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone           TEXT NOT NULL,
  normalized_phone TEXT UNIQUE NOT NULL,
  password_hash   TEXT NOT NULL,
  full_name       TEXT NOT NULL,
  is_active       BOOLEAN DEFAULT TRUE,
  last_login_at   TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ru_normalized_phone ON runtime_users(normalized_phone);
CREATE INDEX IF NOT EXISTS idx_ru_phone ON runtime_users(phone);

-- RLS: All access through SECURITY DEFINER RPCs only
ALTER TABLE runtime_users ENABLE ROW LEVEL SECURITY;

-- ═══════════════════════════════════════════════════════════════════
-- TABLE: runtime_user_profiles
-- ═══════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS runtime_user_profiles (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES runtime_users(id) ON DELETE CASCADE,
  activity_type TEXT,
  governorate   TEXT,
  region        TEXT,
  address_line  TEXT,
  notes         TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id)
);

CREATE INDEX IF NOT EXISTS idx_rup_user_id ON runtime_user_profiles(user_id);

ALTER TABLE runtime_user_profiles ENABLE ROW LEVEL SECURITY;

-- ═══════════════════════════════════════════════════════════════════
-- TABLE: runtime_user_locations
-- ═══════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS runtime_user_locations (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES runtime_users(id) ON DELETE CASCADE,
  latitude    DOUBLE PRECISION NOT NULL,
  longitude   DOUBLE PRECISION NOT NULL,
  accuracy    DOUBLE PRECISION,
  captured_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rul_user_id ON runtime_user_locations(user_id);

ALTER TABLE runtime_user_locations ENABLE ROW LEVEL SECURITY;

-- ═══════════════════════════════════════════════════════════════════
-- TABLE: runtime_sessions — Custom session management
-- ═══════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS runtime_sessions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES runtime_users(id) ON DELETE CASCADE,
  active_actor_id UUID,
  token           TEXT NOT NULL UNIQUE,
  device_info     TEXT,
  is_active       BOOLEAN DEFAULT TRUE,
  expires_at      TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '30 days'),
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  last_active_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rs_token ON runtime_sessions(token);
CREATE INDEX IF NOT EXISTS idx_rs_user_id ON runtime_sessions(user_id);

ALTER TABLE runtime_sessions ENABLE ROW LEVEL SECURITY;

-- ═══════════════════════════════════════════════════════════════════
-- MODIFY EXISTING runtime_actors: Add user_id + new actor types
-- The old identity_id column remains but is deprecated.
-- ═══════════════════════════════════════════════════════════════════
ALTER TABLE runtime_actors ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES runtime_users(id) ON DELETE CASCADE;
ALTER TABLE runtime_actors ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Legacy identity_id is deprecated; user_id is now canonical
ALTER TABLE runtime_actors ALTER COLUMN identity_id DROP NOT NULL;

-- Expand actor_type check constraint to include all new types
ALTER TABLE runtime_actors DROP CONSTRAINT IF EXISTS runtime_actors_actor_type_check;
ALTER TABLE runtime_actors ADD CONSTRAINT runtime_actors_actor_type_check
  CHECK (actor_type IN ('customer','employee','supervisor','manager','executive','admin','operational_owner'));

-- ═══════════════════════════════════════════════════════════════════
-- RPC: runtime_user_login — Verify password via bcrypt, create session
-- ═══════════════════════════════════════════════════════════════════
DROP FUNCTION IF EXISTS runtime_user_login(TEXT, TEXT);
CREATE OR REPLACE FUNCTION runtime_user_login(
  p_phone     TEXT,
  p_password  TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_phone      TEXT := _normalize_eg_phone(p_phone);
  v_user       runtime_users%ROWTYPE;
  v_session_id UUID;
  v_session_token TEXT;
  v_actors     JSONB;
  v_employee   JSONB;
  v_customer   JSONB;
  v_active_actor JSONB;
BEGIN
  -- Find user by normalized phone
  SELECT * INTO v_user FROM runtime_users WHERE normalized_phone = v_phone;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'user_not_found', 'message', 'لم يتم العثور على حساب بهذا الرقم');
  END IF;

  IF NOT v_user.is_active THEN
    RETURN jsonb_build_object('error', 'user_inactive', 'message', 'الحساب غير نشط');
  END IF;

  -- Verify password using bcrypt (pgcrypto)
  IF v_user.password_hash IS NULL OR v_user.password_hash = '' THEN
    RETURN jsonb_build_object('error', 'no_password', 'message', 'يرجى تعيين كلمة المرور أولاً');
  END IF;

  IF crypt(p_password, v_user.password_hash) != v_user.password_hash THEN
    RETURN jsonb_build_object('error', 'invalid_password', 'message', 'رقم الهاتف أو كلمة المرور غير صحيحة');
  END IF;

  -- Update last login
  UPDATE runtime_users SET last_login_at = NOW() WHERE id = v_user.id;

  -- Create session
  INSERT INTO runtime_sessions (user_id, token, is_active, expires_at)
  VALUES (v_user.id, encode(gen_random_bytes(32), 'hex'), TRUE, NOW() + INTERVAL '30 days')
  RETURNING id, token INTO v_session_id, v_session_token;

  -- Get actors
  SELECT jsonb_agg(jsonb_build_object(
    'id', ra.id, 'actor_type', ra.actor_type,
    'actor_id', ra.actor_id, 'is_active', ra.is_active
  )) INTO v_actors
  FROM runtime_actors ra
  WHERE ra.user_id = v_user.id AND ra.is_active = TRUE;

  -- Get employee record (via roles junction)
  SELECT jsonb_build_object(
    'id', e.id, 'employee_code', e.employee_code,
    'full_name', e.full_name, 'phone', e.phone,
    'role_code', r.role_code, 'role_name', r.role_name,
    'capabilities', (
      SELECT jsonb_agg(c.capability_code ORDER BY c.capability_code)
      FROM role_capabilities rc
      JOIN capabilities c ON c.id = rc.capability_id AND c.is_active = TRUE
      WHERE rc.role_id = er.role_id
    )
  ) INTO v_employee
  FROM employees e
  JOIN runtime_actors ra ON ra.actor_id = e.id AND ra.actor_type = 'employee'
  LEFT JOIN employee_roles er ON er.employee_id = e.id AND er.is_active = TRUE
  LEFT JOIN roles r ON r.id = er.role_id
  WHERE ra.user_id = v_user.id AND ra.is_active = TRUE
  LIMIT 1;

  -- Get customer record (with tier via customer_tier_assignments)
  SELECT jsonb_build_object(
    'id', c.id, 'customer_code', c.customer_code,
    'full_name', c.customer_name, 'phone', c.phone,
    'address', c.address, 'customer_type', c.customer_type,
    'tier_id', cta.tier_id
  ) INTO v_customer
  FROM customers c
  JOIN runtime_actors ra ON ra.actor_id = c.id AND ra.actor_type = 'customer'
  LEFT JOIN LATERAL (
    SELECT tier_id FROM customer_tier_assignments
    WHERE customer_id = c.id AND is_active = TRUE
    ORDER BY starts_at DESC NULLS LAST
    LIMIT 1
  ) cta ON TRUE
  WHERE ra.user_id = v_user.id AND ra.is_active = TRUE
  LIMIT 1;

  -- Determine active actor (employee wins if both exist)
  IF v_employee IS NOT NULL THEN
    v_active_actor := jsonb_build_object('type', 'employee', 'record', v_employee);
  ELSIF v_customer IS NOT NULL THEN
    v_active_actor := jsonb_build_object('type', 'customer', 'record', v_customer);
  END IF;

  RETURN jsonb_build_object(
    'user', jsonb_build_object(
      'id', v_user.id, 'phone', v_user.phone,
      'normalized_phone', v_user.normalized_phone,
      'full_name', v_user.full_name, 'is_active', v_user.is_active
    ),
    'session', jsonb_build_object(
      'id', v_session_id, 'token', v_session_token,
      'expires_at', (NOW() + INTERVAL '30 days')::TEXT
    ),
    'actors', COALESCE(v_actors, jsonb_build_array()),
    'active_actor', v_active_actor,
    'employee', v_employee,
    'customer', v_customer
  );
END;
$$;

-- ═══════════════════════════════════════════════════════════════════
-- RPC: runtime_user_register — Full registration
-- ═══════════════════════════════════════════════════════════════════
DROP FUNCTION IF EXISTS runtime_user_register(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION);
CREATE OR REPLACE FUNCTION runtime_user_register(
  p_phone         TEXT,
  p_password      TEXT,
  p_full_name     TEXT,
  p_activity_type TEXT DEFAULT NULL,
  p_governorate   TEXT DEFAULT NULL,
  p_region        TEXT DEFAULT NULL,
  p_address_line  TEXT DEFAULT NULL,
  p_latitude      DOUBLE PRECISION DEFAULT NULL,
  p_longitude     DOUBLE PRECISION DEFAULT NULL,
  p_accuracy      DOUBLE PRECISION DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_phone         TEXT := _normalize_eg_phone(p_phone);
  v_user_id       UUID;
  v_session_token TEXT;
  v_session_id    UUID;
  v_existing      UUID;
  v_customer_id   UUID;
  v_customer_code TEXT;
BEGIN
  -- Validate phone
  IF v_phone = '' OR v_phone IS NULL THEN
    RETURN jsonb_build_object('error', 'invalid_phone', 'message', 'رقم الهاتف غير صحيح');
  END IF;

  IF length(v_phone) != 12 OR NOT (v_phone LIKE '201%') THEN
    RETURN jsonb_build_object('error', 'invalid_phone', 'message', 'رقم الهاتف يجب أن يكون رقم مصري صحيح');
  END IF;

  -- Check existing
  SELECT id INTO v_existing FROM runtime_users WHERE normalized_phone = v_phone;
  IF FOUND THEN
    RETURN jsonb_build_object('error', 'phone_exists', 'message', 'هذا الرقم مسجل بالفعل');
  END IF;

  -- Create runtime_user with bcrypt hashed password
  INSERT INTO runtime_users (phone, normalized_phone, password_hash, full_name)
  VALUES (p_phone, v_phone, crypt(p_password, gen_salt('bf')), p_full_name)
  RETURNING id INTO v_user_id;

  -- Create profile
  INSERT INTO runtime_user_profiles (user_id, activity_type, governorate, region, address_line)
  VALUES (v_user_id, p_activity_type, p_governorate, p_region, p_address_line);

  -- Create location if provided
  IF p_latitude IS NOT NULL AND p_longitude IS NOT NULL THEN
    INSERT INTO runtime_user_locations (user_id, latitude, longitude, accuracy)
    VALUES (v_user_id, p_latitude, p_longitude, p_accuracy);
  END IF;

  -- Create customer record
  INSERT INTO customers (customer_code, customer_name, phone, address, customer_type, is_active)
  VALUES (
    'CUST-' || upper(substr(md5(gen_random_uuid()::TEXT), 1, 8)),
    p_full_name,
    v_phone,
    CASE
      WHEN p_governorate IS NOT NULL AND p_region IS NOT NULL
        THEN 'محافظة ' || p_governorate || ' - ' || p_region || ' - ' || COALESCE(p_address_line, '')
      WHEN p_address_line IS NOT NULL THEN p_address_line
      ELSE ''
    END,
    COALESCE(p_activity_type, 'retail'),
    true
  )
  RETURNING id, customer_code INTO v_customer_id, v_customer_code;

  -- Create actor
  INSERT INTO runtime_actors (user_id, actor_type, actor_id, is_active)
  VALUES (v_user_id, 'customer', v_customer_id, TRUE);

  -- Create session
  INSERT INTO runtime_sessions (user_id, token, is_active, expires_at)
  VALUES (v_user_id, encode(gen_random_bytes(32), 'hex'), TRUE, NOW() + INTERVAL '30 days')
  RETURNING id, token INTO v_session_id, v_session_token;

  RETURN jsonb_build_object(
    'user', jsonb_build_object(
      'id', v_user_id, 'phone', v_phone,
      'normalized_phone', v_phone, 'full_name', p_full_name
    ),
    'session', jsonb_build_object(
      'id', v_session_id, 'token', v_session_token,
      'expires_at', (NOW() + INTERVAL '30 days')::TEXT
    ),
    'customer', jsonb_build_object(
      'id', v_customer_id, 'customer_code', v_customer_code,
      'full_name', p_full_name, 'phone', v_phone
    ),
    'actor', jsonb_build_object(
      'type', 'customer', 'actor_id', v_customer_id
    )
  );
END;
$$;

-- ═══════════════════════════════════════════════════════════════════
-- RPC: runtime_user_verify_session — Check token validity + return data
-- ═══════════════════════════════════════════════════════════════════
DROP FUNCTION IF EXISTS runtime_user_verify_session(TEXT);
CREATE OR REPLACE FUNCTION runtime_user_verify_session(
  p_token TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_session    runtime_sessions%ROWTYPE;
  v_user       runtime_users%ROWTYPE;
  v_actors     JSONB;
  v_employee   JSONB;
  v_customer   JSONB;
  v_active_actor JSONB;
  v_profile    runtime_user_profiles%ROWTYPE;
BEGIN
  IF p_token IS NULL OR p_token = '' THEN
    RETURN jsonb_build_object('error', 'no_token', 'message', 'لا يوجد رمز جلسة');
  END IF;

  -- Find session
  SELECT * INTO v_session FROM runtime_sessions
  WHERE token = p_token AND is_active = TRUE AND expires_at > NOW();

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'session_expired', 'message', 'انتهت الجلسة');
  END IF;

  -- Update last active
  UPDATE runtime_sessions SET last_active_at = NOW() WHERE id = v_session.id;

  -- Get user
  SELECT * INTO v_user FROM runtime_users WHERE id = v_session.user_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'user_not_found', 'message', 'المستخدم غير موجود');
  END IF;

  -- Get profile
  SELECT * INTO v_profile FROM runtime_user_profiles WHERE user_id = v_user.id;

  -- Get actors
  SELECT jsonb_agg(jsonb_build_object(
    'id', ra.id, 'actor_type', ra.actor_type,
    'actor_id', ra.actor_id, 'is_active', ra.is_active
  )) INTO v_actors
  FROM runtime_actors ra
  WHERE ra.user_id = v_user.id AND ra.is_active = TRUE;

  -- Get employee record (via roles junction)
  SELECT jsonb_build_object(
    'id', e.id, 'employee_code', e.employee_code,
    'full_name', e.full_name, 'phone', e.phone,
    'role_code', r.role_code, 'role_name', r.role_name,
    'capabilities', (
      SELECT jsonb_agg(c.capability_code ORDER BY c.capability_code)
      FROM role_capabilities rc
      JOIN capabilities c ON c.id = rc.capability_id AND c.is_active = TRUE
      WHERE rc.role_id = er.role_id
    )
  ) INTO v_employee
  FROM employees e
  JOIN runtime_actors ra ON ra.actor_id = e.id AND ra.actor_type = 'employee'
  LEFT JOIN employee_roles er ON er.employee_id = e.id AND er.is_active = TRUE
  LEFT JOIN roles r ON r.id = er.role_id
  WHERE ra.user_id = v_user.id AND ra.is_active = TRUE
  LIMIT 1;

  -- Get customer record (with tier via customer_tier_assignments)
  SELECT jsonb_build_object(
    'id', c.id, 'customer_code', c.customer_code,
    'full_name', c.customer_name, 'phone', c.phone,
    'address', c.address, 'customer_type', c.customer_type,
    'tier_id', cta.tier_id
  ) INTO v_customer
  FROM customers c
  JOIN runtime_actors ra ON ra.actor_id = c.id AND ra.actor_type = 'customer'
  LEFT JOIN LATERAL (
    SELECT tier_id FROM customer_tier_assignments
    WHERE customer_id = c.id AND is_active = TRUE
    ORDER BY starts_at DESC NULLS LAST
    LIMIT 1
  ) cta ON TRUE
  WHERE ra.user_id = v_user.id AND ra.is_active = TRUE
  LIMIT 1;

  -- Determine active actor
  IF v_session.active_actor_id IS NOT NULL THEN
    -- Use stored active actor preference
    IF v_employee IS NOT NULL AND EXISTS (
      SELECT 1 FROM runtime_actors WHERE id = v_session.active_actor_id AND actor_type = 'employee'
    ) THEN
      v_active_actor := jsonb_build_object('type', 'employee', 'record', v_employee);
    ELSIF v_customer IS NOT NULL AND EXISTS (
      SELECT 1 FROM runtime_actors WHERE id = v_session.active_actor_id AND actor_type = 'customer'
    ) THEN
      v_active_actor := jsonb_build_object('type', 'customer', 'record', v_customer);
    END IF;
  END IF;

  -- Fallback: employee wins if both exist
  IF v_active_actor IS NULL THEN
    IF v_employee IS NOT NULL THEN
      v_active_actor := jsonb_build_object('type', 'employee', 'record', v_employee);
    ELSIF v_customer IS NOT NULL THEN
      v_active_actor := jsonb_build_object('type', 'customer', 'record', v_customer);
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'user', jsonb_build_object(
      'id', v_user.id, 'phone', v_user.phone,
      'normalized_phone', v_user.normalized_phone,
      'full_name', v_user.full_name, 'is_active', v_user.is_active
    ),
    'session', jsonb_build_object(
      'id', v_session.id, 'token', v_session.token,
      'expires_at', v_session.expires_at::TEXT,
      'active_actor_id', v_session.active_actor_id
    ),
    'profile', CASE WHEN v_profile.id IS NOT NULL THEN jsonb_build_object(
      'activity_type', v_profile.activity_type,
      'governorate', v_profile.governorate,
      'region', v_profile.region,
      'address_line', v_profile.address_line
    ) ELSE NULL END,
    'actors', COALESCE(v_actors, jsonb_build_array()),
    'active_actor', v_active_actor,
    'employee', v_employee,
    'customer', v_customer
  );
END;
$$;

-- ═══════════════════════════════════════════════════════════════════
-- RPC: runtime_user_logout — Deactivate session
-- ═══════════════════════════════════════════════════════════════════
DROP FUNCTION IF EXISTS runtime_user_logout(TEXT);
CREATE OR REPLACE FUNCTION runtime_user_logout(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  UPDATE runtime_sessions
  SET is_active = FALSE
  WHERE token = p_token;
  RETURN jsonb_build_object('success', TRUE);
END;
$$;

-- ═══════════════════════════════════════════════════════════════════
-- RPC: runtime_user_switch_actor — Change active actor in session
-- ═══════════════════════════════════════════════════════════════════
DROP FUNCTION IF EXISTS runtime_user_switch_actor(TEXT, UUID);
CREATE OR REPLACE FUNCTION runtime_user_switch_actor(
  p_token       TEXT,
  p_actor_id    UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  UPDATE runtime_sessions
  SET active_actor_id = p_actor_id
  WHERE token = p_token AND is_active = TRUE;
  RETURN jsonb_build_object('success', TRUE);
END;
$$;

-- ═══════════════════════════════════════════════════════════════════
-- BACKFILL: Migrate existing employees into runtime_users
-- ═══════════════════════════════════════════════════════════════════
DROP FUNCTION IF EXISTS runtime_backfill_users();
CREATE OR REPLACE FUNCTION runtime_backfill_users()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_emp_count     INT := 0;
  v_cust_count    INT := 0;
  v_auth_count    INT := 0;
  v_duplicate_count INT := 0;
  v_skip_count    INT := 0;
  v_actor_emp     INT := 0;
  v_actor_cust    INT := 0;
  v_total         INT;
  v_report        JSONB;
  v_duplicates    JSONB;
BEGIN
  -- ── Phase 1: Backfill from employees (copy encrypted_password from auth.users when available) ──
  INSERT INTO runtime_users (phone, normalized_phone, password_hash, full_name, is_active)
  SELECT
    e.phone,
    _normalize_eg_phone(e.phone),
    COALESCE(au.encrypted_password, crypt('123321', gen_salt('bf'))),
    COALESCE(e.full_name, e.employee_code, 'موظف'),
    COALESCE(e.is_active, TRUE)
  FROM employees e
  LEFT JOIN auth.users au ON au.id = e.auth_user_id
  WHERE e.phone IS NOT NULL AND e.phone != ''
    AND _normalize_eg_phone(e.phone) != ''
  ON CONFLICT (normalized_phone) DO NOTHING;
  GET DIAGNOSTICS v_emp_count = ROW_COUNT;

  -- ── Phase 2: Backfill from customers (skip if already in runtime_users) ──
  INSERT INTO runtime_users (phone, normalized_phone, password_hash, full_name, is_active)
  SELECT
    c.phone,
    _normalize_eg_phone(c.phone),
    COALESCE(au.encrypted_password, crypt('123321', gen_salt('bf'))),
    COALESCE(c.customer_name, 'عميل'),
    COALESCE(c.is_active, TRUE)
  FROM customers c
  LEFT JOIN auth.users au ON au.id = c.auth_user_id
  WHERE c.phone IS NOT NULL AND c.phone != ''
    AND _normalize_eg_phone(c.phone) != ''
    AND NOT EXISTS (
      SELECT 1 FROM runtime_users ru WHERE ru.normalized_phone = _normalize_eg_phone(c.phone)
    )
  ON CONFLICT (normalized_phone) DO NOTHING;
  GET DIAGNOSTICS v_cust_count = ROW_COUNT;

  -- ── Phase 3: Backfill from auth.users (try phone from metadata or email) ──
  INSERT INTO runtime_users (phone, normalized_phone, password_hash, full_name, is_active)
  SELECT
    COALESCE(au.raw_user_meta_data->>'phone', split_part(au.email, '@', 1)),
    _normalize_eg_phone(COALESCE(au.raw_user_meta_data->>'phone', split_part(au.email, '@', 1))),
    au.encrypted_password,
    COALESCE(au.raw_user_meta_data->>'full_name', au.raw_user_meta_data->>'name', 'مستخدم'),
    TRUE
  FROM auth.users au
  WHERE (
    (au.raw_user_meta_data->>'phone' IS NOT NULL AND au.raw_user_meta_data->>'phone' != '')
    OR (au.email LIKE '%@internal.local')
  )
    AND NOT EXISTS (
      SELECT 1 FROM runtime_users ru
      WHERE ru.normalized_phone = _normalize_eg_phone(
        COALESCE(au.raw_user_meta_data->>'phone', split_part(au.email, '@', 1))
      )
    )
  ON CONFLICT (normalized_phone) DO NOTHING;
  GET DIAGNOSTICS v_auth_count = ROW_COUNT;

  -- ── Phase 4: Link runtime_actors to runtime_users ──
  -- Employee actors
  UPDATE runtime_actors ra
  SET user_id = ru.id
  FROM employees e
  JOIN runtime_users ru ON ru.normalized_phone = _normalize_eg_phone(e.phone)
  WHERE ra.actor_type = 'employee'
    AND ra.actor_id = e.id
    AND ra.user_id IS NULL;
  GET DIAGNOSTICS v_actor_emp = ROW_COUNT;

  -- Customer actors
  UPDATE runtime_actors ra
  SET user_id = ru.id
  FROM customers c
  JOIN runtime_users ru ON ru.normalized_phone = _normalize_eg_phone(c.phone)
  WHERE ra.actor_type = 'customer'
    AND ra.actor_id = c.id
    AND ra.user_id IS NULL;
  GET DIAGNOSTICS v_actor_cust = ROW_COUNT;

  -- ── Phase 5: Create runtime_actors for users that don't have any yet ──
  -- Employee actors
  INSERT INTO runtime_actors (user_id, identity_id, actor_type, actor_id, is_active)
  SELECT ru.id, ri.id, 'employee', e.id, COALESCE(e.is_active, TRUE)
  FROM employees e
  JOIN runtime_users ru ON ru.normalized_phone = _normalize_eg_phone(e.phone)
  LEFT JOIN runtime_identities ri ON ri.normalized_phone = ru.normalized_phone
  WHERE NOT EXISTS (
    SELECT 1 FROM runtime_actors ra
    WHERE ra.actor_type = 'employee' AND ra.actor_id = e.id
  )
  ON CONFLICT (actor_type, actor_id) DO UPDATE SET
    user_id = EXCLUDED.user_id,
    updated_at = NOW();

  -- Customer actors
  INSERT INTO runtime_actors (user_id, identity_id, actor_type, actor_id, is_active)
  SELECT ru.id, ri.id, 'customer', c.id, COALESCE(c.is_active, TRUE)
  FROM customers c
  JOIN runtime_users ru ON ru.normalized_phone = _normalize_eg_phone(c.phone)
  LEFT JOIN runtime_identities ri ON ri.normalized_phone = ru.normalized_phone
  WHERE NOT EXISTS (
    SELECT 1 FROM runtime_actors ra
    WHERE ra.actor_type = 'customer' AND ra.actor_id = c.id
  )
  ON CONFLICT (actor_type, actor_id) DO UPDATE SET
    user_id = EXCLUDED.user_id,
    updated_at = NOW();

  -- ── Detect phones that appear in BOTH employees AND customers (potential duplicates) ──
  SELECT jsonb_agg(jsonb_build_object(
    'normalized_phone', d.phone,
    'employee_id', d.emp_id,
    'employee_name', d.emp_name,
    'customer_id', d.cust_id,
    'customer_name', d.cust_name
  )) INTO v_duplicates
  FROM (
    SELECT
      _normalize_eg_phone(e.phone) AS phone,
      e.id AS emp_id, e.full_name AS emp_name,
      c.id AS cust_id, c.customer_name AS cust_name
    FROM employees e
    JOIN customers c ON _normalize_eg_phone(e.phone) = _normalize_eg_phone(c.phone)
    WHERE e.phone IS NOT NULL AND c.phone IS NOT NULL
  ) d;
  v_duplicate_count := jsonb_array_length(COALESCE(v_duplicates, jsonb_build_array()));

  SELECT count(*) INTO v_total FROM runtime_users;

  RETURN jsonb_build_object(
    'employees_backfilled', v_emp_count,
    'customers_backfilled', v_cust_count,
    'auth_users_backfilled', v_auth_count,
    'actor_employees_linked', v_actor_emp,
    'actor_customers_linked', v_actor_cust,
    'total_runtime_users', v_total,
    'duplicates_detected', v_duplicate_count,
    'duplicates', COALESCE(v_duplicates, jsonb_build_array()),
    'status', 'complete',
    'note', 'تم نقل البيانات بنجاح. تم نسخ كلمات المرور من auth.users للمستخدمين الموجودين. المستخدمون الجدد فقط كلمة المرور المؤقتة: 123321'
  );
END;
$$;

-- ═══════════════════════════════════════════════════════════════════
-- REPORT: Migration summary
-- ═══════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_users       INT;
  v_profiles    INT;
  v_locations   INT;
  v_actors      INT;
  v_sessions    INT;
  v_identities  INT;
BEGIN
  SELECT count(*) INTO v_users      FROM runtime_users;
  SELECT count(*) INTO v_profiles   FROM runtime_user_profiles;
  SELECT count(*) INTO v_locations  FROM runtime_user_locations;
  SELECT count(*) INTO v_actors     FROM runtime_actors WHERE user_id IS NOT NULL;
  SELECT count(*) INTO v_sessions   FROM runtime_sessions;
  SELECT count(*) INTO v_identities FROM runtime_identities;
  RAISE NOTICE '[runtime-user-system] ====== MIGRATION 007 SUMMARY ======';
  RAISE NOTICE '[runtime-user-system] runtime_users:        %', v_users;
  RAISE NOTICE '[runtime-user-system] runtime_user_profiles: %', v_profiles;
  RAISE NOTICE '[runtime-user-system] runtime_user_locations:%', v_locations;
  RAISE NOTICE '[runtime-user-system] runtime_actors (linked):%', v_actors;
  RAISE NOTICE '[runtime-user-system] runtime_sessions:      %', v_sessions;
  RAISE NOTICE '[runtime-user-system] runtime_identities (legacy):%', v_identities;
  RAISE NOTICE '[runtime-user-system] ===================================';
END;
$$;

-- ═══════════════════════════════════════════════════════════════════
-- SESSION HARDENING: Additional indexes + stale cleanup
-- ═══════════════════════════════════════════════════════════════════

-- Composite index for session lookups by token + active status
CREATE INDEX IF NOT EXISTS idx_rs_token_active ON runtime_sessions(token, is_active);

-- Index for cleaning expired sessions
CREATE INDEX IF NOT EXISTS idx_rs_expires_at ON runtime_sessions(expires_at);

-- Index for user session enumeration
CREATE INDEX IF NOT EXISTS idx_rs_user_id_active ON runtime_sessions(user_id, is_active);

-- Stale session cleanup function
DROP FUNCTION IF EXISTS runtime_cleanup_stale_sessions(INT);
CREATE OR REPLACE FUNCTION runtime_cleanup_stale_sessions(
  p_max_hours INT DEFAULT 72
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_expired   INT := 0;
  v_stale     INT := 0;
  v_total     INT := 0;
BEGIN
  UPDATE runtime_sessions SET is_active = FALSE WHERE is_active = TRUE AND expires_at < NOW();
  GET DIAGNOSTICS v_expired = ROW_COUNT;

  UPDATE runtime_sessions SET is_active = FALSE
  WHERE is_active = TRUE AND last_active_at < NOW() - (p_max_hours || ' hours')::INTERVAL;
  GET DIAGNOSTICS v_stale = ROW_COUNT;

  DELETE FROM runtime_sessions WHERE is_active = FALSE AND created_at < NOW() - INTERVAL '30 days';
  GET DIAGNOSTICS v_total = ROW_COUNT;

  RETURN jsonb_build_object(
    'expired_deactivated', v_expired,
    'stale_deactivated', v_stale,
    'old_deleted', v_total,
    'remaining_active', (SELECT count(*) FROM runtime_sessions WHERE is_active = TRUE)
  );
END;
$$;
