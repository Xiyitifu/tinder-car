(function () {
  'use strict';
  var CLE = 'tindercar', MAX_SUPER = 5;
  var modeles = [], parId = {}, photos = {}, etat = null, occupe = false;
  var $ = function (id) { return document.getElementById(id); };

  function el(tag, cls, txt) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (txt != null) e.textContent = txt;
    return e;
  }
  function src(id, f) { return 'photos/' + encodeURIComponent(id) + '/' + encodeURIComponent(f); }
  function nom(m) { return m.marque + ' ' + m.modele; }
  function cle(c) { return c.id + '/' + c.photo; }

  // ---------- état ----------
  function charger() {
    try {
      var e = JSON.parse(localStorage.getItem(CLE));
      if (!e || !Array.isArray(e.ordre) || !Array.isArray(e.choix)) return null;
      var existe = function (c) { return c && photos[c.id] && photos[c.id].indexOf(c.photo) >= 0; };
      if (!e.ordre.length || !e.ordre.every(existe)) return null; // photos changées: on repart à zéro
      var vus = {}, supers = 0;
      var choix = e.choix.filter(function (c) {
        if (!existe(c) || vus[cle(c)] || ['like', 'nope', 'super'].indexOf(c.v) < 0) return false;
        if (c.v === 'super' && ++supers > MAX_SUPER) return false;
        return (vus[cle(c)] = true);
      });
      var etat = { ordre: e.ordre.map(function (o) { return { id: o.id, photo: o.photo }; }), choix: choix, fini: false, date: e.date };
      etat.fini = !courante(etat);
      return etat;
    } catch (err) { return null; }
  }
  function sauver(e) {
    e.date = new Date().toISOString();
    try { localStorage.setItem(CLE, JSON.stringify(e)); } catch (err) { /* stockage indisponible: on continue en mémoire */ }
  }
  function nouvelle() {
    var ordre = [];
    modeles.forEach(function (m) { photos[m.id].forEach(function (f) { ordre.push({ id: m.id, photo: f }); }); });
    for (var i = ordre.length - 1; i > 0; i--) { // Fisher-Yates
      var j = Math.floor(Math.random() * (i + 1)), t = ordre[i]; ordre[i] = ordre[j]; ordre[j] = t;
    }
    return { ordre: ordre, choix: [], fini: false, date: null };
  }
  function vote(e, o) {
    for (var i = 0; i < e.choix.length; i++) if (e.choix[i].id === o.id && e.choix[i].photo === o.photo) return e.choix[i];
    return null;
  }
  function courante(e) {
    e = e || etat;
    for (var i = 0; i < e.ordre.length; i++) if (!vote(e, e.ordre[i])) return e.ordre[i];
    return null;
  }
  function suivantes(n) {
    var r = [];
    for (var i = 0; i < etat.ordre.length && r.length < n; i++) if (!vote(etat, etat.ordre[i])) r.push(etat.ordre[i]);
    return r;
  }
  function restants() { return MAX_SUPER - etat.choix.filter(function (c) { return c.v === 'super'; }).length; }

  // ---------- écrans ----------
  function montrer(id) {
    ['accueil', 'swipe', 'match', 'classement'].forEach(function (s) { $(s).hidden = s !== id; });
    window.scrollTo(0, 0);
  }

  function afficherAccueil() {
    montrer('accueil');
    $('b-commencer').hidden = !!etat;
    $('b-reprendre').hidden = !etat || etat.fini;
    $('b-resultat').hidden = $('b-recommencer').hidden = !etat || !etat.fini;
    $('info').textContent = !etat ? modeles.length + ' modèles, ' + nouvelle().ordre.length + ' photos à swiper'
      : etat.fini ? 'Partie terminée' : 'Partie en cours : ' + etat.choix.length + ' / ' + etat.ordre.length;
  }

  // ---------- swipe ----------
  function carte(o, dessus) {
    var c = el('div', 'carte' + (dessus ? '' : ' dessous'));
    var img = el('img');
    img.alt = 'Photo de voiture';
    img.draggable = false;
    img.onerror = function () { img.hidden = true; };
    img.src = src(o.id, o.photo);
    c.appendChild(img);
    c.appendChild(el('span', 'tampon like', 'LIKE'));
    c.appendChild(el('span', 'tampon nope', 'NOPE'));
    c.appendChild(el('span', 'tampon super', 'SUPER LIKE'));
    return c;
  }

  function poser(c, dx, dy) {
    c.style.transform = 'translate(' + dx + 'px,' + dy + 'px) rotate(' + dx / 15 + 'deg)';
    var haut = -dy > Math.abs(dx);
    c.querySelector('.like').style.opacity = haut ? 0 : Math.max(0, dx / 100);
    c.querySelector('.nope').style.opacity = haut ? 0 : Math.max(0, -dx / 100);
    c.querySelector('.super').style.opacity = haut ? Math.max(0, -dy / 120) : 0;
  }

  function brancher(c) {
    var x0, y0, dx = 0, dy = 0, actif = false, pid;
    c.addEventListener('pointerdown', function (e) {
      if (occupe || actif) return;
      pid = e.pointerId; actif = true; x0 = e.clientX; y0 = e.clientY; dx = dy = 0;
      c.setPointerCapture(e.pointerId);
      c.style.transition = 'none';
    });
    c.addEventListener('pointermove', function (e) {
      if (!actif || e.pointerId !== pid) return;
      dx = e.clientX - x0; dy = e.clientY - y0;
      poser(c, dx, dy);
    });
    function fin(e) {
      if (!actif || e.pointerId !== pid) return;
      actif = false;
      c.style.transition = '';
      var v = -dy > 120 && -dy > Math.abs(dx) ? 'super' : dx > 100 ? 'like' : dx < -100 ? 'nope' : null;
      if (v) voter(v); else poser(c, 0, 0);
    }
    c.addEventListener('pointerup', fin);
    c.addEventListener('pointercancel', function (e) {
      if (!actif || e.pointerId !== pid) return;
      actif = false; c.style.transition = ''; poser(c, 0, 0);
    });
  }

  function rendreSwipe() {
    montrer('swipe');
    var pile = $('pile'), s = suivantes(4);
    pile.textContent = '';
    if (s[1]) pile.appendChild(carte(s[1], false));
    if (s[0]) { var c = carte(s[0], true); pile.appendChild(c); brancher(c); }
    s.slice(2).forEach(function (o) { new Image().src = src(o.id, o.photo); }); // préchargement
    var n = etat.choix.length, total = etat.ordre.length;
    $('prog').style.width = (100 * n / total) + '%';
    $('compte').textContent = Math.min(n + 1, total) + ' / ' + total;
    $('supers').textContent = restants();
    $('b-super').classList.toggle('vide', restants() <= 0);
    $('b-annuler').disabled = n === 0;
  }

  var toastTimer;
  function toast(t) {
    var e = $('toast');
    e.textContent = t; e.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { e.hidden = true; }, 1800);
  }

  function dessus() { return $('pile').querySelector('.carte:not(.dessous)'); }

  function voter(v) {
    var o = courante(), c = dessus();
    if (!o || occupe) return;
    if (vote(etat, o)) return; // déjà voté (double clic)
    if (v === 'super' && restants() <= 0) {
      if (c) { poser(c, 0, 0); c.classList.remove('refus'); void c.offsetWidth; c.classList.add('refus'); }
      toast('Plus de super like disponible');
      return;
    }
    etat.choix.push({ id: o.id, photo: o.photo, v: v });
    etat.fini = !courante();
    sauver(etat);
    occupe = true;
    if (c) {
      var w = window.innerWidth;
      c.querySelector('.' + v).style.opacity = 1;
      c.style.transform = v === 'super' ? 'translate(0,' + -1.5 * window.innerHeight + 'px)'
        : 'translate(' + (v === 'like' ? 1.5 : -1.5) * w + 'px,40px) rotate(' + (v === 'like' ? 30 : -30) + 'deg)';
    }
    setTimeout(function () {
      occupe = false;
      if (etat.fini) afficherMatch(); else rendreSwipe();
    }, c ? 300 : 0);
  }

  function annuler() {
    if (occupe || !etat.choix.length) return;
    etat.choix.pop();
    etat.fini = false;
    sauver(etat);
    rendreSwipe();
  }

  // ---------- fiche ----------
  function statut(m) { return /^flex/i.test(m.statut_e85 || '') ? "flex d'usine" : 'convertible par boîtier'; }

  function fiche(m) {
    var f = el('div', 'fiche');
    f.appendChild(el('p', null, m.version));
    f.appendChild(el('span', 'statut', 'E85 : ' + statut(m)));
    if (m.carrosserie) f.appendChild(el('p', null, m.carrosserie + (m.annees ? ' · ' + m.annees : '')));
    if (m.moteur) f.appendChild(el('p', null, 'Moteur : ' + m.moteur + (m.injection ? ', injection ' + m.injection : '')));
    [['Atouts', m.atouts], ['Points de vigilance', m.vigilance]].forEach(function (p) {
      if (!Array.isArray(p[1]) || !p[1].length) return;
      f.appendChild(el('h4', null, p[0]));
      var ul = el('ul');
      p[1].forEach(function (t) { ul.appendChild(el('li', null, t)); });
      f.appendChild(ul);
    });
    if (/^https:\/\//.test(m.leboncoin || '')) {
      var a = el('a', null, 'Voir les annonces Leboncoin');
      a.href = m.leboncoin; a.target = '_blank'; a.rel = 'noopener noreferrer';
      f.appendChild(a);
    }
    return f;
  }

  function photoPreferee(id) {
    var aimes = etat.choix.filter(function (c) { return c.id === id && c.v !== 'nope'; });
    aimes.sort(function (a, b) { return (b.v === 'super') - (a.v === 'super'); });
    return aimes.length ? aimes[0].photo : photos[id][0];
  }

  // ---------- match ----------
  function afficherMatch() {
    montrer('match');
    var top = rank(modeles, etat.choix)[0], m = parId[top.id];
    $('m-message').textContent = top.score === 0
      ? "Aucun like cette fois-ci... Voici quand même le premier de la liste."
      : 'Ton coup de cœur avec ' + top.score + (top.score > 1 ? ' points' : ' point') + ' !';
    var img = $('m-photo');
    img.hidden = false;
    img.onerror = function () { img.hidden = true; };
    img.src = src(m.id, photoPreferee(m.id));
    img.alt = nom(m);
    $('m-nom').textContent = nom(m);
    var f = $('m-fiche');
    f.textContent = '';
    f.appendChild(fiche(m));
  }

  // ---------- classement ----------
  function afficherClassement() {
    montrer('classement');
    $('credits').hidden = true;
    var ol = $('liste');
    ol.textContent = '';
    rank(modeles, etat.choix).forEach(function (r, i) {
      var m = parId[r.id], li = el('li'), d = el('details'), s = el('summary');
      s.appendChild(el('span', 'rang', i + 1));
      var img = el('img', 'miniature');
      img.alt = ''; img.loading = 'lazy';
      img.onerror = function () { img.hidden = true; };
      img.src = src(m.id, photoPreferee(m.id));
      s.appendChild(img);
      s.appendChild(el('span', 'nom', nom(m)));
      s.appendChild(el('span', 'score', r.score + ' pt' + (r.score > 1 ? 's' : '')));
      d.appendChild(s);
      d.appendChild(fiche(m));
      li.appendChild(d);
      ol.appendChild(li);
    });
  }

  // CSV RFC 4180 minimal (champs entre guillemets, "" échappé)
  function lireCsv(t) {
    var lignes = [], ligne = [], champ = '', q = false;
    for (var i = 0; i < t.length; i++) {
      var ch = t[i];
      if (q) {
        if (ch === '"') { if (t[i + 1] === '"') { champ += '"'; i++; } else q = false; }
        else champ += ch;
      } else if (ch === '"') q = true;
      else if (ch === ',') { ligne.push(champ); champ = ''; }
      else if (ch === '\n') { ligne.push(champ); lignes.push(ligne); ligne = []; champ = ''; }
      else if (ch !== '\r') champ += ch;
    }
    if (champ || ligne.length) { ligne.push(champ); lignes.push(ligne); }
    return lignes;
  }
  window.lireCsv = lireCsv; // exposé pour vérification manuelle

  function afficherCredits() {
    var bloc = $('credits'), ul = $('c-liste');
    bloc.hidden = false;
    ul.textContent = 'Chargement...';
    fetch('photos/CREDITS.csv').then(function (r) {
      if (!r.ok) throw new Error(r.status);
      return r.text();
    }).then(function (t) {
      var l = lireCsv(t), tete = l.shift() || [];
      var col = function (n) { return tete.indexOf(n); };
      ul.textContent = '';
      l.forEach(function (r) {
        if (r.length < tete.length) return;
        var m = parId[r[col('modele')]], li = el('li');
        li.appendChild(el('strong', null, (m ? nom(m) : r[col('modele')]) + ' · ' + r[col('fichier')]));
        li.appendChild(document.createTextNode(' : ' + r[col('titre_commons')].replace(/^File:/, '') +
          ', par ' + r[col('auteur')] + ', ' + r[col('licence')] + ' '));
        var url = r[col('page_commons')];
        if (/^https:\/\/commons\.wikimedia\.org\//.test(url)) {
          var a = el('a', null, 'source');
          a.href = url; a.target = '_blank'; a.rel = 'noopener noreferrer';
          li.appendChild(a);
        }
        ul.appendChild(li);
      });
      bloc.scrollIntoView({ behavior: 'smooth' });
    }).catch(function () { ul.textContent = 'Crédits indisponibles.'; });
  }

  // ---------- démarrage ----------
  function json(u) { return fetch(u).then(function (r) { if (!r.ok) throw new Error(u + ' ' + r.status); return r.json(); }); }

  Promise.all([json('modeles.json'), json('photos/index.json')]).then(function (d) {
    photos = d[1] || {};
    modeles = (d[0].modeles || []).filter(function (m) { return Array.isArray(photos[m.id]) && photos[m.id].length; });
    modeles.forEach(function (m) { parId[m.id] = m; });
    etat = charger();

    $('b-commencer').onclick = function () { etat = nouvelle(); sauver(etat); rendreSwipe(); };
    $('b-reprendre').onclick = rendreSwipe;
    $('b-resultat').onclick = afficherMatch;
    $('b-recommencer').onclick = function () {
      if (!confirm('Effacer le résultat et recommencer une partie ?')) return;
      etat = nouvelle(); sauver(etat); rendreSwipe();
    };
    $('b-like').onclick = function () { voter('like'); };
    $('b-nope').onclick = function () { voter('nope'); };
    $('b-super').onclick = function () { voter('super'); };
    $('b-annuler').onclick = annuler;
    $('b-classement').onclick = afficherClassement;
    $('b-credits').onclick = afficherCredits;
    $('b-fermer').onclick = function () { $('credits').hidden = true; };
    afficherAccueil();
  }).catch(function (err) {
    montrer('accueil');
    $('info').textContent = 'Impossible de charger les données. Réessaie plus tard.';
    console.warn(err);
  });
})();
