/*
 * Stockage des données dans le navigateur (localStorage) + import / export.
 */
(function () {
  'use strict';

  const CLE = 'suivi-fournisseurs-chantier-v1';

  const UNITES = ['u', 'pce', 'm', 'ml', 'm²', 'm³', 'kg', 't', 'l', 'sac', 'palette', 'rouleau', 'h', 'jour', 'forfait'];

  const FAMILLES_DEFAUT = [
    'Gros œuvre',
    'Béton & mortier',
    'Ferraillage',
    'Bois & coffrage',
    'Isolation',
    'Électricité',
    'Sanitaire & chauffage',
    'Location de matériel',
    'Transport & évacuation',
    'Divers',
  ];

  function nouvelId() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') {
      try { return window.crypto.randomUUID(); } catch (e) { /* contexte non sécurisé */ }
    }
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  }

  function baseVide() {
    return {
      version: 1,
      parametres: { chantier: '', devise: 'CHF', tauxTVA: 8.1 },
      fournisseurs: [],
      familles: FAMILLES_DEFAUT.map((nom) => ({ id: nouvelId(), nom })),
      produits: [],
      factures: [],
    };
  }

  function normaliser(d) {
    const base = baseVide();
    if (!d || typeof d !== 'object') return base;
    return {
      version: 1,
      parametres: Object.assign(base.parametres, d.parametres || {}),
      fournisseurs: Array.isArray(d.fournisseurs) ? d.fournisseurs : [],
      familles: Array.isArray(d.familles) ? d.familles : base.familles,
      produits: Array.isArray(d.produits) ? d.produits : [],
      factures: Array.isArray(d.factures) ? d.factures : [],
    };
  }

  function charger() {
    try {
      const brut = window.localStorage.getItem(CLE);
      if (brut) return normaliser(JSON.parse(brut));
    } catch (e) {
      console.warn('Lecture des données impossible', e);
    }
    return baseVide();
  }

  const Store = {
    UNITES,
    db: charger(),
    nouvelId,

    sauver() {
      try {
        window.localStorage.setItem(CLE, JSON.stringify(this.db));
        return true;
      } catch (e) {
        console.error(e);
        return false;
      }
    },

    remplacer(donnees) {
      this.db = normaliser(donnees);
      this.sauver();
    },

    reinitialiser() {
      this.db = baseVide();
      this.sauver();
    },

    exporterJSON() {
      return JSON.stringify(this.db, null, 2);
    },

    /** Upsert générique sur une collection. */
    enregistrer(collection, objet) {
      const liste = this.db[collection];
      if (!objet.id) objet.id = nouvelId();
      const i = liste.findIndex((x) => x.id === objet.id);
      if (i >= 0) liste[i] = objet;
      else liste.push(objet);
      this.sauver();
      return objet;
    },

    supprimer(collection, id) {
      this.db[collection] = this.db[collection].filter((x) => x.id !== id);
      this.sauver();
    },

    trouver(collection, id) {
      return this.db[collection].find((x) => x.id === id) || null;
    },

    /** Jeu de données de démonstration. */
    chargerExemple() {
      const db = baseVide();
      db.parametres.chantier = 'Immeuble Les Tilleuls – Lausanne';
      const fam = {};
      db.familles.forEach((f) => { fam[f.nom] = f.id; });

      const four = (nom, contact, telephone, email) => {
        const f = { id: nouvelId(), nom, contact, telephone, email, adresse: '', notes: '' };
        db.fournisseurs.push(f);
        return f.id;
      };
      const bat = four('Matériaux Romands SA', 'J. Dupuis', '021 555 12 34', 'commandes@materiaux-romands.ch');
      const beton = four('Béton Express Sàrl', 'M. Rochat', '021 555 98 76', 'info@beton-express.ch');
      const elec = four('ÉlecPro Distribution', 'S. Favre', '022 555 44 11', 'vente@elecpro.ch');
      const loc = four('LocaMachines SA', 'P. Morel', '026 555 66 77', 'location@locamachines.ch');

      const prod = (nom, famille, unite, prixUnitaire) => {
        const p = { id: nouvelId(), nom, familleId: fam[famille], unite, prixUnitaire, reference: '' };
        db.produits.push(p);
        return p;
      };
      const P = {
        ciment: prod('Ciment CEM II 25 kg', 'Béton & mortier', 'sac', 9.8),
        beton: prod('Béton C25/30 livré', 'Béton & mortier', 'm³', 185),
        brique: prod('Brique terre cuite 15 cm', 'Gros œuvre', 'm²', 42.5),
        fer: prod('Fer à béton B500B Ø12', 'Ferraillage', 'kg', 1.65),
        treillis: prod('Treillis K188', 'Ferraillage', 'pce', 68),
        panneau: prod('Panneau coffrage 3 plis 27 mm', 'Bois & coffrage', 'm²', 31),
        laine: prod('Laine de roche 140 mm', 'Isolation', 'm²', 24.9),
        cable: prod('Câble TT 3×2.5 mm²', 'Électricité', 'm', 2.35),
        boite: prod("Boîte d'encastrement", 'Électricité', 'pce', 1.9),
        grue: prod('Location grue mobile', 'Location de matériel', 'jour', 950),
        mini: prod('Location mini-pelle 3 t', 'Location de matériel', 'jour', 320),
        benne: prod('Benne 7 m³ évacuation', 'Transport & évacuation', 'pce', 480),
      };

      const ligne = (p, quantite, prix) => ({
        id: nouvelId(), produitId: p.id, designation: p.nom, familleId: p.familleId,
        unite: p.unite, quantite, prixUnitaire: prix != null ? prix : p.prixUnitaire,
      });
      const facture = (fournisseurId, numero, date, statut, lignes) => {
        db.factures.push({ id: nouvelId(), fournisseurId, numero, date, statut, tauxTVA: 8.1, notes: '', lignes });
      };

      facture(bat, 'MR-2026-0412', '2026-06-04', 'payee', [ligne(P.ciment, 120), ligne(P.brique, 210), ligne(P.panneau, 85)]);
      facture(bat, 'MR-2026-0587', '2026-07-15', 'payee', [ligne(P.brique, 180, 41.9), ligne(P.laine, 320), ligne(P.ciment, 60)]);
      facture(bat, 'MR-2026-0733', '2026-09-02', 'a_payer', [ligne(P.fer, 2400), ligne(P.treillis, 36), ligne(P.laine, 140)]);
      facture(beton, 'BE-1188', '2026-06-18', 'payee', [ligne(P.beton, 42)]);
      facture(beton, 'BE-1254', '2026-08-06', 'payee', [ligne(P.beton, 58, 182)]);
      facture(beton, 'BE-1302', '2026-09-24', 'a_payer', [ligne(P.beton, 31, 182)]);
      facture(elec, 'EP-55102', '2026-08-21', 'payee', [ligne(P.cable, 1500), ligne(P.boite, 260)]);
      facture(elec, 'EP-55890', '2026-10-01', 'a_payer', [ligne(P.cable, 800), ligne(P.boite, 120)]);
      facture(loc, 'LM-26-301', '2026-06-30', 'payee', [ligne(P.grue, 6), ligne(P.mini, 10), ligne(P.benne, 3)]);
      facture(loc, 'LM-26-377', '2026-08-31', 'payee', [ligne(P.grue, 4), ligne(P.benne, 2)]);

      this.db = db;
      this.sauver();
    },
  };

  window.Store = Store;
})();
