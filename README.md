# Admin Dosalga

Admin de produits pour suivre les achats CJ, les couts, le shipping et la marge.

## Demarrer

```bash
npm install
npm run dev
```

## Connexions

L'admin importe les catalogues depuis les deux backends WooCommerce:

- `https://wp-dosalga-mx.o7digitalgroup.com`
- `https://wp-dosalga-us.o7digitalgroup.com`

Pour activer la synchronisation CJdropshipping en direct, configurer la variable serveur
`CJ_API_KEY`. L'admin échange cette clé contre un jeton CJ côté serveur; aucun secret CJ
n'est envoyé au navigateur. `CJ_ACCESS_TOKEN` peut aussi être utilisé temporairement.

La synchronisation catalogue récupère les coûts et les stocks par lots de quatre produits.
L'import d'un produit individuel récupère également les routes et coûts de livraison.

## Donnees

Railway PostgreSQL est la source centrale lorsque `DATABASE_URL` est configurée. La connexion
Vercel doit obligatoirement accepter TLS. Le PgBouncer du template ne doit être utilisé sur
son URL publique qu'après activation de TLS; sinon `DATABASE_URL` pointe temporairement vers
PostgreSQL direct avec un petit pool. `DATABASE_URL_NON_POOLING` sert aux migrations.
`data/products.json` reste uniquement un
fallback de développement lorsque la base n'est pas configurée. Le stockage local du
navigateur est un cache et ne remplace plus les données PostgreSQL.

Initialiser et vérifier la base:

```bash
npm run db:migrate
npm run db:verify
```

L'endpoint `GET /api/health` confirme la connexion, le nombre de boutiques actives et le
nombre de fiches produits. Les imports WooCommerce et les synchronisations CJ sont écrits
dans PostgreSQL. Les deux WordPress restent les seules boutiques; Railway ne crée aucun
WordPress supplémentaire.

Champs principaux:
- `cjCost`: cout produit chez CJ
- `cjCostCurrency`: devise du cout CJ
- `salePrice`: prix de vente
- `saleCurrency`: devise de vente
- `shippingIncluded`: si le shipping est deja inclus dans le cout CJ
- `shippingCost`: cout shipping si non inclus
- `platformFeeRate`: frais plateforme en pourcentage
- `taxRate`: taxe estimee en pourcentage
