"""Parches el prototipo para producción Mi Vettore (API + sin sidebar propio)."""
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
tpl = (ROOT / "src" / "template.html").read_text(encoding="utf-8")

CSS_EXTRA = """
/* Integración Mi Vettore: menú de la app afuera; acá solo contenido. */
.side{display:none!important}
.tabs,#tabs{display:none!important}
.app{display:block;min-height:100%}
html,body{margin:0;min-height:100%;height:auto;overflow:auto;background:var(--bg)}
.main{min-height:100%;min-width:0}
.topbar{height:40px;padding:0 14px}
.content{padding:12px 14px 48px;max-width:none;width:100%;box-sizing:border-box}
.head h1{font-size:18px}
.tw{max-width:100%}
.role[data-locked="1"]{display:none!important}
"""

if "Integración Mi Vettore" not in tpl:
    tpl = tpl.replace("</style>", CSS_EXTRA + "\n</style>", 1)

# Badge / título de prototipo
tpl = tpl.replace(
    '<span class="badge">M6 · Prototipo v7</span>',
    '<span class="badge">Liquidaciones</span>',
)

DB_ADAPTER = r"""
/* ===== Mi Vettore: persistencia via /api/liquidaciones ===== */
(function(){
  // Si se abre el embed a pantalla completa (F5 en URL vieja), volver a la app con menú.
  try{if(window.top===window.self){
    const q=new URLSearchParams(location.search);
    const m=q.get('mod')||'adel';
    const slug={adel:'adelantos',prest:'prestamos',fact:'facturacion',nafta:'nafta',liq:'liquidacion',pago:'pago',panel:'panel',vh:'valores-hora'}[m]||'adelantos';
    location.replace('/liquidaciones/'+slug);return}}catch(e){}
  const TOKEN_KEY='mi-vettore-token';
  function token(){try{return localStorage.getItem(TOKEN_KEY)||''}catch(e){return ''}}
  async function api(method, url, body){
    const headers={Authorization:'Bearer '+token()};
    let payload=undefined;
    if(body!==undefined){headers['Content-Type']='application/json';payload=JSON.stringify(body)}
    const res=await fetch(url,{method,headers,body:payload});
    if(res.status===401){toast('Sesión vencida: volvé a iniciar sesión');throw {code:'auth'}}
    if(!res.ok){let msg='error';try{msg=(await res.json()).error||msg}catch(e){}throw {code:msg}}
    if(res.status===204)return null;
    return res.json();
  }
  function docRef(path){
    const q='?path='+encodeURIComponent(path);
    return {
      async get(){const r=await api('GET','/api/liquidaciones/doc'+q);return {exists:!!r.exists,data:()=>r.data}},
      async set(data){await api('PUT','/api/liquidaciones/doc',{path,data});return true},
      async delete(){await api('DELETE','/api/liquidaciones/doc'+q);return true}
    };
  }
  function collection(name){
    return {
      limit(){return this},
      async get(){
        const r=await api('GET','/api/liquidaciones/collections/'+encodeURIComponent(name));
        return {docs:(r.docs||[]).map(d=>({id:d.id,data:()=>d.data}))};
      }
    };
  }
  window.__vtLiquidacionesDb={doc:docRef,collection};
  window.claude={use:async (svc)=>{
    if(svc==='db')return window.__vtLiquidacionesDb;
    if(svc==='downloads')return {
      async save({filename,data}){
        const a=document.createElement('a');
        a.href=URL.createObjectURL(data instanceof Blob?data:new Blob([data]));
        a.download=filename||'liquidacion.xlsx';
        document.body.appendChild(a);a.click();a.remove();
        setTimeout(()=>URL.revokeObjectURL(a.href),2000);
      }
    };
    return null;
  }};
  // Rol + submódulo forzados desde la app (Administrador / Operaciones)
  try{
    const q=new URLSearchParams(location.search);
    const forced=q.get('role');
    if(forced==='admin'||forced==='operador'){
      UI.role=forced;
      window.__VT_ROLE_LOCKED__=true;
      try{localStorage.setItem('vt_role',forced)}catch(e){}
    }
    const m=q.get('mod');
    if(m&&MODS.some(x=>x[0]===m))UI.mod=m;
  }catch(e){}
  function notifyParentMod(k){
    try{if(parent!==window)parent.postMessage({type:'vt-liq-mod',mod:k},'*')}catch(e){}
  }
  window.addEventListener('message',ev=>{
    const d=ev&&ev.data;if(!d||d.type!=='vt-liq-mod'||!d.mod)return;
    if(!MODS.some(x=>x[0]===d.mod)||UI.mod===d.mod)return;
    UI.mod=d.mod;UI.search='';UI.det=null;
    try{closeDrawer();document.getElementById('modal').classList.remove('on')}catch(e){}
    render();scrollTo(0,0);
  });
  window.__vtNotifyLiqMod=notifyParentMod;
})();
"""

# Inject adapter just before loadDB definition's use - after state init, before PERSISTENCE section
marker = "/* ================= PERSISTENCE ================= */"
if "Mi Vettore: persistencia" not in tpl:
    tpl = tpl.replace(marker, DB_ADAPTER + "\n" + marker, 1)

# Lock role UI in setSt
old_setst = """function setSt(){const el=document.getElementById('saveSt');if(el)el.innerHTML=dbState==='off'?'<span class="dot off"></span>Sin guardado (los cambios se pierden al recargar)':dbState==='connecting'?'<span class="dot busy"></span>Conectando…':pending?'<span class="dot busy"></span>Guardando…':'<span class="dot ok"></span>Cambios guardados';
  const r=document.getElementById('role');if(r)r.innerHTML=[['operador','Operador'],['admin','Administrador']].map(([k,l])=>`<button class="${UI.role===k?'on':''}" data-a="role" data-k="${k}">${l}</button>`).join('')}"""

new_setst = """function setSt(){const el=document.getElementById('saveSt');if(el)el.innerHTML=dbState==='off'?'<span class="dot off"></span>Sin guardado (los cambios se pierden al recargar)':dbState==='connecting'?'<span class="dot busy"></span>Conectando…':pending?'<span class="dot busy"></span>Guardando…':'<span class="dot ok"></span>Cambios guardados';
  const r=document.getElementById('role');if(r){if(window.__VT_ROLE_LOCKED__){r.setAttribute('data-locked','1');r.innerHTML='';}else{r.removeAttribute('data-locked');r.innerHTML=[['operador','Operador'],['admin','Administrador']].map(([k,l])=>`<button class="${UI.role===k?'on':''}" data-a="role" data-k="${k}">${l}</button>`).join('')}}}"""

if old_setst in tpl:
    tpl = tpl.replace(old_setst, new_setst)
else:
    print("WARN: setSt not found exactly")

# Excel download fallback with XLSX.writeFile when claude downloads fails
old_dl = """  let DL=null;try{DL=await claude.use('downloads')}catch(e){}if(!DL){toast('La descarga no está disponible en esta vista.');return}
  try{await DL.save({filename:`Liquidacion_${pLabel(p).replace(/ /g,'_')}.xlsx`,data:new Blob([XLSX.write(wb,{bookType:'xlsx',type:'array'})])});toast('Excel exportado')}catch(e){if(e&&e.code!=='declined')toast('No se pudo descargar ('+(e.code||'error')+')')}"""

new_dl = """  const fname=`Liquidacion_${pLabel(p).replace(/ /g,'_')}.xlsx`;
  const blob=new Blob([XLSX.write(wb,{bookType:'xlsx',type:'array'})],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
  let DL=null;try{DL=await claude.use('downloads')}catch(e){}
  try{if(DL)await DL.save({filename:fname,data:blob});else{const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=fname;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),2000)}toast('Excel exportado')}catch(e){if(e&&e.code!=='declined')toast('No se pudo descargar ('+(e.code||'error')+')')}"""

if old_dl in tpl:
    tpl = tpl.replace(old_dl, new_dl)
else:
    print("WARN: download block not found exactly")

# Prefer tabs in main when side is narrow - also fill tabs from MODS for mobile
old_tabs = """  document.getElementById('tabs').innerHTML='';document.getElementById('ttl').textContent='Liquidaciones · '+(MODS.find(m=>m[0]===UI.mod)||['','',''])[2];
  document.getElementById('subnav').innerHTML=`<div class="grp">Submódulos</div>`+MODS.slice(0,6).map(([k,n,l])=>`<a class="${UI.mod===k?'on':''}" data-a="mod" data-k="${k}">${l}</a>`).join('')+`<div class="grp">Consulta y configuración</div>`+MODS.slice(6).map(([k,n,l])=>`<a class="${UI.mod===k?'on':''}" data-a="mod" data-k="${k}">${l}</a>`).join('');"""

new_tabs = """  document.getElementById('ttl').textContent=(MODS.find(m=>m[0]===UI.mod)||['','','Liquidaciones'])[2];
  // Tabs ocultos: la navegación va por el menú lateral de Mi Vettore.
  const tabs=document.getElementById('tabs');if(tabs)tabs.innerHTML='';
  const sn=document.getElementById('subnav');if(sn)sn.innerHTML='';"""

if old_tabs in tpl:
    tpl = tpl.replace(old_tabs, new_tabs)
else:
    print("WARN: tabs/subnav block not found exactly")

(ROOT / "src" / "template.html").write_text(tpl, encoding="utf-8")
print("OK patched template.html")
