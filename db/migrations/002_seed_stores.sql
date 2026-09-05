INSERT INTO stores (code, name, wordpress_url, country_code, currency_code)
VALUES
  ('MX', 'Dosalga México', 'https://wp-dosalga-mx.o7digitalgroup.com', 'MX', 'MXN'),
  ('US', 'Dosalga USA', 'https://wp-dosalga-us.o7digitalgroup.com', 'US', 'USD')
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  wordpress_url = EXCLUDED.wordpress_url,
  country_code = EXCLUDED.country_code,
  currency_code = EXCLUDED.currency_code,
  active = TRUE,
  updated_at = NOW();

