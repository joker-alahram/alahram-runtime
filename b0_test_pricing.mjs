import { createServer } from 'vite';
import { chromium } from 'playwright';

const PORT = 5240;
const s = await createServer({ root: '.', logLevel: 'silent', server: { port: PORT, host: '127.0.0.1', strictPort: true } });
await s.listen();

const b = await chromium.launch({ headless: true, executablePath: 'C:\\Users\\ahram\\AppData\\Local\\ms-playwright\\chromium-1223\\chrome-win64\\chrome.exe' });
const p = await (await b.newContext()).newPage();
const logs = [];
p.on('console', msg => logs.push(msg.text()));

// Login as customer
await p.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'networkidle' });
await p.evaluate(() => window.location.hash = '#login');
await p.waitForTimeout(1000);
await (await p.waitForSelector('#v2-le')).fill('01066197098');
await (await p.waitForSelector('#v2-lp')).fill('test123456');
await (await p.waitForSelector('#v2-ls')).click();
await p.waitForTimeout(4000);

// Check pricing traces
const rt = logs.filter(l => l.includes('[runtime]'));
console.log('Runtime traces:');
rt.forEach(t => console.log(`  ${t.substring(0, 180)}`));

const pricing = logs.filter(l => l.includes('_lazyHomePrices') || l.includes('pric') || l.includes('resolve_'));
console.log('\nPricing traces:');
pricing.forEach(t => console.log(`  ${t.substring(0, 200)}`));

// Check if RPC now works (should be 200 after grant fix)
const rpcTraces = pricing.filter(t => t.includes('RPC failed') || t.includes('RPC ok') || t.includes('resolve_'));
console.log('\nRPC traces:');
rpcTraces.forEach(t => console.log(`  ${t.substring(0, 200)}`));

await b.close(); await s.close();
