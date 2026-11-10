// score = likes + 3 x super ; egalites: supers, puis interieurs likes, puis ordre du fichier.
function rank(modeles, choix) {
  var s = modeles.map(function (m) { return { id: m.id, score: 0, supers: 0, interieurs: 0 }; });
  var par = {};
  s.forEach(function (x) { par[x.id] = x; });
  (choix || []).forEach(function (c) {
    var x = par[c.id];
    if (!x || (c.v !== 'like' && c.v !== 'super')) return;
    x.score += c.v === 'super' ? 3 : 1;
    if (c.v === 'super') x.supers++;
    if (/interieur|tableau_de_bord/.test(c.photo || '')) x.interieurs++;
  });
  // sort stable (ES2019): l'ordre du fichier departage en dernier
  return s.sort(function (a, b) { return b.score - a.score || b.supers - a.supers || b.interieurs - a.interieurs; });
}
if (typeof window !== 'undefined') window.rank = rank;
if (typeof module !== 'undefined' && module.exports) module.exports = rank;
