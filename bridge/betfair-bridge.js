/**
 * Arbitrage Radar — Betfair/Orbit Bridge (läuft LOKAL auf deinem PC)
 * ------------------------------------------------------------------
 * WARUM lokal? Betfair blockiert Anfragen von Cloud-Servern (403 Cloudflare).
 * Von deiner Heim-Internetleitung aus funktioniert es.
 *
 * WICHTIG ZUR SICHERHEIT:
 *  - Deine Betfair-Zugangsdaten bleiben AUSSCHLIESSLICH auf diesem PC (bridge-config.json).
 *  - An die Website werden NUR Quoten geschickt — niemals Login-Daten.
 *  - bridge-config.json steht in .gitignore und darf NIE hochgeladen werden.
 *
 * START:  node betfair-bridge.js
 */

const fs = require('fs');
const path = require('path');

// Als .exe verpackt liegt die Config neben der exe, sonst neben dem Skript
const BASE_DIR = process.pkg ? path.dirname(process.execPath) : __dirname;
const CFG_PATH = path.join(BASE_DIR, 'bridge-config.json');

const VORLAGE = {
  betfairUsername: 'HIER-DEIN-BETFAIR-BENUTZERNAME',
  betfairPassword: 'HIER-DEIN-BETFAIR-PASSWORT',
  betfairAppKey: 'HIER-DEIN-16-ZEICHEN-APP-KEY',
  bridgeToken: 'HIER-DEIN-TOKEN-AUS-MEIN-BEREICH',
  bridgeUrl: 'https://noexklrgtqveiclijdwp.supabase.co/functions/v1/bf-bridge',
  intervalSeconds: 20,
  maxMarkets: 100,
  eventTypeIds: ['1', '2', '7522', '6423']
};

function warte() {
  // Fenster offen halten, damit man die Meldung lesen kann (bei Doppelklick)
  try {
    console.log('\n[Fenster bleibt offen — zum Schliessen Enter druecken]');
    require('child_process').execSync('pause > nul', { shell: 'cmd.exe', stdio: 'inherit' });
  } catch (e) {}
}

if (!fs.existsSync(CFG_PATH)) {
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
const CFG = JSON.parse(fs.readFileSync(CFG_PATH, 'utf8'));

const REQUIRED = ['betfairUsername', 'betfairPassword', 'betfairAppKey', 'bridgeUrl', 'bridgeToken'];
const offen = REQUIRED.filter(k => !CFG[k] || String(CFG[k]).indexOf('HIER-') === 0);
if (offen.length) {
  console.error('\n❌ In der Zugangsdatei sind noch Felder offen:\n');
  offen.forEach(k => console.error('   • ' + k));
  console.error('\n   Datei: ' + CFG_PATH);
  console.error('   Bitte ausfuellen, speichern und das Programm neu starten.\n');
  try { require('child_process').exec('notepad "' + CFG_PATH + '"'); } catch (e) {}
  warte();
  process.exit(1);
}

const INTERVAL_MS = (CFG.intervalSeconds || 20) * 1000;
const MAX_MARKETS = Math.max(CFG.maxMarkets || 0, 300);

// Sportarten: alles, was Polymarket ebenfalls listet (Fussball, Tennis, Basketball,
// Am. Football, Baseball, Golf, Cricket, Boxen, MMA, Esports, Eishockey, Motorsport).
// Die Liste aus der Konfigurationsdatei wird ERGAENZT, nicht ersetzt -> bestehende
// Installationen bekommen die neuen Sportarten automatisch dazu.
const STANDARD_SPORTS = ['1','2','7522','6423','7511','3','4','6','26420387','61420','7524','8'];
const EVENT_TYPE_IDS = Array.from(new Set([].concat(CFG.eventTypeIds || [], STANDARD_SPORTS)));

// Nur Markttypen mit echten Teilnehmernamen ("A vs B") — dadurch bleibt der
// Abgleich mit Polymarket zuverlaessig. (Ueber/Unter wuerde "Over 2.5 vs Under 2.5"
// liefern, also ohne Event-Namen, und liesse sich nicht zuordnen.)
const MARKET_TYPES = ['MATCH_ODDS','MONEY_LINE','TO_QUALIFY','DRAW_NO_BET'];

let sessionToken = null;
let lastLogin = 0;
let loginFehler = 0;      // zaehlt fehlgeschlagene Logins
let pauseBis = 0;         // Sperre gegen Dauer-Fehlversuche

const log = (...a) => console.log(new Date().toLocaleTimeString('de-DE'), ...a);

/* ---------- Betfair Login (nur lokal!) ---------- */
async function login() {
  const body = 'username=' + encodeURIComponent(CFG.betfairUsername) +
               '&password=' + encodeURIComponent(CFG.betfairPassword);
  const r = await fetch('https://identitysso.betfair.com/api/login', {
    method: 'POST',
    headers: {
      'X-Application': CFG.betfairAppKey,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept': 'application/json'
    },
    body
  });
  const txt = await r.text();
  let j = null; try { j = JSON.parse(txt); } catch (e) {}
  if (!j) throw new Error('Unerwartete Antwort von Betfair: ' + txt.slice(0, 120));

  // WICHTIG: Betfair liefert bei status LIMITED_ACCESS (z.B. error SUSPENDED,
  // KYC_SUSPEND, PENDING_AUTH) TROTZDEM ein gueltiges Session-Token.
  // Wetten ist dann gesperrt — Kurse LESEN funktioniert aber. Genau das brauchen wir.
  if (!j.token) {
    throw new Error('Login fehlgeschlagen: ' + (j.error || j.status || 'unbekannt') +
                    '  (Status: ' + (j.status || '-') + ') — kein Token erhalten');
  }

  sessionToken = j.token;
  lastLogin = Date.now();

  if (j.status === 'SUCCESS') {
    log('✅ Bei Betfair eingeloggt.');
  } else {
    log('✅ Eingeloggt — Kurse lesen moeglich.');
    log('   ⚠ Konto eingeschraenkt (' + (j.error || j.status) + '): Wetten ueber die API gesperrt,');
    log('     Quoten werden trotzdem gelesen. Freischaltung nur ueber Betfair-Support.');
  }
}

async function keepAlive() {
  try {
    const r = await fetch('https://identitysso.betfair.com/api/keepAlive', {
      headers: { 'X-Application': CFG.betfairAppKey, 'X-Authentication': sessionToken, 'Accept': 'application/json' }
    });
    const j = await r.json();
    // Bei eingeschraenkten Konten kann hier etwas anderes als SUCCESS kommen,
    // obwohl die Sitzung lebt. Nur neu einloggen, wenn wirklich kein Token mehr da ist.
    if (j.status !== 'SUCCESS' && !j.token) { log('⚠ Sitzung abgelaufen — logge neu ein'); await login(); }
  } catch (e) { log('⚠ keepAlive Fehler:', e.message); }
}

/* ---------- Betfair API ---------- */
async function rpc(method, params) {
  const r = await fetch('https://api.betfair.com/exchange/betting/json-rpc/v1', {
    method: 'POST',
    headers: {
      'X-Application': CFG.betfairAppKey,
      'X-Authentication': sessionToken,
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    },
    body: JSON.stringify([{ jsonrpc: '2.0', method: 'SportsAPING/v1.0/' + method, params, id: 1 }])
  });
  const txt = await r.text();
  if (txt.trim().startsWith('<')) throw new Error('Blockiert (HTML/Cloudflare) — läuft das Skript wirklich lokal?');
  const j = JSON.parse(txt);
  const first = Array.isArray(j) ? j[0] : j;
  if (first.error) throw new Error(JSON.stringify(first.error).slice(0, 200));
  return first.result;
}

async function fetchOdds() {
  // 1) Aktuelle 2-Wege-Märkte holen (Match Odds)
  const cat = await rpc('listMarketCatalogue', {
    filter: {
      eventTypeIds: EVENT_TYPE_IDS,
      marketTypeCodes: MARKET_TYPES,
      marketStartTime: { from: new Date(Date.now() - 3 * 3600e3).toISOString() }
    },
    maxResults: MAX_MARKETS,
    sort: 'MAXIMUM_TRADED',
    marketProjection: ['RUNNER_DESCRIPTION', 'EVENT']
  });
  if (!cat || !cat.length) return [];

  // 2) Kurse dazu
  const ids = cat.map(c => c.marketId);
  const out = [];
  for (let i = 0; i < ids.length; i += 40) {
    const chunk = ids.slice(i, i + 40);
    const books = await rpc('listMarketBook', {
      marketIds: chunk,
      priceProjection: { priceData: ['EX_BEST_OFFERS'] }
    });
    const byId = {};
    for (const b of books) byId[b.marketId] = b;

    for (const c of cat) {
      const b = byId[c.marketId];
      if (!b || !c.runners || c.runners.length !== 2) continue;
      const price = sel => {
        const r = b.runners && b.runners.find(x => x.selectionId === sel);
        return (r && r.ex && r.ex.availableToBack && r.ex.availableToBack[0] && r.ex.availableToBack[0].price) || 0;
      };
      const o1 = price(c.runners[0].selectionId);
      const o2 = price(c.runners[1].selectionId);
      if (!(o1 > 1 && o2 > 1)) continue;
      out.push({
        key: c.runners[0].runnerName + ' vs ' + c.runners[1].runnerName,
        o1, o2,
        link: 'https://www.betfair.com/exchange/plus/market/' + c.marketId
      });
    }
  }
  return out;
}

/* ---------- Upload (nur Quoten!) ---------- */
async function push(data) {
  const r = await fetch(CFG.bridgeUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-bridge-token': CFG.bridgeToken },
    body: JSON.stringify({ data })
  });
  const j = await r.json().catch(() => ({}));
  if (!j.ok) throw new Error('Upload fehlgeschlagen: ' + (j.error || r.status));
  return j.stored;
}

/* ---------- Hauptschleife ---------- */
async function tick() {
  // Schutz: nach Fehlversuchen nicht im 20-Sekunden-Takt weiterhaemmern
  if (Date.now() < pauseBis) return;

  try {
    if (!sessionToken) await login();
    loginFehler = 0;                       // Login hat geklappt
    if (Date.now() - lastLogin > 15 * 60e3) await keepAlive();
    const odds = await fetchOdds();
    if (!odds.length) { log('… keine 2-Wege-Märkte gefunden'); return; }
    const n = await push(odds);
    log('📤 ' + n + ' Quoten hochgeladen (z.B. ' + odds[0].key.slice(0, 40) + ')');
  } catch (e) {
    log('❌ ' + e.message);
    if (/session|invalid|auth|expired/i.test(e.message)) sessionToken = null;

    if (/Login fehlgeschlagen/i.test(e.message)) {
      loginFehler++;
      if (loginFehler >= 3) {
        // Wartezeit verdoppelt sich: 5, 10, 20, 40 … max 60 Minuten
        const minuten = Math.min(60, 5 * Math.pow(2, loginFehler - 3));
        pauseBis = Date.now() + minuten * 60e3;
        log('');
        log('⏸  ' + loginFehler + ' Fehlversuche — Pause fuer ' + minuten + ' Minuten.');
        log('    Grund: Dauernde Fehlversuche koennen das Betfair-Konto zusaetzlich sperren.');
        log('    Bitte Zugangsdaten pruefen oder Freischaltung abwarten.');
        log('    (Programm laeuft weiter und versucht es danach erneut)');
        log('');
      }
    }
  }
}

console.log('\n=== Arbitrage Radar — Betfair Bridge ===');
console.log('Zugangsdaten bleiben lokal. Es werden nur Quoten hochgeladen.');
console.log('Intervall: ' + (INTERVAL_MS / 1000) + 's  |  Beenden: Strg+C\n');
tick();
setInterval(tick, INTERVAL_MS);
