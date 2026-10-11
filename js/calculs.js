/*
 * Calculs métier : totaux de lignes, récapitulatif de facture, tableau de bord.
 * Fonctions pures, utilisables dans le navigateur (window.Calculs) et sous Node (tests).
 */
(function (racine) {
  'use strict';

  function nombre(v) {
    const n = typeof v === 'string' ? Number(v.replace(',', '.')) : Number(v);
    return Number.isFinite(n) ? n : 0;
  }

  function arrondi(n, decimales = 2) {
    const f = Math.pow(10, decimales);
    return Math.round((nombre(n) + Number.EPSILON) * f) / f;
  }

  /** Prix total d'une ligne = quantité × prix unitaire. */
  function totalLigne(ligne) {
    return arrondi(nombre(ligne.quantite) * nombre(ligne.prixUnitaire));
  }

  function nomFamille(familles, id) {
    const f = (familles || []).find((x) => x.id === id);
    return f ? f.nom : 'Sans famille';
  }

  /**
   * Récapitulatif d'une facture : total HT, TVA, TTC et sous-totaux par famille de produits.
   */
  function recapFacture(facture, familles) {
    const parFamille = new Map();
    let totalHT = 0;
    (facture.lignes || []).forEach((l) => {
      const t = totalLigne(l);
      totalHT += t;
      const cle = l.familleId || '';
      if (!parFamille.has(cle)) {
        parFamille.set(cle, { familleId: cle, nom: nomFamille(familles, cle), nbLignes: 0, totalHT: 0, lignes: [] });
      }
      const g = parFamille.get(cle);
      g.nbLignes += 1;
      g.totalHT = arrondi(g.totalHT + t);
      g.lignes.push(Object.assign({}, l, { total: t }));
    });
    totalHT = arrondi(totalHT);
    const tauxTVA = nombre(facture.tauxTVA);
    const montantTVA = arrondi((totalHT * tauxTVA) / 100);
    return {
      totalHT,
      tauxTVA,
      montantTVA,
      totalTTC: arrondi(totalHT + montantTVA),
      parFamille: Array.from(parFamille.values()).sort((a, b) => b.totalHT - a.totalHT),
    };
  }

  function filtrerFactures(factures, filtres) {
    filtres = filtres || {};
    return (factures || []).filter((f) => {
      if (filtres.fournisseurId && f.fournisseurId !== filtres.fournisseurId) return false;
      if (filtres.debut && (f.date || '') < filtres.debut) return false;
      if (filtres.fin && (f.date || '') > filtres.fin) return false;
      if (filtres.statut && f.statut !== filtres.statut) return false;
      return true;
    });
  }

  /**
   * Agrège les dépenses de tous les fournisseurs : par fournisseur, par famille,
   * par mois, par produit et croisement fournisseur × famille.
   */
  function tableauDeBord(db, filtres) {
    const factures = filtrerFactures(db.factures, filtres);
    const fournisseurs = new Map();
    const familles = new Map();
    const mois = new Map();
    const produits = new Map();
    const matrice = {};
    const totaux = { nbFactures: factures.length, totalHT: 0, totalTVA: 0, totalTTC: 0, paye: 0, aPayer: 0 };

    factures.forEach((f) => {
      const r = recapFacture(f, db.familles);
      const four = (db.fournisseurs || []).find((x) => x.id === f.fournisseurId);
      if (!fournisseurs.has(f.fournisseurId)) {
        fournisseurs.set(f.fournisseurId, {
          fournisseurId: f.fournisseurId,
          nom: four ? four.nom : 'Fournisseur supprimé',
          nbFactures: 0, totalHT: 0, totalTVA: 0, totalTTC: 0, paye: 0, aPayer: 0,
        });
      }
      const fr = fournisseurs.get(f.fournisseurId);
      const paye = f.statut === 'payee';
      fr.nbFactures += 1;
      fr.totalHT = arrondi(fr.totalHT + r.totalHT);
      fr.totalTVA = arrondi(fr.totalTVA + r.montantTVA);
      fr.totalTTC = arrondi(fr.totalTTC + r.totalTTC);
      fr[paye ? 'paye' : 'aPayer'] = arrondi(fr[paye ? 'paye' : 'aPayer'] + r.totalTTC);

      totaux.totalHT = arrondi(totaux.totalHT + r.totalHT);
      totaux.totalTVA = arrondi(totaux.totalTVA + r.montantTVA);
      totaux.totalTTC = arrondi(totaux.totalTTC + r.totalTTC);
      totaux[paye ? 'paye' : 'aPayer'] = arrondi(totaux[paye ? 'paye' : 'aPayer'] + r.totalTTC);

      const cleMois = (f.date || '').slice(0, 7) || 'Sans date';
      if (!mois.has(cleMois)) mois.set(cleMois, { mois: cleMois, totalHT: 0, totalTTC: 0 });
      const m = mois.get(cleMois);
      m.totalHT = arrondi(m.totalHT + r.totalHT);
      m.totalTTC = arrondi(m.totalTTC + r.totalTTC);

      r.parFamille.forEach((g) => {
        if (!familles.has(g.familleId)) familles.set(g.familleId, { familleId: g.familleId, nom: g.nom, totalHT: 0 });
        const fa = familles.get(g.familleId);
        fa.totalHT = arrondi(fa.totalHT + g.totalHT);

        matrice[f.fournisseurId] = matrice[f.fournisseurId] || {};
        matrice[f.fournisseurId][g.familleId] = arrondi((matrice[f.fournisseurId][g.familleId] || 0) + g.totalHT);

        g.lignes.forEach((l) => {
          const cle = (l.designation || '').trim().toLowerCase() + '|' + (l.unite || '');
          if (!produits.has(cle)) {
            produits.set(cle, { designation: l.designation, unite: l.unite, famille: g.nom, quantite: 0, totalHT: 0 });
          }
          const p = produits.get(cle);
          p.quantite = arrondi(p.quantite + nombre(l.quantite), 3);
          p.totalHT = arrondi(p.totalHT + l.total);
        });
      });
    });

    const parProduit = Array.from(produits.values())
      .map((p) => Object.assign(p, { prixMoyen: p.quantite ? arrondi(p.totalHT / p.quantite) : 0 }))
      .sort((a, b) => b.totalHT - a.totalHT);

    return {
      totaux,
      parFournisseur: Array.from(fournisseurs.values()).sort((a, b) => b.totalHT - a.totalHT),
      parFamille: Array.from(familles.values()).sort((a, b) => b.totalHT - a.totalHT),
      parMois: Array.from(mois.values()).sort((a, b) => a.mois.localeCompare(b.mois)),
      parProduit,
      matrice,
    };
  }

  const Calculs = { nombre, arrondi, totalLigne, recapFacture, filtrerFactures, tableauDeBord, nomFamille };

  if (typeof module !== 'undefined' && module.exports) module.exports = Calculs;
  else racine.Calculs = Calculs;
})(typeof window !== 'undefined' ? window : globalThis);
