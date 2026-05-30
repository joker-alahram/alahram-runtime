-- 013: Backfill product_code_snapshot for historical order_items
-- Populates product_code_snapshot from products table where missing

UPDATE order_items oi
SET product_code_snapshot = p.product_code
FROM products p
WHERE oi.product_id = p.id
  AND (oi.product_code_snapshot IS NULL OR oi.product_code_snapshot = '');
