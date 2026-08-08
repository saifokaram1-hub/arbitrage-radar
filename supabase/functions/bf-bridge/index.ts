// bf-bridge — nimmt Quoten und gefundene Chancen von lokalen Bridges entgegen.
// Jeder Nutzer hat ein EIGENES Token. Es werden NUR Quoten gespeichert, nie Zugangsdaten.
//
// RUECKWAERTSKOMPATIBEL (nichts davon darf sich je aendern):
//   POST {data:[{key,o1,o2,link}]} + Header x-bridge-token  -> laeuft unveraendert weiter.
//   GET  ohne Parameter -> liefert exakt die alten Felder (plus kleine Zusaetze).
// NEU (rein additiv):
//   POST {data, v:2, markets, arbs, opps, stats}
//   GET ?v=2     -> inklusive markets (gross)
//   GET ?opps=1  -> nur die aktuellen Cross-Book-Chancen
//   GET ?meta=1  -> nur Frische/Zaehler, ohne Nutzlast
//   GET ?hints=1 -> Stichwortliste des Frontends (Priorisierung der Bridge)
//   GET ?check=1 -> prueft nur das Token im Header, schreibt nichts
import { createClient } from 'jsr:@supabase/supabase-js@2';
const cors={'access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'GET, POST, OPTIONS','content-type':'application/json'};

async function wer(sb:any, given:string){
  if(!given) return null;
  const { data:prof } = await sb.from('profiles').select('id,email,banned').eq('bridge_token',given).maybeSingle();
  if(prof && !prof.banned) return prof.email||prof.id;
  const g=Deno.env.get('BRIDGE_TOKEN');
  if(g && given===g) return 'betreiber';
  return null;
}
const s=(v:any,n:number)=>String(v==null?'':v).slice(0,n);
const f=(v:any)=>{ const x=+v; return isFinite(x)?x:0; };
// Zahl ODER null durchreichen: 0 und "nicht gemeldet" sind zweierlei.
// Ein fehlender Wert darf nicht als 0 erscheinen, sonst wirkt ein unbekanntes
// Datum wie "heute faellig" und ein unbekannter Gebuehrensatz wie "gebuehrenfrei".
const fn=(v:any)=>{ if(v==null) return null; const x=+v; return isFinite(x)?x:null; };

Deno.serve(async (req) => {
  if(req.method==='OPTIONS') return new Response('ok',{headers:cors});
  const sb=createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const url=new URL(req.url);

  if(req.method==='POST'){
    const given=(req.headers.get('x-bridge-token')||'').trim();
    if(!given) return new Response(JSON.stringify({ok:false,error:'Kein Bridge-Token gesendet'}),{status:401,headers:cors});
    const who=await wer(sb,given);
    if(!who) return new Response(JSON.stringify({ok:false,error:'Token unbekannt oder Konto gesperrt'}),{status:401,headers:cors});

    let body:any=null; try{ body=await req.json(); }catch(e){}
    const arr=Array.isArray(body)?body:(body&&body.data)||[];
    const clean=arr.filter((d:any)=>d&&d.key&&+d.o1>1&&+d.o2>1)
                   .map((d:any)=>({key:s(d.key,160),o1:+d.o1,o2:+d.o2,link:d.link||null}));

    const patch:any={payload:clean,updated_at:new Date().toISOString(),source:'betfair via '+who};

    if(body && Array.isArray(body.markets)){
      patch.markets=body.markets.filter((m:any)=>m&&m.k&&Array.isArray(m.r)&&m.r.length>=2)
        .slice(0,8000)
        .map((m:any)=>({
          k:s(m.k,200),
          r:m.r.slice(0,4).map((x:any)=>({n:s(x.n,80),b:f(x.b),bs:f(x.bs),l:f(x.l),ls:f(x.ls)})),
          mt:s(m.mt,40), ev:s(m.ev,120), st:m.st||null, ip:m.ip?1:0, link:m.link||null
        }));
    }
    if(body && Array.isArray(body.arbs)){
      patch.arbs=body.arbs.slice(0,500).map((a:any)=>({
        typ:s(a.typ,20), mid:s(a.mid,30), ev:s(a.ev,120), mn:s(a.mn,120), mt:s(a.mt,40),
        roi:f(a.roi), inv:f(a.inv), max:f(a.max), inplay:!!a.inplay, link:a.link||null,
        legs:Array.isArray(a.legs)?a.legs.slice(0,6).map((l:any)=>({n:s(l.n,80),q:f(l.q),size:f(l.size),anteil:f(l.anteil)})):[]
      }));
    }

    // Cross-Book-Chancen: fuer die Live-Ansicht speichern UND dauerhaft protokollieren
    let geloggt=0;
    if(body && Array.isArray(body.opps)){
      patch.opps=body.opps.slice(0,300).map((o:any)=>({
        ev:s(o.ev,160), cat:s(o.cat,40), roi:f(o.roi), inv:f(o.inv),
        maxStake:f(o.maxStake), risk:s(o.risk,20), ts:o.ts||null,
        // Additiv: die Bridge schickt diese Felder laengst mit, sie wurden hier
        // nur nie weitergereicht. Ohne sie kann die Website weder anzeigen,
        // wann die Wette vorbei ist, noch wie alt die beiden Kurse sind.
        tage:fn(o.tage),
        endet:o.endet||null,
        alterBf:fn(o.alterBf), alterPm:fn(o.alterPm),
        legs:Array.isArray(o.legs)?o.legs.slice(0,4).map((l:any)=>({
          book:s(l.book,20), pick:s(l.pick,90), q:f(l.q), qEff:f(l.qEff),
          // Gebuehrensatz als null durchreichen, wenn er fehlt — sonst kaeme
          // ein unbekannter Satz als 0 % durch und erzeugte Scheinchancen.
          fee:fn(l.fee), anteil:f(l.anteil), size:f(l.size), link:s(l.link,300),
          // Link-Pruefmarke der Bridge (ab Build 17): 1 = Link nachweislich
          // richtig, 0 = gerade nicht pruefbar (Grund in lgrund), null = alte
          // Bridge ohne Pruefer. Falsche Links erreichen den Server nie —
          // die Bridge verwirft solche Chancen vor dem Hochladen.
          lok:fn(l.lok), lgrund:l.lgrund?s(l.lgrund,140):null
        })):[]
      }));

      const zumLoggen=patch.opps.map((o:any)=>({
        event:o.ev, cat:o.cat, edge:o.roi, arb:o.inv*100,
        books:(o.legs||[]).map((l:any)=>l.book).join('/')
      }));
      if(zumLoggen.length){
        const { data:n } = await sb.rpc('bridge_log_opps',{p_token:given,p_opps:zumLoggen});
        geloggt=typeof n==='number'&&n>0?n:0;
      }
    }
    // stats uebernehmen, aber nichts, was das Konto verraet. Der GET-Endpunkt hat
    // bewusst keine Anmeldung, alles hier ist damit oeffentlich lesbar.
    // key_name ist der frei gewaehlte Betfair-Anwendungsname. Die Website zeigt ihn
    // nirgends an (dort zaehlt nur key_art), er hat hier also nichts zu suchen.
    // Serverseitig filtern wirkt auch fuer Bridges, die noch auf altem Build laufen.
    if(body && body.stats && typeof body.stats==='object'){
      const st:any={...body.stats};
      delete st.key_name;
      patch.stats=st;
    }

    const { error } = await sb.from('bridge_odds').update(patch).eq('id',1);
    if(error) return new Response(JSON.stringify({ok:false,error:error.message}),{status:500,headers:cors});
    return new Response(JSON.stringify({
      ok:true, stored:clean.length, von:who,
      markets:(patch.markets||[]).length, arbs:(patch.arbs||[]).length,
      opps:(patch.opps||[]).length, protokolliert:geloggt
    }),{headers:cors});
  }

  /* ---------- GET ---------- */

  if(url.searchParams.get('check')==='1'){
    const who=await wer(sb,(req.headers.get('x-bridge-token')||'').trim());
    if(!who) return new Response(JSON.stringify({ok:false,error:'Token unbekannt oder Konto gesperrt'}),{status:401,headers:cors});
    return new Response(JSON.stringify({ok:true,von:who}),{headers:cors});
  }

  const { data, error } = await sb.from('bridge_odds')
    .select('payload,updated_at,source,markets,arbs,opps,stats,hints').eq('id',1).single();
  if(error) return new Response(JSON.stringify({ok:false,error:error.message,data:[]}),{headers:cors});

  const age=Math.round((Date.now()-new Date(data.updated_at).getTime())/1000);
  const live=age<180;

  if(url.searchParams.get('hints')==='1')
    return new Response(JSON.stringify({ok:true,hints:data.hints||[]}),{headers:cors});

  if(url.searchParams.get('opps')==='1')
    return new Response(JSON.stringify({ok:true,age_seconds:age,live,opps:data.opps||[],arbs:data.arbs||[],stats:data.stats||{}}),{headers:cors});

  if(url.searchParams.get('meta')==='1')
    return new Response(JSON.stringify({
      ok:true, age_seconds:age, live, source:data.source, updated_at:data.updated_at,
      count:(data.payload||[]).length, markets:(data.markets||[]).length,
      arbs:(data.arbs||[]).length, opps:(data.opps||[]).length, stats:data.stats||{}
    }),{headers:cors});

  // Standard = altes Format. opps/arbs/stats sind klein und kommen additiv mit.
  const out:any={
    ok:true, age_seconds:age, live, source:data.source, updated_at:data.updated_at,
    data:data.payload||[], opps:data.opps||[], arbs:data.arbs||[], stats:data.stats||{}
  };
  if(url.searchParams.get('v')==='2') out.markets=data.markets||[];

  return new Response(JSON.stringify(out),{headers:cors});
});
