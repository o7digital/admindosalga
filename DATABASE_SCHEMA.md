# Base centrale Dosalga

Railway PostgreSQL centralise les données du dashboard. Les deux backends WooCommerce
restent les sources commerciales:

- `MX` — `wp-dosalga-mx.o7digitalgroup.com`, prix en MXN;
- `US` — `wp-dosalga-us.o7digitalgroup.com`, prix en USD.

Vercel utilise une connexion SSL dans `DATABASE_URL`. Le PgBouncer fourni par le template
Railway ne doit être utilisé depuis Vercel que lorsqu'il accepte TLS sur son URL publique;
sinon, utiliser temporairement l'URL PostgreSQL directe avec un pool applicatif limité.
Les migrations utilisent `DATABASE_URL_NON_POOLING`. Ces variables sont toujours sensibles.

## Relations principales

```text
products ──< product_variants
    │              │
    ├──< store_listings >── stores
    │              │           │
    ├──< cj_mappings        orders ──< order_items
    │       ├──< cj_cost_snapshots
    │       └──< shipping_quotes >── stores
    │
    ├──< competitor_offers >── stores
    └──< margin_snapshots

fx_rates       taux de change historiques
sync_runs      état des imports et synchronisations
audit_logs     historique des actions sensibles
```

Les stocks WooCommerce sont conservés dans `store_listings`. Les stocks CJ sont enregistrés
dans `cj_cost_snapshots`, afin de ne jamais confondre stock boutique et stock fournisseur.
Les coûts, transports, taux de change et marges sont des snapshots historiques.

## Migrations

Les fichiers de `db/migrations` sont exécutés par ordre alphabétique. Chaque migration est
transactionnelle et enregistrée dans `schema_migrations`, ce qui rend la commande
`npm run db:migrate` réexécutable sans duplication.

Vérification attendue:

```text
database=ready domain_tables=14
store=MX currency=MXN active=true
store=US currency=USD active=true
```

## Sauvegarde avant rollback

Les tables de snapshots sont intentionnellement non destructives. Avant toute suppression
ou restauration de schéma, créer une sauvegarde Railway et tester la restauration dans un
environnement séparé. Aucun script automatique de suppression totale n'est fourni.
