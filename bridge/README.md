# Scanner-Bridge — läuft auf deinem PC

## Was macht das Programm?

Es liest **beide Seiten** und rechnet die Arbitrage selbst aus:

| Quelle | Zugang |
|---|---|
| **Betfair / 96ex Exchange** | dein App-Key, lokal (Cloud wird von Betfair geblockt) |
| **Polymarket** | offene API, kein Konto nötig |

Gefundene Chancen werden hochgeladen **und dauerhaft protokolliert**. Dadurch füllt sich die Historie auch dann, wenn niemand die Website offen hat. Am nächsten Tag siehst du unter „Mein Bereich", wie viel in der Nacht durchgelaufen ist.

## Nur Börse, niemals Buchmacher

Angesprochen wird ausschliesslich die **Exchange** (`SportsAPING`, `availableToBack` / `availableToLay`). Das ist der Marktplatz zwischen Nutzern: gewettet wird **gegen andere Leute**, nie gegen Betfair selbst. Betfair Sportsbook wird an keiner Stelle aufgerufen. Deshalb droht hier auch keine Gewinnersperre.

## Die Rechnung

Zwei sich ausschliessende Ausgänge, je einer auf einem anderen Buch:

```
Effektivquote nach Kommission   qE  = 1 + (q - 1) * (1 - Gebühr)
Summe der Kehrwerte             inv = 1/qE1 + 1/qE2
Arbitrage liegt vor, wenn       inv < 1
Aufteilung von Einsatz S        S1  = S * (1/qE1)/inv       S2 = S - S1
Auszahlung, egal wie es ausgeht      S/inv     (bei BEIDEN Ausgängen gleich)
Rendite                              (1/inv - 1) * 100 %
```

Ausdrücklich **nicht** 50/50, sondern so aufgeteilt, dass beide Ausgänge denselben Betrag zurückgeben. Nur dann ist der Gewinn unabhängig vom Ergebnis.

**Dagegenhalten (Lay)** wird mitgerechnet — das ist der Schlüssel für Märkte mit vielen Teilnehmern (Ballon d'Or, Meister, Wahlen), wo Polymarket binär fragt „Gewinnt X?":

```
qE = 1 + (1 - Gebühr) / (L - 1)          L = Lay-Quote
Eingesetzt wird die Haftung: stake * (L - 1)
```

### Selbst nachrechnen

```bash
node pruefung.js
```

Rechnet die komplette Logik mit Zahlen durch, gegengerechnet über beide Ausgänge. Meldet sich **nicht** bei Betfair an und lädt nichts hoch.

## Einrichtung

Die bebilderte Anleitung steht auf der Website unter **„Betfair/96ex verbinden"**. Kurzfassung:

1. Betfair-Konto anlegen und **verifizieren**
2. App-Key erzeugen: https://apps.betfair.com/visualisers/api-ng-account-operations/ → `createDeveloperAppKeys` → **Delayed App Key** (gratis, 16 Zeichen)
3. `betfair-bridge.exe` herunterladen und in einen eigenen Ordner legen
4. Doppelklick — das Programm legt `bridge-config.json` an und öffnet sie
5. Vier Felder ausfüllen, speichern, nochmal starten

Das `bridgeToken` **denkst du dir nicht aus** — es steht fertig auf der Website unter „Betfair/96ex verbinden" und beginnt mit `brg_`.

## Einstellungen in `bridge-config.json`

| Feld | Vorgabe | Bedeutung |
|---|---|---|
| `intervalSeconds` | 20 | Takt für laufende und bald startende Märkte |
| `warmIntervalSeconds` | 150 | Takt für den gesamten Bestand |
| `coldIntervalSeconds` | 900 | wie oft der Bestand neu erfasst wird |
| `excludeEventTypeIds` | `["7","4339"]` | Pferde- und Windhundrennen aus. Auf `[]` setzen für wirklich alles |
| `feeBetfairPercent` | 5 | deine Betfair-Kommission |
| `feePolymarketPercent` | 0 | Polymarket-Gebühr |
| `minRoiPercent` | 0.5 | ab welcher Rendite gemeldet wird |
| `minStake` | 20 | Chancen mit weniger möglichem Einsatz werden verschwiegen |
| `minSize` | 10 | Mindestgeld hinter einer Quote — ohne Gegenspieler keine Wette |
| `maxRequestsPerSecond` | 4 | Betfair-Schonung, senkt sich bei Drosselung selbst |

## Sicherheit

- Zugangsdaten bleiben **ausschliesslich auf deinem PC** (`bridge-config.json`)
- Hochgeladen werden **nur Quoten und Ergebnisse** — nie Benutzername, Passwort oder App-Key
- `bridge-config.json` steht in `.gitignore` und darf niemals weitergegeben werden

## Dauerbetrieb

Das Fenster muss offen bleiben. Für Dauerbetrieb: PC durchlaufen lassen, Energiesparen und Ruhezustand aus.

## Wenn etwas nicht klappt

| Meldung | Ursache / Lösung |
|---|---|
| `Das bridgeToken wird nicht akzeptiert` | Token frisch von der Website holen (beginnt mit `brg_`) |
| `INVALID_USERNAME_OR_PASSWORD` | Betfair-Login falsch. **Nicht** wiederholt probieren — das Programm pausiert nach 3 Fehlversuchen selbst, damit Betfair das Konto nicht zusätzlich sperrt |
| `Login fehlgeschlagen: SUSPENDED` | Konto eingeschränkt. Kurse lesen geht trotzdem, wetten nicht |
| `Blockiert (HTML/Cloudflare)` | VPN oder Proxy aus — die Bridge muss über den normalen Anschluss laufen |
| `Felder noch offen` | In der Datei stehen noch Platzhalter |
| `Betfair drosselt` | Kein Fehler, das Programm entschärft den Takt selbst |
| gerade keine Chance | Kein Fehler. Wie oft etwas auftaucht, bestimmt der Markt, nicht das Programm |

## Neu bauen (nur für Entwickler)

```bash
node --experimental-sea-config sea-config.json
node -e "require('fs').copyFileSync(process.execPath,'betfair-bridge.exe')"
npx postject betfair-bridge.exe NODE_SEA_BLOB sea-prep.blob --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2
```
