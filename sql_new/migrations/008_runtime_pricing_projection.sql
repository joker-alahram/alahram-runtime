-- ═══════════════════════════════════════════════════════════════════
-- Migration 008 — Canonical Pricing Projection Layer
-- ═══════════════════════════════════════════════════════════════════
-- Creates:
--   1. runtime_product_prices view (canonical pricing projection)
--   2. resolve_product_prices_batch RPC (batch pricing with customer tier)
-- ═══════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════
-- 1. Canonical Pricing Projection View
-- ═══════════════════════════════════════════════════════════════════
-- Returns the effective price for every active product/unit/tier combination.
-- All pricing queries MUST read from this view — no scattered pricing logic.

DROP VIEW IF EXISTS runtime_product_prices CASCADE;

CREATE OR REPLACE VIEW runtime_product_prices AS
SELECT
  p.id                    AS product_id,
  p.product_name          AS product_name,
  pu.id                   AS product_unit_id,
  pu.unit_name            AS unit_name,
  COALESCE(pp.base_price, 0) AS base_price,
  pt.id                   AS tier_id,
  pt.tier_name            AS tier_name,
  pt.tier_code            AS tier_code,
  COALESCE(pp.discount_percent, 0) AS discount_percent,
  CASE
    WHEN pp.base_price IS NULL THEN 0
    ELSE pp.base_price * (1 - COALESCE(pp.discount_percent, 0) / 100.0)
  END                     AS final_price,
  pp.is_active            AS is_active,
  pp.starts_at,
  pp.ends_at,
  pp.availability_status,
  pp.sales_blocked,
  pp.participates_in_tier,
  pp.minimum_quantity,
  pp.maximum_quantity,
  pp.id                   AS price_id,
  pp.execution_priority
FROM products p
JOIN product_units pu ON pu.product_id = p.id AND pu.is_active = TRUE
LEFT JOIN product_prices pp ON pp.product_id = p.id AND pp.product_unit_id = pu.id
LEFT JOIN pricing_tiers pt ON pt.id = pp.tier_id
WHERE p.is_active = TRUE;

COMMENT ON VIEW runtime_product_prices IS
  'Canonical Pricing Projection — single source of truth for all pricing reads. Every storefront, cart, invoice, and operational pricing query MUST read from this view.';

-- ═══════════════════════════════════════════════════════════════════
-- 2. Batch Price Resolution RPC
-- ═══════════════════════════════════════════════════════════════════
-- Returns effective prices for a batch of product IDs.
-- If p_customer_id is provided and the customer has a tier assignment,
-- prices are filtered to that tier (highest priority wins).
-- If no customer or no tier, returns the default (tier-free) prices.

DROP FUNCTION IF EXISTS resolve_product_prices_batch;

CREATE OR REPLACE FUNCTION resolve_product_prices_batch(
  p_product_ids  UUID[],
  p_customer_id  UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_tier_id UUID;
  v_results JSONB;
BEGIN
  -- Resolve customer tier (highest priority active assignment)
  IF p_customer_id IS NOT NULL THEN
    SELECT cta.tier_id INTO v_tier_id
    FROM customer_tier_assignments cta
    JOIN pricing_tiers pt ON pt.id = cta.tier_id AND pt.is_active = TRUE
    WHERE cta.customer_id = p_customer_id AND cta.is_active = TRUE
    ORDER BY pt.priority DESC NULLS LAST, cta.starts_at DESC NULLS LAST
    LIMIT 1;
  END IF;

  -- Build result from runtime_product_prices
  -- If customer has a tier, include prices matching that tier plus fallback (tier-less) prices.
  -- The frontend picks the best discount per product+unit.
  SELECT jsonb_agg(jsonb_build_object(
    'product_id', rpp.product_id,
    'product_unit_id', rpp.product_unit_id,
    'base_price', rpp.base_price,
    'final_price', rpp.final_price,
    'discount_percent', rpp.discount_percent,
    'tier_name', rpp.tier_name,
    'tier_code', rpp.tier_code,
    'unit_name', rpp.unit_name,
    'product_name', rpp.product_name,
    'found', TRUE
  ) ORDER BY rpp.product_id, rpp.execution_priority DESC NULLS LAST)
  INTO v_results
  FROM runtime_product_prices rpp
  WHERE rpp.product_id = ANY(p_product_ids)
    AND rpp.is_active = TRUE
    AND (rpp.starts_at IS NULL OR rpp.starts_at <= NOW())
    AND (rpp.ends_at IS NULL OR rpp.ends_at >= NOW())
    AND (
      v_tier_id IS NULL
      OR rpp.tier_id IS NULL
      OR rpp.tier_id = v_tier_id
    );

  RETURN COALESCE(v_results, jsonb_build_array());
END;
$$;

COMMENT ON FUNCTION resolve_product_prices_batch IS
  'Batch price resolution RPC — canonical pricing entry point. Accepts product IDs and optional customer ID for tier-specific pricing. Returns JSONB array of resolved prices.';

-- Grant execution
GRANT EXECUTE ON FUNCTION resolve_product_prices_batch TO anon, authenticated;
