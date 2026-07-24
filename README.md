# Arbitrage Radar — Live Surebet-Scanner

Ein statischer Surebet-Scanner (Design: Schwarz/Weiß/Grüngold, spitze Ecken) der **echte Live-Kurse von Polymarket** liest und 2‑Wege‑Arbitrage rechnet. Läuft komplett im Browser auf GitHub Pages — solange der Tab offen ist.

**Live:** https://saifokaram1-hub.github.io/arbitrage-radar/

## Was echt ist und was nicht

| Quelle | Status | Warum |
|---|---|---|
| **Polymarket** | ✅ echte Live-Daten | Öffentliche API (`gamma-api.polymarket.com`, `clob.polymarket.com`) ist CORS-offen und aus dem Browser abrufbar. |
| **Orbit-Broker (Betfair)** | ⚠️ Proxy nötig | Betfair/Orbit hat keine Browser-API (App-Key + Session). Ein kleiner Proxy (unten) liefert die Kurse. |
| Kontostand / Echtgeld setzen | manuell | Der Scanner **setzt kein Echtgeld automatisch**. Er zeigt die exakte Aufteilung und öffnet den Markt zum manuellen Setzen. |

Die Arbitrage-Formel: `Arb-% = (1/Quote₁ + 1/Quote₂) · 100`. Unter 100 % = garantierter Vorteil.
Echte Surebets **innerhalb** eines Buches sind selten — die großen Chancen entstehen **zwischen** Polymarket und Orbit. Dafür den Proxy verbinden.

## Bedienung

- **Live / Demo** oben rechts umschalten. Demo = simulierte Kurse zum Ausprobieren der Oberfläche.
- **Konten**: Guthaben eintragen (begrenzt den empfohlenen Einsatz), optional Orbit-Proxy-URL.
- Zeile anklicken → **Wett-Ticket** mit empfohlenem, direkt erhöhbarem Betrag und der genauen Aufteilung (was auf welche Seite geht). Button öffnet den echten Markt.
- Filter, Kategorien, Sortierung, Hit-Benachrichtigung (Ton/Desktop) links.

## Orbit-Broker / Betfair-Proxy (optional, für Cross-Book-Arbs)

Ein Mini-Dienst, den **du** mit deinem Betfair/Orbit-Zugang betreibst. Er gibt JSON in diesem Format zurück, das die App per Event-Name (`key`) an die Polymarket-Märkte hängt:

```json
[
  { "key": "Will the Republican Party win the OH-07 House seat?", "o1": 1.72, "o2": 2.30 }
]
```

`o1`/`o2` = Dezimalquoten für Ausgang 1 / 2, in derselben Reihenfolge wie auf Polymarket. `key` muss exakt dem Polymarket-Fragetext entsprechen (oder du baust ein Mapping).

Beispiel (Cloudflare Worker / Node, Pseudocode mit Betfair-API):

```js
// GET /odds  ->  [{key, o1, o2}, ...]
export default {
  async fetch(req) {
    const app = env.BETFAIR_APP_KEY;
    const token = await login(env.BF_USER, env.BF_PASS, env.BF_CERT); // Betfair-Session
    const markets = await listMarkets(app, token);   // deine Events
    const out = markets.map(m => ({
      key: m.polymarketQuestion,                      // dein Mapping PM<->Betfair
      o1: bestBackPrice(m, 0),                         // beste Back-Quote Ausgang 1
      o2: bestBackPrice(m, 1)
    }));
    return new Response(JSON.stringify(out), {
      headers: { "content-type": "application/json", "access-control-allow-origin": "*" }
    });
  }
}
```

Wichtig: `access-control-allow-origin: *` setzen, sonst blockt der Browser. Deploy z. B. auf Cloudflare Workers / Render / Railway. Danach die URL im Feld **Orbit-Proxy-URL** eintragen.

## Grenzen / Hinweise

- **24/7 nur bei offenem Tab.** Für echtes Dauer-Monitoring mit Push (auch bei geschlossenem Tab) braucht es einen gehosteten Dienst (z. B. Supabase Edge Function, die pollt und benachrichtigt).
- Buchmacher erkennen Arbitrage-Muster und limitieren Konten — Setzen bleibt bewusst manuell.
- Kurse ändern sich in Sekunden; das Fenster kann zugehen, bevor beide Wetten stehen.

## Lokal öffnen
Einfach `index.html` im Browser öffnen (oder `python -m http.server`).
