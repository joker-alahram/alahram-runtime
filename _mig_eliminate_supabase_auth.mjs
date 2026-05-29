import pg from 'pg';
const pool = new pg.Pool({
  connectionString: 'postgres://postgres.teffdegicyfdowveqqvw:Yasser1983%40%40%23%23@aws-0-eu-west-1.pooler.supabase.com:6543/postgres',
  ssl: { rejectUnauthorized: false },
  max: 1
});

async function main() {
  try {
    console.log('=== ELIMINATING SUPABASE AUTH DEPENDENCIES ===\n');

    // 1. Create runtime_has_capability — token-based capability check
    console.log('1. Creating runtime_has_capability...');
    await pool.query(`
      CREATE OR REPLACE FUNCTION public.runtime_has_capability(p_runtime_token text, p_capability text)
      RETURNS boolean
      LANGUAGE plpgsql
      SECURITY DEFINER
      SET search_path TO 'public', 'extensions'
      AS $$
      DECLARE
        v_employee_id uuid;
      BEGIN
        SELECT e.id INTO v_employee_id
        FROM runtime_sessions rs
        JOIN runtime_users ru ON ru.id = rs.user_id
        JOIN runtime_actors ra ON ra.user_id = ru.id AND ra.actor_type = 'employee'
        JOIN employees e ON e.id = ra.actor_id AND e.is_active = true
        WHERE rs.token = p_runtime_token AND rs.is_active = true AND rs.expires_at > now();

        RETURN COALESCE(
          (SELECT capabilities ? p_capability
           FROM runtime_employee_permissions
           WHERE employee_id = v_employee_id),
          false
        );
      END;
      $$;
    `);
    console.log('   ✓ runtime_has_capability created');

    // 2. Create runtime_employee_record — token-based employee record
    console.log('2. Creating runtime_employee_record...');
    await pool.query(`
      CREATE OR REPLACE FUNCTION public.runtime_employee_record(p_runtime_token text)
      RETURNS jsonb
      LANGUAGE plpgsql
      SECURITY DEFINER
      SET search_path TO 'public'
      AS $$
      DECLARE
        v_employee_id uuid;
        v_result jsonb;
      BEGIN
        SELECT e.id INTO v_employee_id
        FROM runtime_sessions rs
        JOIN runtime_users ru ON ru.id = rs.user_id
        JOIN runtime_actors ra ON ra.user_id = ru.id AND ra.actor_type = 'employee'
        JOIN employees e ON e.id = ra.actor_id AND e.is_active = true
        WHERE rs.token = p_runtime_token AND rs.is_active = true AND rs.expires_at > now();

        IF v_employee_id IS NULL THEN
          RETURN NULL;
        END IF;

        SELECT jsonb_build_object(
          'id', e.id, 'employee_code', e.employee_code,
          'full_name', e.full_name, 'phone', e.phone,
          'role_code', r.role_code, 'role_name', r.role_name,
          'capabilities', rep.capabilities
        ) INTO v_result
        FROM employees e
        JOIN employee_roles er ON er.employee_id = e.id AND er.is_active = true
        JOIN roles r ON r.id = er.role_id
        JOIN runtime_employee_permissions rep ON rep.employee_id = e.id
        WHERE e.id = v_employee_id
        LIMIT 1;

        RETURN v_result;
      END;
      $$;
    `);
    console.log('   ✓ runtime_employee_record created');

    // 3. Create runtime_identity_id — token-based identity resolution
    console.log('3. Creating runtime_identity_id...');
    await pool.query(`
      CREATE OR REPLACE FUNCTION public.runtime_identity_id(p_runtime_token text)
      RETURNS uuid
      LANGUAGE plpgsql
      SECURITY DEFINER
      SET search_path TO 'public'
      AS $$
      DECLARE
        v_actor_id uuid;
      BEGIN
        SELECT ra.actor_id INTO v_actor_id
        FROM runtime_sessions rs
        JOIN runtime_users ru ON ru.id = rs.user_id
        JOIN runtime_actors ra ON ra.user_id = ru.id
        WHERE rs.token = p_runtime_token AND rs.is_active = true AND rs.expires_at > now()
        LIMIT 1;

        RETURN v_actor_id;
      END;
      $$;
    `);
    console.log('   ✓ runtime_identity_id created');

    // 4. Fix change_employee_password — update runtime_users instead of auth.users
    console.log('4. Fixing change_employee_password...');
    await pool.query(`
      CREATE OR REPLACE FUNCTION public.change_employee_password(p_employee_id uuid, p_new_password text)
      RETURNS jsonb
      LANGUAGE plpgsql
      SECURITY DEFINER
      SET search_path TO 'public', 'extensions'
      AS $$
      DECLARE
        v_auth_user_id uuid;
        v_runtime_user_id uuid;
        v_result jsonb;
      BEGIN
        -- Get linked auth_user_id and runtime_user_id
        SELECT e.auth_user_id, ra.user_id
        INTO v_auth_user_id, v_runtime_user_id
        FROM employees e
        LEFT JOIN runtime_actors ra ON ra.actor_id = e.id AND ra.actor_type = 'employee'
        WHERE e.id = p_employee_id;

        -- Update application tables
        UPDATE employees SET password = p_new_password WHERE id = p_employee_id;

        -- Update runtime_users (bcrypt) — this is the actual auth source
        IF v_runtime_user_id IS NOT NULL THEN
          UPDATE runtime_users
          SET password_hash = crypt(p_new_password, gen_salt('bf', 10)),
              updated_at = now()
          WHERE id = v_runtime_user_id;
        END IF;

        v_result := jsonb_build_object(
          'success', true,
          'runtime_updated', v_runtime_user_id IS NOT NULL
        );
        RETURN v_result;
      END;
      $$;
    `);
    console.log('   ✓ change_employee_password fixed');

    // 5. Fix set_employee_account_status — remove auth.users dependency
    console.log('5. Fixing set_employee_account_status...');
    await pool.query(`
      CREATE OR REPLACE FUNCTION public.set_employee_account_status(p_employee_id uuid, p_action text)
      RETURNS jsonb
      LANGUAGE plpgsql
      SECURITY DEFINER
      SET search_path TO 'public', 'extensions'
      AS $$
      DECLARE
        v_runtime_user_id uuid;
        v_result jsonb;
      BEGIN
        SELECT ra.user_id INTO v_runtime_user_id
        FROM employees e
        LEFT JOIN runtime_actors ra ON ra.actor_id = e.id AND ra.actor_type = 'employee'
        WHERE e.id = p_employee_id;

        IF p_action = 'activate' THEN
          UPDATE employees SET is_active = true WHERE id = p_employee_id;
          IF v_runtime_user_id IS NOT NULL THEN
            UPDATE runtime_users SET is_active = true, updated_at = now() WHERE id = v_runtime_user_id;
          END IF;
          v_result := jsonb_build_object('success', true, 'status', 'activated');
        ELSIF p_action = 'deactivate' THEN
          UPDATE employees SET is_active = false WHERE id = p_employee_id;
          IF v_runtime_user_id IS NOT NULL THEN
            UPDATE runtime_users SET is_active = false, updated_at = now() WHERE id = v_runtime_user_id;
          END IF;
          v_result := jsonb_build_object('success', true, 'status', 'deactivated');
        ELSIF p_action = 'lock' THEN
          IF v_runtime_user_id IS NOT NULL THEN
            UPDATE runtime_users SET is_active = false, updated_at = now() WHERE id = v_runtime_user_id;
          END IF;
          v_result := jsonb_build_object('success', true, 'status', 'locked');
        ELSIF p_action = 'unlock' THEN
          IF v_runtime_user_id IS NOT NULL THEN
            UPDATE runtime_users SET is_active = true, updated_at = now() WHERE id = v_runtime_user_id;
          END IF;
          v_result := jsonb_build_object('success', true, 'status', 'unlocked');
        ELSE
          v_result := jsonb_build_object('success', false, 'error', 'Invalid action');
        END IF;
        RETURN v_result;
      END;
      $$;
    `);
    console.log('   ✓ set_employee_account_status fixed');

    // 6. Verify the new functions exist
    console.log('\n6. Verifying new functions...');
    const verify = await pool.query(`
      SELECT proname FROM pg_proc
      WHERE pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
        AND proname IN ('runtime_has_capability', 'runtime_employee_record', 'runtime_identity_id',
                        'change_employee_password', 'set_employee_account_status')
        AND prokind = 'f'
      ORDER BY proname
    `);
    verify.rows.forEach(r => console.log('   ✓', r.proname));
    console.log('\n=== DB MIGRATION COMPLETE ===');

  } catch (e) {
    console.error('ERROR:', e.message);
  } finally {
    await pool.end();
  }
}

main();
