/**
 * Prüfung der Arbitrage-Logik — zum Selbernachrechnen.
 * Start:  node pruefung.js
 *
 * Es wird NICHTS bei Betfair angemeldet und nichts hochgeladen.
 * Geprüft wird: rechnet die Bridge richtig, und zahlen wirklich BEIDE
 * Ausgänge denselben Betrag zurück?
 */
'use strict';
const B = require('./betfair-bridge.js');

let fehler = 0, ok = 0;
function pruefe(name, bedingung, zusatz) {
  if (bedingung) { ok++; console.log('  ✅ ' + name + (zusatz ? '   ' + zusatz : '')); }
  else { fehler++; console.log('  ❌ ' + name + (zusatz ? '   ' + zusatz : '')); }
}
const rund = (x, n) => Math.round(x * Math.pow(10, n || 2)) / Math.pow(10, n || 2);

console.log('\n══════════ 1. Die Grundrechnung ══════════\n');
console.log('Beispiel: Polymarket verkauft "JA" zu 0,52 · Betfair bietet 2,30 auf die Gegenseite');
console.log('Gebühren: Polymarket 0 %, Betfair 5 % auf den Gewinn\n');

{
  const preisPM = 0.52;
  const qPM = 1 / preisPM;                       // 1,923
  const qBF = 2.30;
  const bein1 = { qEff: B.effektiv(qPM, 0.00), maxEinsatz: 100000 };
  const bein2 = { qEff: B.effektiv(qBF, 0.05), maxEinsatz: 100000 };
  const r = B.rechne(bein1, bein2);

  console.log('  Rohquote Polymarket : ' + rund(qPM, 4) + '   nach Gebühr: ' + rund(bein1.qEff, 4));
  console.log('  Rohquote Betfair    : ' + rund(qBF, 4) + '   nach Gebühr: ' + rund(bein2.qEff, 4));
  console.log('  inv = 1/qE1 + 1/qE2 = ' + rund(r.inv, 5) + '   (unter 1 = Arbitrage)');
  console.log('  Rendite             : ' + rund(r.roi, 3) + ' %');
  console.log('  Aufteilung          : ' + rund(r.anteil1, 2) + ' % / ' + rund(r.anteil2, 2) + ' %\n');

  const S = 1000;
  const s1 = S * r.anteil1 / 100, s2 = S * r.anteil2 / 100;
  const auszahlung1 = s1 * bein1.qEff;    // Ausgang 1 tritt ein
  const auszahlung2 = s2 * bein2.qEff;    // Ausgang 2 tritt ein

  console.log('  GEGENRECHNUNG bei ' + S + ' Einsatz:');
  console.log('    Auf Polymarket setzen : ' + rund(s1) + '   →  wenn das eintritt: ' + rund(auszahlung1));
  console.log('    Auf Betfair setzen    : ' + rund(s2) + '   →  wenn das eintritt: ' + rund(auszahlung2));
  console.log('    Gewinn Ausgang 1      : ' + rund(auszahlung1 - S));
  console.log('    Gewinn Ausgang 2      : ' + rund(auszahlung2 - S) + '\n');

  pruefe('beide Ausgänge zahlen exakt gleich', Math.abs(auszahlung1 - auszahlung2) < 1e-9,
         '(Differenz ' + (auszahlung1 - auszahlung2).toExponential(2) + ')');
  pruefe('Gewinn ist positiv', auszahlung1 - S > 0, '(+' + rund(auszahlung1 - S) + ')');
  pruefe('Aufteilung ist NICHT 50/50', Math.abs(r.anteil1 - 50) > 0.5,
         '(sonst wäre der Gewinn nicht garantiert)');
  pruefe('Summe der Anteile ergibt 100 %', Math.abs(r.anteil1 + r.anteil2 - 100) < 1e-9);
  pruefe('Rendite passt zur Auszahlung',
         Math.abs((auszahlung1 / S - 1) * 100 - r.roi) < 1e-9);
}

console.log('\n══════════ 2. Kein Arbitrage wird auch als solches erkannt ══════════\n');
{
  // Normalfall: die Bücher sind sich einig, es gibt keine Lücke
  const bein1 = { qEff: B.effektiv(1 / 0.55, 0), maxEinsatz: 1e6 };
  const bein2 = { qEff: B.effektiv(1.90, 0.05), maxEinsatz: 1e6 };
  const r = B.rechne(bein1, bein2);
  console.log('  Polymarket 0,55 gegen Betfair 1,90  →  inv = ' + rund(r.inv, 5) + ', Rendite ' + rund(r.roi, 2) + ' %');
  pruefe('wird korrekt als KEINE Arbitrage erkannt', r.ok === false);
  pruefe('Rendite ist negativ', r.roi < 0);
}

console.log('\n══════════ 3. Gebühren werden wirklich abgezogen ══════════\n');
{
  const ohne = B.effektiv(3.00, 0);
  const mit  = B.effektiv(3.00, 0.05);
  console.log('  Quote 3,00 ohne Gebühr: ' + rund(ohne, 4) + '   mit 5 %: ' + rund(mit, 4));
  pruefe('Gebühr trifft nur den Gewinn, nicht den Einsatz', Math.abs(mit - (1 + 2 * 0.95)) < 1e-12);
  pruefe('Effektivquote ist kleiner als die Rohquote', mit < ohne);

  // Eine knappe Lücke, die nur ohne Gebühr existiert, darf NICHT gemeldet werden
  const a = B.rechne({ qEff: B.effektiv(2.02, 0),    maxEinsatz: 1e6 }, { qEff: B.effektiv(2.02, 0),    maxEinsatz: 1e6 });
  const b = B.rechne({ qEff: B.effektiv(2.02, 0.05), maxEinsatz: 1e6 }, { qEff: B.effektiv(2.02, 0.05), maxEinsatz: 1e6 });
  console.log('  2,02 / 2,02 ohne Gebühr: ' + rund(a.roi, 3) + ' %   mit 5 % auf beiden Seiten: ' + rund(b.roi, 3) + ' %');
  pruefe('Scheingewinn verschwindet, sobald die Gebühr zählt', a.ok === true && b.ok === false);
}

console.log('\n══════════ 4. Drei-Wege-Markt (Fußball mit Unentschieden) ══════════\n');
{
  // Polymarket fragt "Gewinnt Bayern?" -> NEIN muss Unentschieden UND Dortmund abdecken
  const gegen = [{ name: 'The Draw', q: 4.20, size: 500 }, { name: 'Dortmund', q: 3.60, size: 800 }];
  const buendel = B.buendeln(gegen, 0.05);
  const invEinzeln = 1 / B.effektiv(4.20, 0.05) + 1 / B.effektiv(3.60, 0.05);
  console.log('  Unentschieden 4,20 + Dortmund 3,60  →  gebündelte Effektivquote ' + rund(buendel.qEff, 4));
  pruefe('Bündelung rechnet 1/q = 1/q_a + 1/q_b', Math.abs(1 / buendel.qEff - invEinzeln) < 1e-12);
  pruefe('gebündelte Quote liegt unter beiden Einzelquoten',
         buendel.qEff < B.effektiv(4.20, 0.05) && buendel.qEff < B.effektiv(3.60, 0.05));

  // Gegenrechnung: egal ob X oder Dortmund kommt, es muss dasselbe herauskommen
  const S = 1000;
  const eD = B.effektiv(4.20, 0.05), eB = B.effektiv(3.60, 0.05);
  const aD = (1 / eD) / invEinzeln, aB = (1 / eB) / invEinzeln;
  console.log('  Von 1000 auf das Bündel:  Unentschieden ' + rund(S * aD) + '  ·  Dortmund ' + rund(S * aB));
  console.log('    kommt Unentschieden: ' + rund(S * aD * eD) + '    kommt Dortmund: ' + rund(S * aB * eB));
  pruefe('beide Teilausgänge des Bündels zahlen gleich',
         Math.abs(S * aD * eD - S * aB * eB) < 1e-9);
}

console.log('\n══════════ 5. Verfügbare Größe begrenzt den Einsatz ══════════\n');
{
  // Auf einer Seite liegen nur 50 im Buch -> der Gesamteinsatz muss gedeckelt werden
  const r = B.rechne({ qEff: B.effektiv(2.20, 0), maxEinsatz: 50 },
                     { qEff: B.effektiv(2.20, 0), maxEinsatz: 100000 });
  console.log('  Bein 1 hat nur 50 verfügbar, Anteil ' + rund(r.anteil1, 2) + ' %  →  max. Gesamteinsatz ' + rund(r.maxStake));
  pruefe('Deckel richtig berechnet', Math.abs(r.maxStake - 50 / (r.anteil1 / 100)) < 1e-9);
  pruefe('Einsatz auf dem knappen Bein bleibt bei 50',
         Math.abs(r.maxStake * r.anteil1 / 100 - 50) < 1e-9);
}

console.log('\n══════════ 6. Dagegenhalten (Lay) — die Rechnung ══════════\n');
{
  // Lay zu 5,00: du haftest mit stake*(L-1), gewinnst stake abzüglich Kommission
  const runner = { name: 'Mbappe', q: 5.10, size: 300, lq: 5.00, lsize: 200 };
  const bein = B.layBein(runner, 0.05);
  console.log('  Lay-Quote 5,00 · 5 % Kommission  →  Effektivquote ' + rund(bein.qEff, 6));
  pruefe('qEff = 1 + (1-Gebühr)/(L-1)', Math.abs(bein.qEff - (1 + 0.95 / 4)) < 1e-12);

  // Gegenrechnung von Hand: 200 Einsatz des Gegenübers, Haftung 800
  const stake = 200, haftung = stake * (5.00 - 1);
  const rueck = haftung + stake * 0.95;
  console.log('  Von Hand: Gegenüber setzt ' + stake + ', deine Haftung ' + haftung);
  console.log('            verliert Mbappé, bekommst du ' + rueck + '  →  ' + rund(rueck / haftung, 6) + ' je eingesetztem Euro');
  pruefe('Handrechnung deckt sich mit qEff', Math.abs(rueck / haftung - bein.qEff) < 1e-12);
  pruefe('maximaler Einsatz = Haftung', Math.abs(bein.maxEinsatz - haftung) < 1e-12,
         '(' + bein.maxEinsatz + ')');
  pruefe('ohne Lay-Angebot kein Bein', B.layBein({ lq: 0, lsize: 0 }, 0.05) === null);
}

console.log('\n══════════ 7. Namensabgleich und Ausrichtung ══════════\n');
{
  pruefe('Schlüsselwort aus Teamnamen', B.schluessel('Los Angeles Lakers') === 'lakers',
         '("Los Angeles Lakers" → ' + B.schluessel('Los Angeles Lakers') + ')');
  pruefe('Vereinszusätze werden ignoriert', B.schluessel('Bayern Munich FC') === 'munich',
         '("Bayern Munich FC" → ' + B.schluessel('Bayern Munich FC') + ')');
  pruefe('Unentschieden wird erkannt', B.istUnentschieden('The Draw') && B.istUnentschieden('Unentschieden'));

  const markt = {
    mid: '1.111', ev: 'Lakers v Celtics', mn: 'Money Line', mt: 'MONEY_LINE', anzahl: 2,
    start: new Date(Date.now() + 3600e3).toISOString(), inplay: false,
    runners: [{ name: 'Los Angeles Lakers', q: 2.10, size: 400, lq: 2.12, lsize: 400 },
              { name: 'Boston Celtics', q: 1.95, size: 400, lq: 1.97, lsize: 400 }]
  };
  const idx = new Map([['lakers', [markt]], ['celtics', [markt]]]);

  const zu = B.zuordnen({ q: 'Will the Lakers beat the Celtics?', outs: ['Yes', 'No'] }, idx);
  pruefe('Markt gefunden', !!zu);
  if (zu) {
    pruefe('Subjekt sind die Lakers', zu.subjekt.name.indexOf('Lakers') >= 0, '(' + zu.subjekt.name + ')');
    pruefe('JA ist Ausgang 0', zu.jaIdx === 0);
  }
  const zu2 = B.zuordnen({ q: 'Will the Celtics beat the Lakers?', outs: ['Yes', 'No'] }, idx);
  pruefe('bei umgekehrter Frage wandert das Subjekt mit',
         !!zu2 && zu2.subjekt.name.indexOf('Celtics') >= 0, zu2 ? '(' + zu2.subjekt.name + ')' : '');

  // Großes Feld: nur mit passendem Markttitel darf zugeordnet werden
  const ballon = {
    mid: '1.333', ev: 'Ballon d Or 2026', mn: 'Winner', mt: 'WINNER', anzahl: 20,
    start: new Date(Date.now() + 200 * 86400e3).toISOString(), inplay: false,
    runners: [{ name: 'Kylian Mbappe', q: 4.50, size: 300, lq: 4.70, lsize: 250 },
              { name: 'Lamine Yamal', q: 3.20, size: 300, lq: 3.35, lsize: 250 }]
  };
  const torschuetze = {
    mid: '1.444', ev: 'Real Madrid v Barcelona', mn: 'First Goalscorer', mt: 'FIRST_GOALSCORER', anzahl: 30,
    start: new Date(Date.now() + 86400e3).toISOString(), inplay: false,
    runners: [{ name: 'Kylian Mbappe', q: 6.00, size: 100, lq: 6.4, lsize: 100 },
              { name: 'Vinicius Junior', q: 7.00, size: 100, lq: 7.4, lsize: 100 }]
  };
  const idxB = new Map([['mbappe', [ballon, torschuetze]], ['yamal', [ballon]], ['junior', [torschuetze]]]);
  const zuB = B.zuordnen({ q: 'Will Kylian Mbappe win the 2026 Ballon d Or?', outs: ['Yes', 'No'] }, idxB);
  pruefe('Großes Feld korrekt zugeordnet', !!zuB && zuB.markt.mid === '1.333',
         zuB ? '(→ ' + zuB.markt.ev + ' · ' + zuB.markt.mn + ')' : '(nichts gefunden)');
  pruefe('Torschützen-Markt wird NICHT verwechselt', !zuB || zuB.markt.mid !== '1.444');

  const zuFalsch = B.zuordnen({ q: 'Will Kylian Mbappe score first?', outs: ['Yes', 'No'] }, idxB);
  pruefe('ohne Titelübereinstimmung wird nichts zugeordnet', zuFalsch === null);
}

console.log('\n══════════ 8. Lay wird gewählt, wenn es besser ist ══════════\n');
{
  B.PM.clear(); B.KATALOG.clear(); B.BUCH.clear();
  // Polymarket: "NEIN" (Mbappé gewinnt nicht) kostet 0,70 -> Quote 1,4286
  // Betfair: Mbappé zurückwetten zu 4,50. Zusammen ergibt das eine Lücke.
  B.PM.set('bd', {
    q: 'Will Kylian Mbappe win the 2026 Ballon d Or?', outs: ['Yes', 'No'],
    toks: ['a', 'b'], slug: 'ballon-dor-mbappe', liq: 9000, vol: 40000, cat: 'Sport',
    ask: [0.40, 0.70], size: [5000, 5000]
  });
  B.KATALOG.set('1.555', {
    ev: 'Ballon d Or 2026', mn: 'Winner', mt: 'WINNER',
    start: new Date(Date.now() + 200 * 86400e3).toISOString(), etId: '1',
    runners: [{ id: 1, name: 'Kylian Mbappe' }, { id: 2, name: 'Lamine Yamal' },
              { id: 3, name: 'Vinicius Junior' }, { id: 4, name: 'Erling Haaland' }]
  });
  B.BUCH.set('1.555', {
    status: 'OPEN', inplay: false,
    runners: [{ id: 1, st: 'ACTIVE', b: 4.50, bs: 900, l: 4.60, ls: 400 },
              { id: 2, st: 'ACTIVE', b: 3.20, bs: 900, l: 3.30, ls: 400 },
              { id: 3, st: 'ACTIVE', b: 8.00, bs: 500, l: 8.40, ls: 300 },
              { id: 4, st: 'ACTIVE', b: 9.00, bs: 500, l: 9.60, ls: 300 }]
  });

  const c = B.crossBookChancen();
  pruefe('Chance im großen Feld gefunden', c.length === 1);
  if (c.length) {
    const o = c[0];
    console.log('\n  ' + o.ev);
    console.log('  Rendite ' + o.roi + ' %  ·  max. Einsatz ~' + o.maxStake + '  ·  Risiko ' + o.risk +
                (o.tage != null ? '  (' + o.tage + ' Tage bis zur Entscheidung)' : '') + '\n');
    o.legs.forEach(l => {
      console.log('    ' + l.book.toUpperCase().padEnd(12) + l.anteil.toFixed(2).padStart(7) + ' %  ' + l.pick);
      console.log('    ' + ''.padEnd(12) + 'Quote ' + l.q + ' → nach ' + l.fee + ' % Gebühr ' + l.qEff +
                  '   max ' + l.size);
      console.log('    ' + ''.padEnd(12) + l.link);
    });
    const S = 1000;
    const invE = 1 / o.legs[0].qEff + 1 / o.legs[1].qEff;
    const e1 = S * (1 / o.legs[0].qEff) / invE * o.legs[0].qEff;
    const e2 = S * (1 / o.legs[1].qEff) / invE * o.legs[1].qEff;
    console.log('\n    Gegenrechnung bei ' + S + ':  Ausgang 1 → ' + rund(e1) + '   Ausgang 2 → ' + rund(e2));
    pruefe('beide Ausgänge zahlen gleich', Math.abs(e1 - e2) < 1e-9);
    pruefe('Gewinn positiv', e1 > S, '(+' + rund(e1 - S) + ')');
    pruefe('Betfair-Bein ist ein BACK auf Mbappé (Polymarket deckt NEIN)',
           o.legs[1].art === 'back' && /Mbappe/.test(o.legs[1].pick));
    pruefe('beide Links vorhanden', !!o.legs[0].link && !!o.legs[1].link);
  }
}

console.log('\n══════════ 9. Cross-Book im Zweikampf ══════════\n');

{
  B.PM.clear(); B.KATALOG.clear(); B.BUCH.clear();
  // Polymarket: "JA" kostet 0,44 -> Quote 2,273
  B.PM.set('test1', {
    q: 'Will the Lakers beat the Celtics?', outs: ['Yes', 'No'],
    toks: ['a', 'b'], slug: 'lakers-celtics', liq: 5000, vol: 20000, cat: 'Basketball',
    ask: [0.44, 0.60], size: [3000, 3000]
  });
  // Betfair: Celtics zu 2,50 -> zusammen ergibt das eine echte Lücke
  B.KATALOG.set('1.999', {
    ev: 'Lakers v Celtics', mn: 'Money Line', mt: 'MONEY_LINE',
    start: new Date(Date.now() + 4 * 3600e3).toISOString(), etId: '7522',
    runners: [{ id: 11, name: 'Los Angeles Lakers' }, { id: 22, name: 'Boston Celtics' }]
  });
  // Lay bewusst unattraktiv, damit hier das BACK auf die Gegenseite gewinnen muss
  B.BUCH.set('1.999', {
    status: 'OPEN', inplay: false,
    runners: [{ id: 11, st: 'ACTIVE', b: 1.90, bs: 900, l: 1.92, ls: 500 },
              { id: 22, st: 'ACTIVE', b: 2.50, bs: 900, l: 2.54, ls: 500 }]
  });

  const chancen = B.crossBookChancen();
  pruefe('Chance wurde gefunden', chancen.length === 1);
  if (chancen.length) {
    const c = chancen[0];
    console.log('\n  ' + c.ev);
    console.log('  Rendite ' + c.roi + ' %  ·  max. Einsatz ~' + c.maxStake + '  ·  Risiko ' + c.risk + '\n');
    c.legs.forEach(l => {
      console.log('    ' + l.book.toUpperCase().padEnd(12) + l.anteil.toFixed(2).padStart(6) + ' %  ' + l.pick);
      console.log('    ' + ''.padEnd(12) + 'Quote ' + l.q + ' → nach ' + l.fee + ' % Gebühr ' + l.qEff);
      console.log('    ' + ''.padEnd(12) + l.link);
    });

    const S = 1000;
    // a) aus den veröffentlichten (gerundeten) Anteilen
    const p1 = S * c.legs[0].anteil / 100 * c.legs[0].qEff;
    const p2 = S * c.legs[1].anteil / 100 * c.legs[1].qEff;
    // b) aus den Effektivquoten selbst, also ohne jede Rundung
    const invE = 1 / c.legs[0].qEff + 1 / c.legs[1].qEff;
    const e1 = S * (1 / c.legs[0].qEff) / invE * c.legs[0].qEff;
    const e2 = S * (1 / c.legs[1].qEff) / invE * c.legs[1].qEff;
    console.log('\n    Gegenrechnung bei ' + S + ':  Ausgang 1 → ' + rund(p1) + '   Ausgang 2 → ' + rund(p2));
    pruefe('aus den Effektivquoten gerechnet exakt gleich', Math.abs(e1 - e2) < 1e-9,
           '(Differenz ' + (e1 - e2).toExponential(2) + ')');
    pruefe('aus den gerundeten Anteilen: Abweichung unter 1 Cent je 1000',
           Math.abs(p1 - p2) < 0.01, '(Differenz ' + rund(Math.abs(p1 - p2), 4) + ')');
    pruefe('Gewinn positiv', p1 > S, '(+' + rund(p1 - S) + ' auf ' + S + ')');
    pruefe('beide Links vorhanden', !!c.legs[0].link && !!c.legs[1].link);
    pruefe('bei beiden steht drin, worauf zu setzen ist',
           /KAUFEN/.test(c.legs[0].pick) && /BACK/.test(c.legs[1].pick));
  }
}

console.log('\n══════════ 10. Veraltete Kurse dürfen nicht als Chance gelten ══════════\n');
{
  // Dieselbe echte Chance wie oben, aber das Betfair-Bein ist alt.
  function bauen(alterBfSekunden, startInStunden){
    B.PM.clear(); B.KATALOG.clear(); B.BUCH.clear();
    B.PM.set('t', {
      q: 'Will the Lakers beat the Celtics?', outs: ['Yes','No'],
      toks:['a','b'], slug:'x', liq:5000, vol:20000, cat:'Basketball',
      ask:[0.44,0.60], size:[3000,3000], ts: Date.now()
    });
    B.KATALOG.set('1.777', {
      ev:'Lakers v Celtics', mn:'Money Line', mt:'MONEY_LINE',
      start: new Date(Date.now() + startInStunden*3600e3).toISOString(), etId:'7522',
      runners:[{id:11,name:'Los Angeles Lakers'},{id:22,name:'Boston Celtics'}]
    });
    B.BUCH.set('1.777', {
      status:'OPEN', inplay:false, ts: Date.now() - alterBfSekunden*1000,
      runners:[{id:11,st:'ACTIVE',b:1.90,bs:900,l:1.92,ls:500},
               {id:22,st:'ACTIVE',b:2.50,bs:900,l:2.54,ls:500}]
    });
  }

  bauen(5, 1);
  const frisch = B.crossBookChancen();
  pruefe('frischer Kurs wird gemeldet', frisch.length === 1,
         frisch.length ? '(Betfair-Kurs ' + frisch[0].alterBf + ' s alt)' : '');
  pruefe('Alter beider Beine wird mitgeliefert',
         frisch.length === 1 && frisch[0].alterBf != null && frisch[0].alterPm != null);

  bauen(400, 1);   // Spiel startet in 1 h -> Grenze 180 s
  const alt = B.crossBookChancen();
  pruefe('400 s alter Kurs vor Spielbeginn wird verworfen', alt.length === 0,
         '(verworfen: ' + (alt.verworfenAlt||0) + ')');

  bauen(400, 24*200);   // Langzeitwette -> Grenze 1800 s, 400 s sind ok
  const lang = B.crossBookChancen();
  pruefe('bei einer Langzeitwette sind 400 s unkritisch', lang.length === 1);

  console.log('  Grenzen: laufend ' + B.maxAlterMs({inplay:true})/1000 + ' s' +
    ' · Start in 1 h ' + B.maxAlterMs({start:new Date(Date.now()+3600e3).toISOString()})/1000 + ' s' +
    ' · Start in 3 Tagen ' + B.maxAlterMs({start:new Date(Date.now()+3*86400e3).toISOString()})/1000 + ' s' +
    ' · Langzeit ' + B.maxAlterMs({start:new Date(Date.now()+200*86400e3).toISOString()})/1000 + ' s');
}

console.log('\n══════════ 11. Delayed oder Live: wirkt sich die Erkennung aus? ══════════\n');
{
  const laufend  = { inplay: true,  start: new Date(Date.now() + 600e3).toISOString() };
  const bald     = { inplay: false, start: new Date(Date.now() + 3600e3).toISOString() };
  const langsam  = { inplay: false, start: new Date(Date.now() + 90 * 86400e3).toISOString() };

  B.setKeyArt('live');
  pruefe('Live-Key: keine Sonderschwelle für laufende Spiele',
         B.minRoiFuer(laufend) === B.O.minRoi, '(' + B.minRoiFuer(laufend) + ' %)');
  pruefe('Live-Key: wird nicht als verzögert behandelt', B.istVerzoegert() === false);

  B.setKeyArt('delayed');
  pruefe('Delayed: laufendes Spiel braucht mehr Luft',
         B.minRoiFuer(laufend) === B.O.minRoiSchnell, '(' + B.minRoiFuer(laufend) + ' % statt ' + B.O.minRoi + ' %)');
  pruefe('Delayed: kurz vor Anpfiff ebenfalls',
         B.minRoiFuer(bald) === B.O.minRoiSchnell, '(' + B.minRoiFuer(bald) + ' %)');
  pruefe('Delayed: Langzeitwette bleibt bei der normalen Schwelle',
         B.minRoiFuer(langsam) === B.O.minRoi, '(' + B.minRoiFuer(langsam) + ' %)');

  B.setKeyArt('unbekannt');
  pruefe('Unbekannter Schlüssel wird vorsichtshalber wie Delayed behandelt',
         B.istVerzoegert() === true && B.minRoiFuer(laufend) === B.O.minRoiSchnell);

  B.setKeyArt('unbekannt');
}

console.log('\n══════════ 12. Werden wirklich dieselben Märkte verglichen? ══════════\n');
{
  B.PM.clear(); B.KATALOG.clear(); B.BUCH.clear();

  // Zwei Polymarket-Märkte: einer hat ein Betfair-Gegenstück, einer nicht.
  B.PM.set('a', { q:'Will the Lakers beat the Celtics?', outs:['Yes','No'], toks:['1','2'],
    slug:'x', liq:1, vol:1, cat:'Basketball', ask:[0.50,0.52], size:[900,900], ts:Date.now() });
  B.PM.set('b', { q:'Will Bitcoin close above 200000 dollars?', outs:['Yes','No'], toks:['3','4'],
    slug:'y', liq:1, vol:1, cat:'Krypto', ask:[0.30,0.72], size:[900,900], ts:Date.now() });

  // Drei Betfair-Märkte: nur einer davon kommt auch bei Polymarket vor.
  B.KATALOG.set('1.A', { ev:'Lakers v Celtics', mn:'Money Line', mt:'MONEY_LINE',
    start:new Date(Date.now()+3*3600e3).toISOString(), etId:'7522',
    runners:[{id:1,name:'Los Angeles Lakers'},{id:2,name:'Boston Celtics'}] });
  B.KATALOG.set('1.B', { ev:'Arsenal v Chelsea', mn:'Match Odds', mt:'MATCH_ODDS',
    start:new Date(Date.now()+5*3600e3).toISOString(), etId:'1',
    runners:[{id:3,name:'Arsenal'},{id:4,name:'Chelsea'}] });
  B.KATALOG.set('1.C', { ev:'Nadal v Alcaraz', mn:'Match Odds', mt:'MATCH_ODDS',
    start:new Date(Date.now()+7*3600e3).toISOString(), etId:'2',
    runners:[{id:5,name:'Rafael Nadal'},{id:6,name:'Carlos Alcaraz'}] });
  ['1.A','1.B','1.C'].forEach((mid,i)=>{
    B.BUCH.set(mid,{ status:'OPEN', inplay:false, ts:Date.now(),
      runners:[{id:i*2+1,st:'ACTIVE',b:2.00,bs:500,l:2.02,ls:500},
               {id:i*2+2,st:'ACTIVE',b:2.00,bs:500,l:2.02,ls:500}] });
  });

  const gemeinsam = B.schnittmengeIds();
  console.log('  Polymarket: 2 Märkte · Betfair: 3 Märkte');
  console.log('  auf beiden Büchern gefunden: ' + gemeinsam.length + ' → ' + JSON.stringify(gemeinsam));
  pruefe('genau die Schnittmenge wird erkannt', gemeinsam.length === 1 && gemeinsam[0] === '1.A');
  pruefe('Betfair-Märkte ohne Polymarket-Gegenstück fallen raus',
         gemeinsam.indexOf('1.B') < 0 && gemeinsam.indexOf('1.C') < 0);
  pruefe('Polymarket-Märkte ohne Betfair-Gegenstück stören nicht', gemeinsam.length === 1);

  // Und nach dem Nachlesen müssen beide Beine denselben Zeitpunkt tragen
  const jetzt = Date.now();
  B.BUCH.get('1.A').ts = jetzt;
  B.PM.get('a').ts = jetzt;
  const c = B.crossBookChancen();
  pruefe('bei gleichem Lesezeitpunkt ist der Altersabstand null',
         c.length === 0 || Math.abs((c[0].alterBf||0)-(c[0].alterPm||0)) <= 1,
         c.length ? '(Betfair ' + c[0].alterBf + ' s, Polymarket ' + c[0].alterPm + ' s)' : '(keine Chance, Quoten zu eng)');

  B.PM.clear(); B.KATALOG.clear(); B.BUCH.clear();
}

console.log('\n══════════ 13. Gegenprobe: fauler Markt darf nichts melden ══════════\n');
{
  B.PM.clear(); B.KATALOG.clear(); B.BUCH.clear();
  B.PM.set('test2', {
    q: 'Will the Lakers beat the Celtics?', outs: ['Yes', 'No'],
    toks: ['a', 'b'], slug: 'x', liq: 5000, vol: 2000, cat: 'Basketball',
    ask: [0.52, 0.50], size: [3000, 3000]
  });
  B.KATALOG.set('1.998', {
    ev: 'Lakers v Celtics', mn: 'Money Line', mt: 'MONEY_LINE',
    start: new Date(Date.now() + 4 * 3600e3).toISOString(), etId: '7522',
    runners: [{ id: 11, name: 'Los Angeles Lakers' }, { id: 22, name: 'Boston Celtics' }]
  });
  B.BUCH.set('1.998', {
    status: 'OPEN', inplay: false,
    runners: [{ id: 11, st: 'ACTIVE', b: 1.88, bs: 900, l: 1.9, ls: 5 },
              { id: 22, st: 'ACTIVE', b: 1.94, bs: 900, l: 1.96, ls: 5 }]
  });
  pruefe('normaler Markt liefert korrekt keine Chance', B.crossBookChancen().length === 0);
}

console.log('\n══════════════════════════════════════════');
console.log('  ' + ok + ' Prüfungen bestanden, ' + fehler + ' fehlgeschlagen');
console.log('══════════════════════════════════════════\n');
process.exit(fehler ? 1 : 0);
