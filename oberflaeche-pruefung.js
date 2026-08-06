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

const quelle = ['buchKuerzel', 'syncBridgeMarkets', 'evalMarket', 'feasibleMax',
                'paarungsAbdruck', 'gegenrechnung', 'bestaetige']
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
  // fuer die Bestaetigungsschleife
  BESTAETIGUNG: { noetig: 2, hoechstpause: 180000 },
  kandidaten: {},
  Array, Math, String, Number, isFinite, console, Date, Object
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

console.log('\n═════ 9. Gebühren je Anbieter stimmen ═════');
/* Im Ticket steht die Gebühr als  Einsatz × (Rohquote − Effektivquote).
   Das muss fuer BEIDE Buecher stimmen, obwohl sie voellig verschieden
   abrechnen — sonst richtet man echtes Geld nach einer falschen Zahl. */
{
  const S = 100;
  const q1 = 2.045, q2 = 2.09;                 // Effektivquoten der Testchance
  const inv = 1/q1 + 1/q2;
  const E1 = S*(1/q1)/inv, E2 = S - E1;

  // Betfair: Kommission auf den GEWINN, 5 % laut Bridge
  const rohBf = 2.10, satzBf = 0.05;
  const gebBf = E1 * (rohBf - q1);
  const gegenprobeBf = E1 * (rohBf - 1) * satzBf;
  pruef('Betfair: Formel = Kommission auf den Gewinn',
        Math.abs(gebBf - gegenprobeBf) < 0.005,
        gebBf.toFixed(4) + ' € gegen ' + gegenprobeBf.toFixed(4) + ' €');

  // Polymarket: Gebuehr je ANTEIL, preisabhaengig
  const rohPm = 2.15, p = 1/rohPm;
  const gebPm = E2 * (rohPm - q2);
  const gProAnteil = 1 - q2*p;                 // aus qE = (1-g)/p
  const gegenprobePm = E2 * gProAnteil / p;    // Anteile × Gebuehr je Anteil
  pruef('Polymarket: Formel = Gebühr je Anteil × Anteile',
        Math.abs(gebPm - gegenprobePm) < 0.005,
        gebPm.toFixed(4) + ' € gegen ' + gegenprobePm.toFixed(4) + ' €');

  /* Es faellt nur EINE Gebuehr an — die der gewinnenden Seite. Beide zu
     addieren waere falsch. Probe: Bruttoauszahlung der jeweiligen Seite
     minus ihre Gebuehr muss die Nettoauszahlung ergeben. */
  pruef('Betfair-Seite: brutto minus Gebühr = netto',
        Math.abs((E1*rohBf - gebBf) - E1*q1) < 0.005,
        (E1*rohBf).toFixed(2) + ' − ' + gebBf.toFixed(2) + ' = ' + (E1*q1).toFixed(2) + ' €');
  pruef('Polymarket-Seite: brutto minus Gebühr = netto',
        Math.abs((E2*rohPm - gebPm) - E2*q2) < 0.005,
        (E2*rohPm).toFixed(2) + ' − ' + gebPm.toFixed(2) + ' = ' + (E2*q2).toFixed(2) + ' €');
  pruef('die beiden Gebühren sind verschieden hoch',
        Math.abs(gebBf - gebPm) > 0.01,
        gebBf.toFixed(2) + ' € gegen ' + gebPm.toFixed(2) + ' € — nur eine faellt an');

  // Und beide Seiten zahlen wirklich gleich aus — sonst ist es keine Arbitrage
  pruef('beide Ausgänge zahlen gleich aus',
        Math.abs(E1*q1 - E2*q2) < 0.01,
        E1.toFixed(2) + '×' + q1 + ' = ' + (E1*q1).toFixed(2) + ' € · ' +
        E2.toFixed(2) + '×' + q2 + ' = ' + (E2*q2).toFixed(2) + ' €');

  pruef('Gebühr ist nie negativ', gebBf >= 0 && gebPm >= 0);
}

console.log('\n═════ 10. Bestätigungsschleife ═════');
/* Der Kern der Absicherung: eine Chance darf erst gesetzt werden, wenn sie
   sich über mehrere Durchlaeufe UNVERAENDERT bestaetigt hat. Hier wird
   geprueft, dass sie das wirklich tut — und vor allem, dass sie es NICHT
   tut, wenn die Zuordnung springt. */
{
  const mk = () => ({ id:'t1', o1:'Lakers', o2:'No', linkPm:'pm/a', bfLink:'bf/a' });
  const v  = (roi, s1src, s2src) => ({
    ok:true, roi:roi, s1:{src:s1src||'bf', odds:2.10, oddsEff:2.045},
    s2:{src:s2src||'pm', odds:2.15, oddsEff:2.09}
  });

  sandbox.kandidaten = {};
  const a = mk();
  const r1 = sandbox.bestaetige(a, v(3.36));
  pruef('erste Sichtung gilt NICHT als sicher', r1 === false && a._sicher === false,
        a._grund);
  const r2 = sandbox.bestaetige(a, v(3.36));
  pruef('zweite Sichtung gibt frei', r2 === true && a._sicher === true,
        'Treffer: ' + a._treffer);

  // Zuordnung springt auf einen anderen Betfair-Markt
  sandbox.kandidaten = {};
  const b = mk();
  sandbox.bestaetige(b, v(3.36));
  sandbox.bestaetige(b, v(3.36));
  pruef('bestätigt, bevor die Zuordnung springt', b._sicher === true);
  b.bfLink = 'bf/GANZ-ANDERER-MARKT';
  const r3 = sandbox.bestaetige(b, v(3.36));
  pruef('Sprung der Zuordnung sperrt sofort wieder',
        r3 === false && b._sicher === false, b._grund);

  // Chance war zwischendurch ohne Vorteil -> unstet
  sandbox.kandidaten = {};
  const c = mk();
  sandbox.bestaetige(c, v(3.36));
  sandbox.bestaetige(c, v(0.001));      // eingebrochen
  const r4 = sandbox.bestaetige(c, v(3.36));
  pruef('unstete Chance bleibt gesperrt', r4 === false && c._sicher === false,
        c._grund);

  // Kein Vorteil -> gar nicht erst zaehlen
  sandbox.kandidaten = {};
  const d = mk();
  const r5 = sandbox.bestaetige(d, {ok:false, roi:-1, s1:v(0).s1, s2:v(0).s2});
  pruef('ohne Vorteil wird nicht gezählt', r5 === false && d._grund === 'kein Vorteil');

  // Demo bleibt frei, damit man ueben kann
  sandbox.kandidaten = {};
  const e = mk(); e.demo = true;
  pruef('Demo-Modus wird nicht zurückgehalten',
        sandbox.bestaetige(e, v(3.36)) === true);
}

console.log('\n═════ 11. Zweiter Rechenweg als Gegenprobe ═════');
{
  const gut = sandbox.gegenrechnung({ roi:3.3628,
    s1:{oddsEff:2.045}, s2:{oddsEff:2.09} });
  pruef('echte Chance besteht die Gegenprobe', gut.ok === true,
        '+' + gut.roi.toFixed(4) + ' %');

  // Erster und zweiter Rechenweg uneinig -> verwerfen
  const falsch = sandbox.gegenrechnung({ roi:9.99,
    s1:{oddsEff:2.045}, s2:{oddsEff:2.09} });
  pruef('uneinige Rechenwege werden verworfen',
        falsch.ok === false, falsch.grund);

  // Kein Vorteil
  const kein = sandbox.gegenrechnung({ roi:-2,
    s1:{oddsEff:1.80}, s2:{oddsEff:1.90} });
  pruef('ohne Vorteil faellt die Gegenprobe durch', kein.ok === false, kein.grund);

  // Unbrauchbare Quote
  const mist = sandbox.gegenrechnung({ roi:5, s1:{oddsEff:0}, s2:{oddsEff:2.09} });
  pruef('unbrauchbare Quote wird abgefangen', mist.ok === false, mist.grund);

  /* Der zweite Weg teilt ueber die Quoten (q₂/(q₁+q₂)), der erste ueber die
     Kehrwerte. Beide muessen dieselbe Aufteilung ergeben. */
  const q1 = 2.045, q2 = 2.09, S = 1000;
  const wegA = S * (1/q1) / (1/q1 + 1/q2);
  const wegB = S * q2 / (q1 + q2);
  pruef('beide Herleitungen ergeben dieselbe Aufteilung',
        Math.abs(wegA - wegB) < 0.0001,
        wegA.toFixed(4) + ' € gegen ' + wegB.toFixed(4) + ' €');
}

console.log('\n' + '═'.repeat(46));
console.log('  ' + ok + ' Prüfungen bestanden, ' + bad + ' fehlgeschlagen');
console.log('═'.repeat(46));
process.exit(bad ? 1 : 0);
