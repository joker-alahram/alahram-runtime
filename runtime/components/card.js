import { esc, money, dateStr, timeStr, cls } from './helpers.js';
import { badge } from './badge.js';

export function card(config) {
  const { type, data, onClick, actions, link } = config;
  switch (type) {
    case 'invoice': return invoiceCard(data, onClick, actions, link);
    case 'customer': return customerCard(data, onClick, actions, link);
    case 'product': return productCard(data, onClick, link);
    case 'visit': return visitCard(data, onClick, link);
    case 'rep': return repCard(data, onClick, link);
    default: return genericCard(data, onClick, link);
  }
}

function invoiceCard(inv, onClick, actions, link) {
  const num = inv.order_number || inv.invoice_number || '—';
  const customerName = inv.customer_name_snapshot || '';
  const ownerName = inv.owner_name_snapshot || '';
  const status = inv.order_status || inv.workflow_status || 'pending';
  const created = dateStr(inv.created_at);

  const namesHtml = customerName && ownerName && customerName !== ownerName
    ? `<div class="v3-text-sm">${esc(customerName)}</div><div class="v3-text-xs v3-text-muted">${esc(ownerName)}</div>`
    : `<div class="v3-text-sm">${esc(customerName || ownerName)}</div>`;

  const actionsHtml = actions?.length
    ? `<div class="v3-card-actions">${actions.map(a => actionBtn(a)).join('')}</div>`
    : '';

  return `<div class="v3-card"${link ? ` data-link="${link}"` : ''} tabindex="0" role="button">
    <div class="v3-card-inner">
      <div class="v3-card-top">
        <span class="v3-card-sub"># ${esc(String(num))}</span>
        ${badge(status)}
      </div>
      ${namesHtml}
      <div class="v3-card-footer">
        <span class="v3-text-xs v3-text-muted">${created}</span>
        <span class="v3-text-base v3-font-bold" style="color:var(--v2-primary)">${money(inv.total_amount)}</span>
      </div>
      ${actionsHtml}
    </div>
  </div>`;
}

function customerCard(c, onClick, actions, link) {
  const name = c.customer_name || '';
  const phone = c.phone || '';
  const repName = c.owner_name || c.rep_name || '';
  const isActive = c.is_active !== false;

  const quickActions = actions || [
    { icon: '📄', label: 'فاتورة', action: 'invoice' },
    { icon: '📍', label: 'زيارة', action: 'visit' },
    { icon: '💬', label: 'واتساب', action: 'whatsapp' },
  ];

  return `<div class="v3-card"${link ? ` data-link="${link}"` : ''} tabindex="0" role="button">
    <div class="v3-card-inner">
      <div class="v3-card-top">
        <span class="v3-card-title v3-line-clamp-2">${esc(name)}</span>
        <span class="v3-badge ${isActive ? 'v3-badge-ok' : 'v3-badge-no'}" style="flex-shrink:0">${isActive ? 'نشط' : 'غير نشط'}</span>
      </div>
      ${phone ? `<div class="v3-text-xs v3-text-muted">${esc(phone)}</div>` : ''}
      ${repName ? `<div class="v3-text-xs v3-text-muted">المندوب: ${esc(repName)}</div>` : ''}
      <div class="v3-card-actions">${quickActions.map(a => actionBtn(a)).join('')}</div>
    </div>
  </div>`;
}

function productCard(p, onClick, link) {
  const name = p.product_name || '';
  const code = p.product_code || '';
  const price = p.price || p.base_price || 0;
  const company = p.company_name || '';
  const img = p.image_url || '';

  return `<div class="v3-card"${link ? ` data-link="${link}"` : ''} tabindex="0" role="button">
    <div class="v3-card-img">
      ${img ? `<img src="${esc(img)}" alt="${esc(name)}" loading="lazy">` : '<span class="v3-card-img-ph">📦</span>'}
    </div>
    <div class="v3-card-inner">
      <div class="v3-card-title v3-line-clamp-2">${esc(name)}</div>
      ${code ? `<div class="v3-text-xs v3-text-muted">${esc(code)}</div>` : ''}
      ${company ? `<div class="v3-text-xs v3-text-muted">${esc(company)}</div>` : ''}
      <div class="v3-card-footer">
        <span class="v3-text-base v3-font-bold" style="color:var(--v2-primary)">${money(price)}</span>
      </div>
    </div>
  </div>`;
}

function visitCard(v, onClick, link) {
  const customerName = v.customer_name || '';
  const repName = v.rep_name || v.employee_name || '';
  const status = v.status || 'active';
  const duration = v.duration || '';
  const time = v.created_at ? `${dateStr(v.created_at)} ${timeStr(v.created_at)}` : '';

  return `<div class="v3-card"${link ? ` data-link="${link}"` : ''} tabindex="0" role="button">
    <div class="v3-card-inner">
      <div class="v3-card-top">
        <span class="v3-card-title">${esc(customerName)}</span>
        ${badge(status, { size: 'sm' })}
      </div>
      ${repName ? `<div class="v3-text-sm v3-text-muted">${esc(repName)}</div>` : ''}
      <div class="v3-card-row">
        <span class="v3-card-label">الوقت</span>
        <span class="v3-card-value">${time}</span>
      </div>
      ${duration ? `<div class="v3-card-row"><span class="v3-card-label">المدة</span><span class="v3-card-value">${esc(duration)}</span></div>` : ''}
    </div>
  </div>`;
}

function repCard(r, onClick, link) {
  const name = r.name || r.full_name || r.employee_name || '';
  const code = r.code || r.employee_code || '';
  const customers = r.customer_count || 0;
  const sales = r.total_sales || 0;

  return `<div class="v3-card"${link ? ` data-link="${link}"` : ''} tabindex="0" role="button">
    <div class="v3-card-inner">
      <div class="v3-card-top">
        <span class="v3-card-title">${esc(name)}</span>
      </div>
      ${code ? `<div class="v3-text-xs v3-text-muted">${esc(code)}</div>` : ''}
      <div class="v3-card-row">
        <span class="v3-card-label">العملاء</span>
        <span class="v3-card-value">${customers}</span>
      </div>
      <div class="v3-card-row">
        <span class="v3-card-label">المبيعات</span>
        <span class="v3-card-value">${money(sales)}</span>
      </div>
    </div>
  </div>`;
}

function genericCard(data, onClick, link) {
  const title = data.title || data.name || '';
  const sub = data.subtitle || data.description || '';
  const value = data.value || '';

  return `<div class="v3-card"${link ? ` data-link="${link}"` : ''} tabindex="0" role="button">
    <div class="v3-card-inner">
      <div class="v3-card-title">${esc(title)}</div>
      ${sub ? `<div class="v3-text-sm v3-text-muted">${esc(sub)}</div>` : ''}
      ${value ? `<div class="v3-card-value">${esc(value)}</div>` : ''}
    </div>
  </div>`;
}

function actionBtn(a) {
  return `<button class="v3-card-action-btn" data-action="${esc(a.action)}" title="${esc(a.label)}">
    <span class="v3-card-action-icon">${a.icon}</span>
    <span class="v3-card-action-label">${esc(a.label)}</span>
  </button>`;
}
