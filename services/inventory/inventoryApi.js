import { getSession } from '../../auth/sessionService.js';
import { readConfig } from '../../config.js';
import {
  MOVEMENT_TYPES,
  DIRECTIONS,
  buildAdjustmentPayload,
  validateMovementPayload,
} from '../contracts/inventory.contract.js';

const API = readConfig().baseUrl;
const H = () => {
  const s = getSession();
  const h = {
    apikey: readConfig().apiKey,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };

  return h;
};

async function _fetch(path) {
  const r = await fetch(`${API}/${path}`, { headers: H() });
  if (!r.ok) throw new Error('فشل تحميل البيانات');
  return r.json();
}

// ─── Session helper ──────────────────────────────────

function _employeeId() {
  const s = getSession();
  return s?.actor?.type === 'employee' ? s.actor.id : null;
}

// ─── All stock with product info ─────────────────────

export async function getAllStock() {
  const [stock, products, branches] = await Promise.all([
    _fetch('inventory_stock?is_active=eq.true&order=product_id'),
    _fetch('products?select=id,product_name,product_code&order=product_name'),
    _fetch('branches?is_active=eq.true&select=id,branch_name'),
  ]);
  const pm = new Map(products.map(p => [p.id, p]));
  const bm = new Map(branches.map(b => [b.id, b]));
  return stock.map(s => ({
    ...s, product: pm.get(s.product_id) || null, branch: bm.get(s.branch_id) || null,
  }));
}

// ─── Low stock (available_qty < minimum_qty) ─────────

export async function getLowStock() {
  const stock = await _fetch('inventory_stock?is_active=eq.true&available_qty=lt.minimum_qty&order=available_qty.asc');
  const pids = [...new Set(stock.map(s => s.product_id))];
  const products = pids.length ? await _fetch(`products?id=in.(${pids.join(',')})&select=id,product_name,product_code`) : [];
  const pm = new Map(products.map(p => [p.id, p]));
  return stock.map(s => ({ ...s, product: pm.get(s.product_id) || null }));
}

// ─── Product detail ──────────────────────────────────

export async function getProductDetail(productId) {
  const [product, units, stock, movements] = await Promise.all([
    _fetch(`products?id=eq.${productId}&select=*`).then(r => r[0]),
    _fetch(`product_units?product_id=eq.${productId}&select=*`),
    _fetch(`inventory_stock?product_id=eq.${productId}&is_active=eq.true`),
    _fetch(`inventory_movements?product_id=eq.${productId}&order=created_at.desc&limit=50`),
  ]);
  if (!product) throw new Error('المنتج غير موجود');
  const bids = [...new Set(stock.map(s => s.branch_id))];
  const branches = bids.length ? await _fetch(`branches?id=in.(${bids.join(',')})&select=id,branch_name`) : [];
  const bm = new Map(branches.map(b => [b.id, b]));
  return {
    ...product, units,
    stock: stock.map(s => ({ ...s, branch: bm.get(s.branch_id) || null })),
    movements,
  };
}

// ─── Product movements (ledger paginated) ────────────

export async function getProductMovements(productId, { limit = 50, offset = 0 } = {}) {
  return _fetch(`inventory_movements?product_id=eq.${productId}&order=created_at.desc&limit=${limit}&offset=${offset}`);
}

// ─── Recent movements (all products, audit queue) ────

export async function getRecentMovements({ limit = 100 } = {}) {
  return _fetch(`inventory_movements?order=created_at.desc&limit=${limit}`);
}

// ─── Reservations ────────────────────────────────────

export async function getReservations(status = 'active') {
  return _fetch(`inventory_reservations?reservation_status=eq.${status}&order=created_at.desc&limit=100`);
}

// ─── Warehouses (branches) ───────────────────────────

export async function getWarehouses() {
  return _fetch('branches?is_active=eq.true&select=id,branch_name,branch_code&order=branch_name');
}

// ─── Release reservation (RPC) ───────────────────────

export async function releaseReservation(reservationId) {
  const r = await fetch(`${API}/rpc/release_inventory_reservation`, {
    method: 'POST', headers: H(),
    body: JSON.stringify({
      p_reservation_id: reservationId,
      p_actor_type: 'employee',
      p_actor_id: _employeeId() || '',
    }),
  });
  if (!r.ok) throw new Error('فشل إلغاء الحجز');
}

// ─── Movement types labels (re-export from contract) ─

export const MOVEMENT_LABELS = { ...MOVEMENT_TYPES };
export const MOVEMENT_DIR = { ...DIRECTIONS };

// ═══════════════════════════════════════════════════════
// CANONICAL MOVEMENT MUTATIONS
// ═══════════════════════════════════════════════════════
// These are the ONLY entry points for creating movements.
// All UI code MUST go through these functions.
// ═══════════════════════════════════════════════════════

export async function createAdjustmentMovement({ productId, delta, balanceAfter, reason } = {}) {
  const payload = buildAdjustmentPayload({
    productId, delta, balanceAfter, reason,
    employeeId: _employeeId(),
  });
  if (!payload) return null;
  validateMovementPayload(payload);
  const r = await fetch(`${API}/inventory_movements`, {
    method: 'POST',
    headers: { ...H(), Prefer: 'return=representation' },
    body: JSON.stringify(payload),
  });
  if (!r.ok) {
    const t = await r.text().catch(() => '');
    throw new Error(t || 'فشل إنشاء حركة المخزون');
  }
  return r.json();
}
