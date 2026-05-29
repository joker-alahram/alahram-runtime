import pg from 'pg';
const { Client } = pg;
const c = new Client({
  host: 'aws-0-eu-west-1.pooler.supabase.com',
  port: 6543, database: 'postgres',
  user: 'postgres.teffdegicyfdowveqqvw',
  password: 'Yasser1983@@##',
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 15000,
});
await c.connect();

// Set a known password for a test account
const PHONE = '01066197010'; // ياسر توفيق
const PASSWORD = '123456';

// First test the crypt function
const testHash = await c.query("SELECT crypt($1, gen_salt('bf')) AS hash", [PASSWORD]);
const hash = testHash.rows[0].hash;
console.log('Generated bcrypt hash for "' + PASSWORD + '":', hash);

// Update the password for ياسر توفيق
await c.query("UPDATE runtime_users SET password_hash = $1 WHERE phone = $2", [hash, PHONE]);
console.log('Updated password for', PHONE);

// Verify it works
const verify = await c.query("SELECT crypt($1, password_hash) = password_hash AS match FROM runtime_users WHERE phone = $2", [PASSWORD, PHONE]);
console.log('Verification:', verify.rows[0].match ? 'MATCH' : 'NO MATCH');

await c.end();
