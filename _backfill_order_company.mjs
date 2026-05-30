import https from 'https';
const KEY = 'sb_publishable_LjwmfFbqsPz35tnUB0IddA_jLXPFZR6';
const BASE = 'https://teffdegicyfdowveqqvw.supabase.co/rest/v1';
const h = { apikey: KEY, Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json', Accept: 'application/json' };

function fetch(url, opts) {
  return new Promise((res, rej) => {
    const u = new URL(url);
    const req = https.request({
      hostname: u.hostname, port: 443, path: u.pathname + u.search,
      method: opts?.method || 'GET',
      headers: { ...h, ...(opts?.headers || {}) }
    }, (resp) => {
      let data = '';
      resp.on('data', c => data += c);
      resp.on('end', () => res({ status: resp.statusCode, body: data }));
    });
    req.on('error', rej);
    if (opts?.body) req.write(opts.body);
    req.end();
  });
}

async function main() {
  // Get items with empty company
  const r = await fetch(BASE + '/order_items?select=id,product_id,product_code_snapshot,company_name_snapshot&company_name_snapshot=eq.&limit=20');
  const items = JSON.parse(r.body);
  console.log('Items with empty company: ' + items.length);

  // Get products with their company_name_snapshot now updated
  const pr = await fetch(BASE + '/products?select=id,company_name_snapshot&limit=500');
  const prods = JSON.parse(pr.body);
  const prodMap = {};
  for (const p of prods) prodMap[p.id] = p.company_name_snapshot || '';

  // Update each item
  let updated = 0;
  for (const item of items) {
    const companyName = prodMap[item.product_id];
    if (companyName) {
      const body = JSON.stringify({ company_name_snapshot: companyName });
      const r2 = await fetch(BASE + '/order_items?id=eq.' + item.id, { method: 'PATCH', body });
      if (r2.status === 204) {
        updated++;
        process.stdout.write('.');
      } else {
        console.log('\nFAIL id=' + item.id + ' status=' + r2.status + ' ' + r2.body);
      }
    }
  }
  console.log('\nUpdated: ' + updated);

  // Final verification
  const v = await fetch(BASE + '/order_items?select=company_name_snapshot&company_name_snapshot=eq.&limit=20');
  const rem = JSON.parse(v.body);
  console.log('Remaining empty company: ' + rem.length);

  const v2 = await fetch(BASE + '/order_items?select=product_code_snapshot,product_name_snapshot,company_name_snapshot&limit=500');
  const all = JSON.parse(v2.body);
  const nc = all.filter(i => !i.product_code_snapshot).length;
  const nn = all.filter(i => !i.product_name_snapshot).length;
  const nco = all.filter(i => !i.company_name_snapshot).length;
  console.log('Final: total=' + all.length + ' null_code=' + nc + ' null_name=' + nn + ' null_co=' + nco);
}
main().catch(e => console.error('Error:', e.message));
