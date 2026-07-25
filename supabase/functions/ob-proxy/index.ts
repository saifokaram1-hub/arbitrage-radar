// ob-proxy — Orbit/Betfair-Kursquelle für Arbitrage Radar
//
// Antwort-Format (vom Frontend erwartet):
//   { configured: boolean, data: [ { key: string, o1: number, o2: number } ] }
//   o1/o2 = Dezimalquoten für Ausgang 1 / 2, in derselben Reihenfolge wie auf Polymarket.
//   "key" muss exakt dem Polymarket-Fragetext entsprechen (Mapping via BETFAIR_MARKET_MAP).
//
// Deploy:  supabase functions deploy ob-proxy --no-verify-jwt --project-ref noexklrgtqveiclijdwp
// Secrets: supabase secrets set BETFAIR_APP_KEY=... BETFAIR_SESSION_TOKEN=... BETFAIR_MARKET_MAP='[...]'
//
// BETFAIR_MARKET_MAP (JSON):
//   [ { "key": "<Polymarket-Frage>", "marketId": "1.234", "sel1": 111, "sel2": 222 } ]

const cors: Record<string, string> = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, x-client-info, apikey, content-type",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "content-type": "application/json",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const appKey = Deno.env.get("BETFAIR_APP_KEY");
  const session = Deno.env.get("BETFAIR_SESSION_TOKEN");
  const mapRaw = Deno.env.get("BETFAIR_MARKET_MAP");

  if (!appKey || !session) {
    return new Response(JSON.stringify({
      configured: false,
      data: [],
      note: "Secrets BETFAIR_APP_KEY und BETFAIR_SESSION_TOKEN setzen, um Live-Kurse von Orbit/Betfair zu liefern.",
    }), { headers: cors });
  }

  try {
    const map = mapRaw ? JSON.parse(mapRaw) : [];
    if (!Array.isArray(map) || map.length === 0) {
      return new Response(JSON.stringify({ configured: true, data: [], note: "BETFAIR_MARKET_MAP fehlt oder ist leer." }), { headers: cors });
    }

    const marketIds = [...new Set(map.map((m: any) => m.marketId))];
    const bf = await fetch("https://api.betfair.com/exchange/betting/rest/v1.0/listMarketBook/", {
      method: "POST",
      headers: { "X-Application": appKey, "X-Authentication": session, "content-type": "application/json" },
      body: JSON.stringify({ marketIds, priceProjection: { priceData: ["EX_BEST_OFFERS"] } }),
    });
    const books = await bf.json();

    const byId: Record<string, any> = {};
    for (const b of books) byId[b.marketId] = b;
    const bestBack = (book: any, sel: number): number => {
      const r = book?.runners?.find((x: any) => x.selectionId === sel);
      return r?.ex?.availableToBack?.[0]?.price || 0;
    };

    const data = map.map((m: any) => {
      const book = byId[m.marketId];
      return { key: m.key, o1: bestBack(book, m.sel1), o2: bestBack(book, m.sel2) };
    }).filter((d: any) => d.o1 > 1 && d.o2 > 1);

    return new Response(JSON.stringify({ configured: true, data }), { headers: cors });
  } catch (e) {
    return new Response(JSON.stringify({ configured: true, error: String(e), data: [] }), { headers: cors });
  }
});
