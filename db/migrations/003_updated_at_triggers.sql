CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE
  target_table TEXT;
BEGIN
  FOREACH target_table IN ARRAY ARRAY[
    'stores',
    'products',
    'product_variants',
    'store_listings',
    'cj_mappings',
    'orders'
  ]
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I_updated_at ON %I', target_table, target_table);
    EXECUTE format(
      'CREATE TRIGGER %I_updated_at BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION set_updated_at()',
      target_table,
      target_table
    );
  END LOOP;
END;
$$;

