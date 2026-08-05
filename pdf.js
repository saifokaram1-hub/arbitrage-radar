/* ============================================================================
   Erzeugt aus der Suchlogik-Seite eine echte PDF-Datei zum Herunterladen.
   Kein fremdes Programm, keine Bibliothek: das PDF wird hier direkt gebaut.

   Warum selbst bauen statt drucken? Der Druckdialog lädt nichts herunter, er
   druckt. Wer eine Datei will, bekommt hier eine Datei.

   Verwendet werden die 14 Standardschriften, die jedes PDF-Programm kennt
   (Helvetica, Helvetica-Bold, Courier). Dadurch muss keine Schrift eingebettet
   werden und die Datei bleibt klein. Umlaute funktionieren über WinAnsi.
   ========================================================================== */
(function(){
'use strict';

/* ---------- Zeichenbreiten der Standardschriften (aus den AFM-Tabellen) ---------- */
var W_REG = {32:278,33:278,34:355,35:556,36:556,37:889,38:667,39:191,40:333,41:333,42:389,43:584,44:278,45:333,46:278,47:278,
58:278,59:278,60:584,61:584,62:584,63:556,64:1015,
65:667,66:667,67:722,68:722,69:667,70:611,71:778,72:722,73:278,74:500,75:667,76:556,77:833,78:722,79:778,80:667,81:778,82:722,83:667,84:611,85:722,86:667,87:944,88:667,89:667,90:611,
91:278,92:278,93:278,94:469,95:556,96:333,
97:556,98:556,99:500,100:556,101:556,102:278,103:556,104:556,105:222,106:222,107:500,108:222,109:833,110:556,111:556,112:556,113:556,114:333,115:500,116:278,117:556,118:500,119:722,120:500,121:500,122:500,
123:334,124:260,125:334,126:584};
var W_BOLD = {32:278,33:333,34:474,35:556,36:556,37:889,38:722,39:238,40:333,41:333,42:389,43:584,44:278,45:333,46:278,47:278,
58:333,59:333,60:584,61:584,62:584,63:611,64:975,
65:722,66:722,67:722,68:722,69:667,70:611,71:778,72:722,73:278,74:556,75:722,76:611,77:833,78:722,79:778,80:667,81:778,82:722,83:667,84:611,85:722,86:667,87:944,88:667,89:667,90:611,
91:333,92:278,93:333,94:584,95:556,96:333,
97:556,98:611,99:556,100:611,101:556,102:333,103:611,104:611,105:278,106:278,107:556,108:278,109:889,110:611,111:611,112:611,113:611,114:389,115:556,116:333,117:611,118:556,119:778,120:556,121:556,122:500,
123:389,124:280,125:389,126:584};
for(var d=48;d<=57;d++){ W_REG[d]=556; W_BOLD[d]=556; }

// Umlaute und Akzente sind ungefähr so breit wie ihre Grundbuchstaben
var BASIS={196:65,214:79,220:85,228:97,246:111,252:117,223:115,233:101,201:69,224:97,232:101,231:99};
function breite(code, fett){
  var t = fett? W_BOLD : W_REG;
  if(t[code]!=null) return t[code];
  if(BASIS[code]!=null && t[BASIS[code]]!=null) return t[BASIS[code]];
  return fett?611:556;
}

/* ---------- Unicode -> WinAnsi. Was es dort nicht gibt, wird ersetzt. ---------- */
var ERSATZ={
  0x2014:'-',0x2013:'-',0x2212:'-',
  0x201E:'"',0x201C:'"',0x201D:'"',0x2018:"'",0x2019:"'",
  0x2192:'->',0x2190:'<-',0x21C4:'<->',0x2194:'<->',
  0x2713:'[ja]',0x2717:'[nein]',0x2705:'[ja]',0x274C:'[nein]',
  0x00B7:'·',0x2026:'...',0x00A0:' ',0x202F:' ',0x2009:' ',
  0x2039:'<',0x203A:'>',0x2264:'<=',0x2265:'>=',0x00D7:'x',
  0x25B8:'>',0x25BE:'v',0x2913:'',0x2193:''
};
function nachWinAnsi(s){
  var out='';
  for(var i=0;i<s.length;i++){
    var c=s.codePointAt(i);
    if(c>0xFFFF){ i++; out+='?'; continue; }
    if(ERSATZ[c]!=null){ out+=ERSATZ[c]; continue; }
    if(c<256){ out+=String.fromCharCode(c); continue; }
    out+='?';
  }
  return out;
}
function textBreite(s, groesse, fett){
  var w=0;
  for(var i=0;i<s.length;i++) w+=breite(s.charCodeAt(i), fett);
  return w*groesse/1000;
}
function umbrechen(s, maxBreite, groesse, fett){
  var woerter=String(s).split(/\s+/).filter(Boolean), zeilen=[], akt='';
  for(var i=0;i<woerter.length;i++){
    var probe = akt? akt+' '+woerter[i] : woerter[i];
    if(textBreite(probe,groesse,fett)<=maxBreite){ akt=probe; continue; }
    if(akt) zeilen.push(akt);
    // Einzelnes Wort zu lang -> hart trennen
    var w=woerter[i];
    while(textBreite(w,groesse,fett)>maxBreite && w.length>1){
      var n=1;
      while(n<w.length && textBreite(w.slice(0,n+1),groesse,fett)<=maxBreite) n++;
      zeilen.push(w.slice(0,n)); w=w.slice(n);
    }
    akt=w;
  }
  if(akt) zeilen.push(akt);
  return zeilen.length? zeilen : [''];
}

/* ---------- Seite und Layout ---------- */
var SB=595.28, SH=841.89, RAND=42, INHALT=SB-2*RAND;

function Doc(){
  this.seiten=[]; this.s=null; this.y=0; this.neu();
}
Doc.prototype.neu=function(){
  this.s={ops:[]}; this.seiten.push(this.s); this.y=SH-RAND;
};
Doc.prototype.platz=function(h){
  if(this.y-h < RAND+26){ this.neu(); return true; }
  return false;
};
Doc.prototype.text=function(s,x,groesse,fett,mono,grau){
  var f = mono? '/F3' : (fett? '/F2':'/F1');
  var g = grau==null? 0.12 : grau;
  this.s.ops.push('BT '+f+' '+groesse+' Tf '+g.toFixed(2)+' g 1 0 0 1 '+x.toFixed(2)+' '+this.y.toFixed(2)+' Tm ('+esc(s)+') Tj ET');
};
Doc.prototype.linie=function(x1,x2,dicke,grau){
  this.s.ops.push((grau==null?0.72:grau).toFixed(2)+' G '+(dicke||0.6)+' w '+x1.toFixed(2)+' '+this.y.toFixed(2)+' m '+x2.toFixed(2)+' '+this.y.toFixed(2)+' l S');
};
Doc.prototype.kasten=function(x,y,b,h,grau){
  this.s.ops.push((grau==null?0.94:grau).toFixed(3)+' g '+x.toFixed(2)+' '+y.toFixed(2)+' '+b.toFixed(2)+' '+h.toFixed(2)+' re f');
};
function esc(s){ return String(s).replace(/\\/g,'\\\\').replace(/\(/g,'\\(').replace(/\)/g,'\\)'); }

/* ---------- Absatz mit Umbruch ---------- */
function absatz(doc, s, opt){
  opt=opt||{};
  var groesse=opt.groesse||9.5, fett=!!opt.fett, mono=!!opt.mono;
  var x=RAND+(opt.einzug||0), breiteMax=INHALT-(opt.einzug||0)-(opt.rechts||0);
  var zeilen=umbrechen(nachWinAnsi(s), breiteMax, groesse, fett);
  var zh=groesse*1.35;
  for(var i=0;i<zeilen.length;i++){
    doc.platz(zh);
    doc.y-=zh;
    doc.text(zeilen[i], x, groesse, fett, mono, opt.grau);
  }
  if(opt.abstand!==0) doc.y-=(opt.abstand||3);
}

/* ---------- Die Seite einlesen und in Blöcke übersetzen ---------- */
function sammeln(){
  var b=[];
  var txt=function(el){ return el? (el.textContent||'').replace(/\s+/g,' ').trim() : ''; };

  var intro=document.querySelector('.intro');
  if(intro){
    b.push({t:'titel', s:txt(intro.querySelector('h2'))});
    intro.querySelectorAll('p').forEach(function(p){ b.push({t:'p', s:txt(p)}); });
    var stamp=txt(intro.querySelector('.stamp'));
    if(stamp) b.push({t:'klein', s:stamp});
  }

  var g=document.querySelectorAll('.gauges .g');
  if(g.length){
    b.push({t:'h2', s:'Kennzahlen'});
    g.forEach(function(x){
      b.push({t:'kv', k:txt(x.querySelector('.l')), v:txt(x.querySelector('.v')), z:txt(x.querySelector('.s'))});
    });
  }

  document.querySelectorAll('.wrap > section').forEach(function(sec){
    sec.childNodes.forEach(function(n){
      if(n.nodeType!==1) return;
      var cl=n.className||'';
      if(n.tagName==='H3'){ b.push({t:'h2', s:txt(n)}); return; }
      if(n.tagName==='H4'){ b.push({t:'h3', s:txt(n)}); return; }
      if(n.tagName==='P'){ b.push({t:'p', s:txt(n)}); return; }
      if(n.tagName==='PRE'){ b.push({t:'code', s:(n.textContent||'').replace(/\t/g,'  ')}); return; }
      if(/\bcall\b/.test(cl)){ b.push({t:'hinweis', s:txt(n)}); return; }
      if(/\bflow\b/.test(cl)){
        n.querySelectorAll('.stage').forEach(function(st){
          b.push({t:'stufe', n:txt(st.querySelector('.n')), s:txt(st.querySelector('.t')),
                  d:txt(st.querySelector('.d')), m:txt(st.querySelector('.m'))});
        });
        return;
      }
      if(/\bversus\b/.test(cl)){
        n.querySelectorAll('.vs').forEach(function(v){
          var punkte=[]; v.querySelectorAll('li').forEach(function(li){ punkte.push(txt(li)); });
          b.push({t:'spalte', name:txt(v.querySelector('.nm')), preis:txt(v.querySelector('.price')), punkte:punkte});
        });
        return;
      }
      if(/\bledger\b/.test(cl)){
        n.querySelectorAll('.row').forEach(function(r){
          var felder=r.querySelectorAll('.ba div');
          b.push({t:'eintrag', s:txt(r.querySelector('.ttl b')), tag:txt(r.querySelector('.tag')),
                  vor:txt(felder[0]), jetzt:txt(felder[1])});
        });
        return;
      }
      if(/\bscroll\b/.test(cl)){
        var tab=n.querySelector('table'); if(!tab) return;
        var kopf=[], zeilen=[];
        tab.querySelectorAll('tr').forEach(function(tr){
          var th=tr.querySelectorAll('th');
          if(th.length){ th.forEach(function(c){ kopf.push(txt(c)); }); return; }
          var z=[]; tr.querySelectorAll('td').forEach(function(c){ z.push(txt(c)); });
          if(z.length) zeilen.push(z);
        });
        b.push({t:'tabelle', kopf:kopf, zeilen:zeilen});
        return;
      }
    });
  });

  var foot=document.querySelector('.foot');
  if(foot) b.push({t:'klein', s:txt(foot)});
  return b;
}

/* ---------- Blöcke setzen ---------- */
function setzen(doc, bloecke){
  bloecke.forEach(function(b){
    switch(b.t){
      case 'titel':
        doc.platz(40); doc.y-=6;
        absatz(doc, b.s, {groesse:17, fett:true, abstand:7});
        break;
      case 'h2':
        doc.platz(34); doc.y-=9;
        absatz(doc, b.s.toUpperCase(), {groesse:9, fett:true, abstand:3, grau:0.35});
        doc.y+=2; doc.linie(RAND, SB-RAND, 1, 0.25); doc.y-=6;
        break;
      case 'h3':
        doc.platz(24); doc.y-=5;
        absatz(doc, b.s, {groesse:11, fett:true, abstand:3});
        break;
      case 'p':
        absatz(doc, b.s, {groesse:9.5, abstand:5});
        break;
      case 'klein':
        absatz(doc, b.s, {groesse:8, mono:true, grau:0.45, abstand:5});
        break;
      case 'kv':
        doc.platz(15); doc.y-=12;
        doc.text(nachWinAnsi(b.k), RAND, 8.5, false, false, 0.35);
        var vs=nachWinAnsi(b.v+(b.z? '   ('+b.z+')':''));
        doc.text(vs, RAND+INHALT-textBreite(vs,9,true), 9, true, false, 0.12);
        doc.y-=2;
        break;
      case 'code':
        var zl=String(b.s).split('\n');
        var h=zl.length*10.5+10;
        doc.platz(h);
        doc.kasten(RAND, doc.y-h+4, INHALT, h, 0.955);
        doc.y-=4;
        zl.forEach(function(z){ doc.y-=10.5; doc.text(nachWinAnsi(z), RAND+7, 8.2, false, true, 0.15); });
        doc.y-=10;
        break;
      case 'hinweis':
        doc.platz(30);
        var zeilen=umbrechen(nachWinAnsi(b.s), INHALT-16, 9, false);
        var hh=zeilen.length*12.2+9;
        doc.kasten(RAND, doc.y-hh+5, INHALT, hh, 0.955);
        doc.kasten(RAND, doc.y-hh+5, 2.2, hh, 0.45);
        doc.y-=3;
        zeilen.forEach(function(z){ doc.y-=12.2; doc.text(z, RAND+10, 9, false, false, 0.2); });
        doc.y-=9;
        break;
      case 'stufe':
        doc.platz(30); doc.y-=13;
        doc.text(nachWinAnsi(b.n)+'.', RAND, 9.5, true, false, 0.45);
        doc.text(nachWinAnsi(b.s), RAND+17, 9.5, true, false, 0.12);
        doc.y+=13;
        absatz(doc, b.d, {groesse:9, einzug:17, abstand:1, grau:0.28});
        if(b.m) absatz(doc, b.m, {groesse:8.2, einzug:17, mono:true, grau:0.45, abstand:5});
        else doc.y-=4;
        break;
      case 'spalte':
        doc.platz(34); doc.y-=13;
        doc.text(nachWinAnsi(b.name), RAND, 11, true, false, 0.12);
        var pr=nachWinAnsi(b.preis);
        doc.text(pr, RAND+INHALT-textBreite(pr,8.5,false), 8.5, false, true, 0.4);
        doc.y-=3;
        b.punkte.forEach(function(p){
          doc.platz(14); doc.y-=1;
          var zz=umbrechen(nachWinAnsi(p), INHALT-16, 9, false);
          zz.forEach(function(z,i){
            doc.platz(12); doc.y-=12;
            if(i===0) doc.text('-', RAND+4, 9, false, false, 0.45);
            doc.text(z, RAND+14, 9, false, false, 0.25);
          });
        });
        doc.y-=6;
        break;
      case 'eintrag':
        doc.platz(46); doc.y-=14;
        doc.text(nachWinAnsi(b.s), RAND, 10, true, false, 0.12);
        if(b.tag){
          var tg=nachWinAnsi('['+b.tag+']');
          doc.text(tg, RAND+INHALT-textBreite(tg,8,false), 8, false, true, 0.45);
        }
        doc.y-=2;
        absatz(doc, 'VORHER: '+b.vor, {groesse:8.8, einzug:10, abstand:2, grau:0.32});
        absatz(doc, 'JETZT: '+b.jetzt, {groesse:8.8, einzug:10, abstand:7, grau:0.18});
        break;
      case 'tabelle':
        var n=b.kopf.length||1;
        var sp=[]; for(var i=0;i<n;i++) sp.push(INHALT/n);
        // Erste Spalte breiter, sie trägt den Text
        if(n>2){ sp[0]=INHALT*0.30; for(var j=1;j<n;j++) sp[j]=INHALT*0.70/(n-1); }
        doc.platz(40); doc.y-=13;
        var x=RAND;
        b.kopf.forEach(function(k,i){ doc.text(nachWinAnsi(k).toUpperCase(), x, 7.5, true, false, 0.4); x+=sp[i]; });
        doc.y-=3; doc.linie(RAND, SB-RAND, 0.8, 0.3); doc.y-=2;
        b.zeilen.forEach(function(z){
          var hoch=1;
          z.forEach(function(c,i){ hoch=Math.max(hoch, umbrechen(nachWinAnsi(c), sp[i]-6, 8.5, false).length); });
          doc.platz(hoch*11+4);
          var oben=doc.y; var xx=RAND;
          z.forEach(function(c,i){
            var zz=umbrechen(nachWinAnsi(c), sp[i]-6, 8.5, false);
            doc.y=oben;
            zz.forEach(function(t){ doc.y-=11; doc.text(t, xx, 8.5, false, i>0, 0.2); });
            xx+=sp[i];
          });
          doc.y=oben-hoch*11-2;
          doc.linie(RAND, SB-RAND, 0.3, 0.82);
        });
        doc.y-=8;
        break;
    }
  });
}

/* ---------- PDF zusammensetzen ---------- */
function bauen(doc, titel){
  var objekte=[], N=5;   // 1 Katalog, 2 Seitenbaum, 3-5 Schriften
  var seitenIds=[], inhaltIds=[];
  doc.seiten.forEach(function(){ seitenIds.push(++N); inhaltIds.push(++N); });

  objekte[1]='<</Type/Catalog/Pages 2 0 R>>';
  objekte[2]='<</Type/Pages/Kids['+seitenIds.map(function(i){return i+' 0 R';}).join(' ')+']/Count '+seitenIds.length+'>>';
  objekte[3]='<</Type/Font/Subtype/Type1/BaseFont/Helvetica/Encoding/WinAnsiEncoding>>';
  objekte[4]='<</Type/Font/Subtype/Type1/BaseFont/Helvetica-Bold/Encoding/WinAnsiEncoding>>';
  objekte[5]='<</Type/Font/Subtype/Type1/BaseFont/Courier/Encoding/WinAnsiEncoding>>';

  doc.seiten.forEach(function(s,i){
    // Fusszeile mit Seitenzahl
    var fz='BT /F1 7.5 Tf 0.5 g 1 0 0 1 '+RAND+' 26 Tm ('+esc(nachWinAnsi(titel))+') Tj ET';
    var nr='Seite '+(i+1)+' von '+doc.seiten.length;
    fz+=' BT /F1 7.5 Tf 0.5 g 1 0 0 1 '+(SB-RAND-textBreite(nr,7.5,false)).toFixed(2)+' 26 Tm ('+esc(nr)+') Tj ET';
    var strom=s.ops.join('\n')+'\n'+fz;
    objekte[seitenIds[i]]='<</Type/Page/Parent 2 0 R/MediaBox[0 0 '+SB.toFixed(2)+' '+SH.toFixed(2)+
      ']/Resources<</Font<</F1 3 0 R/F2 4 0 R/F3 5 0 R>>>>/Contents '+inhaltIds[i]+' 0 R>>';
    objekte[inhaltIds[i]]='<</Length '+strom.length+'>>\nstream\n'+strom+'\nendstream';
  });

  var kopf='%PDF-1.4\n%\xE2\xE3\xCF\xD3\n';
  var body='', pos=[], offset=kopf.length;
  for(var i=1;i<=N;i++){
    var o=i+' 0 obj\n'+objekte[i]+'\nendobj\n';
    pos[i]=offset; offset+=o.length; body+=o;
  }
  var xref='xref\n0 '+(N+1)+'\n0000000000 65535 f \n';
  for(var k=1;k<=N;k++) xref+=('0000000000'+pos[k]).slice(-10)+' 00000 n \n';
  var ende='trailer\n<</Size '+(N+1)+'/Root 1 0 R>>\nstartxref\n'+offset+'\n%%EOF';
  return kopf+body+xref+ende;
}

function herunterladen(){
  var d=new Date(), p=function(n){return (n<10?'0':'')+n;};
  var stand=p(d.getDate())+'.'+p(d.getMonth()+1)+'.'+d.getFullYear();
  var titel='Orion Panel - Suchlogik - Stand '+stand;

  var doc=new Doc();
  doc.y-=4;
  absatz(doc,'ORION PANEL',{groesse:8,fett:true,grau:0.45,abstand:1});
  doc.linie(RAND,SB-RAND,1.2,0.2); doc.y-=8;
  setzen(doc, sammeln());

  var roh=bauen(doc, titel);
  var bytes=new Uint8Array(roh.length);
  for(var i=0;i<roh.length;i++) bytes[i]=roh.charCodeAt(i)&0xFF;

  var url=URL.createObjectURL(new Blob([bytes],{type:'application/pdf'}));
  var a=document.createElement('a');
  a.href=url;
  a.download='Orion-Panel-Suchlogik-'+d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate())+'.pdf';
  document.body.appendChild(a); a.click();
  setTimeout(function(){ URL.revokeObjectURL(url); a.remove(); }, 4000);
  return doc.seiten.length;
}

if(typeof window!=='undefined') window.orionPdf = herunterladen;
// Für die Prüfung von aussen (node pdf-pruefung.js) — im Browser ohne Wirkung
if(typeof module!=='undefined' && module.exports){
  module.exports={Doc:Doc, setzen:setzen, bauen:bauen, sammeln:sammeln, absatz:absatz,
                  nachWinAnsi:nachWinAnsi, umbrechen:umbrechen, textBreite:textBreite, RAND:RAND, INHALT:INHALT};
}
})();
