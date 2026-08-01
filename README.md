# Orion Panel

Internes Dashboard zur Datenauswertung, Statistik und Auslastungsüberwachung.

**Zugang:** https://saifokaram1-hub.github.io/orion-panel/
Privater Bereich — Zugang nur mit Zugangspasswort und Benutzerkonto.

## Funktionen

- **Live-Datenerfassung** aus mehreren öffentlichen Datenquellen (Echtzeit via WebSocket, Abfrage-Intervall als Rückfallebene)
- **Auswertung & Kennzahlen** — laufende Berechnung, Schwellenwerte, Benachrichtigungen bei Auffälligkeiten
- **Verläufe**
  - Kurzzeit-Verlauf der erfassten Ereignisse (7 Tage)
  - Dauerhafte Tagesstatistik (Anzahl, Durchschnitts- und Spitzenwerte)
  - Dauerhafte Vorgangs-Historie mit Kosten- und Ergebnisrechnung
- **Nutzerverwaltung** — Konten, Rollen, Sitzungszeiten, Sperren, Löschen
- **Lokaler Datensammler** — kleines Hilfsprogramm für Datenquellen, die serverseitig nicht erreichbar sind

## Technik

- Statisches Frontend (GitHub Pages), keine Build-Kette
- Supabase: Authentifizierung, PostgreSQL mit Row Level Security, Edge Functions
- Zugangsdaten des lokalen Datensammlers verbleiben ausschließlich auf dem jeweiligen Rechner; übertragen werden nur Auswertungsdaten

## Ordner

| Pfad | Inhalt |
|---|---|
| `index.html` | Hauptansicht |
| `login.html` | Anmeldung / Registrierung |
| `konto.html` | Persönlicher Bereich, Verläufe, Statistik |
| `admin.html` | Verwaltung |
| `bridge-setup.html` | Einrichtungsanleitung Datensammler |
| `bridge/` | Quellcode des lokalen Datensammlers |

## Hinweis

Privates Projekt. Keine Nutzungsrechte für Dritte.
