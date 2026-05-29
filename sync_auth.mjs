import pg from 'pg';
const pool = new pg.Pool({
  connectionString: 'postgres://postgres.teffdegicyfdowveqqvw:Yasser1983%40%40%23%23@aws-0-eu-west-1.pooler.supabase.com:6543/postgres',
  ssl: { rejectUnauthorized: false }
});

try {
  console.log('=== STARTING SUPABASE AUTH SYNCHRONIZATION ===');

  // 1. Update existing employee passwords in auth.users
  const updateRes = await pool.query(`
    UPDATE auth.users
    SET encrypted_password = crypt('test123', gen_salt('bf', 10)),
        email_confirmed_at = COALESCE(email_confirmed_at, NOW()),
        updated_at = NOW()
    WHERE email IN (
      '201004466887@internal.local',
      '201066197010@internal.local',
      '201002082831@internal.local',
      '201030108501@internal.local',
      '201220800258@internal.local'
    )
  `);
  console.log(`Updated passwords for ${updateRes.rowCount} existing employees in auth.users.`);

  // 2. Define customers to insert
  const customers = [
    {
      phone: '01066190000',
      email: '201066190000@internal.local',
      fullName: 'فادى محمد'
    },
    {
      phone: '01069328266',
      email: '201069328266@internal.local',
      fullName: 'كارن'
    }
  ];

  for (const c of customers) {
    // Check if customer already exists in auth.users
    const checkRes = await pool.query('SELECT id FROM auth.users WHERE email = $1', [c.email]);
    if (checkRes.rows.length === 0) {
      console.log(`Inserting customer ${c.fullName} (${c.email}) into auth.users...`);
      
      const insertRes = await pool.query(`
        INSERT INTO auth.users (
          id, instance_id, email, encrypted_password, email_confirmed_at,
          raw_app_meta_data, raw_user_meta_data, aud, role, created_at, updated_at
        ) VALUES (
          gen_random_uuid(), '00000000-0000-0000-0000-000000000000'::uuid, $1::text,
          crypt('test123', gen_salt('bf', 10)), NOW(),
          '{"provider":"email","providers":["email"]}'::jsonb,
          jsonb_build_object(
            'email', $1::text,
            'phone', $2::text,
            'full_name', $3::text,
            'email_verified', true,
            'phone_verified', false
          ),
          'authenticated', 'authenticated', NOW(), NOW()
        ) RETURNING id
      `, [c.email, c.phone, c.fullName]);
      
      console.log(`✅ Successfully inserted customer ${c.fullName} with ID: ${insertRes.rows[0].id}`);
    } else {
      console.log(`Customer ${c.fullName} already exists in auth.users. Updating password...`);
      await pool.query(`
        UPDATE auth.users
        SET encrypted_password = crypt('test123', gen_salt('bf', 10)),
            updated_at = NOW()
        WHERE email = $1
      `, [c.email]);
    }
  }

  console.log('=== SUPABASE AUTH SYNCHRONIZATION COMPLETE ===');

} catch (e) {
  console.error('ERROR:', e.message);
} finally {
  await pool.end();
}
