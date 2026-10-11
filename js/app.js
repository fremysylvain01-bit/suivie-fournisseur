/*
 * Interface : navigation, tableau de bord, factures, fournisseurs, produits, paramètres.
 */
(function () {
  'use strict';

  const C = window.Calculs;
  const S = window.Store;
  const vue = document.getElementById('vue');

  // ---------------------------------------------------------------- utilitaires

  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function money(n) {
    try {
      return new Intl.NumberFormat('fr-CH', { style: 'currency', currency: S.db.parametres.devise || 'CHF' }).format(n || 0);
    } catch (e) {
      return new Intl.NumberFormat('fr-CH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0) + ' ' + (S.db.parametres.devise || '');
    }
  }
  const qte = (n) => new Intl.NumberFormat('fr-CH', { maximumFractionDigits: 3 }).format(n || 0);
  const pct = (n) => new Intl.NumberFormat('fr-CH', { style: 'percent', maximumFractionDigits: 1 }).format(n || 0);

  function date(iso) {
    if (!iso) return '—';
    const [a, m, j] = iso.split('-');
    return j && m ? `${j}.${m}.${a}` : iso;
  }

  const MOIS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
  function libelleMois(cle) {
    const [a, m] = cle.split('-');
    return m ? `${MOIS[Number(m) - 1]} ${a}` : cle;
  }

  const aujourdhui = () => new Date().toISOString().slice(0, 10);
  const nomFournisseur = (id) => (S.trouver('fournisseurs', id) || { nom: 'Fournisseur supprimé' }).nom;
  const nomFamille = (id) => C.nomFamille(S.db.familles, id);
  const famillesTriees = () => S.db.familles.slice().sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
  const fournisseursTries = () => S.db.fournisseurs.slice().sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));

  function toast(message, type) {
    const t = document.getElementById('toast');
    t.textContent = message;
    t.className = 'toast visible ' + (type || '');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => { t.className = 'toast'; }, 2600);
  }

  function badgeStatut(statut) {
    return statut === 'payee'
      ? '<span class="badge ok">Payée</span>'
      : '<span class="badge attente">À payer</span>';
  }

  function options(liste, valeur, vide) {
    return (vide != null ? `<option value="">${esc(vide)}</option>` : '') +
      liste.map((o) => `<option value="${esc(o.value)}"${o.value === valeur ? ' selected' : ''}>${esc(o.label)}</option>`).join('');
  }

  const optsFournisseurs = (v, vide) => options(fournisseursTries().map((f) => ({ value: f.id, label: f.nom })), v, vide);
  const optsFamilles = (v, vide) => options(famillesTriees().map((f) => ({ value: f.id, label: f.nom })), v, vide);
  const optsUnites = (v) => {
    const liste = S.UNITES.slice();
    if (v && !liste.includes(v)) liste.push(v);
    return options(liste.map((u) => ({ value: u, label: u })), v);
  };

  function barre(valeur, max, libelle, montant) {
    const w = max > 0 ? Math.max(0.5, (valeur / max) * 100) : 0;
    return `<div class="barre-ligne">
      <div class="barre-libelle" title="${esc(libelle)}">${esc(libelle)}</div>
      <div class="barre-piste"><div class="barre" style="width:${w.toFixed(2)}%"></div></div>
      <div class="barre-valeur">${montant}</div>
    </div>`;
  }

  function telecharger(nom, contenu, type) {
    const blob = new Blob([contenu], { type });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = nom;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 0);
  }

  // ---------------------------------------------------------------- modale générique

  const modale = document.getElementById('modale');

  /**
   * champs : [{ nom, label, type: text|number|email|tel|select|textarea, valeur, requis, options(html), step }]
   */
  function formulaire({ titre, champs, onValider, libelleValider }) {
    const html = champs.map((c) => {
      const id = 'champ-' + c.nom;
      const req = c.requis ? ' required' : '';
      let input;
      if (c.type === 'select') input = `<select id="${id}" name="${c.nom}"${req}>${c.options}</select>`;
      else if (c.type === 'textarea') input = `<textarea id="${id}" name="${c.nom}" rows="3">${esc(c.valeur)}</textarea>`;
      else input = `<input id="${id}" name="${c.nom}" type="${c.type || 'text'}"${c.step ? ` step="${c.step}"` : ''}${c.type === 'number' ? ' min="0" inputmode="decimal"' : ''} value="${esc(c.valeur)}"${req}>`;
      return `<label class="champ" for="${id}"><span>${esc(c.label)}${c.requis ? ' *' : ''}</span>${input}</label>`;
    }).join('');

    modale.innerHTML = `<form method="dialog" class="modale-form">
      <h2>${esc(titre)}</h2>
      <div class="champs">${html}</div>
      <p class="erreur" hidden></p>
      <div class="actions">
        <button type="button" class="btn" data-fermer>Annuler</button>
        <button type="submit" class="btn primaire">${esc(libelleValider || 'Enregistrer')}</button>
      </div>
    </form>`;
    const form = modale.querySelector('form');
    form.querySelector('[data-fermer]').addEventListener('click', () => modale.close());
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const valeurs = Object.fromEntries(new FormData(form).entries());
      Object.keys(valeurs).forEach((k) => { if (typeof valeurs[k] === 'string') valeurs[k] = valeurs[k].trim(); });
      const erreur = onValider(valeurs);
      if (erreur) {
        const p = form.querySelector('.erreur');
        p.textContent = erreur;
        p.hidden = false;
        return;
      }
      modale.close();
      route();
    });
    modale.showModal();
    const premier = form.querySelector('input, select, textarea');
    if (premier) premier.focus();
  }

  function confirmer(message) {
    return window.confirm(message);
  }

  // ---------------------------------------------------------------- tableau de bord

  const filtresTDB = { debut: '', fin: '', fournisseurId: '' };

  function vueTableauDeBord() {
    if (!S.db.factures.length) {
      vue.innerHTML = `<section class="vide">
        <h1>Tableau de bord</h1>
        <p>Aucune facture enregistrée pour le moment.</p>
        <p>Commencez par créer vos <a href="#/fournisseurs">fournisseurs</a> et votre <a href="#/produits">catalogue de produits</a>,
        puis saisissez vos <a href="#/factures/nouvelle">factures</a>.</p>
        <p><button class="btn" data-action="exemple">Charger des données d'exemple</button></p>
      </section>`;
      return;
    }

    const t = C.tableauDeBord(S.db, filtresTDB);
    const tx = t.totaux;
    const maxFour = Math.max(0, ...t.parFournisseur.map((x) => x.totalHT));
    const maxFam = Math.max(0, ...t.parFamille.map((x) => x.totalHT));
    const maxMois = Math.max(0, ...t.parMois.map((x) => x.totalHT));
    const famillesUtilisees = t.parFamille;

    vue.innerHTML = `
      <div class="titre-page">
        <h1>Tableau de bord</h1>
        <form class="filtres" id="filtres-tdb">
          <label>Du <input type="date" name="debut" value="${esc(filtresTDB.debut)}"></label>
          <label>Au <input type="date" name="fin" value="${esc(filtresTDB.fin)}"></label>
          <label>Fournisseur <select name="fournisseurId">${optsFournisseurs(filtresTDB.fournisseurId, 'Tous')}</select></label>
          <button type="button" class="btn petit" data-action="raz-filtres">Réinitialiser</button>
        </form>
      </div>

      <section class="kpis">
        <div class="kpi"><span>Dépenses HT</span><strong>${money(tx.totalHT)}</strong></div>
        <div class="kpi"><span>TVA</span><strong>${money(tx.totalTVA)}</strong></div>
        <div class="kpi accent"><span>Dépenses TTC</span><strong>${money(tx.totalTTC)}</strong></div>
        <div class="kpi"><span>Payé (TTC)</span><strong>${money(tx.paye)}</strong></div>
        <div class="kpi alerte"><span>Reste à payer (TTC)</span><strong>${money(tx.aPayer)}</strong></div>
        <div class="kpi"><span>Factures</span><strong>${tx.nbFactures}</strong></div>
      </section>

      <div class="grille-2">
        <section class="carte">
          <h2>Dépenses par fournisseur (HT)</h2>
          ${t.parFournisseur.map((f) => barre(f.totalHT, maxFour, f.nom, money(f.totalHT))).join('') || '<p class="muet">Aucune donnée.</p>'}
        </section>
        <section class="carte">
          <h2>Dépenses par famille de produits (HT)</h2>
          ${t.parFamille.map((f) => barre(f.totalHT, maxFam, f.nom, money(f.totalHT))).join('') || '<p class="muet">Aucune donnée.</p>'}
        </section>
      </div>

      <section class="carte">
        <h2>Récapitulatif par fournisseur</h2>
        <div class="table-scroll"><table>
          <thead><tr><th>Fournisseur</th><th class="num">Factures</th><th class="num">Total HT</th><th class="num">TVA</th>
          <th class="num">Total TTC</th><th class="num">Payé</th><th class="num">À payer</th><th class="num">Part</th></tr></thead>
          <tbody>${t.parFournisseur.map((f) => `<tr>
            <td><a href="#/fournisseurs/${esc(f.fournisseurId)}">${esc(f.nom)}</a></td>
            <td class="num">${f.nbFactures}</td><td class="num">${money(f.totalHT)}</td><td class="num">${money(f.totalTVA)}</td>
            <td class="num"><strong>${money(f.totalTTC)}</strong></td><td class="num">${money(f.paye)}</td>
            <td class="num${f.aPayer > 0 ? ' rouge' : ''}">${money(f.aPayer)}</td>
            <td class="num">${pct(tx.totalHT ? f.totalHT / tx.totalHT : 0)}</td></tr>`).join('')}</tbody>
          <tfoot><tr><th>Total</th><th class="num">${tx.nbFactures}</th><th class="num">${money(tx.totalHT)}</th><th class="num">${money(tx.totalTVA)}</th>
          <th class="num">${money(tx.totalTTC)}</th><th class="num">${money(tx.paye)}</th><th class="num">${money(tx.aPayer)}</th><th class="num">100 %</th></tr></tfoot>
        </table></div>
      </section>

      <section class="carte">
        <h2>Fournisseurs × familles de produits (HT)</h2>
        <div class="table-scroll"><table class="matrice">
          <thead><tr><th>Fournisseur</th>${famillesUtilisees.map((f) => `<th class="num">${esc(f.nom)}</th>`).join('')}<th class="num">Total</th></tr></thead>
          <tbody>${t.parFournisseur.map((f) => `<tr><td>${esc(f.nom)}</td>${famillesUtilisees.map((fa) => {
            const v = (t.matrice[f.fournisseurId] || {})[fa.familleId] || 0;
            return `<td class="num${v ? '' : ' muet'}">${v ? money(v) : '—'}</td>`;
          }).join('')}<td class="num"><strong>${money(f.totalHT)}</strong></td></tr>`).join('')}</tbody>
          <tfoot><tr><th>Total</th>${famillesUtilisees.map((f) => `<th class="num">${money(f.totalHT)}</th>`).join('')}<th class="num">${money(tx.totalHT)}</th></tr></tfoot>
        </table></div>
      </section>

      <div class="grille-2">
        <section class="carte">
          <h2>Évolution mensuelle (HT)</h2>
          ${t.parMois.map((m) => barre(m.totalHT, maxMois, libelleMois(m.mois), money(m.totalHT))).join('') || '<p class="muet">Aucune donnée.</p>'}
        </section>
        <section class="carte">
          <h2>Principaux produits achetés</h2>
          <div class="table-scroll"><table>
            <thead><tr><th>Produit</th><th>Famille</th><th class="num">Quantité</th><th class="num">Prix moyen</th><th class="num">Total HT</th></tr></thead>
            <tbody>${t.parProduit.slice(0, 10).map((p) => `<tr><td>${esc(p.designation)}</td><td>${esc(p.famille)}</td>
              <td class="num">${qte(p.quantite)} ${esc(p.unite)}</td><td class="num">${money(p.prixMoyen)}</td>
              <td class="num">${money(p.totalHT)}</td></tr>`).join('')}</tbody>
          </table></div>
        </section>
      </div>`;

    document.getElementById('filtres-tdb').addEventListener('change', (e) => {
      filtresTDB[e.target.name] = e.target.value;
      vueTableauDeBord();
    });
  }

  // ---------------------------------------------------------------- factures : liste

  const filtresFactures = { fournisseurId: '', statut: '', recherche: '' };

  function vueFactures() {
    const recherche = filtresFactures.recherche.toLowerCase();
    const factures = C.filtrerFactures(S.db.factures, filtresFactures)
      .filter((f) => !recherche || (f.numero || '').toLowerCase().includes(recherche) ||
        nomFournisseur(f.fournisseurId).toLowerCase().includes(recherche))
      .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    let totHT = 0; let totTTC = 0;
    const lignes = factures.map((f) => {
      const r = C.recapFacture(f, S.db.familles);
      totHT += r.totalHT; totTTC += r.totalTTC;
      return `<tr class="cliquable" data-href="#/factures/${esc(f.id)}">
        <td>${date(f.date)}</td><td><a href="#/factures/${esc(f.id)}">${esc(f.numero)}</a></td>
        <td>${esc(nomFournisseur(f.fournisseurId))}</td>
        <td>${r.parFamille.map((g) => `<span class="puce">${esc(g.nom)}</span>`).join(' ')}</td>
        <td class="num">${money(r.totalHT)}</td><td class="num">${money(r.totalTTC)}</td><td>${badgeStatut(f.statut)}</td></tr>`;
    }).join('');

    vue.innerHTML = `
      <div class="titre-page">
        <h1>Factures</h1>
        <a class="btn primaire" href="#/factures/nouvelle">+ Nouvelle facture</a>
      </div>
      <form class="filtres" id="filtres-factures">
        <label>Recherche <input type="search" name="recherche" placeholder="N° ou fournisseur" value="${esc(filtresFactures.recherche)}"></label>
        <label>Fournisseur <select name="fournisseurId">${optsFournisseurs(filtresFactures.fournisseurId, 'Tous')}</select></label>
        <label>Statut <select name="statut">${options([{ value: 'a_payer', label: 'À payer' }, { value: 'payee', label: 'Payée' }], filtresFactures.statut, 'Tous')}</select></label>
      </form>
      <section class="carte">
        ${factures.length ? `<div class="table-scroll"><table>
          <thead><tr><th>Date</th><th>N° facture</th><th>Fournisseur</th><th>Familles</th><th class="num">Total HT</th><th class="num">Total TTC</th><th>Statut</th></tr></thead>
          <tbody>${lignes}</tbody>
          <tfoot><tr><th colspan="4">${factures.length} facture(s)</th><th class="num">${money(C.arrondi(totHT))}</th><th class="num">${money(C.arrondi(totTTC))}</th><th></th></tr></tfoot>
        </table></div>` : `<p class="muet">Aucune facture${S.db.factures.length ? ' ne correspond aux filtres' : ''}.</p>`}
      </section>`;

    const form = document.getElementById('filtres-factures');
    form.addEventListener('change', (e) => { filtresFactures[e.target.name] = e.target.value; vueFactures(); });
    form.recherche.addEventListener('input', (e) => {
      filtresFactures.recherche = e.target.value;
      clearTimeout(vueFactures._t);
      vueFactures._t = setTimeout(() => {
        vueFactures();
        const champ = document.querySelector('#filtres-factures [name=recherche]');
        champ.focus();
        champ.setSelectionRange(champ.value.length, champ.value.length);
      }, 250);
    });
    form.addEventListener('submit', (e) => e.preventDefault());
  }

  // ---------------------------------------------------------------- factures : récapitulatif

  function vueRecapFacture(id) {
    const f = S.trouver('factures', id);
    if (!f) { vue.innerHTML = '<p>Facture introuvable. <a href="#/factures">Retour</a></p>'; return; }
    const four = S.trouver('fournisseurs', f.fournisseurId);
    const r = C.recapFacture(f, S.db.familles);

    vue.innerHTML = `
      <div class="titre-page">
        <div>
          <a href="#/factures" class="retour no-print">← Factures</a>
          <h1>Facture ${esc(f.numero)}</h1>
        </div>
        <div class="boutons no-print">
          <button class="btn" data-action="statut-facture" data-id="${esc(f.id)}">${f.statut === 'payee' ? 'Marquer à payer' : 'Marquer payée'}</button>
          <a class="btn" href="#/factures/${esc(f.id)}/modifier">Modifier</a>
          <button class="btn" data-action="dupliquer-facture" data-id="${esc(f.id)}">Dupliquer</button>
          <button class="btn" onclick="window.print()">Imprimer</button>
          <button class="btn danger" data-action="supprimer-facture" data-id="${esc(f.id)}">Supprimer</button>
        </div>
      </div>

      <section class="carte entete-facture">
        <div><span class="muet">Fournisseur</span><strong><a href="#/fournisseurs/${esc(f.fournisseurId)}">${esc(four ? four.nom : 'Fournisseur supprimé')}</a></strong>
          ${four && four.contact ? `<div>${esc(four.contact)}</div>` : ''}</div>
        <div><span class="muet">Date</span><strong>${date(f.date)}</strong></div>
        <div><span class="muet">Chantier</span><strong>${esc(S.db.parametres.chantier || '—')}</strong></div>
        <div><span class="muet">Statut</span>${badgeStatut(f.statut)}</div>
      </section>

      <section class="carte">
        <h2>Détail par famille de produits</h2>
        <div class="table-scroll"><table>
          <thead><tr><th>Produit</th><th>Unité</th><th class="num">Quantité</th><th class="num">Prix unitaire</th><th class="num">Prix total</th></tr></thead>
          <tbody>${r.parFamille.map((g) => `
            <tr class="groupe"><td colspan="5">${esc(g.nom)}</td></tr>
            ${g.lignes.map((l) => `<tr><td>${esc(l.designation)}</td><td>${esc(l.unite)}</td><td class="num">${qte(C.nombre(l.quantite))}</td>
              <td class="num">${money(C.nombre(l.prixUnitaire))}</td><td class="num">${money(l.total)}</td></tr>`).join('')}
            <tr class="sous-total"><td colspan="4">Sous-total ${esc(g.nom)}</td><td class="num">${money(g.totalHT)}</td></tr>`).join('')}
          </tbody>
        </table></div>
      </section>

      <div class="grille-2">
        <section class="carte">
          <h2>Récapitulatif par famille</h2>
          <table>
            <thead><tr><th>Famille</th><th class="num">Lignes</th><th class="num">Total HT</th><th class="num">Part</th></tr></thead>
            <tbody>${r.parFamille.map((g) => `<tr><td>${esc(g.nom)}</td><td class="num">${g.nbLignes}</td>
              <td class="num">${money(g.totalHT)}</td><td class="num">${pct(r.totalHT ? g.totalHT / r.totalHT : 0)}</td></tr>`).join('')}</tbody>
          </table>
        </section>
        <section class="carte totaux">
          <h2>Totaux</h2>
          <dl>
            <dt>Total HT</dt><dd>${money(r.totalHT)}</dd>
            <dt>TVA ${qte(r.tauxTVA)} %</dt><dd>${money(r.montantTVA)}</dd>
            <dt class="ttc">Total TTC</dt><dd class="ttc">${money(r.totalTTC)}</dd>
          </dl>
          ${f.notes ? `<p class="notes">${esc(f.notes)}</p>` : ''}
        </section>
      </div>`;
  }

  // ---------------------------------------------------------------- factures : édition

  let brouillon = null;

  function ligneVide() {
    return { id: S.nouvelId(), produitId: '', designation: '', familleId: '', unite: 'u', quantite: '', prixUnitaire: '' };
  }

  function optsProduits(valeur) {
    let html = '<option value="">— Saisie libre —</option>';
    famillesTriees().forEach((fa) => {
      const prods = S.db.produits.filter((p) => p.familleId === fa.id).sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
      if (!prods.length) return;
      html += `<optgroup label="${esc(fa.nom)}">${prods.map((p) =>
        `<option value="${esc(p.id)}"${p.id === valeur ? ' selected' : ''}>${esc(p.nom)} (${esc(p.unite)})</option>`).join('')}</optgroup>`;
    });
    const orphelins = S.db.produits.filter((p) => !S.trouver('familles', p.familleId));
    if (orphelins.length) {
      html += `<optgroup label="Sans famille">${orphelins.map((p) =>
        `<option value="${esc(p.id)}"${p.id === valeur ? ' selected' : ''}>${esc(p.nom)} (${esc(p.unite)})</option>`).join('')}</optgroup>`;
    }
    return html;
  }

  function htmlLigne(l, i) {
    return `<tr data-index="${i}">
      <td data-label="Produit catalogue"><select data-champ="produitId">${optsProduits(l.produitId)}</select></td>
      <td data-label="Désignation"><input data-champ="designation" value="${esc(l.designation)}" placeholder="Désignation" required></td>
      <td data-label="Famille"><select data-champ="familleId">${optsFamilles(l.familleId, '— Famille —')}</select></td>
      <td data-label="Unité"><select data-champ="unite">${optsUnites(l.unite)}</select></td>
      <td data-label="Quantité"><input data-champ="quantite" type="number" step="any" min="0" inputmode="decimal" value="${esc(l.quantite)}" class="num" required></td>
      <td data-label="Prix unitaire"><input data-champ="prixUnitaire" type="number" step="any" min="0" inputmode="decimal" value="${esc(l.prixUnitaire)}" class="num" required></td>
      <td data-label="Prix total" class="num total-ligne">${money(C.totalLigne(l))}</td>
      <td><button type="button" class="btn icone danger" data-action="supprimer-ligne" title="Supprimer la ligne" aria-label="Supprimer la ligne">✕</button></td>
    </tr>`;
  }

  function majTotauxBrouillon() {
    const form = document.getElementById('form-facture');
    if (!form) return;
    form.querySelectorAll('#lignes tr').forEach((tr) => {
      const l = brouillon.lignes[Number(tr.dataset.index)];
      tr.querySelector('.total-ligne').textContent = money(C.totalLigne(l));
    });
    const r = C.recapFacture(brouillon, S.db.familles);
    document.getElementById('recap-brouillon').innerHTML = `
      <table class="compact">
        ${r.parFamille.map((g) => `<tr><td>${esc(g.nom)}</td><td class="num">${money(g.totalHT)}</td></tr>`).join('')}
      </table>
      <dl>
        <dt>Total HT</dt><dd>${money(r.totalHT)}</dd>
        <dt>TVA ${qte(r.tauxTVA)} %</dt><dd>${money(r.montantTVA)}</dd>
        <dt class="ttc">Total TTC</dt><dd class="ttc">${money(r.totalTTC)}</dd>
      </dl>`;
  }

  function rendreLignes() {
    document.getElementById('lignes').innerHTML = brouillon.lignes.map(htmlLigne).join('');
    majTotauxBrouillon();
  }

  function vueEditionFacture(id, copieDe) {
    if (!S.db.fournisseurs.length) {
      vue.innerHTML = `<section class="vide"><h1>Nouvelle facture</h1>
        <p>Vous devez d'abord créer au moins un fournisseur.</p>
        <p><a class="btn primaire" href="#/fournisseurs">Gérer les fournisseurs</a></p></section>`;
      return;
    }
    const existante = id ? S.trouver('factures', id) : null;
    if (id && !existante) { vue.innerHTML = '<p>Facture introuvable. <a href="#/factures">Retour</a></p>'; return; }
    const source = existante || (copieDe ? S.trouver('factures', copieDe) : null);

    brouillon = source ? JSON.parse(JSON.stringify(source)) : {
      fournisseurId: '', numero: '', date: aujourdhui(), statut: 'a_payer',
      tauxTVA: S.db.parametres.tauxTVA, notes: '', lignes: [ligneVide()],
    };
    if (!existante) {
      delete brouillon.id;
      if (source) { brouillon.numero = ''; brouillon.date = aujourdhui(); brouillon.statut = 'a_payer'; }
      brouillon.lignes.forEach((l) => { l.id = S.nouvelId(); });
    }

    vue.innerHTML = `
      <div class="titre-page">
        <div><a href="${existante ? '#/factures/' + esc(existante.id) : '#/factures'}" class="retour">← Retour</a>
        <h1>${existante ? 'Modifier la facture ' + esc(existante.numero) : 'Nouvelle facture'}</h1></div>
      </div>
      <form id="form-facture" novalidate>
        <section class="carte champs-facture">
          <label class="champ"><span>Fournisseur *</span><select name="fournisseurId" required>${optsFournisseurs(brouillon.fournisseurId, '— Choisir —')}</select></label>
          <label class="champ"><span>N° de facture *</span><input name="numero" value="${esc(brouillon.numero)}" required></label>
          <label class="champ"><span>Date *</span><input name="date" type="date" value="${esc(brouillon.date)}" required></label>
          <label class="champ"><span>Statut</span><select name="statut">${options([{ value: 'a_payer', label: 'À payer' }, { value: 'payee', label: 'Payée' }], brouillon.statut)}</select></label>
          <label class="champ"><span>Taux TVA (%)</span><input name="tauxTVA" type="number" step="any" min="0" value="${esc(brouillon.tauxTVA)}"></label>
          <label class="champ large"><span>Notes</span><input name="notes" value="${esc(brouillon.notes)}" placeholder="Bon de livraison, remarque…"></label>
        </section>

        <section class="carte">
          <h2>Lignes de la facture</h2>
          <div class="table-scroll"><table class="table-lignes">
            <thead><tr><th>Produit catalogue</th><th>Désignation</th><th>Famille</th><th>Unité</th>
            <th class="num">Quantité</th><th class="num">Prix unitaire</th><th class="num">Prix total</th><th></th></tr></thead>
            <tbody id="lignes"></tbody>
          </table></div>
          <button type="button" class="btn" data-action="ajouter-ligne">+ Ajouter une ligne</button>
        </section>

        <div class="grille-2">
          <section class="carte"><p class="muet">Astuce : choisissez un produit du catalogue pour remplir automatiquement
            la désignation, la famille, l'unité et le prix unitaire. Une ligne en saisie libre peut être ajoutée au catalogue
            en cochant la case ci-dessous.</p>
            <label class="case"><input type="checkbox" name="ajouterCatalogue" checked> Ajouter les lignes libres au catalogue de produits</label>
          </section>
          <section class="carte totaux"><h2>Récapitulatif</h2><div id="recap-brouillon"></div></section>
        </div>

        <p class="erreur" id="erreur-facture" hidden></p>
        <div class="actions">
          <a class="btn" href="${existante ? '#/factures/' + esc(existante.id) : '#/factures'}">Annuler</a>
          <button type="submit" class="btn primaire">Enregistrer la facture</button>
        </div>
      </form>`;

    rendreLignes();
    const form = document.getElementById('form-facture');

    form.addEventListener('input', (e) => {
      const champ = e.target.dataset.champ;
      if (champ) {
        const l = brouillon.lignes[Number(e.target.closest('tr').dataset.index)];
        if (champ === 'produitId') return; // géré sur "change"
        l[champ] = e.target.value;
        if (champ === 'designation' && l.produitId) {
          // Désignation modifiée à la main : la ligne n'est plus liée au produit du catalogue
          const p = S.trouver('produits', l.produitId);
          if (!p || p.nom !== l.designation) {
            l.produitId = '';
            e.target.closest('tr').querySelector('[data-champ=produitId]').value = '';
          }
        }
      } else if (e.target.name && e.target.name in brouillon) {
        brouillon[e.target.name] = e.target.value;
      }
      majTotauxBrouillon();
    });

    form.addEventListener('change', (e) => {
      const champ = e.target.dataset.champ;
      if (champ === 'produitId') {
        const tr = e.target.closest('tr');
        const i = Number(tr.dataset.index);
        const l = brouillon.lignes[i];
        const p = S.trouver('produits', e.target.value);
        l.produitId = e.target.value;
        if (p) Object.assign(l, { designation: p.nom, familleId: p.familleId, unite: p.unite, prixUnitaire: p.prixUnitaire });
        tr.outerHTML = htmlLigne(l, i);
        majTotauxBrouillon();
        const q = form.querySelector(`#lignes tr[data-index="${i}"] [data-champ=quantite]`);
        if (p && q) q.focus();
      } else if (champ === 'familleId' || champ === 'unite') {
        brouillon.lignes[Number(e.target.closest('tr').dataset.index)][champ] = e.target.value;
        majTotauxBrouillon();
      }
    });

    form.addEventListener('click', (e) => {
      const b = e.target.closest('[data-action]');
      if (!b) return;
      if (b.dataset.action === 'ajouter-ligne') {
        brouillon.lignes.push(ligneVide());
        rendreLignes();
        const tr = form.querySelector('#lignes tr:last-child select');
        if (tr) tr.focus();
      } else if (b.dataset.action === 'supprimer-ligne') {
        brouillon.lignes.splice(Number(b.closest('tr').dataset.index), 1);
        if (!brouillon.lignes.length) brouillon.lignes.push(ligneVide());
        rendreLignes();
      }
    });

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const erreur = (msg) => {
        const p = document.getElementById('erreur-facture');
        p.textContent = msg; p.hidden = false;
      };
      ['fournisseurId', 'numero', 'date', 'statut', 'tauxTVA', 'notes'].forEach((k) => { brouillon[k] = form[k].value.trim(); });
      brouillon.tauxTVA = C.nombre(brouillon.tauxTVA);
      if (!brouillon.fournisseurId) return erreur('Choisissez un fournisseur.');
      if (!brouillon.numero) return erreur('Le numéro de facture est obligatoire.');
      if (!brouillon.date) return erreur('La date est obligatoire.');
      const doublon = S.db.factures.find((f) => f.id !== brouillon.id && f.fournisseurId === brouillon.fournisseurId &&
        f.numero.toLowerCase() === brouillon.numero.toLowerCase());
      if (doublon) return erreur('Ce numéro de facture existe déjà pour ce fournisseur.');

      const lignes = brouillon.lignes.filter((l) => l.designation.trim() || C.nombre(l.quantite) || C.nombre(l.prixUnitaire));
      if (!lignes.length) return erreur('Ajoutez au moins une ligne.');
      for (let i = 0; i < lignes.length; i++) {
        const l = lignes[i];
        if (!l.designation.trim()) return erreur(`Ligne ${i + 1} : la désignation est obligatoire.`);
        if (!l.familleId) return erreur(`Ligne ${i + 1} : choisissez une famille de produits.`);
        if (!(C.nombre(l.quantite) > 0)) return erreur(`Ligne ${i + 1} : la quantité doit être supérieure à 0.`);
        if (C.nombre(l.prixUnitaire) < 0) return erreur(`Ligne ${i + 1} : le prix unitaire est invalide.`);
      }

      const ajouterCatalogue = form.ajouterCatalogue.checked;
      brouillon.lignes = lignes.map((l) => {
        const ligne = Object.assign({}, l, {
          designation: l.designation.trim(),
          quantite: C.nombre(l.quantite),
          prixUnitaire: C.nombre(l.prixUnitaire),
        });
        if (!ligne.produitId && ajouterCatalogue) {
          const existant = S.db.produits.find((p) => p.nom.toLowerCase() === ligne.designation.toLowerCase() && p.unite === ligne.unite);
          ligne.produitId = existant ? existant.id : S.enregistrer('produits', {
            nom: ligne.designation, familleId: ligne.familleId, unite: ligne.unite, prixUnitaire: ligne.prixUnitaire, reference: '',
          }).id;
        }
        return ligne;
      });
      const enreg = S.enregistrer('factures', brouillon);
      brouillon = null;
      toast('Facture enregistrée', 'succes');
      location.hash = '#/factures/' + enreg.id;
    });
  }

  // ---------------------------------------------------------------- fournisseurs

  function formFournisseur(f) {
    f = f || {};
    formulaire({
      titre: f.id ? 'Modifier le fournisseur' : 'Nouveau fournisseur',
      champs: [
        { nom: 'nom', label: 'Nom', valeur: f.nom, requis: true },
        { nom: 'contact', label: 'Personne de contact', valeur: f.contact },
        { nom: 'telephone', label: 'Téléphone', type: 'tel', valeur: f.telephone },
        { nom: 'email', label: 'E-mail', type: 'email', valeur: f.email },
        { nom: 'adresse', label: 'Adresse', valeur: f.adresse },
        { nom: 'notes', label: 'Notes', type: 'textarea', valeur: f.notes },
      ],
      onValider(v) {
        if (!v.nom) return 'Le nom est obligatoire.';
        if (S.db.fournisseurs.some((x) => x.id !== f.id && x.nom.toLowerCase() === v.nom.toLowerCase())) return 'Ce fournisseur existe déjà.';
        S.enregistrer('fournisseurs', Object.assign({}, f, v));
        toast('Fournisseur enregistré', 'succes');
        return null;
      },
    });
  }

  function vueFournisseurs() {
    const stats = new Map(C.tableauDeBord(S.db, {}).parFournisseur.map((x) => [x.fournisseurId, x]));
    const liste = fournisseursTries();
    vue.innerHTML = `
      <div class="titre-page"><h1>Fournisseurs</h1>
        <button class="btn primaire" data-action="nouveau-fournisseur">+ Nouveau fournisseur</button></div>
      <section class="carte">
        ${liste.length ? `<div class="table-scroll"><table>
          <thead><tr><th>Fournisseur</th><th>Contact</th><th>Téléphone</th><th>E-mail</th><th class="num">Factures</th>
          <th class="num">Total HT</th><th class="num">Total TTC</th><th class="num">À payer</th><th></th></tr></thead>
          <tbody>${liste.map((f) => {
            const s = stats.get(f.id) || { nbFactures: 0, totalHT: 0, totalTTC: 0, aPayer: 0 };
            return `<tr>
              <td><a href="#/fournisseurs/${esc(f.id)}"><strong>${esc(f.nom)}</strong></a></td>
              <td>${esc(f.contact)}</td><td>${f.telephone ? `<a href="tel:${esc(f.telephone)}">${esc(f.telephone)}</a>` : ''}</td>
              <td>${f.email ? `<a href="mailto:${esc(f.email)}">${esc(f.email)}</a>` : ''}</td>
              <td class="num">${s.nbFactures}</td><td class="num">${money(s.totalHT)}</td><td class="num">${money(s.totalTTC)}</td>
              <td class="num${s.aPayer > 0 ? ' rouge' : ''}">${money(s.aPayer)}</td>
              <td class="boutons-ligne"><button class="btn petit" data-action="modifier-fournisseur" data-id="${esc(f.id)}">Modifier</button>
              <button class="btn petit danger" data-action="supprimer-fournisseur" data-id="${esc(f.id)}">Supprimer</button></td></tr>`;
          }).join('')}</tbody>
        </table></div>` : '<p class="muet">Aucun fournisseur. Ajoutez votre premier fournisseur.</p>'}
      </section>`;
  }

  function vueFicheFournisseur(id) {
    const f = S.trouver('fournisseurs', id);
    if (!f) { vue.innerHTML = '<p>Fournisseur introuvable. <a href="#/fournisseurs">Retour</a></p>'; return; }
    const t = C.tableauDeBord(S.db, { fournisseurId: id });
    const tx = t.totaux;
    const factures = S.db.factures.filter((x) => x.fournisseurId === id).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    const maxFam = Math.max(0, ...t.parFamille.map((x) => x.totalHT));

    vue.innerHTML = `
      <div class="titre-page">
        <div><a href="#/fournisseurs" class="retour">← Fournisseurs</a><h1>${esc(f.nom)}</h1></div>
        <div class="boutons">
          <button class="btn" data-action="modifier-fournisseur" data-id="${esc(f.id)}">Modifier</button>
          <a class="btn primaire" href="#/factures/nouvelle?fournisseur=${esc(f.id)}">+ Facture</a>
        </div>
      </div>
      <section class="carte entete-facture">
        <div><span class="muet">Contact</span><strong>${esc(f.contact || '—')}</strong></div>
        <div><span class="muet">Téléphone</span><strong>${esc(f.telephone || '—')}</strong></div>
        <div><span class="muet">E-mail</span><strong>${esc(f.email || '—')}</strong></div>
        <div><span class="muet">Adresse</span><strong>${esc(f.adresse || '—')}</strong></div>
      </section>
      <section class="kpis">
        <div class="kpi"><span>Total HT</span><strong>${money(tx.totalHT)}</strong></div>
        <div class="kpi accent"><span>Total TTC</span><strong>${money(tx.totalTTC)}</strong></div>
        <div class="kpi"><span>Payé</span><strong>${money(tx.paye)}</strong></div>
        <div class="kpi alerte"><span>À payer</span><strong>${money(tx.aPayer)}</strong></div>
      </section>
      <div class="grille-2">
        <section class="carte"><h2>Dépenses par famille (HT)</h2>
          ${t.parFamille.map((x) => barre(x.totalHT, maxFam, x.nom, money(x.totalHT))).join('') || '<p class="muet">Aucune dépense.</p>'}</section>
        <section class="carte"><h2>Produits achetés</h2>
          <div class="table-scroll"><table><thead><tr><th>Produit</th><th class="num">Quantité</th><th class="num">Prix moyen</th><th class="num">Total HT</th></tr></thead>
          <tbody>${t.parProduit.map((p) => `<tr><td>${esc(p.designation)}</td><td class="num">${qte(p.quantite)} ${esc(p.unite)}</td>
            <td class="num">${money(p.prixMoyen)}</td><td class="num">${money(p.totalHT)}</td></tr>`).join('')}</tbody></table></div></section>
      </div>
      <section class="carte"><h2>Factures</h2>
        ${factures.length ? `<div class="table-scroll"><table><thead><tr><th>Date</th><th>N°</th><th class="num">Total HT</th><th class="num">TVA</th><th class="num">Total TTC</th><th>Statut</th></tr></thead>
        <tbody>${factures.map((x) => {
          const r = C.recapFacture(x, S.db.familles);
          return `<tr class="cliquable" data-href="#/factures/${esc(x.id)}"><td>${date(x.date)}</td><td><a href="#/factures/${esc(x.id)}">${esc(x.numero)}</a></td>
            <td class="num">${money(r.totalHT)}</td><td class="num">${money(r.montantTVA)}</td><td class="num">${money(r.totalTTC)}</td><td>${badgeStatut(x.statut)}</td></tr>`;
        }).join('')}</tbody></table></div>` : '<p class="muet">Aucune facture pour ce fournisseur.</p>'}
      </section>`;
  }

  // ---------------------------------------------------------------- produits & familles

  function formProduit(p) {
    p = p || {};
    if (!S.db.familles.length) { toast("Créez d'abord une famille de produits", 'erreur'); return; }
    formulaire({
      titre: p.id ? 'Modifier le produit' : 'Nouveau produit',
      champs: [
        { nom: 'nom', label: 'Désignation', valeur: p.nom, requis: true },
        { nom: 'reference', label: 'Référence', valeur: p.reference },
        { nom: 'familleId', label: 'Famille de produits', type: 'select', options: optsFamilles(p.familleId || famillesTriees()[0].id), requis: true },
        { nom: 'unite', label: 'Unité', type: 'select', options: optsUnites(p.unite || 'u'), requis: true },
        { nom: 'prixUnitaire', label: 'Prix unitaire de référence (HT)', type: 'number', step: 'any', valeur: p.prixUnitaire, requis: true },
      ],
      onValider(v) {
        if (!v.nom) return 'La désignation est obligatoire.';
        if (v.prixUnitaire === '' || C.nombre(v.prixUnitaire) < 0) return 'Prix unitaire invalide.';
        S.enregistrer('produits', Object.assign({}, p, v, { prixUnitaire: C.nombre(v.prixUnitaire) }));
        toast('Produit enregistré', 'succes');
        return null;
      },
    });
  }

  function formFamille(f) {
    f = f || {};
    formulaire({
      titre: f.id ? 'Renommer la famille' : 'Nouvelle famille de produits',
      champs: [{ nom: 'nom', label: 'Nom de la famille', valeur: f.nom, requis: true }],
      onValider(v) {
        if (!v.nom) return 'Le nom est obligatoire.';
        if (S.db.familles.some((x) => x.id !== f.id && x.nom.toLowerCase() === v.nom.toLowerCase())) return 'Cette famille existe déjà.';
        S.enregistrer('familles', Object.assign({}, f, v));
        toast('Famille enregistrée', 'succes');
        return null;
      },
    });
  }

  let rechercheProduits = '';

  function vueProduits() {
    // Quantités et montants achetés par produit (toutes factures)
    const achats = {};
    S.db.factures.forEach((f) => (f.lignes || []).forEach((l) => {
      if (!l.produitId) return;
      const a = achats[l.produitId] = achats[l.produitId] || { quantite: 0, total: 0 };
      a.quantite += C.nombre(l.quantite);
      a.total += C.totalLigne(l);
    }));
    const r = rechercheProduits.toLowerCase();
    const groupes = famillesTriees().map((fa) => ({
      famille: fa,
      produits: S.db.produits.filter((p) => p.familleId === fa.id && (!r || p.nom.toLowerCase().includes(r) || (p.reference || '').toLowerCase().includes(r)))
        .sort((a, b) => a.nom.localeCompare(b.nom, 'fr')),
    }));

    vue.innerHTML = `
      <div class="titre-page"><h1>Produits par famille</h1>
        <div class="boutons">
          <button class="btn" data-action="nouvelle-famille">+ Famille</button>
          <button class="btn primaire" data-action="nouveau-produit">+ Produit</button>
        </div></div>
      <form class="filtres" onsubmit="return false"><label>Recherche <input type="search" id="recherche-produits" value="${esc(rechercheProduits)}" placeholder="Désignation ou référence"></label></form>
      ${groupes.map((g) => `
        <section class="carte famille">
          <div class="titre-famille">
            <h2>${esc(g.famille.nom)} <span class="compteur">${g.produits.length}</span></h2>
            <div class="boutons">
              <button class="btn petit" data-action="nouveau-produit" data-famille="${esc(g.famille.id)}">+ Produit</button>
              <button class="btn petit" data-action="modifier-famille" data-id="${esc(g.famille.id)}">Renommer</button>
              <button class="btn petit danger" data-action="supprimer-famille" data-id="${esc(g.famille.id)}">Supprimer</button>
            </div>
          </div>
          ${g.produits.length ? `<div class="table-scroll"><table>
            <thead><tr><th>Désignation</th><th>Référence</th><th>Unité</th><th class="num">Prix unitaire réf.</th>
            <th class="num">Quantité achetée</th><th class="num">Montant acheté HT</th><th></th></tr></thead>
            <tbody>${g.produits.map((p) => {
              const a = achats[p.id] || { quantite: 0, total: 0 };
              return `<tr><td>${esc(p.nom)}</td><td>${esc(p.reference)}</td><td>${esc(p.unite)}</td>
                <td class="num">${money(p.prixUnitaire)}</td><td class="num">${a.quantite ? qte(a.quantite) + ' ' + esc(p.unite) : '—'}</td>
                <td class="num">${a.total ? money(C.arrondi(a.total)) : '—'}</td>
                <td class="boutons-ligne"><button class="btn petit" data-action="modifier-produit" data-id="${esc(p.id)}">Modifier</button>
                <button class="btn petit danger" data-action="supprimer-produit" data-id="${esc(p.id)}">Supprimer</button></td></tr>`;
            }).join('')}</tbody></table></div>` : `<p class="muet">${r ? 'Aucun résultat.' : 'Aucun produit dans cette famille.'}</p>`}
        </section>`).join('')}`;

    const champ = document.getElementById('recherche-produits');
    champ.addEventListener('input', () => {
      rechercheProduits = champ.value;
      clearTimeout(vueProduits._t);
      vueProduits._t = setTimeout(() => {
        vueProduits();
        const c = document.getElementById('recherche-produits');
        c.focus();
        c.setSelectionRange(c.value.length, c.value.length);
      }, 250);
    });
  }

  // ---------------------------------------------------------------- paramètres

  function exporterCSV() {
    const entetes = ['Date', 'N° facture', 'Fournisseur', 'Statut', 'Famille', 'Produit', 'Unité', 'Quantité', 'Prix unitaire', 'Prix total HT', 'Taux TVA'];
    const cell = (v) => {
      const s = String(v == null ? '' : v);
      return /[";\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    const num = (n) => String(n).replace('.', ',');
    const lignes = [entetes.join(';')];
    S.db.factures.slice().sort((a, b) => (a.date || '').localeCompare(b.date || '')).forEach((f) => {
      (f.lignes || []).forEach((l) => {
        lignes.push([date(f.date), f.numero, nomFournisseur(f.fournisseurId), f.statut === 'payee' ? 'Payée' : 'À payer',
          nomFamille(l.familleId), l.designation, l.unite, num(C.nombre(l.quantite)), num(C.nombre(l.prixUnitaire)),
          num(C.totalLigne(l)), num(C.nombre(f.tauxTVA))].map(cell).join(';'));
      });
    });
    telecharger(`depenses-fournisseurs-${aujourdhui()}.csv`, '﻿' + lignes.join('\r\n'), 'text/csv;charset=utf-8');
  }

  function vueParametres() {
    const p = S.db.parametres;
    vue.innerHTML = `
      <div class="titre-page"><h1>Paramètres</h1></div>
      <section class="carte">
        <h2>Chantier</h2>
        <form id="form-parametres" class="champs-facture">
          <label class="champ large"><span>Nom du chantier</span><input name="chantier" value="${esc(p.chantier)}" placeholder="Ex. Villa Dupont – Morges"></label>
          <label class="champ"><span>Devise</span><input name="devise" value="${esc(p.devise)}" maxlength="3" placeholder="CHF"></label>
          <label class="champ"><span>Taux TVA par défaut (%)</span><input name="tauxTVA" type="number" step="any" min="0" value="${esc(p.tauxTVA)}"></label>
          <div class="actions"><button class="btn primaire" type="submit">Enregistrer</button></div>
        </form>
      </section>
      <section class="carte">
        <h2>Données</h2>
        <p class="muet">Les données sont enregistrées dans ce navigateur. Exportez-les régulièrement pour en garder une sauvegarde
          ou les transférer sur un autre appareil.</p>
        <div class="boutons">
          <button class="btn" data-action="export-json">Exporter (sauvegarde JSON)</button>
          <label class="btn">Importer une sauvegarde<input type="file" id="import-json" accept="application/json,.json" hidden></label>
          <button class="btn" data-action="export-csv">Exporter les lignes (CSV / Excel)</button>
        </div>
        <div class="boutons" style="margin-top:1rem">
          <button class="btn" data-action="exemple">Charger des données d'exemple</button>
          <button class="btn danger" data-action="reinitialiser">Tout effacer</button>
        </div>
      </section>`;

    document.getElementById('form-parametres').addEventListener('submit', (e) => {
      e.preventDefault();
      const form = e.target;
      const devise = form.devise.value.trim().toUpperCase() || 'CHF';
      try { new Intl.NumberFormat('fr-CH', { style: 'currency', currency: devise }); } catch (err) {
        toast('Code devise invalide (ex. CHF, EUR)', 'erreur'); return;
      }
      Object.assign(S.db.parametres, { chantier: form.chantier.value.trim(), devise, tauxTVA: C.nombre(form.tauxTVA.value) });
      S.sauver();
      majEntete();
      toast('Paramètres enregistrés', 'succes');
    });

    document.getElementById('import-json').addEventListener('change', (e) => {
      const fichier = e.target.files[0];
      if (!fichier) return;
      const lecteur = new FileReader();
      lecteur.onload = () => {
        try {
          const donnees = JSON.parse(lecteur.result);
          if (!donnees || !Array.isArray(donnees.factures)) throw new Error('format');
          if (!confirmer('Remplacer toutes les données actuelles par cette sauvegarde ?')) return;
          S.remplacer(donnees);
          majEntete();
          toast('Sauvegarde importée', 'succes');
          location.hash = '#/tableau-de-bord';
        } catch (err) {
          toast('Fichier de sauvegarde invalide', 'erreur');
        }
      };
      lecteur.readAsText(fichier);
    });
  }

  // ---------------------------------------------------------------- actions globales

  const actions = {
    'exemple'() {
      if ((S.db.factures.length || S.db.fournisseurs.length) && !confirmer('Remplacer les données actuelles par des données d\'exemple ?')) return;
      S.chargerExemple();
      majEntete();
      toast("Données d'exemple chargées", 'succes');
      location.hash = '#/tableau-de-bord';
      route();
    },
    'reinitialiser'() {
      if (!confirmer('Effacer définitivement toutes les données (fournisseurs, produits, factures) ?')) return;
      S.reinitialiser();
      majEntete();
      toast('Données effacées');
      route();
    },
    'export-json'() { telecharger(`sauvegarde-suivi-fournisseurs-${aujourdhui()}.json`, S.exporterJSON(), 'application/json'); },
    'export-csv'() { exporterCSV(); },
    'raz-filtres'() { Object.assign(filtresTDB, { debut: '', fin: '', fournisseurId: '' }); route(); },

    'nouveau-fournisseur'() { formFournisseur(); },
    'modifier-fournisseur'(b) { formFournisseur(S.trouver('fournisseurs', b.dataset.id)); },
    'supprimer-fournisseur'(b) {
      const n = S.db.factures.filter((f) => f.fournisseurId === b.dataset.id).length;
      if (n) { toast(`Impossible : ${n} facture(s) liée(s) à ce fournisseur`, 'erreur'); return; }
      if (!confirmer('Supprimer ce fournisseur ?')) return;
      S.supprimer('fournisseurs', b.dataset.id);
      route();
    },

    'nouveau-produit'(b) { formProduit({ familleId: b.dataset.famille }); },
    'modifier-produit'(b) { formProduit(S.trouver('produits', b.dataset.id)); },
    'supprimer-produit'(b) {
      if (!confirmer('Supprimer ce produit du catalogue ? Les factures existantes ne sont pas modifiées.')) return;
      S.supprimer('produits', b.dataset.id);
      route();
    },
    'nouvelle-famille'() { formFamille(); },
    'modifier-famille'(b) { formFamille(S.trouver('familles', b.dataset.id)); },
    'supprimer-famille'(b) {
      const id = b.dataset.id;
      const nbP = S.db.produits.filter((p) => p.familleId === id).length;
      const nbL = S.db.factures.reduce((n, f) => n + (f.lignes || []).filter((l) => l.familleId === id).length, 0);
      if (nbP || nbL) { toast(`Impossible : famille utilisée (${nbP} produit(s), ${nbL} ligne(s) de facture)`, 'erreur'); return; }
      if (!confirmer('Supprimer cette famille ?')) return;
      S.supprimer('familles', id);
      route();
    },

    'statut-facture'(b) {
      const f = S.trouver('factures', b.dataset.id);
      f.statut = f.statut === 'payee' ? 'a_payer' : 'payee';
      S.sauver();
      route();
    },
    'dupliquer-facture'(b) { location.hash = '#/factures/nouvelle?copie=' + b.dataset.id; },
    'supprimer-facture'(b) {
      if (!confirmer('Supprimer définitivement cette facture ?')) return;
      S.supprimer('factures', b.dataset.id);
      toast('Facture supprimée');
      location.hash = '#/factures';
    },
  };

  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-action]');
    if (b && actions[b.dataset.action] && !b.closest('#form-facture')) {
      e.preventDefault();
      actions[b.dataset.action](b);
      return;
    }
    const tr = e.target.closest('tr[data-href]');
    if (tr && !e.target.closest('a, button')) location.hash = tr.dataset.href;
  });

  // ---------------------------------------------------------------- routage

  function majEntete() {
    document.getElementById('nom-chantier').textContent = S.db.parametres.chantier || '';
    document.title = (S.db.parametres.chantier ? S.db.parametres.chantier + ' – ' : '') + 'Suivi fournisseurs chantier';
  }

  function route() {
    const [chemin, requete] = location.hash.replace(/^#\/?/, '').split('?');
    const params = new URLSearchParams(requete || '');
    const [section, id, action] = (chemin || 'tableau-de-bord').split('/');

    document.querySelectorAll('#nav a').forEach((a) => {
      a.classList.toggle('actif', a.getAttribute('href') === '#/' + section);
    });

    switch (section) {
      case 'factures':
        if (id === 'nouvelle') {
          vueEditionFacture(null, params.get('copie'));
          const four = params.get('fournisseur');
          if (four && brouillon) {
            brouillon.fournisseurId = four;
            const sel = document.querySelector('#form-facture [name=fournisseurId]');
            if (sel) sel.value = four;
          }
        } else if (id && action === 'modifier') vueEditionFacture(id);
        else if (id) vueRecapFacture(id);
        else vueFactures();
        break;
      case 'fournisseurs': id ? vueFicheFournisseur(id) : vueFournisseurs(); break;
      case 'produits': vueProduits(); break;
      case 'parametres': vueParametres(); break;
      default: vueTableauDeBord();
    }
    window.scrollTo(0, 0);
  }

  window.addEventListener('hashchange', route);
  majEntete();
  route();
})();
