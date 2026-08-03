// lm-proxy — Limitless Exchange (Krypto-Prognosebörse, kein Key / kein KYC nötig)
//
// WICHTIG: Es werden ausschließlich ECHTE Kaufkurse verwendet
// (tradePrices.buy.market) — niemals die Felder "prices", denn die sind
// normierte Wahrscheinlichkeiten (Summe immer exakt 1) und würden
// Fake-Arbitrage erzeugen.
const cors = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "*",
  "content-type": "application/json",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const r = await fetch("https://api.limitless.exchange/markets/active", {
      headers: { accept: "application/json" },
    });
    if (!r.ok) throw new Error("HTTP " + r.status);
    const j = await r.json();
    const ms = (j && j.data) || [];
    const out: any[] = [];

    for (const m of ms) {
      const tp = m?.tradePrices?.buy?.market;
      if (!tp || tp.length !== 2) continue;
      const a = Number(tp[0]);
      const b = Number(tp[1]);
      if (!(a > 0 && a < 1) || !(b > 0 && b < 1)) continue;
      out.push({
        id: "lm_" + m.id,
        ev: m.title || m.proxyTitle || "",
        o1: "JA",
        o2: "NEIN",
        ask0: a,
        ask1: b,
        q1: 1 / a,
        q2: 1 / b,
        arb: (a + b) * 100,
        vol: Number(m.volumeFormatted || m.volume || 0),
        link: "https://limitless.exchange/markets/" + (m.slug || m.id),
      });
    }
    out.sort((x, y) => x.arb - y.arb);

    return new Response(
      JSON.stringify({ ok: true, source: "limitless", scanned: ms.length, withOdds: out.length, data: out }),
      { headers: cors },
    );
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e), data: [] }), { headers: cors });
  }
});
