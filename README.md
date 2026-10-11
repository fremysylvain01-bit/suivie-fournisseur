# Suivi des fournisseurs de chantier

Application web pour suivre les achats auprès des fournisseurs d'un chantier :
fournisseurs, produits rangés par famille, unités, prix unitaires, quantités,
prix totaux, récapitulatif par facture et tableau de bord de toutes les dépenses.

## Démarrer

Aucune installation nécessaire : ouvrez simplement `index.html` dans un navigateur.

Ou avec un petit serveur local :

```bash
npm start          # http://localhost:8080
```

Pour tester rapidement : **Paramètres → Charger des données d'exemple**.

## Fonctionnalités

| Écran | Contenu |
|---|---|
| **Tableau de bord** | Totaux HT / TVA / TTC, payé / reste à payer, dépenses par fournisseur, par famille de produits, croisement fournisseurs × familles, évolution mensuelle, principaux produits achetés. Filtres par période et par fournisseur. |
| **Factures** | Liste filtrable (fournisseur, statut, recherche). Saisie des lignes : produit du catalogue (remplit désignation, famille, unité et prix unitaire) ou saisie libre ; **prix total = quantité × prix unitaire** calculé en direct. |
| **Récapitulatif de facture** | Détail groupé par famille avec sous-totaux, récapitulatif par famille (montant et part), total HT, TVA, TTC. Marquer payée, dupliquer, imprimer. |
| **Fournisseurs** | Coordonnées, nombre de factures, totaux et montant à payer ; fiche détaillée avec dépenses par famille et produits achetés. |
| **Produits** | Catalogue rangé par famille de produits (désignation, référence, unité, prix unitaire de référence, quantité et montant achetés). Gestion des familles. |
| **Paramètres** | Nom du chantier, devise, taux de TVA par défaut (8,1 %), sauvegarde / import JSON, export CSV pour Excel. |

Unités disponibles : u, pce, m, ml, m², m³, kg, t, l, sac, palette, rouleau, h, jour, forfait.

## Données

Les données sont enregistrées dans le navigateur (`localStorage`). Utilisez
**Paramètres → Exporter (sauvegarde JSON)** pour les sauvegarder ou les
transférer sur un autre poste, et **Importer une sauvegarde** pour les restaurer.

## Structure

```
index.html        page unique
css/style.css     styles (clair / sombre, mobile, impression)
js/calculs.js     calculs : totaux de ligne, récap facture, tableau de bord
js/store.js       stockage, import / export, données d'exemple
js/app.js         interface et navigation
tests/            tests des calculs (npm test)
```
