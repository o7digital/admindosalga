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

`data/products.json` fournit le catalogue initial. Les imports WooCommerce et les résultats
de synchronisation CJ sont conservés dans le stockage local du navigateur afin de rester
disponibles après rechargement sans tenter d'écrire dans le système de fichiers Vercel.

Champs principaux:
- `cjCost`: cout produit chez CJ
- `cjCostCurrency`: devise du cout CJ
- `salePrice`: prix de vente
- `saleCurrency`: devise de vente
- `shippingIncluded`: si le shipping est deja inclus dans le cout CJ
- `shippingCost`: cout shipping si non inclus
- `platformFeeRate`: frais plateforme en pourcentage
- `taxRate`: taxe estimee en pourcentage
