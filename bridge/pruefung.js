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

console.log('\n══════════ 13. Gebühren: je Markt und je Buch verschieden ══════════\n');
{
  console.log('  Polymarket rechnet anders als Betfair. Gebühr je Anteil = Satz × min(p, 1−p).\n');
  console.log('  Preis   Satz    Gebühr/Anteil   Quote ohne   Quote mit    Unterschied');
  [[0.50,0.04],[0.44,0.04],[0.44,0.07],[0.90,0.04],[0.10,0.07]].forEach(function(x){
    const p=x[0], s=x[1];
    const g=B.pmGebuehr(p,s,1), ohne=1/p, mit=B.pmEffektiv(p,s,1);
    console.log('  '+p.toFixed(2)+'    '+(s*100).toFixed(0)+' %    '+g.toFixed(4)+
                '         '+ohne.toFixed(4)+'      '+mit.toFixed(4)+'      −'+((1-mit/ohne)*100).toFixed(2)+' %');
  });
  console.log('');
  pruefe('Gebühr ist bei 0,50 am höchsten',
         B.pmGebuehr(0.50,0.04,1) > B.pmGebuehr(0.30,0.04,1) &&
         B.pmGebuehr(0.50,0.04,1) > B.pmGebuehr(0.70,0.04,1));
  pruefe('Gebühr ist symmetrisch um 0,50',
         Math.abs(B.pmGebuehr(0.30,0.04,1) - B.pmGebuehr(0.70,0.04,1)) < 1e-12);
  pruefe('ohne Gebühr bleibt die Quote 1/p', Math.abs(B.pmEffektiv(0.40,0,1) - 2.5) < 1e-12);
  pruefe('mit Gebühr wird die Quote kleiner', B.pmEffektiv(0.40,0.04,1) < 2.5);

  // Handrechnung: 1000 Anteile zu 0,44 mit 4 % Satz
  const p=0.44, satz=0.04, anteile=1000;
  const kosten=anteile*p, gebuehr=anteile*satz*Math.min(p,1-p), auszahlung=anteile*1-gebuehr;
  console.log('  Von Hand: '+anteile+' Anteile zu '+p+' kosten '+kosten.toFixed(2)+
              ', Gebühr '+gebuehr.toFixed(2)+', Auszahlung '+auszahlung.toFixed(2));
  pruefe('Handrechnung deckt sich mit pmEffektiv',
         Math.abs(auszahlung/kosten - B.pmEffektiv(p,satz,1)) < 1e-12,
         '('+(auszahlung/kosten).toFixed(6)+')');

  // Der entscheidende Punkt: eine knappe Chance, die nur ohne Gebühr existiert.
  // Genau solche Fälle hat der Scanner vorher als echte Arbitrage gemeldet.
  const bfBein={ qEff:B.effektiv(2.03,0.05), maxEinsatz:1e6 };
  const ohneG={ qEff:B.pmEffektiv(0.49,0,1),    maxEinsatz:1e6 };
  const mitG ={ qEff:B.pmEffektiv(0.49,0.04,1), maxEinsatz:1e6 };
  const a=B.rechne(ohneG,bfBein), b=B.rechne(mitG,bfBein);
  console.log('  Polymarket 0,49 gegen Betfair 2,03 — ohne PM-Gebühr: '+a.roi.toFixed(2)+
              ' %, mit 4 %: '+b.roi.toFixed(2)+' %');
  pruefe('Scheinchance verschwindet, sobald die Polymarket-Gebühr zählt',
         a.ok === true && b.ok === false);

  // Betfair: unterschiedliche Sätze je Markt
  console.log('');
  [0.02,0.05,0.065].forEach(function(s){
    console.log('  Betfair-Quote 3,00 bei '+(s*100).toFixed(1)+' % Kommission → '+B.effektiv(3.00,s).toFixed(4));
  });
  pruefe('niedrigere Kommission ergibt bessere Effektivquote',
         B.effektiv(3.00,0.02) > B.effektiv(3.00,0.05) && B.effektiv(3.00,0.05) > B.effektiv(3.00,0.065));
}

console.log('\n══════════ 14. Unglaubwürdige Renditen dürfen nicht durchgehen ══════════\n');
{
  B.PM.clear(); B.KATALOG.clear(); B.BUCH.clear();
  // Beide Seiten Außenseiter — das kann nur eine falsche Zuordnung sein
  B.PM.set('x', { q:'Will the Lakers beat the Celtics?', outs:['Yes','No'], toks:['1','2'],
    slug:'x', liq:9e3, vol:9e3, cat:'Basketball', ask:[0.05,0.06], size:[9e3,9e3],
    feeSatz:0, feeExp:1, feeTyp:'keine', ts:Date.now() });
  B.KATALOG.set('1.X', { ev:'Lakers v Celtics', mn:'Money Line', mt:'MONEY_LINE', satz:0.05,
    start:new Date(Date.now()+3*3600e3).toISOString(), etId:'7522',
    runners:[{id:1,name:'Los Angeles Lakers'},{id:2,name:'Boston Celtics'}] });
  B.BUCH.set('1.X', { status:'OPEN', inplay:false, ts:Date.now(),
    runners:[{id:1,st:'ACTIVE',b:18.0,bs:900,l:19,ls:900},
             {id:2,st:'ACTIVE',b:20.0,bs:900,l:21,ls:900}] });

  const c=B.crossBookChancen();
  pruefe('unsinnige Rendite wird verworfen', c.length===0,
         '(als unplausibel aussortiert: '+(c.unplausibel||0)+')');
  pruefe('und dabei gezählt, nicht stillschweigend geschluckt', (c.unplausibel||0) > 0);
  console.log('  Obergrenze: ' + B.O.maxPlausibel + ' % — darüber ist es ein Fehler, kein Fund');

  B.PM.clear(); B.KATALOG.clear(); B.BUCH.clear();
}

console.log('\n══════════ 15. Die Fehlpaarungen aus dem Live-Betrieb ══════════\n');
{
  // Genau die Faelle von den Bildschirmfotos: US-Wahlmaerkte, bei denen
  // "Republican Party" und "Democratic Party" beide auf "party" verkuerzt
  // wurden. Dadurch passte jedes Rennen auf jedes andere.
  pruefe('Parteinamen werden unterscheidbar',
         B.schluessel('Republican Party') !== B.schluessel('Democratic Party'),
         '("'+B.schluessel('Republican Party')+'" vs "'+B.schluessel('Democratic Party')+'")');
  pruefe('"party" gilt nicht mehr als Merkmal',
         B.merkmale('Republican Party').indexOf('party') < 0,
         '(Merkmale: '+JSON.stringify(B.merkmale('Republican Party'))+')');

  function bauen(bfEvent, bfMarkt, r1, r2){
    const markt={ mid:'1.W', ev:bfEvent, mn:bfMarkt, mt:'WINNER', anzahl:2, satz:0.065,
      start:new Date(Date.now()+40*86400e3).toISOString(), inplay:false, ts:Date.now(),
      runners:[{name:r1,q:5.1,size:55,lq:5.3,lsize:55},{name:r2,q:1.24,size:900,lq:1.26,lsize:900}] };
    const idx=new Map();
    [r1,r2].forEach(function(n){ B.merkmale(n).forEach(function(w){
      if(!idx.has(w)) idx.set(w,[]); idx.get(w).push(markt); }); });
    return idx;
  }

  // Falsches Rennen: Betfair fuehrt das Senatsrennen in Georgia,
  // Polymarket fragt nach dem Repraesentantenhaus-Sitz UT-03.
  const idxFalsch=bauen('US Senate Georgia 2026','Winner','Republican Party','Democratic Party');
  const zuFalsch=B.zuordnen({ q:'Will the Republican Party win the UT-03 House seat?',
                              outs:['Yes','No'] }, idxFalsch);
  pruefe('fremdes Rennen wird NICHT mehr zugeordnet', zuFalsch===null,
         zuFalsch? '(faelschlich → '+zuFalsch.markt.ev+')' : '');

  // Und der Fall mit der falschen Partei aus Foto 5
  const zuPartei=B.zuordnen({ q:'Will the Democratic Party win the UT-01 House seat?',
                              outs:['Yes','No'] }, idxFalsch);
  pruefe('auch die falsche Partei wird abgelehnt', zuPartei===null);

  // Das RICHTIGE Rennen muss weiterhin gefunden werden
  const idxRichtig=bauen('US House UT-03 2026','Winner','Republican Party','Democratic Party');
  const zuRichtig=B.zuordnen({ q:'Will the Republican Party win the UT-03 House seat?',
                               outs:['Yes','No'] }, idxRichtig);
  pruefe('das passende Rennen wird gefunden', !!zuRichtig,
         zuRichtig? '(→ '+zuRichtig.markt.ev+')' : '(nichts gefunden)');
  if(zuRichtig) pruefe('und die richtige Partei als Subjekt',
    /Republican/.test(zuRichtig.subjekt.name), '('+zuRichtig.subjekt.name+')');

  // Sport bleibt unberuehrt
  const m={ mid:'1.S', ev:'Lakers v Celtics', mn:'Money Line', mt:'MONEY_LINE', anzahl:2, satz:0.05,
    start:new Date(Date.now()+3600e3).toISOString(), inplay:false, ts:Date.now(),
    runners:[{name:'Los Angeles Lakers',q:2.1,size:400,lq:2.12,lsize:400},
             {name:'Boston Celtics',q:1.95,size:400,lq:1.97,lsize:400}] };
  const idxS=new Map();
  ['Los Angeles Lakers','Boston Celtics'].forEach(function(n){ B.merkmale(n).forEach(function(w){
    if(!idxS.has(w)) idxS.set(w,[]); idxS.get(w).push(m); }); });
  const zuS=B.zuordnen({ q:'Will the Lakers beat the Celtics?', outs:['Yes','No'] }, idxS);
  pruefe('Sport-Zweikampf funktioniert weiterhin', !!zuS && /Lakers/.test(zuS.subjekt.name),
         zuS? '('+zuS.subjekt.name+')':'');
}

console.log('\n══════════ 16. Namensgleichheit über verschiedene Sportarten hinweg ══════════\n');
{
  function idxAus(ev, mn, r1, r2){
    const markt={ mid:'1.K', ev:ev, mn:mn, mt:'MATCH_ODDS', anzahl:2, satz:0.05,
      start:new Date(Date.now()+4*3600e3).toISOString(), inplay:false, ts:Date.now(),
      runners:[{name:r1,q:1.03,size:999,lq:1.61,lsize:20},{name:r2,q:2.4,size:525,lq:2.44,lsize:28}] };
    const idx=new Map();
    [r1,r2].forEach(function(n){ B.merkmale(n).forEach(function(w){
      if(!idx.has(w)) idx.set(w,[]); idx.get(w).push(markt); }); });
    return idx;
  }

  // Der Fall vom Bildschirmfoto: brasilianischer Wahlmarkt gegen einen Kampf,
  // verbunden allein ueber den Nachnamen "Silva" und das Fuellwort "da".
  const kampf=idxAus('Louie Sutherland v Jose Montanha da Silva','Fight Result',
                     'Louie Sutherland','Jose Montanha da Silva');
  const zu1=B.zuordnen({ q:"Will Luiz Inacio Lula da Silva qualify for Brazil's presidential runoff?",
                         outs:['Yes','No'] }, kampf);
  pruefe('Wahlmarkt wird NICHT an den Kampf gehaengt', zu1===null,
         zu1? '(faelschlich → '+zu1.markt.ev+')':'');

  const zu2=B.zuordnen({ q:'Will Luiz Inacio Lula da Silva win the 2026 Brazilian election?',
                         outs:['Yes','No'] }, kampf);
  pruefe('auch die zweite Lula-Frage wird abgelehnt', zu2===null);

  // Blosse Jahreszahl darf nichts bestaetigen
  const lck=idxAus('LCK 2026 Season','Winner','KT Rolster','Gen G');
  const zu3=B.zuordnen({ q:'Will Fnatic win the 2026 World Championship?', outs:['Yes','No'] }, lck);
  pruefe('gemeinsame Jahreszahl allein reicht nicht', zu3===null);

  // Der ECHTE Fall muss weiterhin durchkommen
  const zu4=B.zuordnen({ q:'Will KT Rolster win the LCK 2026 season playoffs?', outs:['Yes','No'] }, lck);
  pruefe('das passende LCK-Rennen wird gefunden', !!zu4,
         zu4? '(→ '+zu4.markt.ev+')':'(nichts gefunden)');
  if(zu4) pruefe('mit dem richtigen Teilnehmer', /Rolster/.test(zu4.subjekt.name));

  // Zweikampf braucht keinen Kontext, beide Namen genuegen
  const duell=idxAus('Sutherland v Silva','Fight Result','Louie Sutherland','Jose Montanha da Silva');
  const zu5=B.zuordnen({ q:'Will Louie Sutherland beat Jose Montanha da Silva?', outs:['Yes','No'] }, duell);
  pruefe('echter Zweikampf wird weiterhin erkannt', !!zu5 && /Sutherland/.test(zu5.subjekt.name));
}

console.log('\n══════════ 17. Gegenprobe in beide Richtungen ══════════\n');
{
  // Betfair ist das kleinere, strukturierte Buch. Eine Paarung gilt erst,
  // wenn unter ALLEN Polymarket-Fragen keine besser zu diesem Betfair-Markt
  // passt als die gewählte.
  B.PM.clear(); B.KATALOG.clear(); B.BUCH.clear();

  const kampf={ mid:'1.F', ev:'Louie Sutherland v Jose Montanha da Silva', mn:'Fight Result',
    mt:'MATCH_ODDS', anzahl:2, satz:0.05, start:new Date(Date.now()+4*3600e3).toISOString(),
    inplay:false, ts:Date.now(),
    runners:[{name:'Louie Sutherland',q:1.03,size:999,lq:1.61,lsize:20},
             {name:'Jose Montanha da Silva',q:2.4,size:525,lq:2.44,lsize:28}] };
  const idx=new Map();
  kampf.runners.forEach(function(r){ B.merkmale(r.name).forEach(function(w){
    if(!idx.has(w)) idx.set(w,[]); idx.get(w).push(kampf); }); });

  function pmEintrag(id,q){
    const w=B.nrm(q).split(' ');
    B.PM.set(id,{ q:q, outs:['Yes','No'], toks:['a','b'], slug:'x', liq:1, vol:1, cat:'Sport',
      ask:[0.5,0.52], size:[900,900], ts:Date.now(), feeSatz:0, feeExp:1, feeTyp:'keine',
      fw:new Set(w.filter(x=>x.length>2)),
      kf:new Set(w.filter(x=>x.length>1 && !['the','and','for','win','wins','beat','beats','vs','yes','no'].includes(x))) });
  }

  // Nur die Lula-Frage vorhanden: der Kampf ist der einzige Kandidat
  pmEintrag('lula',"Will Luiz Inacio Lula da Silva qualify for Brazil's presidential runoff?");
  pruefe('Lula-Frage wird schon durch die Textregel abgelehnt',
         B.zuordnen(B.PM.get('lula'), idx, 'lula')===null);

  // Jetzt zusaetzlich die passende Kampf-Frage
  pmEintrag('kampf','Will Louie Sutherland beat Jose Montanha da Silva?');
  const zuKampf=B.zuordnen(B.PM.get('kampf'), idx, 'kampf');
  pruefe('die echte Kampf-Frage wird zugeordnet', !!zuKampf,
         zuKampf? '('+zuKampf.subjekt.name+')':'');
  pruefe('die Lula-Frage bleibt abgelehnt', B.zuordnen(B.PM.get('lula'), idx, 'lula')===null);

  // Gegenprobe direkt: eine schwaechere Paarung muss weichen, wenn es eine bessere gibt
  const punkteKampf=10;
  pruefe('Gegenprobe erkennt die bessere Frage',
         B.bestaetigtRueckwaerts('lula', kampf, 1)===false,
         '(die Kampf-Frage passt besser)');
  pruefe('und bestaetigt die beste selbst', B.bestaetigtRueckwaerts('kampf', kampf, punkteKampf)===true);

  B.PM.clear(); B.KATALOG.clear(); B.BUCH.clear();
}

console.log('\n══════════ 18. Suchrichtung: Betfair zuerst ══════════\n');
{
  B.PM.clear(); B.KATALOG.clear(); B.BUCH.clear();

  // EIN Betfair-Markt, aber VIELE Polymarket-Fragen. Wird von Betfair aus
  // gesucht, gibt es genau einen Ausgangspunkt statt vieler.
  B.KATALOG.set('1.B', { ev:'Lakers v Celtics', mn:'Money Line', mt:'MONEY_LINE', satz:0.05,
    start:new Date(Date.now()+3*3600e3).toISOString(), etId:'7522',
    runners:[{id:1,name:'Los Angeles Lakers'},{id:2,name:'Boston Celtics'}] });
  B.BUCH.set('1.B', { status:'OPEN', inplay:false, ts:Date.now(),
    runners:[{id:1,st:'ACTIVE',b:1.90,bs:900,l:1.92,ls:500},
             {id:2,st:'ACTIVE',b:2.50,bs:900,l:2.54,ls:500}] });

  function pmRein(id,q,a0,a1){
    const w=B.nrm(q).split(' ');
    B.PM.set(id,{ q:q, outs:['Yes','No'], toks:['a','b'], slug:'ev-'+id, liq:9e3, vol:9e3,
      cat:'Basketball', ask:[a0,a1], size:[3000,3000], ts:Date.now(),
      feeSatz:0, feeExp:1, feeTyp:'keine',
      fw:new Set(w.filter(x=>x.length>2)), kf:new Set(w.filter(x=>x.length>1)) });
  }
  // Die passende Frage, plus zwei Ablenkungen mit aehnlichen Namen
  pmRein('echt','Will the Lakers beat the Celtics?',0.44,0.60);
  pmRein('ablenk1','Will the Lakers make the playoffs?',0.30,0.72);
  pmRein('ablenk2','Will the Celtics trade a first round pick?',0.20,0.82);

  const c=B.crossBookChancen();
  pruefe('genau eine Chance, nicht eine je Ablenkung', c.length===1,
         '('+c.length+' gefunden)');
  if(c.length){
    pruefe('es ist die passende Frage', /beat the Celtics/.test(c[0].ev), '("'+c[0].ev+'")');
    const bf=c[0].legs.filter(function(l){return l.book==='betfair';})[0];
    const pm=c[0].legs.filter(function(l){return l.book==='polymarket';})[0];
    pruefe('der Betfair-Link zeigt auf genau diesen Markt',
           bf && bf.link.indexOf('1.B')>0, bf? bf.link : '');
    pruefe('der Polymarket-Link zeigt auf die zugeordnete Frage',
           pm && pm.link.indexOf('ev-echt')>0, pm? pm.link : '');
  }

  // Ohne Betfair-Markt kann es gar keinen Ausgangspunkt geben
  B.BUCH.clear();
  pruefe('ohne Betfair-Markt wird nichts gesucht', B.crossBookChancen().length===0);

  B.PM.clear(); B.KATALOG.clear(); B.BUCH.clear();
}

console.log('\n══════════ 19. Zeitliche Gegenprobe ══════════\n');
{
  // Zwei Maerkte koennen nur dasselbe Ereignis meinen, wenn sie zeitlich
  // zusammenpassen. Ein Spiel heute Abend ist nicht der Turniersieger in
  // zwei Wochen, auch wenn beide dieselben Namen tragen.
  const inVier=new Date(Date.now()+4*3600e3).toISOString();
  const markt={ mid:'1.Z', ev:'Alcaraz v Sinner', mn:'Match Odds', mt:'MATCH_ODDS', anzahl:2,
    satz:0.05, start:inVier, inplay:false, ts:Date.now(),
    runners:[{name:'Carlos Alcaraz',q:1.6,size:900,lq:1.62,lsize:900},
             {name:'Jannik Sinner',q:2.5,size:900,lq:2.55,lsize:900}] };

  function frage(q, extra){
    const w=B.nrm(q).split(' ');
    return Object.assign({ q:q, outs:['Yes','No'],
      fw:new Set(w.filter(x=>x.length>2)), kf:new Set(w.filter(x=>x.length>1)) }, extra||{});
  }

  // Dasselbe Spiel: Anpfiff passt
  const gleich=frage('Will Carlos Alcaraz beat Jannik Sinner?',
                     { spielStart: Date.now()+4*3600e3 });
  pruefe('gleicher Anpfiff wird akzeptiert', B.bewerte(gleich.fw,gleich.kf,markt,gleich)!=null);

  // Anderes Spiel derselben Paarung, drei Tage spaeter
  const spaeter=frage('Will Carlos Alcaraz beat Jannik Sinner?',
                      { spielStart: Date.now()+3*86400e3 });
  pruefe('Spiel drei Tage spaeter wird abgelehnt', B.bewerte(spaeter.fw,spaeter.kf,markt,spaeter)===null);

  // Markt, der laengst aufgeloest ist, bevor das Spiel stattfindet
  const vorbei=frage('Will Carlos Alcaraz beat Jannik Sinner?',
                     { endet: Date.now()-10*86400e3 });
  pruefe('bereits aufgeloester Markt wird abgelehnt', B.bewerte(vorbei.fw,vorbei.kf,markt,vorbei)===null);

  // Ohne Zeitangabe darf nicht blockiert werden
  const ohne=frage('Will Carlos Alcaraz beat Jannik Sinner?');
  pruefe('ohne Zeitangabe wird nicht blockiert', B.bewerte(ohne.fw,ohne.kf,markt,ohne)!=null);

  console.log('  Toleranz bei genanntem Anpfiff: 12 Stunden');
}

console.log('\n══════════ 20. Gegenprobe: fauler Markt darf nichts melden ══════════\n');
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


console.log('\n══════════ 21. Takt richtet sich nach dem Schluessel ══════════\n');
{
  /* Der DELAYED-Schluessel liefert Kurse mit rund einer Minute Verzoegerung.
     Oefter zu fragen bringt dieselben Zahlen — die Kapazitaet gehoert in
     BREITE. Der LIVE-Schluessel darf dagegen schnell fragen. */
  const alt = B.getKeyArt();

  B.setKeyArt('delayed');
  const d = B.takt();
  pruefe('verzoegert: Takt nicht schneller als die Verzoegerung', d.heiss >= 45,
         d.heiss + ' s');
  pruefe('verzoegert: mehr Maerkte je Durchlauf', d.sweep >= 12000,
         d.sweep + ' Maerkte');
  pruefe('verzoegert: alles wird oefter durchgegangen', d.breit <= 120,
         'alle ' + d.breit + ' s');

  B.setKeyArt('live');
  const l = B.takt();
  pruefe('live: darf schnell fragen', l.heiss <= 20, l.heiss + ' s');
  pruefe('live: Profil ist vorbereitet', l.sweep > 0 && l.voll > 0,
         l.sweep + ' Maerkte, voll alle ' + l.voll + ' s');

  pruefe('live fragt oefter als verzoegert', l.heiss < d.heiss,
         l.heiss + ' s gegen ' + d.heiss + ' s');
  pruefe('verzoegert prueft dafuer mehr Maerkte', d.sweep > l.sweep,
         d.sweep + ' gegen ' + l.sweep);

  B.setKeyArt('unbekannt');
  const u = B.takt();
  pruefe('unbekannter Schluessel wird vorsichtig behandelt',
         u.heiss === d.heiss && u.sweep === d.sweep,
         'wie verzoegert');

  B.setKeyArt(alt);
}


console.log('\n══════════ 22. Anfragerate und Erholung ══════════\n');
{
  /* Betfairs dokumentierte Grenze von 5 Anfragen je Sekunde gilt fuer EINEN
     Markt. Wir fragen jeden Markt einmal je Durchlauf. Begrenzend ist das
     Gewicht: 200 Punkte je Anfrage, ein Kursabruf wiegt 5 -> 40 Maerkte.
     Wird trotzdem gedrosselt, muss sich das wieder erholen — sonst bleibt
     die Bridge nach einer einzigen Drosselung bis zum Neustart lahm. */
  B.rateZuruecksetzen();
  const start = B.rateStand();

  pruefe('Zielrate ist 10 Anfragen je Sekunde',
         Math.round(1000 / start.zielGap) === 10,
         (1000 / start.zielGap).toFixed(1) + ' Anfragen/s');

  const proDurchlauf = Math.ceil(4256 / 40);
  pruefe('ganzer Bestand in rund 11 Sekunden',
         Math.abs(proDurchlauf * start.zielGap / 1000 - 10.7) < 1,
         (proDurchlauf * start.zielGap / 1000).toFixed(1) + ' s fuer ' + proDurchlauf + ' Anfragen');

  // Jeder EINZELNE Markt wird hoechstens einmal je Durchlauf gefragt
  pruefe('Abstand zu Betfairs Grenze je Markt ist gross',
         (1 / 60) * 5 < 1, '1 Abfrage/60 s gegen erlaubte 5/s');

  // Drosselung
  B.rateDrosseln();
  const gedrosselt = B.rateStand();
  pruefe('Drosselung verlangsamt sofort',
         gedrosselt.minGap > start.zielGap,
         start.zielGap + ' ms -> ' + gedrosselt.minGap + ' ms');

  // Erholung: erst nach genuegend stoerungsfreien Aufrufen
  for (let i = 0; i < 39; i++) B.rateErholen();
  pruefe('erholt sich nicht sofort',
         B.rateStand().minGap === gedrosselt.minGap,
         'nach 39 Aufrufen noch ' + B.rateStand().minGap + ' ms');

  B.rateErholen();
  const nach40 = B.rateStand();
  pruefe('nach 40 stoerungsfreien Aufrufen wieder schneller',
         nach40.minGap < gedrosselt.minGap,
         gedrosselt.minGap + ' ms -> ' + nach40.minGap + ' ms');

  // Und irgendwann zurueck auf der Zielrate, aber nie darueber hinaus
  for (let i = 0; i < 40 * 12; i++) B.rateErholen();
  const ende = B.rateStand();
  pruefe('kehrt zur Zielrate zurueck', ende.minGap === ende.zielGap,
         ende.minGap + ' ms');
  pruefe('beschleunigt nie ueber die Zielrate hinaus',
         ende.minGap >= ende.zielGap);

  B.rateZuruecksetzen();
}


console.log('\n══════════ 23. Echte Fehlmeldungen aus dem Betrieb ══════════\n');
{
  /* Beide Faelle sind am 08.08.2026 wirklich als "Arbitrage" gemeldet worden.
     Beide waren falsch. Sie stehen hier, damit sie nicht wiederkommen. */

  // FALL 1: "Will Bitcoin reach $200,000 by December 31, 2026?"
  //         wurde mit dem Betfair-Ausgang "200 - 250m" gepaart.
  //         Grund: "200" galt als Namensmerkmal und stand in beiden Texten.
  pruefe('reine Zahlen sind kein Namensmerkmal',
         B.merkmale('200 - 250m').length === 0,
         JSON.stringify(B.merkmale('200 - 250m')));
  pruefe('auch Zahlen mit Einheit zaehlen nicht',
         B.merkmale('250m').length === 0 && B.merkmale('1.5m').length === 0);
  pruefe('Namen mit Ziffer behalten ihren Wortteil',
         JSON.stringify(B.merkmale('Man Utd 2')) === '["man","utd"]',
         JSON.stringify(B.merkmale('Man Utd 2')));
  pruefe('gewoehnliche Namen bleiben unveraendert',
         JSON.stringify(B.merkmale('Real Madrid')) === '["real","madrid"]');

  // FALL 2: "Poilievre out as leader of Conservatives" wurde mit
  //         "BACK: Conservatives @ 24" gepaart — Quote 24 = 4 % Chance.
  //         Dort steht fast nichts im Buch; die Rendite war ein Artefakt.
  pruefe('Quotengrenze ist gesetzt', B.O.maxQuote === 20, String(B.O.maxQuote));
  pruefe('Quote 24 liegt ueber der Grenze', 24 > B.O.maxQuote);
  pruefe('Quote 250 liegt weit ueber der Grenze', 250 > B.O.maxQuote);
  pruefe('uebliche Quoten bleiben erlaubt',
         2.1 <= B.O.maxQuote && 7 <= B.O.maxQuote && 15 <= B.O.maxQuote);

  // Die Grenze in Wahrscheinlichkeit ausgedrueckt
  const wk = (100 / B.O.maxQuote).toFixed(1);
  pruefe('Grenze entspricht rund 5 % Wahrscheinlichkeit',
         Math.abs(+wk - 5) < 0.6, wk + ' %');
}


console.log('\n══════════ 24. Links treffen den gemeinten Markt ══════════\n');
{
  /* Ein Polymarket-Event buendelt oft zwanzig Maerkte — bei einer Wahl einen
     je Kandidat. Der blosse Event-Link fuehrt dann auf die Uebersicht, und
     man muss den gemeinten Markt selbst heraussuchen. Das wirkte im Betrieb
     wie ein zufaelliger Link.
     Geprueft am 08.08.2026 gegen die echten Adressen:
       /event/<event>            -> 200, aber nur die Uebersicht
       /event/<event>/<markt>    -> 200, genau der richtige Markt
       /event/<markt>            -> 404  (deshalb NIE der Markt-Slug allein) */

  const mehrfach = { slug:'democratic-presidential-nominee-2028',
                     marktSlug:'will-gavin-newsom-win-the-2028-democratic-presidential-nomination-568' };
  const a = B.pmAdresse(mehrfach);
  pruefe('Mehrfach-Event fuehrt zum einzelnen Markt',
         a === 'https://polymarket.com/event/' + mehrfach.slug + '/' + mehrfach.marktSlug,
         a.slice(0, 78));
  pruefe('Event-Slug steht dabei vorn',
         a.indexOf('/event/' + mehrfach.slug + '/') > 0);

  // Ja/Nein-Frage: Event und Markt heissen gleich -> kein doppelter Pfad
  const einzeln = { slug:'xi-jinping-out-before-2027', marktSlug:'xi-jinping-out-before-2027' };
  pruefe('gleicher Slug wird nicht verdoppelt',
         B.pmAdresse(einzeln) === 'https://polymarket.com/event/xi-jinping-out-before-2027',
         B.pmAdresse(einzeln));

  pruefe('ohne Markt-Slug bleibt der Event-Link',
         B.pmAdresse({slug:'lakers-celtics', marktSlug:''}) ===
         'https://polymarket.com/event/lakers-celtics');
  pruefe('ohne jeden Slug die Uebersicht',
         B.pmAdresse({slug:'', marktSlug:''}) === 'https://polymarket.com/markets');
  pruefe('ohne Angaben kein Absturz',
         B.pmAdresse(null) === 'https://polymarket.com/markets');

  // Der Markt-Slug darf NIE allein hinter /event/ stehen — das ergibt 404
  pruefe('Markt-Slug steht nie allein hinter /event/',
         B.pmAdresse(mehrfach).indexOf('/event/' + mehrfach.marktSlug) < 0);
}


console.log('\n══════════ 25. Mehrfach-Arbitrage innerhalb Polymarkets ══════════\n');
{
  /* Ereignis mit mehreren sich ausschliessenden Ausgaengen: summieren sich
     alle JA-Preise auf unter 1 $, kauft man alle — genau einer zahlt 1 $.
     Kein zweites Buch, keine Zuordnung: die groesste Fehlerquelle des
     Scanners existiert hier nicht. Nur negRisk-Events zaehlen. */
  B.PM.clear();
  const kandidat = (id, frage, ask, size, extra) => B.PM.set(id, Object.assign({
    q: frage, outs: ['Yes', 'No'], toks: ['a'+id, 'b'+id],
    slug: 'wahl-2027', marktSlug: 'm'+id, negRisk: true, evTitel: 'Wahl 2027',
    ask: [ask, 1 - ask + 0.02], size: [size, size],
    feeSatz: 0.04, feeExp: 1, liq: 1000, vol: 1000, cat: 'Politik'
  }, extra || {}));

  kandidat('k1', 'Gewinnt A?', 0.30, 500);
  kandidat('k2', 'Gewinnt B?', 0.30, 400);
  kandidat('k3', 'Gewinnt C?', 0.35, 600);

  let f = B.polymarketMehrfach();
  pruefe('drei Kandidaten unter 1 $ werden gefunden', f.length === 1,
         f.length + ' Fund(e)');
  if (f.length) {
    const a = f[0];
    // summe .95, Gewinner zahlt 1 abzueglich seiner Gebuehr (max .014)
    pruefe('Rendite stimmt auf zwei Stellen', Math.abs(a.roi - 3.789) < 0.01,
           '+' + a.roi + ' %');
    pruefe('das duennste Bein deckelt den Einsatz', a.max === Math.floor(400 * 0.95),
           a.max + ' $');
    pruefe('drei Beine im Ticket', a.legs.length === 3);
    pruefe('Link fuehrt auf die Event-Seite (alle Ausgaenge auf einer Seite)',
           a.link === 'https://polymarket.com/event/wahl-2027', a.link);
    pruefe('als pm-mehrfach gekennzeichnet', a.typ === 'pm-mehrfach');
  }

  // Ohne negRisk-Garantie ist "alle kaufen" KEINE Absicherung
  B.PM.forEach(m => { m.negRisk = false; });
  pruefe('ohne negRisk-Kennzeichnung kein Fund', B.polymarketMehrfach().length === 0);
  B.PM.forEach(m => { m.negRisk = true; });

  // Summe ueber 1 -> kein Gewinn -> nichts melden
  B.PM.get('k3').ask[0] = 0.45;
  pruefe('Summe ueber 1 $ liefert nichts', B.polymarketMehrfach().length === 0);
  B.PM.get('k3').ask[0] = 0.35;

  // Ein Bein ohne Kurs -> die Garantie faellt -> ganzes Event verwerfen
  B.PM.get('k2').ask[0] = 0;
  pruefe('ein Bein ohne Kurs verwirft das ganze Event',
         B.polymarketMehrfach().length === 0);
  B.PM.get('k2').ask[0] = 0.30;

  // Mehr als 6 Beine: die Serverseite kuerzt legs auf 6 — ein
  // unvollstaendiges Ticket waere gefaehrlicher als keines
  for (let i = 4; i <= 8; i++) kandidat('k'+i, 'Gewinnt '+i+'?', 0.02, 500);
  pruefe('mehr als sechs Beine werden uebersprungen',
         B.polymarketMehrfach().length === 0, B.PM.size + ' Maerkte im Event');

  B.PM.clear();
}


console.log('\n══════════ 26. Quotengrenze greift wirklich ══════════\n');
{
  /* Die erste Fassung dieser Pruefung las v.bf.q — ein Feld, das es am Bein
     nicht gibt. NaN > 20 ist immer false, die Grenze griff NIE. Deshalb stand
     'Conservatives @ 30' tagelang in der Liste. Hier wird echt gegen die
     runners geprueft. */
  const bein = (art, quoten) => ({ art, runners: quoten.map(q => art==='lay'? {l:q}:{q}) });
  const hoch = b => { let h=0; for(const r of b.runners){ const v=b.art==='lay'?(+r.l||+r.q||0):(+r.q||0); if(v>h)h=v;} return h||Infinity; };
  pruefe('back mit Quote 30 ist zu hoch', hoch(bein('back',[30])) > 20, hoch(bein('back',[30]))+'');
  pruefe('lay-Kurs 33 wird erkannt', hoch(bein('lay',[33])) > 20);
  pruefe('gebuendelt: hoechster Teil zaehlt', hoch(bein('back',[3,28,4])) === 28);
  pruefe('normale Quote 5.1 bleibt erlaubt', hoch(bein('back',[5.1])) <= 20);
  pruefe('leeres Bein gilt als unbekannt', hoch({art:'back',runners:[]}) === Infinity);
}

/* Die letzten zwei Gruppen brauchen await (der Link-Pruefer ist async, auch
   wenn er mit warmem Speicher nie ins Netz geht) — deshalb ein async-Rahmen,
   der am Ende auch die Schlussbilanz druckt. */
(async function () {

/* Die letzten beiden Gruppen laufen in einer async-Klammer, weil der
   Polymarket-Link-Pruefer ein Promise liefert. Die Zusammenfassung und der
   Exit-Code ziehen mit hinein — nach hier kommt kein synchroner Code mehr. */
(async function () {

console.log('\n══════════ 27. Jeder Link wird geprüft, bevor er gemeldet wird ══════════\n');
{
  /* Betfair: ohne Netz pruefbar. Der Link muss die marketId der gerechneten
     Kurse tragen, die Id muss im Katalog stehen, der Markt muss offen sein. */
  B.KATALOG.set('1.111', { ev: 'A gegen B', mn: 'Match Odds', runners: [] });
  B.BUCH.set('1.111', { status: 'OPEN', runners: [] });

  pruefe('richtiger Betfair-Link besteht',
         B.bfLinkPruefen('1.111', 'https://www.betfair.com/exchange/plus/market/1.111').lok === 1);
  pruefe('Link mit fremder marketId wird verworfen',
         B.bfLinkPruefen('1.111', 'https://www.betfair.com/exchange/plus/market/1.999').lok === -1);
  pruefe('marketId ohne Katalogeintrag wird verworfen',
         B.bfLinkPruefen('1.222', 'https://www.betfair.com/exchange/plus/market/1.222').lok === -1);
  B.BUCH.set('1.111', { status: 'CLOSED', runners: [] });
  pruefe('geschlossener Markt wird verworfen',
         B.bfLinkPruefen('1.111', 'https://www.betfair.com/exchange/plus/market/1.111').lok === -1);
  B.BUCH.set('1.111', { status: 'OPEN', runners: [] });

  /* Polymarket: die Gegenprobe laeuft uebers Netz und wird gemerkt. Hier wird
     der Speicher direkt gefuellt — geprueft wird die VERGLEICHSLOGIK, nicht
     das Netz: loest der Slug auf denselben Markt und dasselbe Orderbuch auf? */
  const frisch = { id: '4711', toks: ['tokJA', 'tokNEIN'], ts: Date.now() };
  B.LINK_CACHE.set('wer-gewinnt-x', frisch);

  const p1 = await B.pmLinkPruefen('4711', 'wer-gewinnt-x', 'tokJA');
  pruefe('richtiger Polymarket-Slug besteht', p1.lok === 1);
  const p2 = await B.pmLinkPruefen('9999', 'wer-gewinnt-x', 'tokJA');
  pruefe('Slug eines FREMDEN Marktes wird verworfen', p2.lok === -1, p2.grund);
  const p3 = await B.pmLinkPruefen('4711', 'wer-gewinnt-x', 'tokFREMD');
  pruefe('fremdes Orderbuch-Token wird verworfen', p3.lok === -1, p3.grund);
  const p4 = await B.pmLinkPruefen('4711', '', 'tokJA');
  pruefe('fehlender Slug wird verworfen', p4.lok === -1);

  /* Ganze Chancen: eine mit falschem Link darf die Liste nie erreichen,
     eine mit richtigen Links bleibt und traegt die Pruefmarke. */
  const opp = (mid, pmId, slug, tok) => ({
    ev: 'Testchance', _mid: mid, _pmId: pmId, _marktSlug: slug, _tok: tok,
    legs: [
      { book: 'polymarket', link: 'https://polymarket.com/event/e/' + slug },
      { book: 'betfair', link: 'https://www.betfair.com/exchange/plus/market/' + mid }
    ]
  });
  const beide = await B.linksPruefen([
    opp('1.111', '4711', 'wer-gewinnt-x', 'tokJA'),     // beide Links richtig
    opp('1.999', '4711', 'wer-gewinnt-x', 'tokJA')      // Betfair-Link ohne Katalogeintrag
  ]);
  pruefe('Chance mit richtigen Links bleibt', beide.length === 1);
  pruefe('Chance mit falschem Link ist verworfen', beide.verworfenLink === 1);
  pruefe('Beine tragen die Pruefmarke lok=1',
         beide[0] && beide[0].legs.every(l => l.lok === 1));
  pruefe('Vergleichsfelder sind vor dem Hochladen entfernt',
         beide[0] && !('_mid' in beide[0]) && !('_pmId' in beide[0]));

  B.KATALOG.delete('1.111'); B.BUCH.delete('1.111'); B.LINK_CACHE.clear();
}

console.log('\n══════════ 28. Zu viel Daten? Teilen statt melden ══════════\n');
{
  /* Betfairs TOO_MUCH_DATA (oft versteckt hinter dem Sammelcode ANGX-0001)
     ist KEIN Fehler, sondern der Befehl, kleiner zu fragen. Die Entscheidung
     ist eine reine Funktion und hier vollstaendig nachgerechnet. */
  const h = 3600e3, jetzt = 1700000000000;
  const f = B.fensterEntscheidung;
  pruefe('grosses Fenster wird geteilt, still',
         f('TOO_MUCH_DATA', jetzt, jetzt + 24 * h, false) === 'teilen');
  pruefe('Sammelcode ANGX-0001 wird genauso geteilt',
         f('ANGX-0001', jetzt, jetzt + 24 * h, false) === 'teilen');
  pruefe('auch ein 3-Minuten-Fenster wird noch geteilt',
         f('TOO_MUCH_DATA', jetzt, jetzt + 3 * 60e3, false) === 'teilen');
  pruefe('kleinstes Fenster: erst Wartepause und zweiter Versuch',
         f('TOO_MUCH_DATA', jetzt, jetzt + 2 * 60e3, false) === 'nochmal');
  pruefe('kleinstes Fenster nach zweitem Versuch: ehrlich als Verlust verbucht',
         f('TOO_MUCH_DATA', jetzt, jetzt + 2 * 60e3, true) === 'verloren');
  pruefe('Anmeldefehler wird NICHT verschluckt, sondern weitergeworfen',
         f('INVALID_SESSION_INFORMATION', jetzt, jetzt + 24 * h, false) === 'weiterwerfen');
  pruefe('Netzfehler wird ebenfalls weitergeworfen',
         f('fetch failed', jetzt, jetzt + 24 * h, false) === 'weiterwerfen');
  /* Keine Tiefengrenze mehr, aber auch keine Endlosschleife: jede Teilung
     halbiert das Fenster, unter 2 Minuten wird nicht mehr geteilt. Vom
     groessten Fenster (900 Tage) bis dorthin sind es ~19 Halbierungen. */
  let fenster = 900 * 86400e3, ebenen = 0;
  while (f('TOO_MUCH_DATA', 0, fenster, false) === 'teilen') { fenster = Math.floor(fenster / 2); ebenen++; }
  pruefe('Teilung endet von selbst', ebenen > 10 && ebenen < 25, ebenen + ' Ebenen bis zum kleinsten Fenster');
}

console.log('\n══════════════════════════════════════════');
console.log('  ' + ok + ' Prüfungen bestanden, ' + fehler + ' fehlgeschlagen');
console.log('══════════════════════════════════════════\n');
process.exit(fehler ? 1 : 0);

})();

})();
