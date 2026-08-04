# Admin Dosalga

Admin de produits pour suivre les achats CJ, les couts, le shipping et la marge.

## Demarrer

```bash
npm install
npm run dev
```

## Donnees

La premiere version stocke les produits dans `data/products.json`.

Champs principaux:
- `cjCost`: cout produit chez CJ
- `cjCostCurrency`: devise du cout CJ
- `salePrice`: prix de vente
- `saleCurrency`: devise de vente
- `shippingIncluded`: si le shipping est deja inclus dans le cout CJ
- `shippingCost`: cout shipping si non inclus
- `platformFeeRate`: frais plateforme en pourcentage
- `taxRate`: taxe estimee en pourcentage
