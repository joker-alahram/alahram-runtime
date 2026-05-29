-- 010: Order editing support + enhanced execution evidence
-- Adds columns for GPS accuracy, revision tracking, and audit support

ALTER TABLE orders ADD COLUMN IF NOT EXISTS execution_accuracy_meters numeric;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS execution_captured_at timestamptz;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS revision integer NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS updated_at timestamptz;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS updated_by uuid;

COMMENT ON COLUMN orders.execution_accuracy_meters IS 'GPS accuracy in meters at time of order creation/update';
COMMENT ON COLUMN orders.execution_captured_at IS 'Timestamp when GPS reading was captured';
COMMENT ON COLUMN orders.revision IS 'Incremented on each edit; 0 = original creation';
COMMENT ON COLUMN orders.updated_at IS 'Timestamp of last modification';
COMMENT ON COLUMN orders.updated_by IS 'Employee UUID who last modified the order';

-- Verify
DO $$
BEGIN
  RAISE NOTICE 'Migration 010 complete: execution_accuracy_meters, execution_captured_at, revision, updated_at, updated_by added to orders';
END $$;
