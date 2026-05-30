export function groupItemsByCompany(items) {
  const groups = [];
  const map = {};
  for (const item of Array.isArray(items) ? items : []) {
    const company = getCompanyName(item);
    if (!map[company]) {
      map[company] = { companyName: company, items: [] };
      groups.push(map[company]);
    }
    map[company].items.push(item);
  }
  return groups;
}

export function getCompanyName(item) {
  return item.company_name_snapshot || item.product?.company_name_snapshot || 'غير مصنف';
}

export function getProductName(item) {
  return item.product_name_snapshot || item.product?.product_name || '';
}

export function getProductCode(item) {
  return item.product_code_snapshot || item.product?.product_code || item.code || '';
}

export function getQuantity(item) {
  return Number(item.quantity || item.qty || 1);
}

export function getFinalPrice(item) {
  return Number(item.final_price || item.price?.final_price || 0);
}

export function getUnitName(item) {
  return item.unit_name_snapshot || item.unitName || item.unit?.unit_name || 'قطعة';
}

export function getLineTotal(item) {
  return getQuantity(item) * getFinalPrice(item);
}

export function computeGroupSubtotal(items) {
  return items.reduce((s, i) => s + getLineTotal(i), 0);
}

export function computeGrandTotal(groups) {
  return groups.reduce((s, g) => s + computeGroupSubtotal(g.items), 0);
}
