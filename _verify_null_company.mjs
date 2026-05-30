import https from 'https';
const KEY = 'sb_publishable_LjwmfFbqsPz35tnUB0IddA_jLXPFZR6';
const BASE = 'https://teffdegicyfdowveqqvw.supabase.co/rest/v1';

function fetch(url) {
  return new Promise((res, rej) => {
    const u = new URL(url);
    const req = https.request({
      hostname: u.hostname, port: 443, path: u.pathname + u.search,
      method: 'GET',
      headers: { apikey: KEY, Authorization: 'Bearer ' + KEY, Accept: 'application/json' }
    }, (resp) => {
      let data = '';
      resp.on('data', c => data += c);
      resp.on('end', () => res({ status: resp.statusCode, body: data }));
    });
    req.on('error', rej);
    req.end();
  });
}

async function main() {
  // 1. Check for items where company_name_snapshot equals empty string
  const r1 = await fetch(BASE + '/order_items?select=id,product_id,company_name_snapshot,order_id,product_code_snapshot,product_name_snapshot&company_name_snapshot=eq.&limit=20');
  const empty = JSON.parse(r1.body);
  console.log('Empty string company: ' + empty.length);
  for (const i of empty) {
    console.log('  id=' + i.id + ' company="' + i.company_name_snapshot + '" pid=' + i.product_id + ' code=' + (i.product_code_snapshot||'null'));
  }

  // 2. Fetch raw data for the 7 items that register as falsy
  const all = await fetch(BASE + '/order_items?select=company_name_snapshot,product_code_snapshot,product_name_snapshot,order_id&limit=500');
  const items = JSON.parse(all.body);
  const falsy = items.filter(i => !i.company_name_snapshot);
  console.log('\nFalsy company items: ' + falsy.length);
  for (const i of falsy) {
    console.log('  co="' + i.company_name_snapshot + '" code=' + (i.product_code_snapshot||'null') + ' type=' + typeof i.company_name_snapshot);
  }

  // 3. Backfill those 7 items from the updated products
  console.log('\nBackfilling order_items company_name_snapshot from products...');
  for (const i of falsy) {
    if (i.product_code_snapshot) {
      const pr = await fetch(BASE + '/products?select=id,company_name_snapshot,product_code&product_code=eq.' + i.product_code_snapshot + '&limit=1');
      const prods = JSON.parse(pr.body);
      if (prods.length && prods[0].company_name_snapshot) {
        // Need order_id (not in our item) - fetch by code and order
        console.log('  Would set company="' + prods[0].company_name_snapshot + '" for order_item with code=' + i.product_code_snapshot);
      }
    }
  }
}
main().catch(e => console.error('Error:', e.message));
