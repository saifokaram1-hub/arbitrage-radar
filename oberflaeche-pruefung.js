/* Prueft die Einspeisung der fertig gerechneten Bridge-Chancen in die
   Live-Chancen-Liste.  Aufruf:  node oberflaeche-pruefung.js

   Der Code wird NICHT nachgebaut, sondern aus der echten index.html
   herausgeschnitten und ausgefuehrt — sonst prueft man eine Kopie und
   merkt nicht, wenn das Original sich aendert. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const datei = path.join(__dirname, 'index.html');
const html = fs.readFileSync(datei, 'utf8');

// Eine benannte Funktion samt Rumpf ausschneiden (geschweifte Klammern zaehlen)
function holeFunktion(name) {
  const start = html.indexOf('function ' + name + '(');
  if (start < 0) throw new Error('Funktion nicht gefunden: ' + name);
  let i = html.indexOf('{', start), tiefe = 0, inStr = null, prev = '';
  for (; i < html.length; i++) {
    const c = html[i];
    if (inStr) {
      if (c === inStr && prev !== '\\') inStr = null;
    } else if (c === '"' || c === "'") {
      inStr = c;
    } else if (c === '{') tiefe++;
    else if (c === '}') { tiefe--; if (tiefe === 0) return html.slice(start, i + 1); }
    prev = c;
  }
  throw new Error('Ende der Funktion nicht gefunden: ' + name);
}

const quelle = ['buchKuerzel', 'syncBridgeMarkets', 'evalMarket', 'feasibleMax']
  .map(holeFunktion).join('\n\n');

// Umgebung wie im Browser, aber nur so viel wie diese Funktionen brauchen
const mkMap = new Map();
const sandbox = {
  mkMap,
  CONFIG: { MAX_PLAUSIBEL: 20 },
  state: { bfOpps: [], oppsVerworfen: 0, balPm: 0, balOb: 0, minRoi: 0,
           srcOn: { pm: 1, bf: 1, ob: 1 } },
  categorize: q => (/lakers|celtics|spiel/i.test(q) ? 'Basketball' : 'Politik'),
  pmEff: () => 0, effOdds: () => 0, feeOf: () => 0,
  Array, Math, String, Number, isFinite, console
};
vm.createContext(sandbox);
vm.runInContext(quelle, sandbox);

let ok = 0, bad = 0;
function pruef(was, bedingung, zusatz) {
  if (bedingung) { ok++; console.log('  ✅ ' + was + (zusatz ? '   ' + zusatz : '')); }
  else { bad++; console.log('  ❌ ' + was + (zusatz ? '   ' + zusatz : '')); }
}

// Eine Chance, wie die Bridge sie liefert: Betfair gegen Polymarket
const chance = {
  ev: 'Will the Lakers beat the Celtics?', roi: 2.4, inv: 0.9766, maxStake: 340,
  risk: 'niedrig', cat: 'Basketball', tage: 2,
  legs: [
    { book: 'Betfair', pick: 'Lakers', q: 2.10, qEff: 2.045, fee: 5, size: 400, anteil: 48.9,
      link: 'https://www.betfair.com/exchange/plus/market/1.234' },
    { book: 'Polymarket', pick: 'No', q: 2.15, qEff: 2.09, fee: 4, size: 520, anteil: 51.1,
      link: 'https://polymarket.com/event/lakers-celtics' }
  ]
};

console.log('\n═════ 1. Chance wird zur Zeile in der Liste ═════');
sandbox.state.bfOpps = [chance];
sandbox.syncBridgeMarkets();
pruef('genau eine Zeile entstanden', mkMap.size === 1, '(' + mkMap.size + ')');
const m = Array.from(mkMap.values())[0];
pruef('als fertig gerechnet markiert', m.fertig === true);
pruef('Eventname uebernommen', m.ev === chance.ev);
pruef('Kategorie abgeleitet', m.cat === 'Basketball', m.cat);
pruef('beide Ausgaenge benannt', m.o1 === 'Lakers' && m.o2 === 'No');
pruef('Buecher richtig erkannt', m.src1 === 'bf' && m.src2 === 'pm', m.src1 + '/' + m.src2);
pruef('Betfair-Link uebernommen', m.bfLink === chance.legs[0].link);
pruef('Polymarket-Link uebernommen', m.linkPm === chance.legs[1].link);
pruef('Buchtiefe als Liquiditaet', m.liq === 340);

console.log('\n═════ 2. Die Rechnung der Bridge wird uebernommen ═════');
const v = sandbox.evalMarket(m);
pruef('gilt als echte Chance', v.ok === true);
pruef('Effektivquoten unveraendert', v.s1.oddsEff === 2.045 && v.s2.oddsEff === 2.09);
const erwartetRoi = (1 / (1 / 2.045 + 1 / 2.09) - 1) * 100;
pruef('Rendite aus den Effektivquoten', Math.abs(v.roi - erwartetRoi) < 1e-9,
      v.roi.toFixed(4) + ' %');
pruef('als Cross-Book erkannt', v.cross === true);
pruef('Arb-Prozent unter 100', v.arbPct < 100, v.arbPct.toFixed(2));

console.log('\n═════ 3. Einsatzvorschlag wird nie faelschlich 0 ═════');
sandbox.state.balPm = 0; sandbox.state.balOb = 0;
pruef('ohne eingetragenes Guthaben begrenzt die Buchtiefe',
      sandbox.feasibleMax(v) === 340, String(sandbox.feasibleMax(v)));
sandbox.state.balPm = 100;
const gedeckelt = sandbox.feasibleMax(v);
pruef('mit knappem Guthaben gewinnt das Guthaben', gedeckelt < 340, gedeckelt.toFixed(2));
sandbox.state.balPm = 0;

console.log('\n═════ 4. Unplausibles wird verworfen ═════');
mkMap.clear();
sandbox.state.bfOpps = [chance, {
  ev: 'Kaputte Paarung', roi: 61, maxStake: 50, risk: 'hoch',
  legs: [ { book: 'Betfair', pick: 'A', q: 3.0, qEff: 2.9, fee: 5, size: 90, anteil: 50, link: 'x' },
          { book: 'Polymarket', pick: 'B', q: 3.4, qEff: 3.3, fee: 4, size: 90, anteil: 50, link: 'y' } ]
}];
sandbox.syncBridgeMarkets();
pruef('nur die belastbare Chance bleibt', mkMap.size === 1, '(' + mkMap.size + ')');
pruef('die verworfene wird gezaehlt', sandbox.state.oppsVerworfen === 1,
      String(sandbox.state.oppsVerworfen));

console.log('\n═════ 5. Renditefilter blendet aus, loescht nicht ═════');
mkMap.clear();
sandbox.state.bfOpps = [chance];
sandbox.state.minRoi = 5;              // hoeher als die 2,4 % dieser Chance
sandbox.syncBridgeMarkets();
pruef('Chance bleibt im Bestand', mkMap.size === 1,
      'der Filter gehoert in die Ansicht, nicht in die Daten');
sandbox.state.minRoi = 0;

console.log('\n═════ 6. Verschwundene Chancen werden entfernt ═════');
sandbox.state.bfOpps = [];
sandbox.syncBridgeMarkets();
pruef('Liste wieder leer', mkMap.size === 0, '(' + mkMap.size + ')');

console.log('\n═════ 7. Vorgeschichte bleibt erhalten ═════');
sandbox.state.bfOpps = [chance];
sandbox.syncBridgeMarkets();
const zeile = Array.from(mkMap.values())[0];
zeile.since = 111111; zeile.wasHit = true;
sandbox.syncBridgeMarkets();                 // zweiter Durchlauf, gleiche Chance
const nachher = Array.from(mkMap.values())[0];
pruef('seit-wann-offen bleibt stehen', nachher.since === 111111, String(nachher.since));
pruef('Hit-Status bleibt stehen', nachher.wasHit === true);
pruef('keine Dublette entstanden', mkMap.size === 1, '(' + mkMap.size + ')');

console.log('\n═════ 8. Polymarket-Bein zeigt den Prozentkurs ═════');
pruef('Kurs fuer das PM-Bein gesetzt', Math.abs(nachher.ask1 - 1 / 2.15) < 1e-12,
      (nachher.ask1 * 100).toFixed(1) + ' %');
pruef('kein Kurs fuers Betfair-Bein', nachher.ask0 === null);

console.log('\n' + '═'.repeat(46));
console.log('  ' + ok + ' Prüfungen bestanden, ' + bad + ' fehlgeschlagen');
console.log('═'.repeat(46));
process.exit(bad ? 1 : 0);
