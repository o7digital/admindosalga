-- Match a source SKU within its market without scanning/decompressing the
-- existing catalogue for every snapshot product.
CREATE INDEX IF NOT EXISTS store_listings_store_lower_sku_idx
  ON store_listings (store_id, LOWER(woo_sku));
