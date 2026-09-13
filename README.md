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

## Prix proposés CJ (US / MX)

La colonne « Update price CJ » permet de saisir un prix de vente proposé dans la devise
de la fiche, de préciser si la livraison est incluse et de confirmer les délais min/max.
La suggestion vise 35 % de marge : coût produit et livraison incluse, convertis avec le
taux de la fiche, divisés par (1 − 35 % − frais plateforme − taxes configurées), arrondis
au centime supérieur. Sans coût CJ, ou sans coût de livraison lorsqu'elle est incluse,
la suggestion reste indisponible ; la saisie manuelle reste possible. Le taux de change
et les délais existants sont des estimations à vérifier, pas des données temps réel.

Les propositions sont enregistrées dans PostgreSQL (`store_listings.metadata.cjPriceProposal`)
via `PUT /api/cj/price-proposal`, par fiche et par marché. Les imports WooCommerce et
synchronisations CJ les préservent. Elles figurent également dans l'export CSV.
Le bouton enregistre un brouillon : il ne modifie ni le prix actuel ni CJ ni WooCommerce.

La [documentation CJ Shop](https://developers.cjdropshipping.com/en/api/api2/api/shop.html)
documente `saveProduct` et `saveVariantBatch` pour enregistrer les produits/prix de boutique
dans CJ. Elle ne garantit pas une publication de ces changements vers WooCommerce.
Une future publication nécessite les identifiants vérifiés boutique/produit/variation et
les accès WooCommerce en écriture ; l'intégration actuelle utilise son API publique en lecture.
Le backend US fait déjà l'objet d'une correction de devise à l'import : cette incohérence
devra être résolue avant toute écriture de prix. Aucun endpoint CJ non documenté n'est utilisé.

Vérification des calculs et validations : `node --test tests/cjPricing.test.mjs`.

## Donnees

Le catalogue WooCommerce MX stocke les montants de vente en USD malgré le code MXN
renvoyé par son API. L'admin les convertit en MXN avec le taux de la fiche :
23,58 × 17,49 = 412,41 MXN. Cette correction s'applique aux nouvelles importations
et à la lecture des anciennes fiches. Le marqueur `priceNormalization` évite une
double conversion lors des sauvegardes et synchronisations. Les propositions saisies
en MXN restent dans cette devise. Vérification : `node --test tests/wooPricing.test.mjs`.

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
