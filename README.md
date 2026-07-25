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

**Der Proxy ist als fertige Supabase Edge Function dabei:** `supabase/functions/ob-proxy/index.ts`. Er liefert genau dieses Format (`{configured, data:[{key,o1,o2}]}`) mit offenem CORS und ruft die Betfair-API auf, sobald die Secrets gesetzt sind.

Deploy (einmalig, Supabase CLI):

```bash
supabase link --project-ref noexklrgtqveiclijdwp
supabase functions deploy ob-proxy --no-verify-jwt
supabase secrets set BETFAIR_APP_KEY=dein_app_key BETFAIR_SESSION_TOKEN=dein_session_token
# optionales Mapping Polymarket-Frage <-> Betfair-Markt:
supabase secrets set BETFAIR_MARKET_MAP='[{"key":"Will the Republican Party win the OH-07 House seat?","marketId":"1.234","sel1":111,"sel2":222}]'
```

Endpoint danach: `https://noexklrgtqveiclijdwp.supabase.co/functions/v1/ob-proxy` — diese URL steht schon als Platzhalter im Feld **Orbit-Proxy-URL** in der App. Eintragen → Live-Cross-Book-Arbs erscheinen. Ohne Secrets antwortet der Proxy `{configured:false}` (Orbit bleibt „aus"). Alternativ dasselbe als Cloudflare Worker (CORS `*` nicht vergessen).

Der schwierige Teil bleibt das **Mapping**: Polymarket-Fragen ↔ Betfair-Märkte müssen zusammenpassen (`key` = exakter PM-Fragetext). Ohne Mapping keine echten Cross-Book-Paare.

## Konten, Admin & eigener Bereich (Supabase)
- **Login/Registrierung** ohne E-Mail-Bestätigung (DB-Trigger `auto_confirm_user`).
- **Admin** (nur `saifokaram1@gmail.com`, Auto-Rolle) → `admin.html`: alle User, verbundene Bücher, Gewinn, Online-Zeit, „wann online", Bannen.
- **Jeder User** → `konto.html`: eigene History, Einsätze, Gewinn, Statistik und Gewinn-Chart. Präferenzen (Wett-Modus, Standard-Einsatz, Gebühren, Filter) werden pro User gespeichert.
- RLS: User sehen nur eigene Daten, Admin alles.

## Grenzen / Hinweise

- **24/7 nur bei offenem Tab.** Für echtes Dauer-Monitoring mit Push (auch bei geschlossenem Tab) braucht es einen gehosteten Dienst (z. B. Supabase Edge Function, die pollt und benachrichtigt).
- Buchmacher erkennen Arbitrage-Muster und limitieren Konten — Setzen bleibt bewusst manuell.
- Kurse ändern sich in Sekunden; das Fenster kann zugehen, bevor beide Wetten stehen.

## Lokal öffnen
Einfach `index.html` im Browser öffnen (oder `python -m http.server`).
