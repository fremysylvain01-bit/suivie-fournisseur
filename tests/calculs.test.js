const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../js/calculs.js');

const familles = [{ id: 'b', nom: 'Béton' }, { id: 'e', nom: 'Électricité' }];
const fournisseurs = [{ id: 'f1', nom: 'Alpha' }, { id: 'f2', nom: 'Beta' }];

const f1 = {
  id: 'a', fournisseurId: 'f1', numero: '1', date: '2026-06-10', statut: 'payee', tauxTVA: 8.1,
  lignes: [
    { designation: 'Béton C25/30', familleId: 'b', unite: 'm³', quantite: 10, prixUnitaire: 185 },
    { designation: 'Câble', familleId: 'e', unite: 'm', quantite: 100.5, prixUnitaire: 2.35 },
  ],
};
const f2 = {
  id: 'b', fournisseurId: 'f2', numero: '2', date: '2026-07-01', statut: 'a_payer', tauxTVA: 8.1,
  lignes: [{ designation: 'Béton C25/30', familleId: 'b', unite: 'm³', quantite: '5', prixUnitaire: '180,50' }],
};

test('totalLigne = quantité × prix unitaire, arrondi au centime', () => {
  assert.equal(C.totalLigne({ quantite: 100.5, prixUnitaire: 2.35 }), 236.18);
  assert.equal(C.totalLigne({ quantite: '3', prixUnitaire: '1,10' }), 3.3);
  assert.equal(C.totalLigne({ quantite: '', prixUnitaire: 5 }), 0);
});

test('recapFacture : HT, TVA, TTC et sous-totaux par famille', () => {
  const r = C.recapFacture(f1, familles);
  assert.equal(r.totalHT, 2086.18);
  assert.equal(r.montantTVA, 168.98);
  assert.equal(r.totalTTC, 2255.16);
  assert.deepEqual(r.parFamille.map((g) => [g.nom, g.totalHT]), [['Béton', 1850], ['Électricité', 236.18]]);
});

test('tableauDeBord agrège tous les fournisseurs', () => {
  const t = C.tableauDeBord({ familles, fournisseurs, factures: [f1, f2] });
  assert.equal(t.totaux.nbFactures, 2);
  assert.equal(t.totaux.totalHT, 2988.68);
  assert.equal(t.totaux.aPayer, C.recapFacture(f2, familles).totalTTC);
  assert.deepEqual(t.parFournisseur.map((x) => x.nom), ['Alpha', 'Beta']);
  assert.equal(t.parFamille[0].totalHT, 2752.5);
  assert.equal(t.matrice.f2.b, 902.5);
  assert.deepEqual(t.parMois.map((m) => m.mois), ['2026-06', '2026-07']);
  const beton = t.parProduit.find((p) => p.designation === 'Béton C25/30');
  assert.equal(beton.quantite, 15);
  assert.equal(beton.prixMoyen, 183.5);
});

test('filtres par fournisseur et par période', () => {
  const db = { familles, fournisseurs, factures: [f1, f2] };
  assert.equal(C.tableauDeBord(db, { fournisseurId: 'f2' }).totaux.nbFactures, 1);
  assert.equal(C.tableauDeBord(db, { debut: '2026-06-15' }).totaux.nbFactures, 1);
  assert.equal(C.tableauDeBord(db, { fin: '2026-05-01' }).totaux.nbFactures, 0);
});
