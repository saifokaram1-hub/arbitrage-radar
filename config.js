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

// Session prüfen; bei fehlender Anmeldung zu login.html. Gibt {session, profile} zurück.
window.arRequireAuth = async function(opts){
  opts = opts || {};
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
