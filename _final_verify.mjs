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
      resp.on('end', () => res({ body: data }));
    });
    req.on('error', rej);
    req.end();
  });
}

async function main() {
  const r = await fetch(BASE + '/order_items?select=product_code_snapshot,product_name_snapshot,company_name_snapshot,order_id&limit=500');
  const items = JSON.parse(r.body);
  const nc = items.filter(i => !i.product_code_snapshot).length;
  const nn = items.filter(i => !i.product_name_snapshot).length;
  const nco = items.filter(i => !i.company_name_snapshot).length;
  console.log('=== FINAL VERIFICATION ===');
  console.log('Total items: ' + items.length);
  console.log('null product_code_snapshot:    ' + nc);
  console.log('null product_name_snapshot:    ' + nn);
  console.log('null company_name_snapshot:    ' + nco);

  // Show oldest order with multiple companies
  const ordersRaw2 = await fetch(BASE + '/orders?select=id,order_number,created_at,order_status&order=created_at.asc&limit=5');
  // Actually parse properly
  const ordersRaw = await fetch(BASE + '/orders?select=id,order_number,created_at,order_status&order=created_at.asc&limit=5');
  const orders = JSON.parse(ordersRaw.body);
  console.log('\n=== SAMPLE OLD ORDERS ===');
  for (const ord of orders) {
    const ir = await fetch(BASE + '/order_items?select=product_code_snapshot,product_name_snapshot,company_name_snapshot,quantity&order_id=eq.' + ord.id + '&order=created_at.asc');
    const items2 = JSON.parse(ir.body);
    const companies = [...new Set(items2.map(i => i.company_name_snapshot))].filter(Boolean);
    const hasMulti = companies.length > 1;
    console.log('#' + ord.order_number + ' (' + ord.created_at.slice(0,10) + ') items=' + items2.length + ' companies=' + companies.join(',') + (hasMulti ? ' [MULTI]' : ''));
    for (const i of items2) {
      console.log('  code=' + i.product_code_snapshot + ' name=' + (i.product_name_snapshot||'').slice(0,30) + ' co=' + i.company_name_snapshot + ' qty=' + i.quantity);
    }
    if (hasMulti) break;
  }

  // Show newest order
  console.log('\n=== NEWEST ORDER ===');
  const newestRaw = await fetch(BASE + '/orders?select=id,order_number,created_at,order_status&order=created_at.desc&limit=1');
  const newest = JSON.parse(newestRaw.body);
  for (const ord of newest) {
    const ir = await fetch(BASE + '/order_items?select=product_code_snapshot,product_name_snapshot,company_name_snapshot,quantity&order_id=eq.' + ord.id + '&order=created_at.asc');
    const items2 = JSON.parse(ir.body);
    const companies = [...new Set(items2.map(i => i.company_name_snapshot))].filter(Boolean);
    console.log('#' + ord.order_number + ' (' + ord.created_at.slice(0,10) + ') items=' + items2.length + ' companies=' + companies.join(','));
    for (const i of items2) {
      console.log('  code=' + i.product_code_snapshot + ' name=' + (i.product_name_snapshot||'').slice(0,30) + ' co=' + i.company_name_snapshot + ' qty=' + i.quantity);
    }
  }

  // Find any order with multiple companies
  console.log('\n=== MULTI-COMPANY ORDER SAMPLE ===');
  // Check items for orders with 3+ items
  const ordersAllRaw = await fetch(BASE + '/orders?select=id,order_number,created_at&order=created_at.asc&limit=50');
  const ordersAll = JSON.parse(ordersAllRaw.body);
  let found = false;
  for (const ord of ordersAll) {
    if (found) break;
    const ir = await fetch(BASE + '/order_items?select=company_name_snapshot&order_id=eq.' + ord.id + '&limit=20');
    const items2 = JSON.parse(ir.body);
    const companies = [...new Set(items2.map(i => i.company_name_snapshot))].filter(Boolean);
    if (companies.length > 1) {
      // Fetch full items
      const ir2 = await fetch(BASE + '/order_items?select=product_code_snapshot,product_name_snapshot,company_name_snapshot,quantity,final_price&order_id=eq.' + ord.id + '&order=created_at.asc');
      const full = JSON.parse(ir2.body);
      console.log('#' + ord.order_number + ' (' + ord.created_at.slice(0,10) + ') items=' + full.length + ' companies=' + companies.join(','));
      for (const i of full) {
        console.log('  code=' + i.product_code_snapshot + ' name=' + (i.product_name_snapshot||'').slice(0,35) + ' co=' + i.company_name_snapshot + ' qty=' + i.quantity + ' price=' + i.final_price);
      }
      found = true;
    }
  }
  if (!found) console.log('No multi-company order found in first 50 orders');
}
main().catch(e => console.error('Error:', e.message));
