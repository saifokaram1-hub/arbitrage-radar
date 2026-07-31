# Betfair / Orbit Bridge — läuft auf deinem PC

## Warum lokal?
Betfair **blockiert Anfragen von Cloud-Servern** (403 Cloudflare). Von deiner **Heim-Internetleitung** aus funktioniert es. Deshalb läuft dieses kleine Programm bei dir und schickt nur die **Quoten** an die Website.

## 🔒 Sicherheit
- Deine Betfair-Zugangsdaten bleiben **ausschließlich auf deinem PC** (`bridge-config.json`).
- An die Website gehen **nur Quoten** — niemals Benutzername, Passwort oder Token.
- `bridge-config.json` steht in `.gitignore` → wird **nie** ins öffentliche Repo hochgeladen.
- Teile diese Datei mit **niemandem**.

## Einrichtung (einmalig, ~10 Minuten)

**1. Node.js installieren** → https://nodejs.org (LTS-Version)

**2. Diesen Ordner herunterladen** (`bridge/` aus dem Repo)

**3. Konfiguration anlegen**
```bash
copy bridge-config.example.json bridge-config.json
```
Dann `bridge-config.json` öffnen und ausfüllen:

| Feld | Wert |
|---|---|
| `betfairUsername` | dein Betfair-Login |
| `betfairPassword` | dein Betfair-Passwort |
| `betfairAppKey` | dein 16-Zeichen App-Key |
| `bridgeToken` | **selbst ausdenken** — ein langes Passwort |
| `bridgeUrl` | bleibt wie voreingestellt |

**4. Dasselbe `bridgeToken` in Supabase hinterlegen**
Supabase → Project Settings → Edge Functions → Secrets → `BRIDGE_TOKEN` = derselbe Wert.

**5. Starten**
```bash
node betfair-bridge.js
```

Läuft es, siehst du alle ~20 Sekunden:
```
📤 43 Quoten hochgeladen (z.B. Bayern vs Dortmund)
```
Und in der Website springt **Betfair / Orbit** auf **Live**. ✅

## Dauerbetrieb
Das Fenster muss **offen bleiben**. Für 24/7: PC durchlaufen lassen (Energiesparen/Ruhezustand aus).

## Probleme

| Meldung | Ursache / Lösung |
|---|---|
| `Login fehlgeschlagen` | Benutzername/Passwort prüfen; Konto verifiziert? |
| `Blockiert (HTML/Cloudflare)` | Läuft nicht lokal (VPN/Proxy aus?) |
| `Falscher Bridge-Token` | `bridgeToken` ≠ Supabase-Secret `BRIDGE_TOKEN` |
| `keine 2-Wege-Märkte` | Gerade keine passenden Märkte offen — normal |

## Einstellungen
- `intervalSeconds` — wie oft geholt wird (Standard 20)
- `maxMarkets` — wie viele Märkte (Standard 100)
- `eventTypeIds` — Sportarten: `1` Fußball, `2` Tennis, `7522` Basketball, `6423` Am. Football
