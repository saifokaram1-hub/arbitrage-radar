/**
 * Orion Panel — Scanner-Bridge (läuft LOKAL auf deinem PC)
 * ========================================================
 * Liest BEIDE Seiten und rechnet die Arbitrage selbst aus:
 *   1. Betfair / 96ex Exchange   (über deinen App-Key, lokal — Cloud wird geblockt)
 *   2. Polymarket                (offene API, kein Konto nötig)
 *
 * Weil das Programm auf deinem PC läuft, sammelt sich die Historie auch dann,
 * wenn niemand die Website offen hat. Gefundene Chancen werden hochgeladen
 * und dauerhaft protokolliert.
 *
 * ── NUR BÖRSE, NIEMALS BUCHMACHER ──────────────────────────────────────────
 * Es wird ausschliesslich die Exchange angesprochen (SportsAPING, availableToBack).
 * Das ist der Marktplatz zwischen Nutzern: du wettest gegen andere Leute,
 * nie gegen Betfair selbst. Betfair Sportsbook wird nirgends aufgerufen.
 * Deshalb gibt es hier auch keine Gewinnersperre wie beim Buchmacher.
 *
 * ── DIE RECHNUNG ───────────────────────────────────────────────────────────
 * Zwei sich ausschliessende Ausgänge, je einer auf einem anderen Buch:
 *   Effektivquote nach Kommission:  qE = 1 + (q - 1) * (1 - Gebühr)
 *   Summe der Kehrwerte:            inv = 1/qE1 + 1/qE2
 *   Arbitrage liegt vor, wenn       inv < 1
 *   Aufteilung von Einsatz S:       S1 = S * (1/qE1)/inv   S2 = S - S1
 *   Auszahlung, egal wie es ausgeht: S/inv   (bei BEIDEN Ausgängen gleich)
 *   Gewinn: S/inv - S      Rendite: (1/inv - 1) * 100 %
 * Also ausdrücklich NICHT 50/50, sondern so aufgeteilt, dass beide Ausgänge
 * denselben Betrag zurückgeben. Nur dann ist der Gewinn garantiert.
 *
 * ── SICHERHEIT ─────────────────────────────────────────────────────────────
 * Zugangsdaten bleiben AUSSCHLIESSLICH auf diesem PC (bridge-config.json).
 * Hochgeladen werden nur Quoten und Ergebnisse, niemals Login-Daten.
 *
 * START:  Doppelklick auf die .exe   |   oder:  node betfair-bridge.js
 */

'use strict';
const fs = require('fs');
const path = require('path');

// Wird die Datei direkt gestartet (Doppelklick / node betfair-bridge.js), läuft das
// Programm. Wird sie dagegen von einem Prüfskript eingebunden, werden nur die
// Rechenfunktionen bereitgestellt — so lässt sich die Arbitrage-Logik nachrechnen,
// ohne dass sich irgendetwas bei Betfair anmeldet.
const ALS_PROGRAMM = require.main === module;

const BASE_DIR = process.pkg ? path.dirname(process.execPath) : __dirname;
const CFG_PATH = path.join(BASE_DIR, 'bridge-config.json');

const VORLAGE = {
  betfairUsername: 'HIER-DEIN-BETFAIR-BENUTZERNAME',
  betfairPassword: 'HIER-DEIN-BETFAIR-PASSWORT',
  betfairAppKey: 'HIER-DEIN-16-ZEICHEN-APP-KEY',
  bridgeToken: 'HIER-DEIN-TOKEN-AUS-MEIN-BEREICH',
  bridgeUrl: 'https://noexklrgtqveiclijdwp.supabase.co/functions/v1/bf-bridge',
  intervalSeconds: 20,
  feeBetfairPercent: 5,
  feePolymarketPercent: 0,
  minRoiPercent: 0.5,
  minStake: 20
};

function warte() {
  // Nur anhalten, wenn wirklich ein Konsolenfenster da ist. Läuft das Programm
  // ohne Eingabe (Dienst, Aufgabenplanung, automatischer Test), würde das
  // Warten sonst abstürzen statt sauber zu beenden.
  try {
    if (!process.stdin || !process.stdin.isTTY) return;
    console.log('\n[Fenster bleibt offen — zum Schliessen Enter druecken]');
    require('child_process').execSync('pause > nul', { shell: 'cmd.exe', stdio: 'inherit' });
  } catch (e) {}
}

/* ═══════════════ Konfiguration laden und ehrlich prüfen ═══════════════ */

if (ALS_PROGRAMM && !fs.existsSync(CFG_PATH)) {
  try {
    fs.writeFileSync(CFG_PATH, JSON.stringify(VORLAGE, null, 2), 'utf8');
    console.log('\n📝 Zugangsdatei wurde neu angelegt:\n   ' + CFG_PATH);
    console.log('\n   SO GEHT ES WEITER:');
    console.log('   1. Diese Datei mit dem Editor oeffnen (Doppelklick, dann "Editor" waehlen)');
    console.log('   2. Die vier HIER-... Felder ausfuellen:');
    console.log('        betfairUsername  = dein Betfair-Login');
    console.log('        betfairPassword  = dein Betfair-Passwort');
    console.log('        betfairAppKey    = dein 16-Zeichen App-Key');
    console.log('        bridgeToken      = dein Token aus "Mein Bereich" auf der Website');
    console.log('   3. Speichern und dieses Programm nochmal starten\n');
    try { require('child_process').exec('notepad "' + CFG_PATH + '"'); } catch (e) {}
  } catch (e) {
    console.error('\n❌ Konnte die Zugangsdatei nicht anlegen: ' + e.message);
  }
  warte();
  process.exit(1);
}

let CFG = VORLAGE;
try {
  if (fs.existsSync(CFG_PATH)) CFG = JSON.parse(fs.readFileSync(CFG_PATH, 'utf8'));
} catch (e) {
  if (!ALS_PROGRAMM) throw e;
  console.error('\n❌ Die Zugangsdatei ist beschaedigt (fehlendes Komma oder Anfuehrungszeichen?):');
  console.error('   ' + e.message);
  console.error('   Datei: ' + CFG_PATH + '\n');
  try { require('child_process').exec('notepad "' + CFG_PATH + '"'); } catch (e2) {}
  warte();
  process.exit(1);
}

// Platzhalter zuverlaessig erkennen — die Vorlagen benutzen mal Bindestrich,
// mal Unterstrich. Frueher wurde nur "HIER-" geprueft, dadurch rutschte
// "HIER_DEIN_..." als vermeintlich fertig ausgefuellt durch.
function istPlatzhalter(v) {
  const t = String(v == null ? '' : v).trim();
  if (!t) return true;
  return /^(hier|dein|deine|selbst|your|xxx|<)[-_ ]?/i.test(t) || /^\.{2,}/.test(t);
}

const PFLICHT = [
  ['betfairUsername', 'dein Betfair-Benutzername'],
  ['betfairPassword', 'dein Betfair-Passwort'],
  ['betfairAppKey',   'dein 16-Zeichen App-Key'],
  ['bridgeUrl',       'Adresse der Website (bleibt wie voreingestellt)'],
  ['bridgeToken',     'dein Token aus "Mein Bereich"']
];
const offen = PFLICHT.filter(p => istPlatzhalter(CFG[p[0]]));
if (ALS_PROGRAMM && offen.length) {
  console.error('\n❌ In der Zugangsdatei sind noch Felder offen (Platzhalter statt echter Wert):\n');
  offen.forEach(p => console.error('   • ' + p[0] + '   ->  ' + p[1]));
  console.error('\n   Datei: ' + CFG_PATH);
  console.error('   Bitte ausfuellen, speichern und das Programm neu starten.\n');
  try { require('child_process').exec('notepad "' + CFG_PATH + '"'); } catch (e) {}
  warte();
  process.exit(1);
}
if (ALS_PROGRAMM && !/^brg_/.test(String(CFG.bridgeToken)) && String(CFG.bridgeToken).length < 20) {
  console.log('\n⚠ Hinweis: dein bridgeToken sieht ungewoehnlich aus.');
  console.log('  Es steht auf der Website unter "Betfair/96ex verbinden" und beginnt normalerweise mit brg_.\n');
}

const zahl = (v, d) => { const n = +v; return isFinite(n) && n >= 0 ? n : d; };

/* ═══════════ Takt: was der Schluessel wirklich hergibt ═══════════════════
   Der DELAYED-Schluessel liefert Kurse mit rund einer Minute Verzoegerung.
   Wer damit alle 20 Sekunden fragt, bekommt zweimal von drei Malen exakt
   dieselben Zahlen zurueck — die Anfragen sind verschenkt.

   Also nicht schneller, sondern BREITER: derselbe Aufwand, aber ueber mehr
   Maerkte verteilt. Mehr geprueft heisst mehr Ueberschneidung mit Polymarket
   und damit mehr echte Funde. Genau das bringt Treffer, nicht ein hoeherer
   Takt auf denselben paar Maerkten.

   Beim LIVE-Schluessel ist es umgekehrt: dort zaehlt jede Sekunde, weil die
   Kurse wirklich aktuell sind. Deshalb stehen beide Profile hier nebeneinander
   und werden nach der erkannten Schluesselart gewaehlt — der Live-Teil ist
   bereits fertig hinterlegt und greift, sobald ein Live-Key erkannt wird. */
const TAKT = {
  delayed: {
    heiss:  zahl(CFG.delayedHotSeconds,   60),   // so alt sind die Daten ohnehin
    breit:  zahl(CFG.delayedWarmSeconds, 120),   // alles durchgehen, doppelt so oft wie zuvor
    voll:   zahl(CFG.delayedColdSeconds, 900),   // Bestand neu entdecken
    sweep:  zahl(CFG.delayedMaxBookPerSweep, 12000)  // deutlich mehr Maerkte je Durchlauf
  },
  live: {
    heiss:  zahl(CFG.liveHotSeconds,   20),
    breit:  zahl(CFG.liveWarmSeconds, 150),
    voll:   zahl(CFG.liveColdSeconds, 900),
    sweep:  zahl(CFG.liveMaxBookPerSweep, 6000)
  }
};

const O = {
  hotSeconds:   zahl(CFG.hotIntervalSeconds,  zahl(CFG.intervalSeconds, 20)),
  warmSeconds:  zahl(CFG.warmIntervalSeconds, 150),
  coldSeconds:  zahl(CFG.coldIntervalSeconds, 900),
  excludeEventTypeIds: CFG.excludeEventTypeIds || ['7', '4339'],   // Pferde, Windhunde
  reqPerSecond: zahl(CFG.maxRequestsPerSecond, 10),
  minSize:      zahl(CFG.minSize, 10),
  // Rückfallwerte. Im Normalfall werden die ECHTEN Sätze je Markt verwendet:
  // Betfair liefert marketBaseRate, Polymarket feeSchedule.rate.
  feeBf:        zahl(CFG.feeBetfairPercent, 5) / 100,
  // Wenn Polymarket Gebühren meldet, aber keinen Satz nennt, wird der
  // ungünstigste beobachtete Satz angenommen. Eine unbekannte Gebühr darf
  // NIE als null durchgehen, sonst entstehen Chancen, die es nicht gibt.
  pmFallbackFee: zahl(CFG.pmFallbackFeePercent, 7) / 100,
  minRoi:       zahl(CFG.minRoiPercent, 0.5),
  // Schwelle für schnelle Märkte, solange der Schlüssel verzögerte Kurse liefert
  minRoiSchnell: zahl(CFG.minRoiSchnellPercent, 2.5),
  minStake:     zahl(CFG.minStake, 20),
  // Obergrenze fuer eine glaubwuerdige Rendite zwischen zwei Boersen
  maxPlausibel: zahl(CFG.maxPlausibelPercent, 20),
  // Hoechste Betfair-Quote, die noch als handelbar gilt. 20 entspricht 5 %
  // Wahrscheinlichkeit — darunter ist das Buch zu duenn fuer eine Absicherung.
  maxQuote:     zahl(CFG.maxQuote, 20),
  minInternalRoi: zahl(CFG.minInternalRoiPercent, 0.3),
  maxDataAge:   zahl(CFG.maxDataAgeSeconds, 0),   // 0 = automatisch nach Marktgeschwindigkeit
  scanPolymarket: CFG.scanPolymarket !== false,
  internalArb:  CFG.internalArb !== false,
  uploadLimit:  zahl(CFG.uploadLimit, 4000),
  maxBookPerSweep: zahl(CFG.maxBookPerSweep, 6000)
};

/* Fassung dieses Programms. Beim Hochladen mitgeschickt, damit die Website
   erkennt, ob auf einem PC noch eine veraltete Bridge läuft, und den Nutzer
   auffordern kann, die neue Datei zu holen. BEI JEDER inhaltlichen Änderung
   an der Suchlogik hochzählen — sonst merkt niemand, dass er alt ist. */
const BRIDGE_BUILD = 13;
const BRIDGE_VERSION = "3.3";

const BF_LOGIN = 'https://identitysso.betfair.com/api/login';
const BF_KEEP  = 'https://identitysso.betfair.com/api/keepAlive';
const BF_RPC   = 'https://api.betfair.com/exchange/betting/json-rpc/v1';   // Exchange, NICHT Sportsbook
const BF_ACCOUNT = 'https://api.betfair.com/exchange/account/json-rpc/v1'; // nur zum Auslesen der App-Keys
const PM_GAMMA = 'https://gamma-api.polymarket.com/markets';
const PM_CLOB  = 'https://clob.polymarket.com';
const BOOK_CHUNK = 40;    // EX_BEST_OFFERS: Gewicht 5, Betfair erlaubt 200 pro Aufruf
const PM_CHUNK   = 250;   // /books nimmt bis 500, 250 ist der sichere Wert

const log = (...a) => console.log(new Date().toLocaleTimeString('de-DE'), ...a);
const schlaf = ms => new Promise(r => setTimeout(r, ms));

/* ═══════════════ Betfair: Drosselung, Login, Aufrufe ═══════════════ */

/* ── Anfragerate ────────────────────────────────────────────────────────
   Betfairs dokumentierte Grenze von 5 Anfragen je Sekunde gilt fuer EINEN
   EINZELNEN Markt. Wir fragen jeden Markt nur einmal je Durchlauf, also
   hoechstens einmal pro Minute — davon sind wir weit entfernt. Fuer die
   Gesamtrate ueber VERSCHIEDENE Maerkte nennt Betfair keine harte Grenze;
   begrenzend ist das Gewicht: 200 Punkte je Anfrage, ein Kursabruf wiegt 5,
   macht 40 Maerkte pro Anfrage.

   Deshalb 10 Anfragen je Sekunde als Ziel. Das halbiert die Dauer eines
   Durchlaufs gegenueber den bisherigen 4 — und ein kuerzerer Durchlauf ist
   auch mit verzoegertem Schluessel besser: zwischen dem ersten und dem
   letzten gelesenen Markt liegen dann 11 statt 27 Sekunden, die beiden
   Buecher werden also naeher am selben Augenblick verglichen.

   Meldet Betfair trotzdem TOO_MANY_REQUESTS, wird sofort entschaerft und
   danach in kleinen Schritten wieder herangetastet — ohne diese Erholung
   bliebe die Bridge nach einer einzigen Drosselung bis zum Neustart lahm. */
const zielGap = Math.round(1000 / Math.max(O.reqPerSecond, 1));
let minGap = zielGap;
let letzterCall = 0;
let seitDrossel = 0;          // erfolgreiche Aufrufe seit der letzten Drosselung

async function bremse() {
  const w = letzterCall + minGap - Date.now();
  if (w > 0) await schlaf(w);
  letzterCall = Date.now();
}
// Nach einer Drosselung vorsichtig wieder beschleunigen
function rateErholen() {
  if (minGap <= zielGap) return;
  if (++seitDrossel < 40) return;      // erst nach 40 stoerungsfreien Aufrufen
  seitDrossel = 0;
  minGap = Math.max(zielGap, Math.round(minGap * 0.85));
  log('⏱ wieder etwas schneller — Takt ' + minGap + ' ms (' +
      (1000 / minGap).toFixed(1) + ' Anfragen/s)');
}

let sessionToken = null, lastLogin = 0, loginFehler = 0, pauseBis = 0;

async function login() {
  const body = 'username=' + encodeURIComponent(CFG.betfairUsername) +
               '&password=' + encodeURIComponent(CFG.betfairPassword);
  const r = await fetch(BF_LOGIN, {
    method: 'POST',
    headers: { 'X-Application': CFG.betfairAppKey, 'Content-Type': 'application/x-www-form-urlencoded', 'Accept': 'application/json' },
    body
  });
  const txt = await r.text();
  let j = null; try { j = JSON.parse(txt); } catch (e) {}
  if (!j) throw new Error('Unerwartete Antwort von Betfair: ' + txt.slice(0, 120));

  // Bei LIMITED_ACCESS (SUSPENDED, KYC_SUSPEND, PENDING_AUTH) kommt TROTZDEM ein
  // gueltiges Token: wetten gesperrt, Kurse lesen erlaubt. Genau das brauchen wir.
  if (!j.token) {
    throw new Error('Login fehlgeschlagen: ' + (j.error || j.status || 'unbekannt') +
                    ' (Status: ' + (j.status || '-') + ') — kein Token erhalten');
  }
  sessionToken = j.token;
  lastLogin = Date.now();
  if (j.status === 'SUCCESS') log('✅ Bei Betfair eingeloggt.');
  else {
    log('✅ Eingeloggt — Kurse lesen moeglich.');
    log('   ⚠ Konto eingeschraenkt (' + (j.error || j.status) + '): Wetten ueber die API gesperrt,');
    log('     Quoten werden trotzdem gelesen.');
  }

  // Einmal je Anmeldung klaeren, womit wir es zu tun haben
  await schluesselArtErkennen();
  if (KEY_ART === 'live') {
    log('🔑 App-Key: LIVE' + (KEY_NAME ? ' ("' + KEY_NAME + '")' : '') + ' — Kurse in Echtzeit.');
    log('   Schwelle bleibt bei ' + O.minRoi + '% auch fuer laufende Spiele.');
  } else if (KEY_ART === 'delayed') {
    log('🔑 App-Key: DELAYED' + (KEY_NAME ? ' ("' + KEY_NAME + '")' : '') + ' — Kurse kommen verzoegert.');
    log('   Langsame Maerkte (Politik, Langzeitwetten): Schwelle ' + O.minRoi + '%');
    log('   Schnelle Maerkte (laufend / <2 h bis Anpfiff): Schwelle ' + O.minRoiSchnell + '%,');
    log('   weil eine verzoegerte Quote dort meist schon weg ist, wenn du klickst.');
  } else {
    log('🔑 App-Key: Art nicht feststellbar — es wird vorsichtshalber wie DELAYED gerechnet.');
    log('   (Der Schluessel gehoert womoeglich zu einem anderen Betfair-Konto.)');
  }
}

async function keepAlive() {
  try {
    const r = await fetch(BF_KEEP, { headers: { 'X-Application': CFG.betfairAppKey, 'X-Authentication': sessionToken, 'Accept': 'application/json' } });
    const j = await r.json();
    if (j.status !== 'SUCCESS' && !j.token) { log('⚠ Sitzung abgelaufen — logge neu ein'); await login(); }
    else lastLogin = Date.now();
  } catch (e) { log('⚠ keepAlive Fehler:', e.message); }
}

/* ═══════════════ Welcher Schlüssel steckt drin: verzögert oder echtzeit? ═══════════════ */
// Betfair sagt es selbst. Die Kontoschnittstelle listet alle App-Keys des Nutzers,
// und jede Fassung trägt ein Feld "delayData": true heisst verzögert, false heisst live.
// Wir suchen darin unseren eingetragenen Schlüssel und lesen den Wert ab.
// Solange das nicht sicher geklärt ist, wird VORSICHTIG gerechnet, also wie verzögert.
let KEY_ART = 'unbekannt';   // 'delayed' | 'live' | 'unbekannt'
let KEY_NAME = '';

async function schluesselArtErkennen() {
  try {
    const r = await fetch(BF_ACCOUNT, {
      method: 'POST',
      headers: {
        'X-Application': CFG.betfairAppKey, 'X-Authentication': sessionToken,
        'Content-Type': 'application/json', 'Accept': 'application/json'
      },
      body: JSON.stringify({ jsonrpc: '2.0', method: 'AccountAPING/v1.0/getDeveloperAppKeys', params: {}, id: 1 })
    });
    const txt = await r.text();
    if (txt.trim().startsWith('<')) throw new Error('HTML statt Antwort');
    const j = JSON.parse(txt);
    const erg = (Array.isArray(j) ? j[0] : j).result;
    if (!Array.isArray(erg)) throw new Error('unerwartete Antwort');

    const meiner = String(CFG.betfairAppKey).trim();
    for (const app of erg) {
      for (const v of (app.appVersions || [])) {
        if (String(v.applicationKey || '').trim() === meiner) {
          KEY_ART = v.delayData ? 'delayed' : 'live';
          KEY_NAME = app.appName || '';
          return KEY_ART;
        }
      }
    }
    // Schlüssel nicht in der Liste: kann an einem fremden Konto liegen
    KEY_ART = 'unbekannt';
    return KEY_ART;
  } catch (e) {
    KEY_ART = 'unbekannt';
    return KEY_ART;
  }
}

const istVerzoegert = () => KEY_ART !== 'live';   // unbekannt wird wie verzögert behandelt

/* Der aktive Takt, passend zur erkannten Schluesselart.
   Steht in der Konfiguration ein ausdruecklicher Wert, hat der Vorrang —
   sonst wird das Profil aus TAKT genommen. Solange die Art noch unbekannt
   ist, gilt das vorsichtigere Delayed-Profil. */
function takt() {
  const p = istVerzoegert() ? TAKT.delayed : TAKT.live;
  const gesetzt = (a, b) => (a != null || b != null);
  let heiss = gesetzt(CFG.hotIntervalSeconds, CFG.intervalSeconds) ? O.hotSeconds : p.heiss;
  let sweep = CFG.maxBookPerSweep != null ? O.maxBookPerSweep : p.sweep;

  /* Untergrenze beim verzoegerten Schluessel.
     Betfair liefert damit Kurse mit rund einer Minute Verzoegerung. Ein
     kuerzerer Takt holt nachweislich DIESELBEN Zahlen und verbraucht nur
     Anfragen, die dann bei der Breite fehlen. Deshalb wird auch eine
     aeltere Konfiguration mit intervalSeconds:20 hier angehoben — das ist
     keine Bevormundung, sondern die physikalische Grenze des Schluessels. */
  if (istVerzoegert() && heiss < 45) heiss = 45;

  return { heiss, breit: CFG.warmIntervalSeconds != null ? O.warmSeconds : p.breit,
           voll: CFG.coldIntervalSeconds != null ? O.coldSeconds : p.voll,
           sweep };
}

// Mit verzögerten Kursen braucht ein schneller Markt mehr Luft: was man sieht,
// ist bereits Vergangenheit. Langsame Märkte sind davon kaum betroffen.
function minRoiFuer(markt) {
  if (!istVerzoegert()) return O.minRoi;
  const bis = markt.start ? Date.parse(markt.start) - Date.now() : Infinity;
  const schnell = markt.inplay || bis < 2 * 3600e3;
  return schnell ? Math.max(O.minRoi, O.minRoiSchnell) : O.minRoi;
}

async function rpc(method, params, versuch) {
  versuch = versuch || 0;
  await bremse();
  const r = await fetch(BF_RPC, {
    method: 'POST',
    headers: {
      'X-Application': CFG.betfairAppKey, 'X-Authentication': sessionToken,
      'Content-Type': 'application/json', 'Accept': 'application/json'
    },
    body: JSON.stringify([{ jsonrpc: '2.0', method: 'SportsAPING/v1.0/' + method, params, id: 1 }])
  });
  const txt = await r.text();
  if (txt.trim().startsWith('<')) throw new Error('Blockiert (HTML/Cloudflare) — laeuft das Programm wirklich lokal? VPN aus?');
  const j = JSON.parse(txt);
  const first = Array.isArray(j) ? j[0] : j;
  if (first.error) {
    const s = JSON.stringify(first.error);
    if (/TOO_MANY_REQUESTS|DSC-0018/i.test(s) && versuch < 4) {
      minGap = Math.min(2000, Math.round(minGap * 1.7));
      seitDrossel = 0;   // Erholung beginnt von vorn
      log('⏱ Betfair drosselt — Takt auf ' + minGap + 'ms entschaerft');
      await schlaf(1200 * (versuch + 1));
      return rpc(method, params, versuch + 1);
    }
    throw new Error(s.slice(0, 220));
  }
  rateErholen();   // stoerungsfrei durchgekommen -> ggf. wieder beschleunigen
  return first.result;
}

/* ═══════════════ Betfair: Bestand erfassen ═══════════════ */

const KATALOG = new Map();   // marketId -> {ev, mn, mt, start, runners[], etId}

/* Adresse eines Polymarket-Marktes: Event-Slug UND Markt-Slug.
   Nur mit beiden landet man beim gemeinten Markt statt auf der Uebersicht
   aller Maerkte des Events — ein Event wie "democratic-presidential-nominee-2028"
   buendelt zwanzig davon, einen je Kandidat. Fehlt der Markt-Slug oder ist er
   mit dem Event identisch, bleibt es beim Event-Link. */
function pmAdresse(pm) {
  if (!pm || !pm.slug) return 'https://polymarket.com/markets';
  const basis = 'https://polymarket.com/event/' + pm.slug;
  return (pm.marktSlug && pm.marktSlug !== pm.slug) ? basis + '/' + pm.marktSlug : basis;
}

async function katalogFenster(etId, vonMs, bisMs, tiefe) {
  let res;
  try {
    res = await rpc('listMarketCatalogue', {
      filter: { eventTypeIds: [etId], marketStartTime: { from: new Date(vonMs).toISOString(), to: new Date(bisMs).toISOString() } },
      maxResults: 1000, sort: 'FIRST_TO_START',
      marketProjection: ['RUNNER_DESCRIPTION', 'EVENT', 'MARKET_START_TIME', 'MARKET_DESCRIPTION']
    });
  } catch (e) {
    if (/TOO_MUCH_DATA/i.test(e.message) && tiefe < 7) {
      const m = Math.floor((vonMs + bisMs) / 2);
      await katalogFenster(etId, vonMs, m, tiefe + 1);
      await katalogFenster(etId, m, bisMs, tiefe + 1);
      return;
    }
    throw e;
  }
  if (!res) return;
  for (const c of res) {
    // Betfair nennt den Kommissionssatz je Markt selbst. Er ist NICHT überall 5 %.
    const bd = c.description || {};
    const satz = isFinite(+bd.marketBaseRate) && +bd.marketBaseRate >= 0
      ? +bd.marketBaseRate / 100
      : O.feeBf;
    KATALOG.set(c.marketId, {
      ev: (c.event && c.event.name) || '',
      mn: c.marketName || '',
      mt: bd.marketType || '',
      satz: satz,
      rabattOk: bd.discountAllowed !== false,
      start: c.marketStartTime || (c.event && c.event.openDate) || null,
      etId: etId,
      runners: (c.runners || []).map(r => ({ id: r.selectionId, name: r.runnerName }))
    });
  }
  // Genau am Deckel = Fenster war voll -> teilen, sonst gehen Maerkte verloren
  if (res.length >= 1000 && tiefe < 7 && (bisMs - vonMs) > 3600e3) {
    const m = Math.floor((vonMs + bisMs) / 2);
    await katalogFenster(etId, vonMs, m, tiefe + 1);
    await katalogFenster(etId, m, bisMs, tiefe + 1);
  }
}

async function entdecken() {
  const t0 = Date.now();
  KATALOG.clear();
  const typen = await rpc('listEventTypes', { filter: {} });
  const aus = new Set((O.excludeEventTypeIds || []).map(String));
  const liste = typen.filter(t => !aus.has(String(t.eventType.id)))
                     .sort((a, b) => b.marketCount - a.marketCount);
  const jetzt = Date.now();
  const fenster = [
    [jetzt - 6 * 3600e3,        jetzt + 12 * 3600e3],
    [jetzt + 12 * 3600e3,       jetzt + 48 * 3600e3],
    [jetzt + 48 * 3600e3,       jetzt + 14 * 86400e3],
    [jetzt + 14 * 86400e3,      jetzt + 120 * 86400e3],
    [jetzt + 120 * 86400e3,     jetzt + 900 * 86400e3]
  ];
  for (const t of liste) {
    for (const f of fenster) {
      try { await katalogFenster(String(t.eventType.id), f[0], f[1], 0); }
      catch (e) { log('   ⚠ ' + t.eventType.name + ': ' + e.message.slice(0, 90)); }
    }
  }
  log('🗺  Betfair-Bestand: ' + KATALOG.size + ' Maerkte aus ' + liste.length + ' Sportarten (' +
      ((Date.now() - t0) / 1000).toFixed(0) + 's)' + (aus.size ? '  [ohne Rennsport]' : ''));
  return KATALOG.size;
}

const BUCH = new Map();   // marketId -> {status, inplay, runners:[{id,st,b,bs,l,ls}]}

async function buecherHolen(ids) {
  let n = 0;
  for (let i = 0; i < ids.length; i += BOOK_CHUNK) {
    let books;
    try {
      books = await rpc('listMarketBook', {
        marketIds: ids.slice(i, i + BOOK_CHUNK),
        priceProjection: { priceData: ['EX_BEST_OFFERS'], virtualise: false }
      });
    } catch (e) {
      if (/session|invalid|auth|expired|INVALID_SESSION/i.test(e.message)) throw e;
      continue;
    }
    for (const b of books || []) {
      BUCH.set(b.marketId, {
        status: b.status, inplay: !!b.inplay,
        // Lesezeitpunkt festhalten. Ohne den könnte ein Kurs aus dem
        // 15-Minuten-Volldurchlauf gegen einen sekundenfrischen Polymarket-Preis
        // gerechnet und als aktuelle Chance gemeldet werden.
        ts: Date.now(),
        runners: (b.runners || []).map(r => {
          const back = (r.ex && r.ex.availableToBack && r.ex.availableToBack[0]) || null;
          const lay  = (r.ex && r.ex.availableToLay  && r.ex.availableToLay[0])  || null;
          return { id: r.selectionId, st: r.status,
                   b: back ? +back.price : 0, bs: back ? +back.size : 0,
                   l: lay ? +lay.price : 0,  ls: lay ? +lay.size : 0 };
        })
      });
      n++;
    }
  }
  return n;
}

/* ═══════════════ Polymarket: alle Märkte, Stapelabruf ═══════════════ */

const PM = new Map();   // marketId -> {q, outs, toks, slug, liq, cat, ask:[p0,p1], size:[s0,s1]}

function kategorie(q) {
  q = (q || '').toLowerCase();
  if (/bitcoin|btc|ethereum| eth |solana|crypto|dogecoin|xrp|coin/.test(q)) return 'Krypto';
  if (/fed|rate|cpi|gdp|recession|s&p|nasdaq|stock|inflation|earnings|ipo|tesla|apple|nvidia|openai/.test(q)) return 'Wirtschaft';
  if (/election|senate|house|president|governor|republican|democrat| party |congress|vote|poll\b/.test(q)) return 'Politik';
  if (/tennis|alcaraz|sinner|djokovic|swiatek|sabalenka|\batp\b|\bwta\b|medvedev|zverev/.test(q)) return 'Tennis';
  if (/nba|basketball|lakers|celtics|nuggets|warriors|bucks|76ers|suns|knicks/.test(q)) return 'Basketball';
  if (/soccer|bundesliga|premier league|la liga|serie a|champions|bayern|dortmund|real madrid|barcelona|\bfc /.test(q)) return 'Fußball';
  if (/nfl|mlb|nhl|ufc|\bgame\b|\bmatch\b| vs\.?| win\b/.test(q)) return 'Sport';
  return 'Markt';
}

async function pmListe() {
  const gefunden = new Map();
  let off = 0;
  // Gamma liefert hoechstens 100 pro Aufruf, egal welches limit gesetzt ist.
  while (off < 20000) {
    let j;
    try {
      const r = await fetch(PM_GAMMA + '?closed=false&active=true&limit=100&offset=' + off);
      // Hinter dem letzten Eintrag antwortet Gamma mit 422 statt mit einer
      // leeren Liste. Das ist das Ende der Daten, kein Fehler.
      if (r.status === 422) break;
      if (!r.ok) break;
      j = await r.json();
    } catch (e) { break; }
    if (!Array.isArray(j) || !j.length) break;
    for (const m of j) {
      if (!m.enableOrderBook) continue;
      let outs, toks;
      try { outs = JSON.parse(m.outcomes); toks = JSON.parse(m.clobTokenIds); } catch (e) { continue; }
      if (!outs || outs.length !== 2 || !toks || toks.length !== 2) continue;
      // Gebührenangaben des Marktes übernehmen. Ist etwas unklar, wird der
      // ungünstigste beobachtete Satz angenommen — eine unbekannte Gebühr
      // darf niemals als null durchgehen, sonst entstehen Scheinchancen.
      const fs = m.feeSchedule || {};
      const anAus = m.feesEnabled !== false;
      const satz = anAus ? (isFinite(+fs.rate) && +fs.rate >= 0 ? +fs.rate : O.pmFallbackFee) : 0;
      /* Fuer die Adresse zaehlt der EVENT-Slug — /event/<markt-slug> allein
         liefert 404, weil ein Event mehrere Maerkte buendelt.
         Der Markt-Slug wird aber MITGENOMMEN: ein Event wie
         "democratic-presidential-nominee-2028" enthaelt zwanzig Maerkte, einen
         je Kandidat. Nur der Event-Link fuehrt auf die Uebersicht, und man
         muss den gemeinten Markt selbst heraussuchen — das wirkte wie ein
         zufaelliger Link. Der Pfad /event/<event>/<markt> trifft genau. */
      const ereignis = Array.isArray(m.events) && m.events[0] ? m.events[0] : null;
      const adresse = (ereignis && ereignis.slug) || m.slug || '';
      const marktSlug = m.slug || '';
      gefunden.set(String(m.id), {
        q: m.question || '', outs, toks, slug: adresse, marktSlug: marktSlug,
        liq: parseFloat(m.liquidity || 0), vol: parseFloat(m.volume || 0),
        cat: kategorie(m.question),
        // Zeitpunkte: gameStartTime steht bei konkreten Spielen, endDate ist
        // der Auflösungstermin. Damit lässt sich prüfen, ob zwei Märkte
        // überhaupt dasselbe Ereignis meinen können.
        spielStart: m.gameStartTime ? Date.parse(String(m.gameStartTime).replace(' ', 'T')) : null,
        endet: m.endDate ? Date.parse(m.endDate) : null,
        feeSatz: satz,
        feeExp: isFinite(+fs.exponent) && +fs.exponent > 0 ? +fs.exponent : 1,
        feeTyp: String(m.feeType || (anAus ? 'unbekannt' : 'keine'))
      });
    }
    off += 100;
    if (j.length < 100) break;
  }
  return gefunden;
}

async function pmKurse(markets) {
  const toks = [];
  markets.forEach(m => { toks.push(m.toks[0], m.toks[1]); });
  const preis = new Map();
  for (let i = 0; i < toks.length; i += PM_CHUNK) {
    const chunk = toks.slice(i, i + PM_CHUNK);
    try {
      const r = await fetch(PM_CLOB + '/books', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify(chunk.map(t => ({ token_id: t })))
      });
      const j = await r.json();
      if (!Array.isArray(j)) continue;
      for (const b of j) {
        if (!b.asks || !b.asks.length) continue;
        // Achtung: die asks kommen absteigend. Der Kaufpreis ist der NIEDRIGSTE.
        let best = null;
        for (const a of b.asks) { const p = +a.price; if (best === null || p < best.p) best = { p: p, s: +a.size }; }
        if (best && best.p > 0 && best.p < 1) preis.set(String(b.asset_id), best);
      }
    } catch (e) { /* einzelner Stapel darf ausfallen */ }
  }
  return preis;
}

async function polymarketScan() {
  const liste = await pmListe();
  pmGelistet = liste.size;
  if (!liste.size) return 0;
  const preise = await pmKurse(liste);
  PM.clear();
  let handelbar = 0;
  liste.forEach((m, id) => {
    const a = preise.get(String(m.toks[0])), b = preise.get(String(m.toks[1]));
    if (!a || !b) return;
    // Beide Seiten muessen echt handelbar sein. 0.99/0.01 heisst: tot.
    if (a.p < 0.02 || a.p > 0.98 || b.p < 0.02 || b.p > 0.98) return;
    m.ask = [a.p, b.p];
    m.size = [a.s, b.s];
    m.ts = Date.now();
    // Wortmengen einmal vorbereiten — die Gegenprobe fragt sie oft ab
    const w = nrm(m.q).split(' ');
    m.fw = new Set(w.filter(x => x.length > 2));
    m.kf = new Set(w.filter(x => x.length > 1 && !STOPP.has(x)));
    PM.set(id, m);
    handelbar++;
  });
  return handelbar;
}

/* ═══════════════ Namensabgleich ═══════════════ */

const nrm = s => (s || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

/* Wörter, die einen Markt NICHT eindeutig machen.
   Früher wurde nur das letzte Wort eines Namens als Schlüssel genommen. Damit
   wurden "Republican Party" und "Democratic Party" beide zu "party" — und die
   Bedingung "beide Teilnehmer kommen in der Frage vor" war erfüllt, sobald
   irgendwo das Wort Party stand. Jeder US-Wahlmarkt passte dadurch auf jeden
   anderen, und heraus kamen Renditen von mehreren hundert Prozent. */
const STOPP = new Set([
  'the','and','for','with','from','not','win','wins','won','beat','beats','vs','versus',
  'yes','no','ja','nein','draw','tie','unentschieden',
  'party','team','club','city','united','fc','sc','afc','cf','sv','tsv','bsc',
  'seat','race','house','senate','election','elections','district','state','county',
  'game','match','round','group','league','cup','open','final','finals','winner',
  'total','over','under','first','next','new','national','world','championship'
]);

/* Zahlen sind KEIN Namensmerkmal.
   Ein Betfair-Ausgang "200 - 250m" lieferte die Merkmale "200" und "250m".
   Das Wort "200" steht aber auch in "Will Bitcoin reach $200,000" — und schon
   galt ein Preisspannen-Markt als dieselbe Wette wie eine Bitcoin-Frage.
   Bisher waren nur vierstellige Jahreszahlen ausgeschlossen; alle anderen
   Zahlen zaehlten als vollwertiger Beleg. Ein Name wird durch Buchstaben
   unterscheidbar, nicht durch Ziffern. */
const istNurZahl = w => /^\d+(?:[.,]\d+)?[a-z]{0,2}$/.test(w);
// Alle unterscheidungskräftigen Wörter eines Namens, nicht nur das letzte
function merkmale(name) {
  return nrm(name).split(' ')
    .filter(x => x.length > 2 && !STOPP.has(x) && !istNurZahl(x));
}
// Nur für Anzeigezwecke: ein einzelnes Wort, das den Namen grob kennzeichnet
function schluessel(name) {
  const w = merkmale(name);
  return w.length ? w[w.length - 1] : '';
}
// Welches Merkmal dieses Namens steht in der Frage?
function trefferIn(fragWoerter, name) {
  const m = merkmale(name);
  for (const w of m) if (fragWoerter.has(w)) return w;
  return null;
}
const istUnentschieden = n => /^(the )?(draw|tie|unentschieden)$/i.test(String(n || '').trim());
// Eine blosse Jahreszahl bestaetigt gar nichts — die steht in fast jedem Titel
const istJahr = w => /^(19|20)\d{2}$/.test(w);

/* Kennungen wie "UT-03", "NFC 2", "Runde 5" sind die eigentlichen Namen eines
   Rennens — und bestehen ausgerechnet aus den kurzen Teilen, die eine reine
   Wortlaengen-Regel wegwirft. Deshalb werden benachbarte kurze Teile, von
   denen einer eine Ziffer traegt, zu einem Stueck zusammengezogen:
   "ut 03" -> "ut03". Das ist unterscheidungskraeftig genug, um allein zu zaehlen. */
function kennungen(text) {
  const w = nrm(text).split(' ').filter(Boolean);
  const out = new Set();
  for (let i = 0; i < w.length - 1; i++) {
    if (w[i].length > 4 || w[i + 1].length > 4) continue;
    if (!/\d/.test(w[i]) && !/\d/.test(w[i + 1])) continue;
    if (istJahr(w[i]) && istJahr(w[i + 1])) continue;
    out.add(w[i] + w[i + 1]);
  }
  return out;
}

/* ═══════════════ Arbitrage-Rechnung (der Kern) ═══════════════ */

/* ── Gebühren ─────────────────────────────────────────────────────────────
   Beide Bücher nehmen Gebühren, aber auf völlig verschiedene Weise. Wer das
   in einen Topf wirft, rechnet sich Chancen herbei, die es nicht gibt.

   BETFAIR (Börse, du wettest gegen andere Nutzer):
     Kommission auf den NETTOGEWINN eines Marktes. Der Satz steht pro Markt
     in marketBaseRate und ist NICHT überall 5 % — je nach Markt 2 bis 7 %.
         qE = 1 + (q - 1) * (1 - Satz)

   POLYMARKET (Orderbuch, du handelst gegen andere Nutzer):
     Gebühr auf die ANTEILE, nicht auf den Gewinn, und abhängig vom Preis:
         Gebühr je Anteil = Satz * min(p, 1-p)^Exponent
     Sie ist bei p = 0,50 am höchsten und fällt zu den Rändern hin ab.
     Nur Taker zahlen — und wer zum Briefkurs kauft, ist immer Taker.
         qE = (1 - Gebühr je Anteil) / p

   WICHTIG: Beide Bücher sind Marktplätze zwischen Nutzern. Genau deshalb
   fallen diese Gebühren überhaupt an. Gegen einen Buchmacher zu wetten
   kostet keine Kommission, dafür ist die Quote schlechter und man fliegt
   als Gewinner raus. Solche Bücher werden hier bewusst nicht angefasst,
   also gibt es hier auch keine Buchmacher-Marge einzurechnen.
   ───────────────────────────────────────────────────────────────────────── */

const effektiv = (q, gebuehr) => 1 + (q - 1) * (1 - gebuehr);

// Gebühr je Anteil bei Polymarket
function pmGebuehr(preis, satz, exponent) {
  if (!(satz > 0)) return 0;
  const seite = Math.min(preis, 1 - preis);
  return satz * Math.pow(seite, exponent > 0 ? exponent : 1);
}
// Effektivquote beim Kauf zum Briefkurs, Gebühr eingerechnet
function pmEffektiv(preis, satz, exponent) {
  if (!(preis > 0 && preis < 1)) return 0;
  const netto = 1 - pmGebuehr(preis, satz, exponent);
  if (!(netto > 0)) return 0;
  return netto / preis;
}

/**
 * Zwei Beine, die zusammen ALLE Ausgänge abdecken.
 * bein = {qEff, maxEinsatz, ...}
 * Liefert die Aufteilung, bei der beide Ausgänge exakt gleich auszahlen.
 */
function rechne(bein1, bein2) {
  const inv = 1 / bein1.qEff + 1 / bein2.qEff;
  if (!(inv > 0)) return null;
  const a1 = (1 / bein1.qEff) / inv;      // Anteil am Gesamteinsatz
  const a2 = (1 / bein2.qEff) / inv;
  // Wie viel Gesamteinsatz lassen die verfuegbaren Groessen zu?
  const maxS = Math.min(
    bein1.maxEinsatz > 0 ? bein1.maxEinsatz / a1 : Infinity,
    bein2.maxEinsatz > 0 ? bein2.maxEinsatz / a2 : Infinity
  );
  return {
    inv: inv,
    roi: (1 / inv - 1) * 100,
    ok: inv < 1,
    anteil1: a1 * 100,
    anteil2: a2 * 100,
    maxStake: isFinite(maxS) ? maxS : 0
  };
}

/* ═══════════════ Cross-Book: Polymarket ⇄ Betfair/96ex ═══════════════ */

// Betfair-Märkte mit Teilnehmernamen in einen Suchindex legen.
// Auch Märkte mit vielen Teilnehmern (Ballon d'Or, Meisterschaftssieger, Wahlen)
// kommen mit hinein — dort ist die Gegenseite ein LAY auf den einen Teilnehmer.
function bfIndex() {
  const idx = new Map();   // schluesselwort -> [{mid, runners[]}]
  KATALOG.forEach((k, mid) => {
    const buch = BUCH.get(mid);
    if (!buch || buch.status !== 'OPEN') return;
    const n = (k.runners || []).length;
    if (n < 2 || n > 60) return;
    const namen = {}; k.runners.forEach(r => { namen[r.id] = r.name; });
    const rs = [];
    for (const r of buch.runners) {
      if (r.st && r.st !== 'ACTIVE') continue;
      const name = namen[r.id];
      if (!name) continue;
      rs.push({ name, q: r.b, size: r.bs, lq: r.l, lsize: r.ls });
    }
    if (rs.length < 2) return;
    const eintrag = { mid, ev: k.ev, mn: k.mn, mt: k.mt, start: k.start, inplay: buch.inplay,
                      satz: k.satz != null ? k.satz : O.feeBf,   // Kommission dieses Marktes
                      ts: buch.ts || 0, runners: rs, anzahl: n };
    // Unter JEDEM unterscheidungskräftigen Wort ablegen, nicht nur unter dem
    // letzten — sonst findet man "Los Angeles Lakers" nur über "lakers".
    for (const r of rs) {
      for (const w of merkmale(r.name)) {
        if (!idx.has(w)) idx.set(w, []);
        idx.get(w).push(eintrag);
      }
    }
  });
  return idx;
}

/**
 * Ein Betfair-Bein aus einem LAY: du hältst dagegen, dass dieser Teilnehmer gewinnt.
 * Das ist reines Börsengeschäft — die Gegenseite ist ein anderer Nutzer.
 *
 * Beim Lay setzt du die Haftung ein: Haftung = stake * (L - 1).
 * Gewinnt dein Lay (der Teilnehmer verliert), bekommst du die Haftung zurück
 * plus stake abzüglich Kommission. Als Dezimalquote auf den eingesetzten Betrag:
 *      qEff = 1 + (1 - Gebühr) / (L - 1)
 */
function layBein(runner, gebuehr) {
  const L = runner.lq;
  if (!(L > 1.01)) return null;
  const qEff = 1 + (1 - gebuehr) / (L - 1);
  if (!(qEff > 1)) return null;
  // availableToLay.size ist der Einsatz des Gegenübers -> unsere Haftung ist size*(L-1)
  const maxEinsatz = runner.lsize > 0 ? runner.lsize * (L - 1) : 0;
  return { qEff, maxEinsatz, art: 'lay', runners: [runner], L };
}

/**
 * Wie gut passt ein Betfair-Markt zu einer Frage? Gibt Punkte zurück, oder
 * null wenn er gar nicht passt. Eine einzige Stelle, damit der Abgleich in
 * BEIDE Richtungen nach exakt denselben Regeln bewertet wird.
 */
/**
 * Können zwei Märkte zeitlich überhaupt dasselbe Ereignis meinen?
 *
 * Nennt Polymarket einen Anpfiff (gameStartTime), muss der Betfair-Markt
 * innerhalb weniger Stunden davon starten — sonst ist es ein anderes Spiel.
 * Sonst gilt nur die schwache Bedingung: ein Ereignis kann nicht stattfinden,
 * nachdem der Markt darüber längst aufgelöst wurde.
 */
function zeitPasst(pm, e) {
  const bfStart = e.start ? Date.parse(e.start) : null;
  if (!bfStart) return true;                       // ohne Angabe nicht blockieren
  if (pm.spielStart) {
    return Math.abs(bfStart - pm.spielStart) <= 12 * 3600e3;
  }
  if (pm.endet) {
    // Ein Tag Nachlauf, weil Auflösung und Anpfiff selten exakt zusammenfallen
    return bfStart <= pm.endet + 86400e3;
  }
  return true;
}

function bewerte(fragWoerter, kontextDerFrage, e, pm) {
  // Zeitliche Gegenprobe zuerst: sie ist billig und schliesst ganze Klassen
  // von Verwechslungen aus, etwa ein Spiel heute Abend gegen einen Markt,
  // der ueber den Turniersieger in zwei Wochen entscheidet.
  if (pm && !zeitPasst(pm, e)) return null;

  const echte = e.runners.filter(r => !istUnentschieden(r.name));
  if (echte.length < 2) return null;

  // Welches Merkmal jedes Teilnehmers steht in der Frage?
  const treffer = echte.map(r => ({ r: r, w: trefferIn(fragWoerter, r.name) }));
  const genannt = treffer.filter(t => t.w);
  // Ein Wort darf NICHT für zwei Teilnehmer zugleich zählen. Genau daran
  // scheiterte es vorher: "party" galt für beide Parteien gleichzeitig.
  if (new Set(genannt.map(t => t.w)).size !== genannt.length) return null;

  // Kontext des Betfair-Marktes: Ereignisname und Markttitel, ohne die
  // Teilnehmernamen selbst — sonst bestätigt sich der Treffer selbst.
  // ALLE Wörter der Namen ausschliessen, auch kurze wie "da", "de", "van":
  // genau so hat sich ein Kampfmarkt über sein eigenes "da" bestätigt.
  const eigenNamen = new Set();
  e.runners.forEach(r => nrm(r.name).split(' ').forEach(w => { if (w) eigenNamen.add(w); }));
  // Ab 2 Zeichen, weil die Kennung eines Rennens oft genau darin steckt
  // ("UT 03"). Gefährlich sind kurze Wörter nur, wenn sie aus dem Namen
  // selbst stammen — und die sind oben bereits vollständig ausgeschlossen.
  const kontextBf = nrm((e.ev || '') + ' ' + (e.mn || '')).split(' ')
    .filter(w => w.length >= 2 && !STOPP.has(w) && !eigenNamen.has(w));
  const kontextTreffer = kontextBf.filter(w => kontextDerFrage.has(w));

  if (genannt.length >= 2 && genannt.length === echte.length) {
    // Beide Seiten des Zweikampfs stehen namentlich in der Frage — eindeutig.
    return 10 + kontextTreffer.length;
  }
  if (genannt.length === 1) {
    // Nur EIN Teilnehmer genannt (typisch bei "Gewinnt X das Turnier?").
    // Ein einzelnes gemeinsames Wort reicht nie: so wurde ein brasilianischer
    // Wahlmarkt an einen Kampf gegen "Jose Montanha da SILVA" gehängt,
    // bestätigt allein durch das Füllwort "da".
    // Zwei Kontexttreffer, die BEIDE keine Jahreszahl sind. Eine Jahreszahl
    // steht in fast jedem Titel und bestätigt nichts. Auf eine Mindestlänge
    // wird bewusst verzichtet: die Kennung eines Rennens ist oft kurz
    // ("UT" + "03"), und lange Wörter wie "house" fallen als Allerweltswort
    // schon vorher weg.
    const ohneJahr = kontextTreffer.filter(w => !istJahr(w));
    if (ohneJahr.length < 2) return null;
    return kontextTreffer.length;
  }
  return null;
}

/**
 * Gegenprobe in die andere Richtung.
 *
 * Betfair ist das kleinere und viel besser strukturierte Buch: Ereignisname,
 * Markttyp, saubere Teilnehmernamen. Polymarket liefert nur Freitext. Deshalb
 * genügt es nicht zu fragen "welcher Betfair-Markt passt zu dieser Frage" —
 * es muss auch umgekehrt gelten: unter ALLEN Polymarket-Fragen darf keine
 * besser zu diesem Betfair-Markt passen als die gewählte.
 *
 * Genau daran wäre die Verwechslung gescheitert: der Kampf "Sutherland gegen
 * Jose Montanha da Silva" passt offensichtlich besser zu einer Frage über
 * diesen Kampf als zu einer über Brasiliens Präsidentschaftswahl.
 */
function bestaetigtRueckwaerts(pmId, e, punkte) {
  let besser = false;
  PM.forEach((p, id) => {
    if (besser || id === pmId) return;
    wortMengen(p);
    const s = bewerte(p.fw, p.kf, e, p);
    if (s != null && s > punkte) besser = true;
  });
  return !besser;
}

/**
 * Sucht zu einem Polymarket-Markt den passenden Betfair-Markt.
 * Ergebnis: welcher Betfair-Teilnehmer ist gemeint (subjekt), und welcher
 * Polymarket-Ausgang bedeutet "dieser Teilnehmer gewinnt" (jaIdx).
 */
function zuordnen(pm, idx, pmId) {
  const frage = nrm(pm.q);
  const fragWoerter = pm.fw || new Set(frage.split(' ').filter(w => w.length > 2));
  const kandidaten = new Map();
  fragWoerter.forEach(w => { (idx.get(w) || []).forEach(e => kandidaten.set(e.mid, e)); });
  if (!kandidaten.size) return null;

  const o0 = nrm(pm.outs[0]), o1 = nrm(pm.outs[1]);
  const jaNein = /^(yes|ja)$/.test(o0) || /^(yes|ja)$/.test(o1) ||
                 /^(no|nein)$/.test(o0) || /^(no|nein)$/.test(o1);

  let bester = null, besterScore = -1, besterSubjekt = null;

  // Wörter, die den KONTEXT tragen: Ort, Wettbewerb, Kennung des Rennens.
  // "UT 03", "massachusetts", "wimbledon" — daran hängt, um welches Ereignis
  // es überhaupt geht. Ohne diesen Abgleich passt jeder Wahlmarkt auf jeden.
  const kontextDerFrage = pm.kf || new Set(
    frage.split(' ').filter(w => w.length > 1 && !STOPP.has(w))
  );

  kandidaten.forEach(e => {
    const score = bewerte(fragWoerter, kontextDerFrage, e, pm);
    if (score == null) return;
    const frueher = !bester || (e.start && bester.start && Date.parse(e.start) < Date.parse(bester.start));
    if (score > besterScore || (score === besterScore && frueher)) {
      bester = e; besterScore = score;
    }
  });
  if (!bester) return null;

  // Erst wenn auch die Gegenrichtung zustimmt, gilt die Paarung
  if (pmId != null && PM.size && !bestaetigtRueckwaerts(pmId, bester, besterScore)) return null;

  const echte = bester.runners.filter(r => !istUnentschieden(r.name));

  if (jaNein) {
    // "Will Bayern beat Dortmund?" / "Will Mbappé win the Ballon d'Or?"
    // Subjekt = der Teilnehmer, dessen Merkmal in der Frage ZUERST auftaucht.
    let frueh = Infinity;
    for (const r of echte) {
      const w = trefferIn(fragWoerter, r.name);
      if (!w) continue;
      const p = frage.indexOf(w);
      if (p >= 0 && p < frueh) { frueh = p; besterSubjekt = r; }
    }
    if (!besterSubjekt) return null;
    const jaIdx = /^(yes|ja)$/.test(o0) ? 0 : 1;
    return { markt: bester, subjekt: besterSubjekt, jaIdx, neinIdx: 1 - jaIdx };
  }

  // Ausgänge tragen Namen -> nur beim echten Zweikampf eindeutig
  if (bester.anzahl !== 2) return null;
  const finde = o => {
    const woerter = new Set(o.split(' ').filter(w => w.length > 2));
    return echte.find(r => merkmale(r.name).some(w => woerter.has(w)));
  };
  const r0 = finde(o0), r1 = finde(o1);
  if (!r0 || !r1 || r0 === r1) return null;
  return { markt: bester, subjekt: r0, jaIdx: 0, neinIdx: 1 };
}

// Mehrere Betfair-Ausgänge zu EINEM Bein bündeln (z.B. "nicht Bayern" = X + Dortmund)
function buendeln(runners, gebuehr) {
  let invSum = 0;
  for (const r of runners) {
    const e = effektiv(r.q, gebuehr);
    if (!(e > 1)) return null;
    invSum += 1 / e;
  }
  if (!(invSum > 0)) return null;
  const qEff = 1 / invSum;
  // Maximaler Einsatz für das Bündel: jede Teilwette begrenzt ihren eigenen Anteil
  let maxEinsatz = Infinity;
  for (const r of runners) {
    const e = effektiv(r.q, gebuehr);
    const anteil = (1 / e) / invSum;
    if (r.size > 0) maxEinsatz = Math.min(maxEinsatz, r.size / anteil);
  }
  return { qEff, maxEinsatz: isFinite(maxEinsatz) ? maxEinsatz : 0, runners };
}

/**
 * Wie alt darf ein Kurs höchstens sein, damit die Chance noch etwas wert ist?
 * Ein laufendes Spiel bewegt sich im Sekundentakt, eine Wette auf den Ballon d'Or
 * im Dezember bewegt sich in Tagen. Beim Delayed Key kommt Betfairs eigene
 * Verzögerung noch obendrauf, deshalb ist die Grenze hier bewusst eng.
 */
function maxAlterMs(markt) {
  if (O.maxDataAge) return O.maxDataAge * 1000;
  if (markt.inplay) return 60e3;
  const bis = markt.start ? Date.parse(markt.start) - Date.now() : Infinity;
  if (bis < 2 * 3600e3)  return 180e3;
  if (bis < 7 * 86400e3) return 600e3;
  return 1800e3;
}

/**
 * Die Schnittmenge: welche Betfair-Märkte gibt es auch bei Polymarket?
 * Nur diese sind für einen Vergleich überhaupt brauchbar. Sie werden unmittelbar
 * vor der Rechnung noch einmal frisch gelesen, damit BEIDE Seiten denselben
 * Zeitpunkt haben. Ohne das läge zwischen den Büchern der halbe Durchlauf.
 */
function schnittmengeIds() {
  if (!PM.size || !KATALOG.size) return [];
  const idx = bfIndex();
  if (!idx.size) return [];
  const ids = new Set();
  PM.forEach((pm, pmId) => {
    const zu = zuordnen(pm, idx, pmId);
    if (zu) ids.add(zu.markt.mid);
  });
  return Array.from(ids);
}

/**
 * Suchrichtung: BETFAIR ZUERST.
 *
 * Betfair ist das kleinere Buch und liefert saubere Angaben — Ereignisname,
 * Markttyp, klare Teilnehmer, eigener Link. Polymarket hat ein Vielfaches an
 * Märkten, aber nur eine Freitextfrage. Deshalb wird über die Betfair-Märkte
 * gelaufen und zu JEDEM die beste Polymarket-Frage gesucht, nicht umgekehrt.
 *
 * Das hat zwei Folgen, die genau die bisherigen Fehler ausschliessen:
 *  - Es gibt viel weniger Ausgangspunkte, also weniger Gelegenheiten für eine
 *    zufällige Namensähnlichkeit.
 *  - Der Betfair-Link steht von Anfang an fest und kann nicht mehr zu einem
 *    anderen Markt gehören als die Quote, mit der gerechnet wurde.
 */
/* Wortmengen einer Frage. Normalerweise beim Einlesen vorbereitet — fehlen sie,
   werden sie hier nachgezogen. Ein Markt darf niemals stillschweigend aus der
   Suche fallen, nur weil ein Feld fehlt. */
function wortMengen(pm) {
  if (!pm.fw || !pm.kf) {
    const w = nrm(pm.q || '').split(' ');
    pm.fw = new Set(w.filter(x => x.length > 2));
    pm.kf = new Set(w.filter(x => x.length > 1 && !STOPP.has(x)));
  }
  return pm;
}

function pmIndex() {
  const idx = new Map();
  PM.forEach((pm, id) => {
    wortMengen(pm).fw.forEach(w => {
      if (!idx.has(w)) idx.set(w, []);
      idx.get(w).push({ id, pm });
    });
  });
  return idx;
}

function crossBookChancen() {
  if (!PM.size || !KATALOG.size) return [];
  const idx = bfIndex();
  if (!idx.size) return [];
  const treffer = [];
  let verworfenAlt = 0, unplausibel = 0;

  // Alle Betfair-Märkte einmal sammeln (der Index führt sie je Stichwort mehrfach)
  const bfMaerkte = new Map();
  idx.forEach(liste => liste.forEach(e => bfMaerkte.set(e.mid, e)));
  const pmIdx = pmIndex();

  bfMaerkte.forEach(m => {
    // Zu DIESEM Betfair-Markt die passendste Polymarket-Frage suchen
    const kandidaten = new Map();
    m.runners.forEach(r => merkmale(r.name).forEach(w => {
      (pmIdx.get(w) || []).forEach(x => kandidaten.set(x.id, x.pm));
    }));
    if (!kandidaten.size) return;

    let pm = null, pmId = null, besteWertung = -1;
    kandidaten.forEach((kandidat, id) => {
      wortMengen(kandidat);
      const s = bewerte(kandidat.fw, kandidat.kf, m, kandidat);
      if (s != null && s > besteWertung) { besteWertung = s; pm = kandidat; pmId = id; }
    });
    if (!pm) return;

    // Ausrichtung bestimmen: welcher Teilnehmer ist gemeint, welcher
    // Polymarket-Ausgang heisst "dieser gewinnt"
    const zu = zuordnen(pm, idx, pmId);
    if (!zu || zu.markt.mid !== m.mid) return;   // beide Richtungen müssen auf denselben Markt zeigen

    // Beide Beine müssen frisch genug sein. Ein Betfair-Kurs aus dem
    // Volldurchlauf kann Minuten alt sein — den gegen einen sekundenfrischen
    // Polymarket-Preis zu rechnen ergibt eine Chance, die es nicht mehr gibt.
    const jetzt = Date.now();
    const alterBf = m.ts ? Math.round((jetzt - m.ts) / 1000) : null;
    const alterPm = pm.ts ? Math.round((jetzt - pm.ts) / 1000) : null;
    const grenze = maxAlterMs(m);
    if ((m.ts && jetzt - m.ts > grenze) || (pm.ts && jetzt - pm.ts > grenze)) { verworfenAlt++; return; }

    const subjekt = zu.subjekt;
    const andere = m.runners.filter(r => r !== subjekt);

    // Betfair-Bein für "Subjekt gewinnt": schlicht zurückwetten
    // Kommissionssatz dieses konkreten Betfair-Marktes, nicht irgendein Mittelwert
    const satzBf = m.satz != null ? m.satz : O.feeBf;

    const bfJa = subjekt.q > 1
      ? { qEff: effektiv(subjekt.q, satzBf), maxEinsatz: subjekt.size, art: 'back', runners: [subjekt] }
      : null;

    // Betfair-Bein für "Subjekt gewinnt NICHT": entweder dagegenhalten (lay),
    // oder bei kleinem Feld alle übrigen zurückwetten. Das Bessere gewinnt.
    const kandidatenNein = [];
    const lay = layBein(subjekt, satzBf);
    if (lay) kandidatenNein.push(lay);
    if (m.anzahl <= 3 && andere.length && andere.every(r => r.q > 1)) {
      const b = buendeln(andere, satzBf);
      if (b) { b.art = 'back'; kandidatenNein.push(b); }
    }
    const bfNein = kandidatenNein.sort((a, b) => b.qEff - a.qEff)[0] || null;

    // Zwei Kombinationen, die zusammen immer beide Ausgänge abdecken:
    //   A: Polymarket "Subjekt gewinnt" kaufen  +  Betfair dagegen
    //   B: Polymarket "Subjekt gewinnt nicht" kaufen  +  Betfair Subjekt zurückwetten
    const varianten = [
      { pmIdx: zu.jaIdx,   bf: bfNein },
      { pmIdx: zu.neinIdx, bf: bfJa }
    ];

    let best = null;
    for (const v of varianten) {
      if (!v.bf) continue;
      const preis = pm.ask[v.pmIdx];
      const groesse = pm.size[v.pmIdx];
      if (!(preis > 0 && preis < 1)) continue;

      // Polymarket-Gebühr hängt am Preis und am Markt — nicht pauschal null
      const qEffPm = pmEffektiv(preis, pm.feeSatz, pm.feeExp);
      if (!(qEffPm > 1)) continue;
      const pmBein = {
        qEff: qEffPm,
        maxEinsatz: groesse * preis      // Anteile * Preis = einsetzbarer Betrag
      };
      const r = rechne(pmBein, v.bf);
      if (!r || !r.ok) continue;
      // Schwelle hängt davon ab, wie schnell der Markt ist und ob die Kurse verzögert sind
      if (r.roi < minRoiFuer(m)) continue;
      // Obergrenze: zwei liquide Börsen liegen nie zweistellig auseinander.
      // Was darüber liegt, ist keine Chance, sondern eine falsche Zuordnung,
      // eine vertauschte Seite oder ein längst entschiedener Markt.
      if (r.roi > O.maxPlausibel) { unplausibel++; continue; }
      /* Extreme Aussenseiter aussortieren.
         Eine Betfair-Quote von 24 heisst 4 % Wahrscheinlichkeit, 250 heisst
         0,4 %. Dort steht fast nichts im Buch, der Abstand zwischen Kauf- und
         Verkaufskurs ist riesig, und eine rechnerische "Arbitrage" entsteht
         schon durch die Rundung des letzten Cents. Beide Fehlmeldungen, die
         aufgefallen sind — "Conservatives @ 24" und "200 - 250m @ 250" —
         waren genau solche Faelle. Wer auf einen 0,4-%-Ausgang setzt,
         betreibt keine Absicherung. */
      if (v.bf && +v.bf.q > O.maxQuote) { unplausibel++; continue; }
      if (r.maxStake < O.minStake) continue;
      if (!best || r.roi > best.r.roi) best = { v, r, pmBein, bfBein: v.bf, preis };
    }
    if (!best) return;

    const { v, r, bfBein, preis } = best;
    const pmLink = pmAdresse(pm);
    const bfLink = 'https://www.betfair.com/exchange/plus/market/' + m.mid;

    // Risiko ehrlich benennen: laufende Spiele sind mit verzögertem Key gefährlich,
    // Langzeitwetten binden dafür monatelang Kapital.
    const bisStart = m.start ? Date.parse(m.start) - Date.now() : Infinity;
    const tage = isFinite(bisStart) ? Math.round(bisStart / 86400e3) : null;
    let risk = 'niedrig';
    if (m.inplay) risk = 'hoch';
    else if (bisStart < 30 * 60e3) risk = 'mittel';
    else if (tage != null && tage > 60) risk = 'kapital gebunden';

    treffer.push({
      ev: pm.q.slice(0, 160),
      cat: pm.cat,
      roi: +r.roi.toFixed(3),
      inv: +r.inv.toFixed(5),
      maxStake: Math.floor(r.maxStake),
      risk: risk,
      tage: tage,
      alterBf: alterBf,        // Sekunden seit dem Betfair-Kurs
      alterPm: alterPm,        // Sekunden seit dem Polymarket-Kurs
      ts: new Date().toISOString(),
      legs: [
        {
          book: 'polymarket',
          pick: 'KAUFEN: "' + pm.outs[v.pmIdx] + '"  zu ' + preis.toFixed(3),
          q: +(1 / preis).toFixed(6),
          // Genug Stellen, damit sich die Einsätze daraus exakt nachrechnen lassen.
          // Wer nachrechnet, sollte immer von qEff ausgehen, nicht vom gerundeten Anteil.
          qEff: +best.pmBein.qEff.toFixed(6),
          // Was hier wirklich abgezogen wurde, in Prozent des Einsatzes
          fee: +(pmGebuehr(preis, pm.feeSatz, pm.feeExp) / preis * 100).toFixed(3),
          feeTyp: pm.feeTyp,
          feeSatz: +(pm.feeSatz * 100).toFixed(2),
          anteil: +r.anteil1.toFixed(4),
          size: Math.floor(best.pmBein.maxEinsatz),
          link: pmLink
        },
        {
          book: 'betfair',
          // Kurz halten: die Serverseite kürzt lange Texte, sonst bricht der Satz mitten ab.
          pick: bfBein.art === 'lay'
            ? 'LAY (dagegenhalten): ' + subjekt.name + ' @ ' + bfBein.L
            : 'BACK: ' + bfBein.runners.map(x => x.name + ' @ ' + x.q).join(' + '),
          art: bfBein.art,
          q: bfBein.art === 'lay'
            ? +(1 + 1 / (bfBein.L - 1)).toFixed(6)
            : +(1 / bfBein.runners.reduce((s, x) => s + 1 / x.q, 0)).toFixed(6),
          qEff: +bfBein.qEff.toFixed(6),
          fee: +(satzBf * 100).toFixed(2),
          feeTyp: 'Kommission auf den Gewinn',
          anteil: +r.anteil2.toFixed(4),
          size: Math.floor(bfBein.maxEinsatz),
          link: bfLink
        }
      ]
    });
  });

  treffer.sort((a, b) => b.roi - a.roi);
  treffer.verworfenAlt = verworfenAlt;
  treffer.unplausibel = unplausibel;
  return treffer;
}

/* ═══════════════ Arbitrage innerhalb EINES Buches ═══════════════ */

// Betfair: alle Ausgänge zurückwetten. Summe der Kehrwerte unter 1 = sicherer Gewinn.
function betfairIntern() {
  const treffer = [];
  BUCH.forEach((buch, mid) => {
    if (buch.status !== 'OPEN') return;
    const k = KATALOG.get(mid);
    if (!k || !buch.runners || buch.runners.length < 2) return;
    const satzBf = k.satz != null ? k.satz : O.feeBf;
    let inv = 0, tiefe = Infinity, ok = true;
    for (const r of buch.runners) {
      if (r.st && r.st !== 'ACTIVE') { ok = false; break; }
      if (!(r.b > 1) || !(r.bs >= O.minSize)) { ok = false; break; }
      const e = effektiv(r.b, satzBf);
      inv += 1 / e;
      tiefe = Math.min(tiefe, r.bs * e);
    }
    if (!ok || !(inv > 0) || inv >= 1) return;
    const roi = (1 / inv - 1) * 100;
    if (roi < O.minInternalRoi) return;
    const namen = {}; (k.runners || []).forEach(r => { namen[r.id] = r.name; });
    treffer.push({
      typ: 'betfair-intern', mid, ev: k.ev, mn: k.mn, mt: k.mt,
      roi: +roi.toFixed(3), inv: +inv.toFixed(5), max: Math.floor(tiefe), inplay: buch.inplay,
      fee: +(satzBf * 100).toFixed(2),
      link: 'https://www.betfair.com/exchange/plus/market/' + mid,
      legs: buch.runners.map(r => {
        const e = effektiv(r.b, satzBf);
        return { n: namen[r.id] || String(r.id), q: r.b, size: r.bs, anteil: +((1 / e) / inv * 100).toFixed(2) };
      })
    });
  });
  return treffer;
}

// Polymarket: beide Seiten kaufen. Kosten unter 1 pro Anteil = sicherer Gewinn.
function polymarketIntern() {
  const treffer = [];
  PM.forEach((m, id) => {
    const summe = m.ask[0] + m.ask[1];
    if (!(summe > 0)) return;
    // Beide Seiten kaufen: eine gewinnt und zahlt 1 aus, abzüglich ihrer Gebühr.
    // Welche gewinnt, weiß man vorher nicht, also mit der teureren rechnen.
    const g = Math.max(pmGebuehr(m.ask[0], m.feeSatz, m.feeExp),
                       pmGebuehr(m.ask[1], m.feeSatz, m.feeExp));
    const auszahlung = 1 - g;
    if (!(auszahlung > summe)) return;          // nach Gebühr kein Gewinn
    const roi = (auszahlung / summe - 1) * 100;
    if (roi < O.minInternalRoi) return;
    const anteile = Math.min(m.size[0], m.size[1]);
    const max = Math.floor(anteile * summe);
    if (max < O.minStake) return;
    treffer.push({
      typ: 'polymarket-intern', mid: id, ev: m.q.slice(0, 120), mn: 'beide Seiten kaufen', mt: m.cat,
      roi: +roi.toFixed(3), inv: +summe.toFixed(5), max, inplay: false,
      fee: +(m.feeSatz * 100).toFixed(2), feeTyp: m.feeTyp,
      link: pmAdresse(m),
      legs: [
        { n: m.outs[0], q: +(1 / m.ask[0]).toFixed(4), size: Math.floor(m.size[0]), anteil: +(m.ask[0] / summe * 100).toFixed(2) },
        { n: m.outs[1], q: +(1 / m.ask[1]).toFixed(4), size: Math.floor(m.size[1]), anteil: +(m.ask[1] / summe * 100).toFixed(2) }
      ]
    });
  });
  return treffer;
}

/* ═══════════════ Upload ═══════════════ */

function hochladeMaerkte() {
  const raus = [];
  KATALOG.forEach((k, mid) => {
    const buch = BUCH.get(mid);
    if (!buch || buch.status !== 'OPEN') return;
    const n = (k.runners || []).length;
    if (n < 2 || n > 3) return;
    const namen = {}; k.runners.forEach(r => { namen[r.id] = r.name; });
    const rs = [];
    for (const r of buch.runners) {
      if (r.st && r.st !== 'ACTIVE') return;
      if (!(r.b > 1)) return;
      rs.push({ n: namen[r.id] || String(r.id), b: r.b, bs: r.bs, l: r.l || 0, ls: r.ls || 0 });
    }
    if (rs.length !== n) return;
    raus.push({
      k: rs.map(x => x.n).join(' vs '), r: rs, mt: k.mt || '', ev: k.ev || '',
      st: k.start || null, ip: buch.inplay ? 1 : 0,
      link: 'https://www.betfair.com/exchange/plus/market/' + mid
    });
  });
  raus.sort((a, b) => {
    if (a.ip !== b.ip) return b.ip - a.ip;
    const ta = a.st ? Date.parse(a.st) : Infinity, tb = b.st ? Date.parse(b.st) : Infinity;
    if (ta !== tb) return ta - tb;
    return b.r.reduce((s, x) => s + x.bs, 0) - a.r.reduce((s, x) => s + x.bs, 0);
  });
  return raus.slice(0, O.uploadLimit);
}

async function push(markets, arbs, opps, stats) {
  const data = markets.filter(m => m.r.length === 2)
                      .map(m => ({ key: m.k, o1: m.r[0].b, o2: m.r[1].b, link: m.link }));
  const r = await fetch(CFG.bridgeUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-bridge-token': CFG.bridgeToken },
    body: JSON.stringify({ data, v: 2, markets, arbs, opps, stats })
  });
  const j = await r.json().catch(() => ({}));
  if (!j.ok) throw new Error('Upload fehlgeschlagen: ' + (j.error || r.status));
  return j;
}

/* ═══════════════ Hauptschleife ═══════════════ */

let letzteEntdeckung = 0, letzteWarm = 0, letztePM = 0, laeuft = false;

// Letzter Fehler je Quelle, damit die Website nicht nur "Fehler" anzeigt,
// sondern auch woran es liegt. Wird bei Erfolg wieder geleert.
let bfFehler = '', pmFehler = '', pmGelistet = 0;

// Technische Meldungen in Klartext übersetzen — der Nutzer soll wissen, was zu tun ist.
function klartext(m) {
  const s = String(m || '');
  if (/INVALID_USERNAME_OR_PASSWORD/i.test(s)) return 'Betfair-Benutzername oder Passwort in der Zugangsdatei ist falsch';
  if (/INVALID_APP_KEY|APP_KEY/i.test(s))      return 'App-Key wird von Betfair nicht akzeptiert';
  if (/ACCOUNT_PENDING_PASSWORD_CHANGE/i.test(s)) return 'Betfair verlangt eine Passwortänderung — erst im Browser erledigen';
  if (/SUSPENDED|KYC/i.test(s))                return 'Betfair-Konto eingeschränkt — Kurse lesen geht, wetten nicht';
  if (/Cloudflare|HTML/i.test(s))              return 'Betfair blockt die Verbindung — VPN oder Proxy ausschalten';
  if (/INVALID_SESSION|session/i.test(s))      return 'Sitzung abgelaufen, meldet sich neu an';
  if (/TOO_MANY_REQUESTS|DSC-0018/i.test(s))   return 'Betfair drosselt gerade — das Tempo wird automatisch gesenkt';
  if (/Upload fehlgeschlagen/i.test(s))        return 'Website nimmt die Daten nicht an: ' + s.replace(/^Upload fehlgeschlagen:\s*/, '');
  if (/fetch failed|ENOTFOUND|ECONNREFUSED|ETIMEDOUT|network/i.test(s)) return 'Keine Internetverbindung erreichbar';
  if (/abort|timeout/i.test(s))                return 'Zeitüberschreitung — Gegenstelle antwortet nicht';
  return s.slice(0, 140);
}

function heisseIds() {
  // Heiss = worauf Polymarket gerade Märkte hat, plus alles was läuft oder bald startet
  const woerter = new Set();
  PM.forEach(m => nrm(m.q).split(' ').forEach(w => { if (w.length > 3) woerter.add(w); }));
  const jetzt = Date.now();
  const ids = [];
  KATALOG.forEach((k, mid) => {
    const t = k.start ? Date.parse(k.start) : null;
    const buch = BUCH.get(mid);
    const nah = (buch && buch.inplay) || (t && t > jetzt - 4 * 3600e3 && t < jetzt + 8 * 3600e3);
    if (nah) { ids.push(mid); return; }
    if (woerter.size) {
      for (const r of (k.runners || [])) {
        const w = schluessel(r.name);
        if (w && woerter.has(w)) { ids.push(mid); return; }
      }
    }
  });
  return ids;
}

async function durchlauf() {
  if (Date.now() < pauseBis || laeuft) return;
  laeuft = true;
  try {
    if (!sessionToken) await login();
    loginFehler = 0;
    if (Date.now() - lastLogin > 15 * 60e3) await keepAlive();

    const jetzt = Date.now();
    const T = takt();
    let stufe = 'heiss', ids;

    if (jetzt - letzteEntdeckung > T.voll * 1000) {
      await entdecken();
      letzteEntdeckung = jetzt; letzteWarm = jetzt;
      stufe = 'vollstaendig'; ids = Array.from(KATALOG.keys());
    } else if (jetzt - letzteWarm > T.breit * 1000) {
      letzteWarm = jetzt; stufe = 'breit'; ids = Array.from(KATALOG.keys());
    } else {
      ids = heisseIds();
      /* Bleibt Zeit uebrig, wird sie in BREITE gesteckt statt in Wiederholung.
         Beim verzoegerten Schluessel bringt es nichts, dieselben Maerkte
         oefter zu fragen — die Zahlen aendern sich ohnehin nur einmal pro
         Minute. Mehr geprueft heisst mehr Ueberschneidung und mehr Funde. */
      const rest = T.sweep - ids.length;
      if (rest > 0) {
        const dabei = new Set(ids);
        for (const mid of KATALOG.keys()) {
          if (dabei.has(mid)) continue;
          ids.push(mid);
          if (ids.length >= T.sweep) break;
        }
      }
    }
    if (ids.length > T.sweep) ids = ids.slice(0, T.sweep);

    const t0 = Date.now();
    const gelesen = await buecherHolen(ids);
    bfFehler = gelesen ? '' : 'Betfair lieferte in diesem Durchlauf keine Kurse';

    /* Polymarket in EIGENEM Takt. Diese Kurse sind echt live, unabhaengig
       davon, welchen Betfair-Schluessel wir haben. Sie an den verzoegerten
       Betfair-Takt zu koppeln hiesse, die frischere Quelle kuenstlich
       auszubremsen — und die Ueberschneidung entsteht auf beiden Seiten. */
    let pmAnzahl = PM.size;
    const pmTakt = zahl(CFG.polymarketIntervalSeconds, 20);
    if (O.scanPolymarket && jetzt - letztePM > pmTakt * 1000) {
      try {
        pmAnzahl = await polymarketScan();
        letztePM = jetzt;
        pmFehler = pmAnzahl ? '' : 'Polymarket antwortet, liefert aber keine handelbaren Kurse';
      } catch (e) {
        pmFehler = klartext(e.message);
        log('⚠ Polymarket: ' + pmFehler);
      }
    }

    // ── Gleichstand herstellen ────────────────────────────────────────────
    // Jetzt stehen beide Bestände. Genau die Märkte, die es auf BEIDEN Büchern
    // gibt, werden unmittelbar vor der Rechnung noch einmal gelesen. Erst dadurch
    // vergleichen wir zwei Kurse desselben Augenblicks statt zweier Zeitpunkte.
    const gemeinsam = schnittmengeIds();
    let syncGelesen = 0;
    if (gemeinsam.length) {
      try { syncGelesen = await buecherHolen(gemeinsam); }
      catch (e) { bfFehler = klartext(e.message); }
    }

    const dauer = Math.round((Date.now() - t0) / 1000);
    const opps = crossBookChancen();
    const arbs = O.internalArb ? betfairIntern().concat(polymarketIntern()).sort((a, b) => b.roi - a.roi) : [];
    const markets = hochladeMaerkte();

    const stats = {
      bf_katalog: KATALOG.size, bf_gelesen: gelesen, pm_handelbar: pmAnzahl,
      stufe, sweep_s: dauer, hochgeladen: markets.length,
      opps: opps.length, arbs: arbs.length, veraltet: opps.verworfenAlt || 0,
      unplausibel: opps.unplausibel || 0,
      build: BRIDGE_BUILD, version: BRIDGE_VERSION,
      key_art: KEY_ART, key_name: KEY_NAME,
      // Takt mitschicken, damit auf der Website sichtbar ist, wie intensiv
      // gescannt wird — und dass er sich nach der Schluesselart richtet
      takt_heiss: takt().heiss, takt_breit: takt().breit, takt_sweep: takt().sweep,
      schwelle: O.minRoi, schwelle_schnell: istVerzoegert() ? O.minRoiSchnell : O.minRoi,
      takt_ms: minGap, takt_hot: O.hotSeconds, takt_warm: O.warmSeconds, takt_cold: O.coldSeconds,
      // Zustand je Quelle, damit die Website den Grund nennen kann statt nur "Fehler"
      bf_ok: bfFehler ? false : true, bf_fehler: bfFehler || '',
      pm_ok: pmFehler ? false : true, pm_fehler: pmFehler || '',
      pm_gelistet: pmGelistet,
      // Wie viele Märkte gibt es auf BEIDEN Büchern, und wie viele davon
      // wurden direkt vor der Rechnung noch einmal frisch gelesen
      gemeinsam: gemeinsam.length, sync_gelesen: syncGelesen,
      zeit: new Date().toISOString()
    };

    const res = await push(markets, arbs.slice(0, 200), opps.slice(0, 200), stats);

    log('📊 Betfair ' + gelesen + '/' + KATALOG.size + ' · Polymarket ' + pmAnzahl +
        ' · ' + stufe + ' · ' + dauer + 's  →  ' + markets.length + ' Maerkte hochgeladen');
    log('   auf beiden Buechern: ' + gemeinsam.length + ' Maerkte' +
        (syncGelesen ? ' (' + syncGelesen + " direkt vor der Rechnung nachgelesen)" : ''));

    if (opps.length) {
      log('🎯 ' + opps.length + ' Cross-Book-Chance(n)' +
          (res.protokolliert ? '  [' + res.protokolliert + ' neu protokolliert]' : ''));
      opps.slice(0, 3).forEach(o => {
        log('   ' + o.roi.toFixed(2) + '%  ' + o.ev.slice(0, 70) + '   max ~' + o.maxStake + '  Risiko ' + o.risk);
        o.legs.forEach(l => log('       ' + l.book.padEnd(11) + l.anteil.toFixed(1).padStart(5) + '%  ' + l.pick));
      });
    }
    if (arbs.length) {
      log('💰 ' + arbs.length + ' Chance(n) innerhalb eines Buches — beste: ' +
          arbs[0].roi.toFixed(2) + '%  ' + (arbs[0].ev || arbs[0].mn).slice(0, 60));
    }
    if (!opps.length && !arbs.length) log('   (gerade keine Chance über ' + O.minRoi + '% mit mindestens ' + O.minStake + ' Einsatz)');

  } catch (e) {
    bfFehler = klartext(e.message);
    log('❌ ' + e.message);
    if (bfFehler !== e.message) log('   → ' + bfFehler);
    // Auch im Fehlerfall melden, damit die Website den Grund anzeigen kann
    try {
      await push([], [], [], {
        bf_ok: false, bf_fehler: bfFehler, pm_ok: !pmFehler, pm_fehler: pmFehler,
        bf_katalog: KATALOG.size, bf_gelesen: 0, pm_handelbar: PM.size, pm_gelistet: pmGelistet,
        build: BRIDGE_BUILD, version: BRIDGE_VERSION,
        key_art: KEY_ART, stufe: 'fehler', zeit: new Date().toISOString()
      });
    } catch (e2) { /* Website nicht erreichbar — dann bleibt nur das Fenster */ }

    if (/session|invalid|auth|expired|INVALID_SESSION/i.test(e.message)) sessionToken = null;
    if (/Login fehlgeschlagen/i.test(e.message)) {
      loginFehler++;
      if (loginFehler >= 3) {
        const minuten = Math.min(60, 5 * Math.pow(2, loginFehler - 3));
        pauseBis = Date.now() + minuten * 60e3;
        log('');
        log('⏸  ' + loginFehler + ' Fehlversuche — Pause fuer ' + minuten + ' Minuten.');
        log('    Dauernde Fehlversuche koennen das Betfair-Konto zusaetzlich sperren.');
        log('    Bitte Benutzername und Passwort in der Datei pruefen.');
        log('');
      }
    }
  } finally { laeuft = false; }
}

/* ═══════════════ Nach aussen sichtbar: die Rechenlogik zum Nachprüfen ═══════════════ */

module.exports = {
  effektiv, pmGebuehr, pmEffektiv, rechne, buendeln, layBein, bfIndex, zuordnen, maxAlterMs, minRoiFuer,
  schluessel, merkmale, trefferIn, nrm, istUnentschieden,
  setKeyArt: (a) => { KEY_ART = a; }, getKeyArt: () => KEY_ART, istVerzoegert,
  crossBookChancen, schnittmengeIds, bewerte, bestaetigtRueckwaerts,
  betfairIntern, polymarketIntern,
  pmListe, pmKurse, polymarketScan, kategorie, pmAdresse,
  takt, TAKT,
  // Nur zum Nachpruefen der Drossel- und Erholungslogik
  rateErholen,
  rateStand: () => ({ minGap, zielGap, seitDrossel }),
  rateDrosseln: () => { minGap = Math.min(2000, Math.round(minGap * 1.7)); seitDrossel = 0; },
  rateZuruecksetzen: () => { minGap = zielGap; seitDrossel = 0; },
  PM, KATALOG, BUCH, O
};

/* ═══════════════ Start ═══════════════ */

if (!ALS_PROGRAMM) return;

(async function start() {
  console.log('\n=== Orion Panel — Scanner-Bridge ===');
  console.log('Quellen: Betfair/96ex Exchange (nur Boerse, gegen andere Nutzer) + Polymarket');
  console.log('Zugangsdaten bleiben lokal. Hochgeladen werden nur Quoten und Ergebnisse.');
  console.log('Takt: heiss ' + O.hotSeconds + 's | breit ' + O.warmSeconds + 's | Neuerfassung ' + O.coldSeconds + 's');
  console.log('Gebuehren: je Markt aus der Quelle gelesen.');
  console.log('  Betfair    = Kommission auf den Gewinn (marketBaseRate, meist 2-7 %)');
  console.log('  Polymarket = Gebuehr je Anteil, preisabhaengig: Satz * min(p, 1-p)');
  console.log('               (nur Taker zahlen, und wer zum Briefkurs kauft ist Taker)');
  console.log('  Rueckfall wenn eine Quelle schweigt: Betfair ' + (O.feeBf*100).toFixed(1) +
              ' % · Polymarket ' + (O.pmFallbackFee*100).toFixed(1) + ' %');
  console.log('Meldeschwelle: ab ' + O.minRoi + '% Rendite und ' + O.minStake + ' moeglichem Einsatz');
  console.log('  (bei verzoegertem App-Key gilt fuer laufende und bald startende');
  console.log('   Spiele stattdessen ' + O.minRoiSchnell + '% — die Art des Keys erkennt das Programm selbst)');
  console.log('Beenden: Strg+C\n');

  // Laeuft hier noch eine veraltete Fassung? Das gehoert an den Anfang, damit
  // niemand stundenlang mit alter Logik scannt, ohne es zu merken.
  try {
    const r = await fetch('https://saifokaram1-hub.github.io/orion-panel/version.json?t=' + Date.now());
    if (r.ok) {
      const v = await r.json();
      if (v && +v.bridgeBuild > BRIDGE_BUILD) {
        console.log('');
        console.log('  ┌─────────────────────────────────────────────────────────────┐');
        console.log('  │  NEUE FASSUNG VERFUEGBAR                                     │');
        console.log('  └─────────────────────────────────────────────────────────────┘');
        console.log('  Du hast Fassung ' + BRIDGE_VERSION + ', aktuell ist ' + (v.bridgeVersion || v.bridgeBuild) + '.');
        if (Array.isArray(v.aenderungen)) {
          console.log('');
          console.log('  Was sich geaendert hat:');
          v.aenderungen.forEach(z => console.log('   - ' + z));
        }
        console.log('');
        console.log('  Neue Datei holen:');
        console.log('   ' + (v.exe || 'siehe Website'));
        console.log('');
        console.log('  Danach: dieses Fenster schliessen, die alte betfair-bridge.exe');
        console.log('  durch die neue ersetzen und wieder doppelklicken.');
        console.log('  Deine bridge-config.json bleibt unveraendert — nichts neu eintragen.');
        console.log('');
        console.log('  Das Programm laeuft weiter, rechnet aber mit der alten Logik.');
        console.log('');
      } else {
        log('✔ Fassung ' + BRIDGE_VERSION + ' ist aktuell.');
      }
    }
  } catch (e) { /* Versionspruefung ist Beiwerk, sie darf den Start nie verhindern */ }

  // Token vorab pruefen, damit ein Tippfehler nicht erst nach dem ersten Vollscan auffaellt
  try {
    const r = await fetch(CFG.bridgeUrl + '?check=1', { headers: { 'x-bridge-token': CFG.bridgeToken } });
    const j = await r.json().catch(() => ({}));
    if (j.ok) log('🔑 Bridge-Token gueltig — angemeldet als ' + j.von);
    else {
      console.error('\n❌ Das bridgeToken wird nicht akzeptiert: ' + (j.error || r.status));
      console.error('   Hol es dir frisch auf der Website unter "Betfair/96ex verbinden"');
      console.error('   und trage es in ' + CFG_PATH + ' ein.\n');
      warte();
      // Kein process.exit hier: die HTTPS-Verbindung ist noch offen, ein harter
      // Abbruch mittendrin lässt Node mit einer Assertion abstürzen.
      // exitCode setzen und zurückkehren beendet sauber, sobald alles zu ist.
      process.exitCode = 1;
      return;
    }
  } catch (e) {
    log('⚠ Token-Vorabpruefung nicht moeglich (' + e.message.slice(0, 60) + ') — starte trotzdem.');
  }

  durchlauf();
  /* Der Weckruf laeuft bewusst haeufiger als der Betfair-Takt: durchlauf()
     entscheidet selbst anhand der Schluesselart, was in diesem Moment faellig
     ist. So kann Polymarket in seinem schnelleren Takt laufen, ohne dass
     Betfair unnoetig oft gefragt wird. */
  const weckruf = Math.max(10, Math.min(
    zahl(CFG.polymarketIntervalSeconds, 20),
    takt().heiss
  ));
  log('⏱  Weckruf alle ' + weckruf + ' s · Betfair-Takt ' + takt().heiss + ' s · '
      + 'bis zu ' + takt().sweep + ' Maerkte je Durchlauf');
  setInterval(durchlauf, weckruf * 1000);
})();
