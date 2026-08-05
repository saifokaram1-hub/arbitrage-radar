/**
 * Prüft den PDF-Erzeuger, ohne Browser.
 * Start:  node pdf-pruefung.js
 * Schreibt zusätzlich eine Beispieldatei, die man öffnen und ansehen kann.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const P = require('./pdf.js');

let ok = 0, fehler = 0;
function pruefe(name, bed, zusatz) {
  if (bed) { ok++; console.log('  ✅ ' + name + (zusatz ? '   ' + zusatz : '')); }
  else { fehler++; console.log('  ❌ ' + name + (zusatz ? '   ' + zusatz : '')); }
}

console.log('\n══════════ 1. Zeichen und Umbruch ══════════\n');
{
  pruefe('Umlaute bleiben erhalten', P.nachWinAnsi('Größe Änderung Überprüfung') === 'Größe Änderung Überprüfung');
  pruefe('Gedankenstrich wird ersetzt', P.nachWinAnsi('a — b').indexOf('—') < 0, '("' + P.nachWinAnsi('a — b') + '")');
  pruefe('Pfeil wird ersetzt', P.nachWinAnsi('vorher → jetzt') === 'vorher -> jetzt');
  pruefe('Haken wird ersetzt', P.nachWinAnsi('✅ fertig') === '[ja] fertig');
  pruefe('Anführungszeichen werden ersetzt', P.nachWinAnsi('„Test"').indexOf('„') < 0);
  pruefe('kein Zeichen über 255 übrig', /^[\x00-\xFF]*$/.test(P.nachWinAnsi('Mbappé — „Ballon d’Or" → ✅ ⇄ 中')));

  const z = P.umbrechen('Das ist ein längerer Satz der über mehrere Zeilen umbrochen werden muss damit er passt', 200, 9.5, false);
  pruefe('Text wird umbrochen', z.length > 1, '(' + z.length + ' Zeilen)');
  pruefe('keine Zeile ist zu breit', z.every(l => P.textBreite(l, 9.5, false) <= 200));
  const lang = P.umbrechen('Donaudampfschifffahrtsgesellschaftskapitaenspatentpruefungsverordnung', 80, 9.5, false);
  pruefe('überlanges Wort wird hart getrennt', lang.length > 1 && lang.every(l => P.textBreite(l, 9.5, false) <= 80));
}

console.log('\n══════════ 2. Aufbau der Datei ══════════\n');
let roh;
{
  const doc = new P.Doc();
  const bloecke = [
    { t: 'titel', s: 'Wie gesucht wird, wie schnell, und was der Schlüssel daran ändert' },
    { t: 'p', s: 'Der Scanner vergleicht Polymarket mit der Betfair-Börse und meldet nur Wetten, bei denen beide Ausgänge zusammen mehr zurückzahlen als eingesetzt wurde.' },
    { t: 'klein', s: 'Bridge v2 · Endpunkt unverändert' },
    { t: 'h2', s: 'Kennzahlen' },
    { t: 'kv', k: 'Polymarket-Märkte', v: '2 100', z: 'vorher 100' },
    { t: 'kv', k: 'beidseitig handelbar', v: '1 251', z: '838 mit echter Tiefe' },
    { t: 'h2', s: 'Wie gesucht wird' },
    { t: 'stufe', n: '1', s: 'Marktliste durchblättern', d: 'Die Schnittstelle gibt höchstens 100 Einträge pro Anfrage zurück, egal welche Anzahl man verlangt. Deshalb wird geblättert, bis das Ende erreicht ist.', m: '21 Anfragen · 2,2 s · 2 100 Märkte' },
    { t: 'stufe', n: '6', s: 'Gleichstand herstellen', d: 'Verglichen werden darf nur, was es auf beiden Büchern gibt.', m: 'Schnittmenge im Bridge-Fenster' },
    { t: 'h3', s: 'Die Rechnung' },
    { t: 'code', s: 'qE  = 1 + (q - 1) * (1 - Gebühr)\ninv = 1/qE1 + 1/qE2\nS1  = S * (1/qE1) / inv\nAuszahlung = S / inv' },
    { t: 'hinweis', s: 'Von Hand gegengerechnet: Lay-Quote 5,00, Gegenüber setzt 200, deine Haftung 800. Verliert der Teilnehmer, bekommst du 990 zurück.' },
    { t: 'tabelle', kopf: ['Vorgang', 'Grenze', 'Anfragen', 'Dauer', 'Herkunft'], zeilen: [
      ['Polymarket Marktliste', '100 je Anfrage', '21', '2,2 s', 'gemessen'],
      ['Polymarket Preise', '250 Token je Anfrage', '17', '4,3 s', 'gemessen'],
      ['Betfair 20 000 Märkte', '40 je Abfrage', '500', '125 s', 'gerechnet']
    ] },
    { t: 'spalte', name: 'Delayed App Key', preis: '0 € · sofort verfügbar', punkte: [
      'Kurse kommen verzögert, Betfair nennt keine feste Zahl.',
      'Taugt für langsame Märkte: Politik, Langzeitwetten.',
      'Bei laufenden Spielen praktisch unbrauchbar.'
    ] },
    { t: 'eintrag', s: 'Der Scanner sah 100 von 2 100 Märkten', tag: 'kritisch',
      vor: 'Im Code stand bis zu 500 Märkte. Die Schnittstelle liefert aber nie mehr als 100 pro Anfrage.',
      jetzt: 'Es wird geblättert, bis alles da ist. 2 100 Märkte, davon 1 251 beidseitig handelbar.' }
  ];
  // Genug Inhalt für mehrere Seiten
  for (let i = 0; i < 6; i++) bloecke.push(bloecke[7], bloecke[11], bloecke[14], bloecke[13]);

  P.setzen(doc, bloecke);
  roh = P.bauen(doc, 'Orion Panel - Suchlogik - Stand 05.08.2026');

  pruefe('mehrere Seiten entstanden', doc.seiten.length >= 2, '(' + doc.seiten.length + ' Seiten)');
  pruefe('beginnt mit %PDF-1.4', roh.startsWith('%PDF-1.4'));
  pruefe('endet mit %%EOF', roh.trimEnd().endsWith('%%EOF'));
  pruefe('enthält xref', roh.indexOf('\nxref\n') > 0);
  pruefe('enthält trailer mit Root', /trailer\s*<<\/Size \d+\/Root 1 0 R>>/.test(roh));
  pruefe('keine Zeichen über 255', /^[\x00-\xFF]*$/.test(roh));
}

console.log('\n══════════ 3. Sind die xref-Offsets byte-genau? ══════════\n');
{
  // Die Tabelle wird über startxref gefunden — "lastIndexOf('xref')" träfe
  // sonst das Wort in "startxref" selbst.
  const startxref = +(/startxref\s+(\d+)/.exec(roh) || [])[1];
  pruefe('startxref zeigt exakt auf "xref"', roh.slice(startxref, startxref + 4) === 'xref',
         '(Position ' + startxref + ', dort steht "' + roh.slice(startxref, startxref + 4) + '")');

  const block = roh.slice(startxref);
  const zeilen = block.split('\n');
  const anzahl = +zeilen[1].split(' ')[1];
  pruefe('Kopfzeile der Tabelle ist lesbar', Number.isFinite(anzahl) && anzahl > 5, '("' + zeilen[1] + '")');
  let alleOk = true, ersterFehler = '';
  for (let i = 1; i < anzahl; i++) {
    const off = +zeilen[1 + i + 1].slice(0, 10);
    const soll = i + ' 0 obj';
    const ist = roh.slice(off, off + soll.length);
    if (ist !== soll) { alleOk = false; if (!ersterFehler) ersterFehler = 'Objekt ' + i + ': erwartet "' + soll + '", gefunden "' + ist + '"'; }
  }
  pruefe('jeder Offset trifft sein Objekt', alleOk, alleOk ? '(' + (anzahl - 1) + ' Objekte geprüft)' : ersterFehler);

  const size = +(/\/Size (\d+)/.exec(roh) || [])[1];
  pruefe('Size im trailer passt zur Objektzahl', size === anzahl, '(Size ' + size + ', xref ' + anzahl + ')');
}

console.log('\n══════════ 4. Inhalt und Sonderzeichen im Strom ══════════\n');
{
  pruefe('Klammern werden geschützt', roh.indexOf('\\(') > 0 || roh.indexOf('(1 - Geb') < 0);
  pruefe('Schriften eingebunden', /BaseFont\/Helvetica[^-]/.test(roh) && /Helvetica-Bold/.test(roh) && /Courier/.test(roh));
  pruefe('WinAnsi gesetzt', (roh.match(/WinAnsiEncoding/g) || []).length === 3);
  pruefe('Seitenzahlen vorhanden', roh.indexOf('Seite 1 von') > 0);
  pruefe('jede Length stimmt mit dem Strom überein', (function(){
    const re = /<<\/Length (\d+)>>\nstream\n([\s\S]*?)\nendstream/g;
    let m, alle = true, n = 0;
    while ((m = re.exec(roh))) { n++; if (+m[1] !== m[2].length) alle = false; }
    return n > 0 && alle;
  })());
}

const ziel = path.join(__dirname, 'beispiel-suchlogik.pdf');
const bytes = Buffer.alloc(roh.length);
for (let i = 0; i < roh.length; i++) bytes[i] = roh.charCodeAt(i) & 0xFF;
fs.writeFileSync(ziel, bytes);

console.log('\n══════════════════════════════════════════');
console.log('  ' + ok + ' bestanden, ' + fehler + ' fehlgeschlagen');
console.log('  Beispieldatei: ' + ziel + '  (' + Math.round(bytes.length / 1024) + ' KB)');
console.log('══════════════════════════════════════════\n');
process.exit(fehler ? 1 : 0);
