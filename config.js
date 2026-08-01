// Supabase-Verbindung (öffentliche Werte — die Sicherheit macht Row Level Security, nicht Geheimhaltung)
window.AR_SUPABASE_URL = "https://noexklrgtqveiclijdwp.supabase.co";
window.AR_SUPABASE_KEY = "sb_publishable_NrgVUoZhe-uN8U8j41P17Q_9cZgUd6M";

// Gemeinsamer Client + Auth-Helfer
window.arClient = function(){
  if(!window.__arc){
    window.__arc = window.supabase.createClient(window.AR_SUPABASE_URL, window.AR_SUPABASE_KEY);
  }
  return window.__arc;
};

// ---- Sperrbildschirm: Zugangspasswort vor allem anderen ----
// Sofort beim Laden ALLES verstecken, damit nichts durchblitzt, bevor entsperrt ist.
(function(){
  if(sessionStorage.getItem('ar_gate')==='ok') return;
  var s=document.createElement('style');
  s.id='arGateHide';
  // Alles verstecken — NUR der Sperrbildschirm selbst bleibt sichtbar.
  // (Auch Markup, das der Browser erst danach lädt, bleibt so verdeckt.)
  s.textContent='html{visibility:hidden!important}'+
                '#arGateOverlay,#arGateOverlay *{visibility:visible!important}'+
                'html.ar-unlocked{visibility:visible!important}';
  (document.head||document.documentElement).appendChild(s);
})();

window.AR_LOCKED = (sessionStorage.getItem('ar_gate')!=='ok');

window.arGate = function(){
  var unlock=function(){ window.AR_LOCKED=false; document.documentElement.classList.add('ar-unlocked'); var h=document.getElementById('arGateHide'); if(h)h.remove(); };
  if(sessionStorage.getItem('ar_gate')==='ok'){ unlock(); return true; }
  if(document.getElementById('arGateOverlay')) return false;   // schon aufgebaut
  var sb = window.arClient();
  document.title='Orion Panel';
  var ov=document.createElement('div');
  ov.id='arGateOverlay';
  ov.innerHTML =
    '<div id="gateWrap" style="position:fixed;inset:0;z-index:2147483647;background:#060704;display:grid;place-items:center;font-family:ui-sans-serif,system-ui,Segoe UI,Roboto,Arial,sans-serif">'+
      '<div style="width:340px;max-width:calc(100vw - 32px);border:1px solid #2f2b18;background:linear-gradient(180deg,#0b0c07,#080905);padding:30px 28px;text-align:center">'+
        '<div style="width:40px;height:40px;margin:0 auto 16px;position:relative;border:1px solid #7f7130;background:#0a0b06">'+
          '<span style="position:absolute;left:13px;top:19px;width:14px;height:1px;background:#c7b24c;box-shadow:0 -5px 0 #7f7130,0 5px 0 #7f7130"></span>'+
          '<span style="position:absolute;left:19px;top:13px;width:1px;height:14px;background:#c7b24c;box-shadow:-5px 0 0 #7f7130,5px 0 0 #7f7130"></span></div>'+
        '<div style="font-size:13px;letter-spacing:.3em;text-transform:uppercase;color:#f2f1e7;font-weight:700">Orion Panel</div>'+
        '<div style="font-size:9.5px;letter-spacing:.22em;text-transform:uppercase;color:#8b8c7c;margin-top:6px">Interner Zugang</div>'+
        '<input id="gatePw" type="password" placeholder="Zugangspasswort" autocomplete="off" '+
          'style="width:100%;height:42px;margin-top:22px;padding:0 12px;background:#0b0c07;border:1px solid #2f2b18;color:#f2f1e7;font-size:14px;text-align:center;font-family:ui-monospace,Consolas,monospace">'+
        '<button id="gateBtn" style="width:100%;height:42px;margin-top:12px;border:1px solid #7f7130;background:#1a1608;color:#e7d882;font:inherit;font-size:11px;font-weight:800;letter-spacing:.18em;text-transform:uppercase;cursor:pointer">Entsperren</button>'+
        '<div id="gateErr" style="min-height:18px;margin-top:10px;font-size:11px;color:#b0402e;font-family:ui-monospace,monospace"></div>'+
        '<div style="margin-top:14px;padding-top:14px;border-top:1px solid #211f12;font-size:10.5px;color:#5c5d50;line-height:1.6">'+
          'Danach kannst du dich <b style="color:#8b8c7c">anmelden oder registrieren</b>.<br>Kein Zugangspasswort? Frag den Betreiber.</div>'+
      '</div></div>';
  function mount(){ (document.body||document.documentElement).appendChild(ov); }
  if(document.body) mount(); else document.addEventListener('DOMContentLoaded', mount);
  var pw=document.getElementById('gatePw'), btn=document.getElementById('gateBtn'), err=document.getElementById('gateErr');
  function tryOpen(){
    var v=pw.value; if(!v) return;
    btn.disabled=true; err.textContent='prüfe …';
    sb.rpc('check_gate',{p:v}).then(function(r){
      if(r && r.data===true){ sessionStorage.setItem('ar_gate','ok'); location.reload(); }
      else { err.textContent='Falsches Passwort'; btn.disabled=false; pw.value=''; pw.focus(); }
    }).catch(function(){ err.textContent='Verbindungsfehler'; btn.disabled=false; });
  }
  btn.onclick=tryOpen;
  pw.onkeydown=function(e){ if(e.key==='Enter') tryOpen(); };
  setTimeout(function(){pw.focus();},50);
  return false;
};

// Sperrbildschirm sofort aufbauen (unabhängig davon, ob die Seite ihn aufruft)
if(window.AR_LOCKED){ try{ window.arGate(); }catch(e){} }

// Session prüfen; bei fehlender Anmeldung zu login.html. Gibt {session, profile} zurück.
window.arRequireAuth = async function(opts){
  opts = opts || {};
  if(!window.arGate()) return null;          // Sperrbildschirm zuerst
  const sb = window.arClient();
  const { data:{ session } } = await sb.auth.getSession();
  if(!session){ location.replace('login.html'); return null; }
  const { data: profile } = await sb.rpc('my_profile');
  if(profile && profile.banned){
    await sb.auth.signOut();
    document.body.innerHTML = '<div style="min-height:100vh;display:grid;place-items:center;background:#060704;color:#f2f1e7;font-family:ui-sans-serif,system-ui">'+
      '<div style="border:1px solid #6e2c22;background:#140a08;padding:34px 40px;max-width:420px;text-align:center">'+
      '<div style="font-size:11px;letter-spacing:.24em;text-transform:uppercase;color:#b0402e;font-weight:800">Zugang gesperrt</div>'+
      '<p style="color:#8b8c7c;margin:14px 0 18px;font-size:13px">Dieser Account wurde vom Administrator gebannt.'+
      (profile.banned_reason? '<br><br>Grund: '+profile.banned_reason : '')+'</p>'+
      '<a href="login.html" style="color:#c7b24c;font-size:12px;letter-spacing:.1em;text-transform:uppercase">Zurück zum Login</a></div></div>';
    return null;
  }
  if(opts.adminOnly && (!profile || profile.role !== 'admin')){ location.replace('index.html'); return null; }
  return { session, profile, sb };
};
