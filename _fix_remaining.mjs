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
  // Find remaining items with empty company
  const r = await fetch(BASE + '/order_items?select=id,product_id,product_code_snapshot,company_name_snapshot&company_name_snapshot=eq.&limit=20');
  const items = JSON.parse(r.body);
  console.log('Remaining items: ' + items.length);
  for (const i of items) {
    console.log('  id=' + i.id + ' code=' + i.product_code_snapshot + ' pid=' + i.product_id);
    // Check what the product has for company_name_snapshot
    const pr = await fetch(BASE + '/products?select=id,product_code,company_name_snapshot,company_id&id=eq.' + i.product_id);
    const prods = JSON.parse(pr.body);
    if (prods.length) {
      console.log('    product: code=' + prods[0].product_code + ' company_snap=' + JSON.stringify(prods[0].company_name_snapshot) + ' company_id=' + prods[0].company_id);
      if (prods[0].company_id) {
        // Get company name
        const cr = await fetch(BASE + '/companies?select=id,company_name&id=eq.' + prods[0].company_id);
        const comps = JSON.parse(cr.body);
        if (comps.length) {
          console.log('    company name=' + comps[0].company_name);
          // Update product
          const body = JSON.stringify({ company_name_snapshot: comps[0].company_name });
          const p2 = await fetch(BASE + '/products?id=eq.' + i.product_id, { method: 'PATCH', body });
          console.log('    product PATCH status=' + p2.status);
          // Now update order_item
          const body2 = JSON.stringify({ company_name_snapshot: comps[0].company_name });
          const o2 = await fetch(BASE + '/order_items?id=eq.' + i.id, { method: 'PATCH', body: body2 });
          console.log('    order_item PATCH status=' + o2.status);
        }
      }
    }
  }
}
main().catch(e => console.error('Error:', e.message));
