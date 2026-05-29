-- 009: Add product_code_snapshot column to order_items
-- Required for immutable invoice PDF/WhatsApp snapshots

ALTER TABLE order_items
  ADD COLUMN IF NOT EXISTS product_code_snapshot TEXT;

-- Also add product_code_snapshot to the runtime_order_visibility view if it doesn't have it
-- (view definition depends on whether it includes order_items columns)

DO $$
BEGIN
  -- Refresh the view to include the new column if needed
  -- The view runtime_order_visibility is order-level, not item-level, so no change needed there
  RAISE NOTICE 'Migration 009 complete: product_code_snapshot added to order_items';
END $$;
