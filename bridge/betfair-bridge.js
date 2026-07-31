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

const CFG_PATH = path.join(__dirname, 'bridge-config.json');
if (!fs.existsSync(CFG_PATH)) {
  console.error('\n❌ bridge-config.json fehlt.');
  console.error('   Kopiere bridge-config.example.json zu bridge-config.json und trage deine Daten ein.\n');
  process.exit(1);
}
const CFG = JSON.parse(fs.readFileSync(CFG_PATH, 'utf8'));

const REQUIRED = ['betfairUsername', 'betfairPassword', 'betfairAppKey', 'bridgeUrl', 'bridgeToken'];
for (const k of REQUIRED) {
  if (!CFG[k]) { console.error('❌ In bridge-config.json fehlt: ' + k); process.exit(1); }
}

const INTERVAL_MS = (CFG.intervalSeconds || 20) * 1000;
const MAX_MARKETS = CFG.maxMarkets || 100;
const EVENT_TYPE_IDS = CFG.eventTypeIds || ['1', '2', '7522', '6423']; // Fußball, Tennis, Basketball, Am. Football

let sessionToken = null;
let lastLogin = 0;

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
  if (!j || j.status !== 'SUCCESS' || !j.token) {
    throw new Error('Login fehlgeschlagen: ' + (j ? (j.error || j.status) : txt.slice(0, 120)));
  }
  sessionToken = j.token;
  lastLogin = Date.now();
  log('✅ Bei Betfair eingeloggt.');
}

async function keepAlive() {
  try {
    const r = await fetch('https://identitysso.betfair.com/api/keepAlive', {
      headers: { 'X-Application': CFG.betfairAppKey, 'X-Authentication': sessionToken, 'Accept': 'application/json' }
    });
    const j = await r.json();
    if (j.status !== 'SUCCESS') { log('⚠ keepAlive abgelaufen — logge neu ein'); await login(); }
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
      marketTypeCodes: ['MATCH_ODDS'],
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
  try {
    if (!sessionToken) await login();
    if (Date.now() - lastLogin > 15 * 60e3) await keepAlive();
    const odds = await fetchOdds();
    if (!odds.length) { log('… keine 2-Wege-Märkte gefunden'); return; }
    const n = await push(odds);
    log('📤 ' + n + ' Quoten hochgeladen (z.B. ' + odds[0].key.slice(0, 40) + ')');
  } catch (e) {
    log('❌ ' + e.message);
    if (/session|invalid|auth|expired/i.test(e.message)) { sessionToken = null; }
  }
}

console.log('\n=== Arbitrage Radar — Betfair Bridge ===');
console.log('Zugangsdaten bleiben lokal. Es werden nur Quoten hochgeladen.');
console.log('Intervall: ' + (INTERVAL_MS / 1000) + 's  |  Beenden: Strg+C\n');
tick();
setInterval(tick, INTERVAL_MS);
