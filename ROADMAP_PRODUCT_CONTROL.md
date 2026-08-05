# Dosalga Product Control Roadmap

## Contexte

Le dashboard premium est en production comme base visuelle et opérationnelle. La prochaine étape est de transformer l'admin en vraie plateforme de pilotage produits, marges, shipping, sponsors, socios et reporting IA.

## Priorité 1: Product Control sérieux

Chaque produit doit afficher et stocker:

- photo produit WooCommerce;
- lien produit boutique;
- boutique: Dosalga México, Dosalga USA ou les deux;
- SKU Dosalga;
- PID / SKU CJdropshipping;
- CJ cost toujours en USD;
- prix boutique dans la devise locale:
  - México: MXN;
  - USA: USD;
- shipping CJ:
  - coût en USD;
  - origine;
  - destination;
  - méthode;
  - délai minimum;
  - délai maximum;
  - lien ou référence de route CJ si disponible;
- marge nette;
- taux USD/MXN utilisé pour le calcul;
- nombre de clients ayant acheté le produit;
- stock WooCommerce;
- stock CJ;
- dernière sync WooCommerce;
- dernière sync CJ.

Formule México:

```txt
marge MXN = prix MXN - ((CJ cost USD + shipping USD) * taux USD/MXN)
```

Formule USA:

```txt
marge USD = prix USD - CJ cost USD - shipping USD
```

Le taux de change doit être historisé pour comprendre les marges passées.

## Priorité 2: vraies sections sidebar

Les boutons sidebar doivent devenir de vraies vues:

- Products: catalogue, import, édition, archive, filtres.
- Shipping: routes CJ, coûts par pays, délais, alertes shipping cher ou lent.
- Margins: produits par marge, marge faible, marge négative, recommandations de prix.
- CJ Connection: état API, dernière sync, erreurs, produits non liés à CJ.

## Priorité 3: commandes WooCommerce

Importer les commandes des deux apps WordPress:

- o7digital/dosalga -> Dosalga México;
- o7digital/dosalgaus -> Dosalga USA.

Objectif:

- savoir combien de clients ont acheté chaque produit;
- calculer revenu produit;
- identifier les meilleurs vendeurs;
- croiser ventes, marge, stock et shipping.

## Priorité 4: Sponsors

Créer une section Sponsors pour vendre de la publicité sur les boutiques:

- sponsor;
- campagne;
- boutique ciblée;
- emplacement: homepage, product page, collection, banner;
- dates début/fin;
- budget;
- statut;
- visuel publicitaire;
- lien cible;
- impressions, clics et conversions plus tard.

## Priorité 5: Socios

Créer un espace Socios pour permettre à un client/partenaire de monter sa plateforme sur le système Dosalga:

- socio / client;
- boutique associée;
- produits assignés;
- marge ou commission;
- commandes générées;
- reporting;
- accès limité;
- branding possible;
- frais de gestion Dosalga.

Cette partie doit être pensée comme un mini SaaS multi-client.

## Priorité 6: Reporting IA

Préparer un espace Reporting IA, avec intégration Hugging Face plus tard:

- résumé automatique des ventes;
- recommandations de prix;
- détection des produits à retirer;
- produits à pousser en publicité;
- prédiction de rupture stock;
- analyse performance sponsor;
- rapport hebdomadaire automatique.

L'IA doit venir après la structuration des données produits, commandes, sponsors et socios.

## Prochaine étape recommandée

Commencer par le modèle de données Railway/Postgres et la vue Product Control enrichie.

Ordre recommandé:

1. créer le schéma Postgres `products`, `product_syncs`, `orders`, `order_items`, `shipping_routes`, `margin_snapshots`;
2. migrer le stockage JSON vers un repository data abstrait;
3. importer les produits WooCommerce avec photo et lien boutique;
4. importer les commandes WooCommerce pour compter les clients par produit;
5. enrichir CJ avec cost USD, shipping USD et route;
6. rendre Shipping et Margins fonctionnels.
