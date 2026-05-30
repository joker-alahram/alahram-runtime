-- ═══════════════════════════════════════════════════════════════════
-- 012: Add Snapshot Columns + Backfill Order Identity Snapshots
-- ═══════════════════════════════════════════════════════════════════
-- Step 1: Add created_by_name_snapshot / created_by_phone_snapshot
--         to the orders table (if missing).
-- Step 2: Backfill from employees table via created_by_employee_id.
-- Step 3: Add customer_name_snapshot / customer_phone_snapshot
--         / customer_address_snapshot to orders (if missing).
-- Step 4: Backfill from customers + runtime_customer_visibility.
--
-- Safe to re-run (idempotent — uses IF NOT EXISTS / WHERE IS NULL).
-- ═══════════════════════════════════════════════════════════════════

-- ─── Step 0: Add columns to orders table (idempotent) ─────────────
ALTER TABLE orders ADD COLUMN IF NOT EXISTS created_by_name_snapshot TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS created_by_phone_snapshot TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_name_snapshot TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_phone_snapshot TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_address_snapshot TEXT;

-- ─── Main backfill routine ────────────────────────────────────────
DO $$
DECLARE
  v_rep_backfilled INT := 0;
  v_cust_backfilled INT := 0;
  v_cust_extra INT := 0;
  v_total_orders INT := 0;
  v_still_missing_rep INT := 0;
  v_still_missing_cust INT := 0;
BEGIN

  -- ─── Phase 1: Backfill created_by_name_snapshot / created_by_phone_snapshot ──────
  UPDATE orders o
  SET
    created_by_name_snapshot  = e.full_name,
    created_by_phone_snapshot = e.phone
  FROM employees e
  WHERE o.created_by_employee_id = e.id
    AND e.full_name IS NOT NULL AND e.full_name != ''
    AND (o.created_by_name_snapshot IS NULL OR o.created_by_name_snapshot = '');

  GET DIAGNOSTICS v_rep_backfilled = ROW_COUNT;

  -- ─── Phase 2: Backfill customer_name_snapshot / customer_phone_snapshot / customer_address_snapshot ──
  UPDATE orders o
  SET
    customer_name_snapshot    = c.full_name,
    customer_phone_snapshot   = c.phone,
    customer_address_snapshot = c.address
  FROM customers c
  WHERE o.customer_id = c.id
    AND (o.customer_name_snapshot IS NULL OR o.customer_name_snapshot = '');

  GET DIAGNOSTICS v_cust_backfilled = ROW_COUNT;

  -- ─── Phase 3: Second pass — try runtime_customer_visibility for any remaining misses ──
  UPDATE orders o
  SET
    customer_name_snapshot    = rcv.customer_name,
    customer_phone_snapshot   = COALESCE(o.customer_phone_snapshot, rcv.phone),
    customer_address_snapshot = COALESCE(o.customer_address_snapshot, rcv.address)
  FROM runtime_customer_visibility rcv
  WHERE o.customer_id = rcv.id
    AND (o.customer_name_snapshot IS NULL OR o.customer_name_snapshot = '');

  GET DIAGNOSTICS v_cust_extra = ROW_COUNT;
  v_cust_backfilled := v_cust_backfilled + v_cust_extra;

  -- ─── Report ──────────────────────────────────────────────────────
  SELECT COUNT(*) INTO v_total_orders FROM orders;
  SELECT COUNT(*) INTO v_still_missing_rep FROM orders
    WHERE created_by_name_snapshot IS NULL OR created_by_name_snapshot = '';
  SELECT COUNT(*) INTO v_still_missing_cust FROM orders
    WHERE customer_name_snapshot IS NULL OR customer_name_snapshot = '';

  RAISE NOTICE '═══════════════════════════════════════════';
  RAISE NOTICE '012 MIGRATION COMPLETE — Backfill Order Snapshots';
  RAISE NOTICE '═══════════════════════════════════════════';
  RAISE NOTICE 'Total orders in database:        %', v_total_orders;
  RAISE NOTICE 'Rep identity backfilled:         %', v_rep_backfilled;
  RAISE NOTICE 'Customer identity backfilled:    %', v_cust_backfilled;
  RAISE NOTICE 'Still missing rep identity:      %', v_still_missing_rep;
  RAISE NOTICE 'Still missing customer identity: %', v_still_missing_cust;

  IF v_still_missing_rep > 0 THEN
    RAISE NOTICE '⚠ % orders still have no rep name — created_by_employee_id may be missing or employee record has no name.', v_still_missing_rep;
  END IF;
  IF v_still_missing_cust > 0 THEN
    RAISE NOTICE '⚠ % orders still have no customer name — customer_id may be missing or customer record has no name.', v_still_missing_cust;
  END IF;
  RAISE NOTICE '═══════════════════════════════════════════';
END;
$$;
