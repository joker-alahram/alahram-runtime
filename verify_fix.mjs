const controller = new AbortController();
const timeout = setTimeout(() => controller.abort(), 10000);

try {
  const r = await fetch('https://teffdegicyfdowveqqvw.supabase.co/rest/v1/order_timeline?select=id,event_type,change_details&id=eq.10', {
    headers: { apikey: 'sb_publishable_LjwmfFbqsPz35tnUB0IddA_jLXPFZR6' },
    signal: controller.signal
  });
  clearTimeout(timeout);
  const d = await r.json();
  const cd = d[0].change_details;
  console.log('typeof:', typeof cd);
  console.log('Array.isArray:', Array.isArray(cd));
  console.log('length:', cd?.length);
  console.log('type[0]:', cd?.[0]?.type);
  console.log('code[0]:', cd?.[0]?.product_code);
} catch (e) {
  console.error('Error:', e.message);
}
