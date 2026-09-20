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

## Prix WooCommerce (US / MX)

La colonne « Update WooCommerce price » permet de saisir un prix de vente dans la devise
de la fiche, de préciser si la livraison est incluse et de confirmer les délais min/max.
La suggestion vise 35 % de marge : coût produit et livraison incluse, convertis avec le
taux de la fiche, divisés par (1 − 35 % − frais plateforme − taxes configurées), arrondis
au centime supérieur. Sans coût CJ, ou sans coût de livraison lorsqu'elle est incluse,
la suggestion reste indisponible ; la saisie manuelle reste possible. Le taux de change
et les délais existants sont des estimations à vérifier, pas des données temps réel.

Les propositions sont enregistrées dans PostgreSQL (`store_listings.metadata.cjPriceProposal`)
via `PUT /api/cj/price-proposal`, par fiche et par marché. Les imports WooCommerce et
synchronisations CJ les préservent. Elles figurent également dans l'export CSV.
Le bouton enregistre un brouillon. « Review & update WooCommerce » met ensuite à jour le
produit simple ou toutes ses variations dans la boutique correspondante, puis relit chaque
prix pour le vérifier. Cette opération ne modifie jamais CJ.

La [documentation CJ Shop](https://developers.cjdropshipping.com/en/api/api2/api/shop.html)
documente `saveProduct` et `saveVariantBatch` pour enregistrer les produits/prix de boutique
dans CJ. La publication écrit ensuite dans WooCommerce via son API REST et vérifie chaque
produit ou variation.
Configurer côté Vercel les quatre variables secrètes `WOOCOMMERCE_MX_CONSUMER_KEY`,
`WOOCOMMERCE_MX_CONSUMER_SECRET`, `WOOCOMMERCE_US_CONSUMER_KEY` et
`WOOCOMMERCE_US_CONSUMER_SECRET`. Sans ces accès, le bouton bloque avant l'écriture CJ
pour éviter un prix différent entre CJ et WooCommerce.
Le backend US fait déjà l'objet d'une correction de devise à l'import : cette incohérence
devra être résolue avant toute écriture de prix. Aucun endpoint CJ non documenté n'est utilisé.

Vérification des calculs et validations : `node --test tests/cjPricing.test.mjs`.

## Donnees

La devise source est vérifiée par fiche : la montre `wp-dosalga-mexico-12711`
a été confirmée en USD par le propriétaire (23,58 USD × 17,49 = 412,41 MXN).
Les autres fiches MX conservent le montant et la devise de WooCommerce, sans conversion
fondée sur la taille du prix. L'ancienne conversion globale est annulée à la lecture
si elle a été persistée, en restaurant le montant source conservé. Un marqueur évite
les doubles conversions. Les propositions saisies restent intactes.
Vérification : `node --test tests/wooPricing.test.mjs`.

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

Les règles de prix par boutique et catégorie sont enregistrées dans `pricing_rules` sur
Railway. Le bouton « Price rules » de l'admin permet de choisir la devise source, la devise
affichée, le taux et le mode de lecture (`Native Woo price`, `Storefront display price` ou
`Convert source price`). La règle MX / `caps` est initialisée en `native` + MXN : elle lit
le montant WooCommerce natif et n'applique jamais la conversion USD/MXN du storefront.

Champs principaux:
- `cjCost`: cout produit chez CJ
- `cjCostCurrency`: devise du cout CJ
- `salePrice`: prix de vente
- `saleCurrency`: devise de vente
- `shippingIncluded`: si le shipping est deja inclus dans le cout CJ
- `shippingCost`: cout shipping si non inclus
- `platformFeeRate`: frais plateforme en pourcentage
- `taxRate`: taxe estimee en pourcentage

## Alertes prix et Olivia One

Le tableau classe les fiches par priorité avant pagination. Les prix sont comparés
après conversion dans une même devise (USD, taux configuré sur la fiche). Une ligne
rouge signale un prix sous le coût CJ, une perte après transport/frais ou un prix
au moins cinq fois supérieur au coût CJ (écart à vérifier, pas une erreur prouvée).
Les devises ne sont jamais modifiées par les alertes. Le transport figure près du
coût CJ ; zéro importé est affiché comme non confirmé. Le prix MXN affiche son
équivalent USD et les conditions de livraison enregistrées.

Olivia One lit PostgreSQL quand configuré, et uniquement le JSON de développement
sinon. Le rapport retourne toutes les fiches avec anomalies, leurs SKU, montants,
motifs et actions, classés comme le tableau. Hugging Face reçoit les totaux et les
30 fiches prioritaires pour rédiger la synthèse ; le rapport détaillé reste exhaustif.
La clé existante reste côté serveur. Une erreur, un délai dépassé (25 s) ou une réponse
invalide est signalé explicitement avec un rapport de règles disponible en secours.
Tests : `node --test tests/*.test.mjs`.

## Ancien envoi conjoint vers CJ

L'ancien endpoint conjoint reste disponible pour compatibilité, mais il n'est plus utilisé par
l'interface de gestion des prix. Le dashboard publie désormais directement dans WooCommerce.
L'ancien flux vérifie le hostname de la boutique autorisée,
la devise, le produit et toutes ses variantes via l'API CJ. La confirmation indique
explicitement que le prix saisi sera envoyé à toutes les variantes listées.
`POST /api/cj/publish-price` utilise exclusivement le brouillon enregistré côté serveur.
Un verrou PostgreSQL bloque les envois concurrents et les répétitions du même brouillon.
Les résultats partiels et les réponses incertaines ne sont jamais affichés comme publiés.
Les états et identifiants de requête sont conservés dans `cjPricePublication`.

L'endpoint CJ `saveProduct` puis `saveVariantBatch` enregistre le prix du produit et de
toutes ses variantes dans CJ. La livraison incluse et les délais restent des notes de
l'admin. L'API REST WooCommerce met ensuite à jour le prix du produit simple ou de toutes
les variations. L'état `woo_verified` n'est enregistré qu'après confirmation de chaque prix.
Le statut public WooCommerce est vérifié avant toute écriture : un produit brouillon,
masqué ou non achetable y est refusé. Un ancien statut « off shelf » dans CJ ne bloque
pas la mise à jour, car `saveProduct` sert précisément à réenregistrer la fiche active.
