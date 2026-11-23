const { createClient } = supabase;
const db = createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
const $ = (id) => document.getElementById(id);
let currentUser = null;
let currentPage = 'dashboard';
let invoicePreviewReturnPage = 'clients';
let currentProfile = { role: 'staff', full_name: '', provider_id: null, must_change_password: false };
let invoices = [];
let clientRowsCache = [];
let reportRowsCache = [];
const PAGE_TITLES = { dashboard:'Resumen general', invoices:'Facturas', new:'Nueva factura', clients:'Clientes', reports:'Reportes', users:'Usuarios y accesos', trash:'Papelera de facturas', backup:'Respaldos' };
const PROVIDERS = [{id:1,name:'Julio Ríos'},{id:2,name:'Alfredo Sánchez'},{id:3,name:'Dwayne Darren'}];
const money = n => 'C$ ' + Number(n || 0).toLocaleString('es-NI',{minimumFractionDigits:2,maximumFractionDigits:2});
const esc = s => String(s ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const isAdmin = () => currentProfile.role === 'admin';
function setMessage(id, text, bad=false){ const el=$(id); if(el){el.textContent=text;el.style.color=bad?'#a63e36':'#257a58';} }
function localDate(date){ if(!date)return '—'; const d=new Date(`${date}T00:00:00`); return Number.isNaN(d.getTime())?String(date):d.toLocaleDateString('es-NI'); }
function initials(name){return String(name||'JG').split(/\s+/).filter(Boolean).slice(0,2).map(x=>x[0]).join('').toUpperCase();}
function monthKey(d){return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;}
function monthShort(d){return d.toLocaleDateString('es-NI',{month:'short'}).replace('.','');}

async function init(){
  if(!window.SUPABASE_URL || window.SUPABASE_URL.includes('TU-PROYECTO') || !window.SUPABASE_ANON_KEY || window.SUPABASE_ANON_KEY.includes('TU_CLAVE')){
    $('loginError').textContent='Configura config.js con la Project URL y la Publishable key de Supabase.'; return;
  }
  const {data:{session}} = await db.auth.getSession();
  if(session) await enter(session.user);
}
async function enter(user){
  currentUser=user;
  await loadProfile();
  if(currentProfile.must_change_password){
    $('login').classList.add('hidden');
    $('app').classList.add('hidden');
    $('forcePasswordPanel').classList.remove('hidden');
    $('forcePasswordForm').reset();
    $('forcedAccountEmail').textContent=currentUser.email||'';
    $('forcePasswordError').textContent='';
    $('forcePasswordNew').focus();
    return;
  }
  $('forcePasswordPanel').classList.add('hidden');
  $('login').classList.add('hidden'); $('app').classList.remove('hidden');
  $('todayLabel').textContent=new Date().toLocaleDateString('es-NI',{day:'2-digit',month:'short',year:'numeric'});
  showPage('dashboard');
}
async function loadProfile(){
  const {data,error}=await db.from('profiles').select('full_name,role,provider_id,must_change_password,password_changed_at').eq('id',currentUser.id).maybeSingle();
  if(error || !data){ currentProfile={role:'staff',provider_id:null,full_name:currentUser.email?.split('@')[0]||'Usuario',must_change_password:false}; $('profileNotice').textContent='No se encontró el perfil de acceso. Solicita al administrador completar la configuración de roles en Supabase.'; $('profileNotice').classList.remove('hidden'); }
  else {currentProfile={...data,must_change_password:Boolean(data.must_change_password)}; $('profileNotice').classList.add('hidden');}
  const displayName=currentProfile.full_name||currentUser.email||'Usuario';
  $('userName').textContent=displayName; const assignedProvider=PROVIDERS.find(p=>p.id===Number(currentProfile.provider_id)); $('userRole').textContent=isAdmin()?'Administrador':(assignedProvider?.name||'Personal sin proveedor'); $('userAvatar').textContent=initials(displayName);
  document.querySelectorAll('.admin-only').forEach(el=>el.classList.toggle('hidden',!isAdmin()));
  document.querySelector('.admin-label').classList.toggle('hidden',!isAdmin());
}
function showPage(page){
  currentPage = page;
  if(['users','backup','trash'].includes(page) && !isAdmin()){alert('Esta sección está disponible únicamente para administradores.');page='dashboard';}
  document.querySelectorAll('.page-section').forEach(s=>s.classList.add('hidden'));
  const map={dashboard:'dashboardPage',invoices:'invoicePage',new:'newPage',clients:'clientsPage',reports:'reportsPage',users:'usersPage',trash:'trashPage',backup:'backupPage'};
  $(map[page]).classList.remove('hidden');
  $('pageTitle').textContent=PAGE_TITLES[page]||'RIVER GOLD';
  document.querySelectorAll('.nav').forEach(b=>b.classList.toggle('active',b.dataset.page===page));
  $('app').classList.remove('menu-open');
  syncMenuButton();
  if(page==='dashboard') loadDashboard();
  if(page==='invoices') loadInvoices();
  if(page==='new') resetInvoiceForm();
  if(page==='clients') loadClients();
  if(page==='reports') loadReports();
  if(page==='users') loadUsers();
  if(page==='trash') loadTrash();
}
async function logout(){await db.auth.signOut();currentUser=null;$('app').classList.add('hidden');$('forcePasswordPanel').classList.add('hidden');$('login').classList.remove('hidden');$('loginForm').reset();$('forcePasswordForm').reset();}
$('loginForm').addEventListener('submit',async e=>{
  e.preventDefault();$('loginError').textContent='Validando acceso…';
  const {data,error}=await db.auth.signInWithPassword({email:$('email').value,password:$('password').value});
  if(error){$('loginError').textContent='No fue posible iniciar sesión. Verifica el correo y la contraseña.';return;}
  $('loginError').textContent=''; await enter(data.user);
});
$('forcePasswordForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.currentTarget;
  const button = $('saveForcedPassword');
  const password = $('forcePasswordNew').value;
  const confirmation = $('forcePasswordConfirm').value;
  $('forcePasswordError').textContent = '';
  if (password.length < 8) { $('forcePasswordError').textContent = 'La nueva contraseña debe tener al menos 8 caracteres.'; return; }
  if (password !== confirmation) { $('forcePasswordError').textContent = 'Las contraseñas no coinciden.'; return; }
  button.disabled = true;
  button.textContent = 'Actualizando contraseña…';
  try {
    const { error: updateError } = await db.auth.updateUser({ password });
    if (updateError) throw updateError;
    const { error: confirmError } = await db.rpc('confirm_my_password_change');
    if (confirmError) throw new Error('La contraseña se actualizó, pero no se pudo confirmar el cambio en el perfil. Intenta guardar nuevamente: ' + confirmError.message);
    form.reset();
    await enter(currentUser);
  } catch (err) {
    $('forcePasswordError').textContent = err?.message || 'No se pudo actualizar la contraseña.';
  } finally {
    button.disabled = false;
    button.textContent = 'Guardar nueva contraseña';
  }
});
$('logout').onclick=logout;
document.querySelectorAll('[data-page]').forEach(b=>b.addEventListener('click',()=>showPage(b.dataset.page)));
function isMobileLayout(){return window.matchMedia('(max-width: 760px)').matches;}
function syncMenuButton(){
  const mobile=isMobileLayout();
  const open=mobile?$('app').classList.contains('menu-open'):!$('app').classList.contains('sidebar-collapsed');
  $('menu').setAttribute('aria-expanded',String(open));
  $('menu').setAttribute('aria-label',mobile?(open?'Cerrar menú':'Abrir menú'):(open?'Contraer menú':'Expandir menú'));
  $('menu').title=mobile?(open?'Cerrar menú':'Abrir menú'):(open?'Contraer menú':'Expandir menú');
}
$('menu').onclick=()=>{
  if(isMobileLayout()) $('app').classList.toggle('menu-open');
  else {
    $('app').classList.toggle('sidebar-collapsed');
    try{localStorage.setItem('riverGoldSidebarCollapsed',$('app').classList.contains('sidebar-collapsed')?'1':'0');}catch(_e){}
  }
  syncMenuButton();
};
window.addEventListener('resize',syncMenuButton);
try{if(localStorage.getItem('riverGoldSidebarCollapsed')==='1')$('app').classList.add('sidebar-collapsed');}catch(_e){}
syncMenuButton();
document.querySelectorAll('[data-password-toggle]').forEach(toggle=>{
  const input=$(toggle.dataset.passwordToggle);
  if(!input)return;
  toggle.addEventListener('click',()=>{
    const reveal=input.type==='password';
    input.type=reveal?'text':'password';
    toggle.innerHTML=reveal
      ?'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 3l18 18M10.6 10.6a2 2 0 002.8 2.8"/><path d="M9.9 5.2A10.7 10.7 0 0112 5c6.4 0 10 7 10 7a15 15 0 01-3.2 3.9M6.2 6.2C3.5 8 2 12 2 12s3.6 7 10 7a10 10 0 003.1-.5"/></svg>'
      :'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg>';
    toggle.setAttribute('aria-label',reveal?'Ocultar contraseña':'Mostrar contraseña');
    toggle.setAttribute('title',reveal?'Ocultar contraseña':'Mostrar contraseña');
    toggle.setAttribute('aria-pressed',String(reveal));
    input.focus();
  });
});
$('dashboardNew').onclick=()=>showPage('new'); $('goNew').onclick=()=>showPage('new'); $('cancel').onclick=()=>showPage('invoices');

async function fetchInvoices(){
  const {data,error}=await db.from('facturas').select('factura_id,numero_factura,fecha,ruc,uag,proveedor_id,deleted_at,proveedores(nombre),clientes(cliente_id,nombre,cedula),detalles_factura(detalle_id,precio_total,gramos,onzas)').is('deleted_at',null).order('factura_id',{ascending:false});
  if(error) throw error; return data||[];
}
function invoiceTotal(f){return (f.detalles_factura||[]).reduce((sum,d)=>sum+Number(d.precio_total||0),0);}
async function loadDashboard(){
  $('kpiInvoices').textContent='…'; $('kpiSales').textContent='…'; $('kpiClients').textContent='…'; $('kpiMonth').textContent='…';
  try{
    const [allInvoices,clientsCount]=await Promise.all([
      fetchInvoices(),
      db.from('clientes').select('cliente_id',{count:'exact',head:true})
    ]);
    if(clientsCount.error) throw clientsCount.error;
    const sales=allInvoices.reduce((sum,f)=>sum+invoiceTotal(f),0);
    const now=new Date(); const thisMonth=allInvoices.filter(f=>String(f.fecha).slice(0,7)===monthKey(now));
    $('kpiInvoices').textContent=allInvoices.length.toLocaleString('es-NI');
    $('kpiSales').textContent=money(sales);
    $('kpiClients').textContent=Number(clientsCount.count||0).toLocaleString('es-NI');
    $('kpiMonth').textContent=thisMonth.length.toLocaleString('es-NI');
    $('kpiMonthLabel').textContent=now.toLocaleDateString('es-NI',{month:'long',year:'numeric'});
    const months=[]; for(let i=5;i>=0;i--){const d=new Date(now.getFullYear(),now.getMonth()-i,1);months.push({key:monthKey(d),label:monthShort(d),value:0});}
    allInvoices.forEach(f=>{const m=months.find(x=>x.key===String(f.fecha).slice(0,7));if(m)m.value+=invoiceTotal(f);});
    renderSalesChart(months);
    $('recentRows').innerHTML=allInvoices.slice(0,5).map(f=>`<tr><td>${esc(f.numero_factura)}</td><td>${localDate(f.fecha)}</td><td>${esc(f.clientes?.nombre)}</td><td>${esc(f.proveedores?.nombre)}</td><td>${money(invoiceTotal(f))}</td></tr>`).join('')||'<tr><td colspan="5">Aún no hay facturas registradas.</td></tr>';
  }catch(err){$('recentRows').innerHTML=`<tr><td colspan="5">${esc(err.message)}</td></tr>`;}
}
function renderSalesChart(months){
  const max=Math.max(1,...months.map(x=>x.value));
  $('salesChart').innerHTML=months.map(m=>`<div class="bar-item"><span class="bar-value">${m.value?money(m.value).replace('C$ ',''): '0.00'}</span><div class="bar-column" style="height:${Math.max(3,(m.value/max)*125)}px" title="${money(m.value)}"></div><span class="bar-label">${esc(m.label)}</span></div>`).join('');
}

// El listado general muestra las facturas activas de los tres proveedores.
// El RPC solo devuelve un resumen operativo (sin cédula, dirección ni fotografía).
async function loadInvoices(){
  $('invoiceRows').innerHTML='<tr><td colspan="6">Cargando…</td></tr>';
  try{
    const {data,error}=await db.rpc('listar_facturas_globales');
    if(error) throw error;
    invoices=data||[];
    renderInvoices();
  }catch(error){$('invoiceRows').innerHTML=`<tr><td colspan="6">${esc(error.message)}</td></tr>`;}
}
function renderInvoices(){
  const term=$('filter').value.toLowerCase();
  const rows=invoices.filter(f=>[f.numero_factura,f.proveedor_nombre,f.cliente_nombre,f.fecha].join(' ').toLowerCase().includes(term));
  $('invoiceRows').innerHTML=rows.length?rows.map(f=>{
    const canPrint=isAdmin() || Number(f.proveedor_id)===Number(currentProfile.provider_id);
    const actions=canPrint
      ? `<button class="btn btn-outline btn-small" onclick="printInvoice(${f.factura_id})">Imprimir</button>`
      : '<span class="muted" title="La impresión completa corresponde al proveedor asignado o a la administradora">Solo consulta</span>';
    return `<tr><td>${esc(f.numero_factura)}</td><td>${esc(f.proveedor_nombre)}</td><td>${localDate(f.fecha)}</td><td>${esc(f.cliente_nombre)}</td><td>${money(f.total)}</td><td><div class="actions">${actions}${isAdmin()?`<button class="danger" onclick="deleteInvoice(${f.factura_id})">Papelera</button>`:''}</div></td></tr>`;
  }).join(''):'<tr><td colspan="6">No hay facturas para mostrar.</td></tr>';
}
$('filter').oninput=renderInvoices; $('refresh').onclick=loadInvoices;
window.deleteInvoice=async id=>{if(!isAdmin()){alert('Solo un administrador puede enviar facturas a la papelera.');return;}if(!confirm('¿Enviar esta factura a la papelera? Podrás restaurarla después.'))return;const {error}=await db.rpc('mover_factura_papelera',{p_factura_id:Number(id)});if(error){alert(error.message);return;}await loadInvoices();await loadDashboard();alert('Factura enviada a la papelera. Su número y sus datos se conservaron.');};

function applyProviderAccess(){
  const select=$('provider');
  const label=select.closest('label');
  if(!select) return;
  if(isAdmin()){select.disabled=false;label?.classList.remove('assigned-provider');}
  else {
    const assigned=Number(currentProfile.provider_id||0);
    select.value=String(assigned);select.disabled=true;label?.classList.add('assigned-provider');
    if(!assigned) setMessage('formMessage','Tu cuenta todavía no tiene un proveedor asignado. Solicita al administrador que lo configure.',true);
  }
}
function resetInvoiceForm(){ $('invoiceForm').reset(); $('provider').disabled=false; $('itemRows').innerHTML=''; applyProviderAccess(); addItem(); updateTotal(); loadNextNumber(); setMessage('formMessage',''); }
async function loadNextNumber(){
  const provider=Number(isAdmin()?$('provider').value:currentProfile.provider_id);
  if(!provider){$('invoiceNumber').value='Proveedor sin asignar';return;}
  const {data,error}=await db.from('factura_contadores').select('contador_actual').eq('proveedor_id',provider).maybeSingle();
  $('invoiceNumber').value=error?'No disponible':String((data?.contador_actual??0)+1);
}
$('provider').onchange=()=>{if(isAdmin())loadNextNumber();};
function addItem(){
  const tr=document.createElement('tr');
  tr.innerHTML=`<td><input data-k="descripcion" required></td><td><input data-k="cantidad" type="number" min="1" step="1" required value="1"></td><td><input data-k="fecha_entrega" type="date" required></td><td><input data-k="cierre" required></td><td><input data-k="gramos" type="number" min="0" step=".01" required value="0"></td><td><input data-k="precio_por_gramo" type="number" min="0" step=".01" required value="0"></td><td><input data-k="kilataje"></td><td><input data-k="onzas" type="number" min="0" step=".01" value="0" required></td><td><input data-k="punto"></td><td><input data-k="precio_total" readonly value="0.00"></td><td><button type="button" class="danger">×</button></td>`;
  tr.querySelector('button').onclick=()=>{tr.remove();updateTotal();};
  tr.querySelectorAll('input').forEach(i=>i.addEventListener('input',updateTotal)); $('itemRows').appendChild(tr);
}
$('addItem').onclick=addItem;
function updateTotal(){let total=0;document.querySelectorAll('#itemRows tr').forEach(tr=>{const val=k=>Number(tr.querySelector(`[data-k="${k}"]`).value)||0;const sub=val('gramos')*val('precio_por_gramo');tr.querySelector('[data-k="precio_total"]').value=sub.toFixed(2);total+=sub;});$('grandTotal').textContent=money(total);}
$('searchClient').onclick=async()=>{
  const ced=$('clientSearch').value.trim();if(!ced)return;
  const {data,error}=await db.from('clientes').select('nombre,telefono,cedula,direccion').ilike('cedula',`%${ced}%`).limit(10);
  if(error){$('clientResults').textContent=error.message;return;}
  $('clientResults').innerHTML=(data||[]).map((c,i)=>`<div class="client-result"><span>${esc(c.cedula)} · ${esc(c.nombre)} · ${esc(c.telefono||'')}</span><button type="button" class="btn btn-outline btn-small" data-index="${i}">Seleccionar</button></div>`).join('')||'Sin coincidencias';
  $('clientResults').querySelectorAll('button').forEach(b=>b.onclick=()=>{const c=data[Number(b.dataset.index)];$('invoiceForm').elements.clienteNombre.value=c.nombre;$('invoiceForm').elements.telefono.value=c.telefono||'';$('invoiceForm').elements.cedula.value=c.cedula;$('invoiceForm').elements.clienteDireccion.value=c.direccion||'';});
};
$('invoiceForm').addEventListener('submit',async e=>{
  e.preventDefault();const form=e.currentTarget;const b=$('saveInvoice');b.disabled=true;setMessage('formMessage','Guardando factura…');
  let uploadedPath=null;
  try{
    const fd=new FormData(form), file=fd.get('fotoCedula');
    const assignedProvider=Number(isAdmin()?$('provider').value:currentProfile.provider_id);
    if(!assignedProvider) throw Error('Tu usuario no tiene un proveedor asignado. Contacta a la administradora.');
    if(!file||!file.size)throw Error('Adjunta la foto de la cédula.');
    if(!file.type.startsWith('image/'))throw Error('El archivo debe ser una imagen.');
    // El proveedor en la ruta permite que Storage aplique permisos por cuenta.
    uploadedPath=`cedulas/provider-${assignedProvider}/${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g,'_')}`;
    const up=await db.storage.from('documentos-clientes').upload(uploadedPath,file,{upsert:false,contentType:file.type}); if(up.error)throw up.error;
    const details=[...$('itemRows').querySelectorAll('tr')].map(tr=>{const o={};tr.querySelectorAll('[data-k]').forEach(i=>o[i.dataset.k]=i.value);return o;});
    if(!details.length)throw Error('Agrega al menos un detalle.');
    const payload={cliente:{nombre:fd.get('clienteNombre'),telefono:fd.get('telefono'),cedula:fd.get('cedula'),direccion:fd.get('clienteDireccion'),foto_cedula:uploadedPath},proveedor_id:assignedProvider,ruc:fd.get('ruc'),uag:fd.get('uag'),detalles:details};
    const {error}=await db.rpc('crear_factura',{p_payload:payload}); if(error)throw error;
    alert('Factura guardada correctamente.');showPage('invoices');
  }catch(err){if(uploadedPath)await db.storage.from('documentos-clientes').remove([uploadedPath]);setMessage('formMessage',err.message||'No fue posible guardar la factura.',true);}
  finally{b.disabled=false;}
});

async function loadClients(){
  $('clientRows').innerHTML='<tr><td colspan="6">Cargando…</td></tr>';
  const {data,error}=await db.from('clientes').select('cliente_id,nombre,cedula,telefono,direccion,created_at').order('cliente_id',{ascending:false});
  if(error){$('clientRows').innerHTML=`<tr><td colspan="6">${esc(error.message)}</td></tr>`;return;}
  clientRowsCache=data||[];renderClients();
}
function renderClients(){
  const term=$('clientFilter').value.toLowerCase();
  const rows=clientRowsCache.filter(c=>[c.nombre,c.cedula,c.telefono,c.direccion].join(' ').toLowerCase().includes(term));
  $('clientRows').innerHTML=rows.map(c=>`<tr>
    <td>${esc(c.nombre)}</td><td>${esc(c.cedula)}</td><td>${esc(c.telefono)}</td><td>${esc(c.direccion)}</td>
    <td>${c.created_at?new Date(c.created_at).toLocaleDateString('es-NI'):'—'}</td>
    <td><div class="client-actions"><button type="button" class="btn btn-outline btn-small client-view-button" onclick="viewClientInvoices(${Number(c.cliente_id)})">Ver factura</button></div></td>
  </tr>`).join('')||'<tr><td colspan="6">No hay clientes para mostrar.</td></tr>';
}
$('clientFilter').oninput=renderClients; $('reloadClients').onclick=loadClients;

window.viewClientInvoices = async (clientId) => {
  const client=clientRowsCache.find(c=>Number(c.cliente_id)===Number(clientId));
  if(!client){alert('No se encontró el cliente seleccionado. Actualiza el directorio e inténtalo nuevamente.');return;}
  $('clientInvoicesTitle').textContent=`Facturas de ${client.nombre}`;
  $('clientInvoicesSubtitle').textContent=`Cédula: ${client.cedula||'—'} · Teléfono: ${client.telefono||'—'}`;
  $('clientInvoiceRows').innerHTML='<tr><td colspan="5">Buscando facturas…</td></tr>';
  const dialog=$('clientInvoicesDialog');
  if(!dialog.open) dialog.showModal();
  const {data,error}=await db.from('facturas')
    .select('factura_id,numero_factura,fecha,proveedor_id,deleted_at,proveedores(nombre),detalles_factura(precio_total)')
    .eq('cliente_id',Number(clientId)).is('deleted_at',null).order('factura_id',{ascending:false});
  if(error){$('clientInvoiceRows').innerHTML=`<tr><td colspan="5">${esc(error.message)}</td></tr>`;return;}
  const rows=data||[];
  if(!rows.length){$('clientInvoiceRows').innerHTML='<tr><td colspan="5">Este cliente todavía no tiene facturas activas registradas.</td></tr>';return;}
  $('clientInvoiceRows').innerHTML=rows.map(f=>{
    const total=(f.detalles_factura||[]).reduce((sum,d)=>sum+Number(d.precio_total||0),0);
    const canView=isAdmin()||Number(f.proveedor_id)===Number(currentProfile.provider_id);
    const action=canView?`<button type="button" class="btn btn-primary btn-small" onclick="viewInvoice(${Number(f.factura_id)})">Ver factura</button>`:'<span class="muted">Solo consulta</span>';
    return `<tr><td>${esc(f.numero_factura)}</td><td>${esc(f.proveedores?.nombre||'—')}</td><td>${localDate(f.fecha)}</td><td>${money(total)}</td><td>${action}</td></tr>`;
  }).join('');
};
$('closeClientInvoices').onclick=()=> $('clientInvoicesDialog').close();
$('clientInvoicesDialog').addEventListener('click',e=>{if(e.target===$('clientInvoicesDialog'))$('clientInvoicesDialog').close();});

async function loadReports(){
  $('providerReportRows').innerHTML='<tr><td colspan="4">Cargando…</td></tr>';
  try{
    const data=await fetchInvoices();reportRowsCache=[];
    const total=data.reduce((s,f)=>s+invoiceTotal(f),0);$('reportTotal').textContent=money(total);$('reportCount').textContent=data.length.toLocaleString('es-NI');$('reportAverage').textContent=money(data.length?total/data.length:0);
    const grouped={};data.forEach(f=>{const name=f.proveedores?.nombre||'Sin proveedor';grouped[name]??={count:0,total:0};grouped[name].count++;grouped[name].total+=invoiceTotal(f);});
    reportRowsCache=Object.entries(grouped).map(([name,v])=>({name,...v,share:total?v.total/total*100:0}));
    $('providerReportRows').innerHTML=reportRowsCache.map(r=>`<tr><td>${esc(r.name)}</td><td>${r.count}</td><td>${money(r.total)}</td><td>${r.share.toFixed(1)}%</td></tr>`).join('')||'<tr><td colspan="4">Todavía no hay datos.</td></tr>';
  }catch(err){$('providerReportRows').innerHTML=`<tr><td colspan="4">${esc(err.message)}</td></tr>`;}
}
$('exportReport').onclick=()=>{
  const lines=[['Proveedor','Facturas','Total C$','Participación %'],...reportRowsCache.map(r=>[r.name,r.count,r.total.toFixed(2),r.share.toFixed(1)])];
  const csv='\uFEFF'+lines.map(row=>row.map(v=>'"'+String(v).replaceAll('"','""')+'"').join(';')).join('\r\n');
  downloadBlob(new Blob([csv],{type:'text/csv;charset=utf-8'}),`reporte-proveedores-${new Date().toISOString().slice(0,10)}.csv`);
};
function downloadBlob(blob,name){const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url);}

async function invokeAdmin(action,body){
  const options={method:action==='list'?'GET':action==='create'?'POST':'PATCH'};
  if(body)options.body=action==='reset_password'?{...body,action:'reset_password'}:body;
  const {data,error}=await db.functions.invoke('admin-users',options);
  if(error)throw error; if(data?.error)throw new Error(data.error); return data;
}
async function loadUsers(){
  $('userRows').innerHTML='<tr><td colspan="7">Cargando…</td></tr>';
  try{
    const result=await invokeAdmin('list');
    $('userRows').innerHTML=(result.users||[]).map(u=>{
      const providerOptions=PROVIDERS.map(p=>`<option value="${p.id}" ${Number(u.provider_id)===p.id?'selected':''}>${esc(p.name)}</option>`).join('');
      const roleOptions=`<option value="staff" ${u.role==='staff'?'selected':''}>Personal</option><option value="admin" ${u.role==='admin'?'selected':''}>Administrador</option>`;
      const passwordState=u.must_change_password
        ?'<span class="status-pill inactive">Debe cambiar contraseña</span>'
        :'<span class="status-pill">Contraseña actualizada</span>';
      return `<tr>
        <td>${esc(u.full_name||'—')}</td>
        <td>${esc(u.email)}</td>
        <td><select class="role-select" data-user-id="${esc(u.id)}" data-field="role">${roleOptions}</select></td>
        <td><select class="role-select provider-user-select" data-user-id="${esc(u.id)}" data-field="provider_id" ${u.role==='admin'?'disabled':''}><option value="">Sin asignar</option>${providerOptions}</select></td>
        <td>${u.last_sign_in_at?new Date(u.last_sign_in_at).toLocaleString('es-NI'):'Sin acceso'}</td>
        <td>${passwordState}</td>
        <td><span class="status-pill ${u.banned_until?'inactive':''}">${u.banned_until?'Suspendido':'Activo'}</span><button type="button" class="btn btn-outline btn-small" data-reset-user="${esc(u.id)}" data-reset-name="${esc(u.full_name||u.email)}" data-reset-email="${esc(u.email)}">Restablecer clave</button></td>
      </tr>`;
    }).join('')||'<tr><td colspan="7">No hay usuarios registrados.</td></tr>';
    $('userRows').querySelectorAll('tr').forEach(row=>{
      const roleSelect=row.querySelector('select[data-field="role"]');
      const providerSelect=row.querySelector('select[data-field="provider_id"]');
      if(roleSelect&&providerSelect){
        const syncProviderControl=()=>{providerSelect.disabled=roleSelect.value==='admin';};
        const saveAssignment=async()=>{
          const role=roleSelect.value;
          const provider_id=role==='admin'?null:Number(providerSelect.value||0);
          if(role==='staff'&&!provider_id){alert('Selecciona el proveedor asignado.');return;}
          if(!confirm('¿Guardar el rol y proveedor asignado de esta cuenta?')){await loadUsers();return;}
          try{await invokeAdmin('update',{user_id:roleSelect.dataset.userId,role,provider_id});alert('Usuario actualizado.');await loadUsers();}
          catch(e){alert(e.message);await loadUsers();}
        };
        roleSelect.addEventListener('change',()=>{syncProviderControl();if(roleSelect.value==='admin'||providerSelect.value)saveAssignment();});
        providerSelect.addEventListener('change',saveAssignment);
        syncProviderControl();
      }
      row.querySelector('[data-reset-user]')?.addEventListener('click',()=>{
        const button=row.querySelector('[data-reset-user]');
        $('resetTempPasswordForm').reset();
        $('resetTargetUserId').value=button.dataset.resetUser;
        $('resetTargetUserEmail').value=button.dataset.resetEmail;
        $('resetTargetUserLabel').textContent=`${button.dataset.resetName} · ${button.dataset.resetEmail}`;
        $('resetPasswordError').textContent='';
        $('resetPasswordDialog').showModal();
      });
    });
  }catch(err){$('userRows').innerHTML=`<tr><td colspan="7">${esc(err.message)}<br><small>Verifica que la función admin-users esté desplegada y que tu cuenta tenga rol administrador.</small></td></tr>`;}
}
$('reloadUsers').onclick=loadUsers;
$('newUserRole').addEventListener('change',()=>{const admin=$('newUserRole').value==='admin';$('newUserProviderWrap').classList.toggle('hidden',admin);$('newUserProvider').required=!admin;});
$('newUserRole').dispatchEvent(new Event('change'));
$('userForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.currentTarget;
  const button = $('createUserBtn');
  button.disabled = true;
  setMessage('userMessage', 'Creando usuario…');
  try {
    const formData = new FormData(form);
    const role = formData.get('role');
    const email = String(formData.get('email')||'').trim().toLowerCase();
    const temporaryPassword = String(formData.get('password')||'');
    const request = {
      email,
      password: temporaryPassword,
      full_name: formData.get('full_name'),
      role,
      provider_id: role === 'admin' ? null : Number(formData.get('provider_id')),
    };
    await invokeAdmin('create', request);
    form.reset();
    $('newUserRole').dispatchEvent(new Event('change'));
    $('createdCredentialEmail').textContent=email;
    $('createdCredentialPassword').value=temporaryPassword;
    $('createdCredentials').classList.remove('hidden');
    setMessage('userMessage', 'Usuario creado. Comparte esta contraseña temporal por un canal seguro; deberá cambiarla al entrar por primera vez.');
    await loadUsers();
  } catch (err) {
    setMessage('userMessage', err?.message || 'No fue posible crear el usuario.', true);
  } finally {
    button.disabled = false;
  }
});
$('copyCreatedCredentials').onclick=async()=>{
  const value=`Usuario: ${$('createdCredentialEmail').textContent}\nContraseña temporal: ${$('createdCredentialPassword').value}`;
  try{await navigator.clipboard.writeText(value);setMessage('createdCredentialMessage','Credenciales copiadas. Envíalas por un canal seguro.');}
  catch(_e){setMessage('createdCredentialMessage','No se pudo copiar automáticamente. Puedes seleccionar los datos manualmente.',true);}
};
$('dismissCreatedCredentials').onclick=()=>{
  $('createdCredentialPassword').value='';
  $('createdCredentialEmail').textContent='';
  $('createdCredentials').classList.add('hidden');
  setMessage('createdCredentialMessage','');
};
$('resetTempPasswordForm').addEventListener('submit',async(e)=>{
  e.preventDefault();
  const form=e.currentTarget;
  const button=$('saveResetPassword');
  const userId=$('resetTargetUserId').value;
  const temporaryPassword=$('resetTemporaryPassword').value;
  if(temporaryPassword.length<8){$('resetPasswordError').textContent='La contraseña debe tener al menos 8 caracteres.';return;}
  button.disabled=true;$('resetPasswordError').textContent='Actualizando contraseña…';
  try{
    await invokeAdmin('reset_password',{user_id:userId,temporary_password:temporaryPassword});
    $('resetPasswordDialog').close();
    $('createdCredentialEmail').textContent=$('resetTargetUserEmail').value;
    $('createdCredentialPassword').value=temporaryPassword;
    $('createdCredentials').classList.remove('hidden');
    setMessage('createdCredentialMessage','Contraseña temporal restablecida. El usuario deberá cambiarla al iniciar sesión.');
    await loadUsers();
  }catch(err){$('resetPasswordError').textContent=err?.message||'No se pudo restablecer la contraseña.';}
  finally{button.disabled=false;}
});
$('cancelResetPassword').onclick=()=>$('resetPasswordDialog').close();


async function loadTrash(){
  $('trashRows').innerHTML='<tr><td colspan="6">Cargando papelera…</td></tr>';
  setMessage('trashMessage','');
  const {data,error}=await db.from('facturas').select('factura_id,numero_factura,fecha,deleted_at,proveedor_id,proveedores(nombre),clientes(nombre)').not('deleted_at','is',null).order('deleted_at',{ascending:false});
  if(error){$('trashRows').innerHTML=`<tr><td colspan="6">${esc(error.message)}</td></tr>`;return;}
  $('trashRows').innerHTML=(data||[]).map(f=>`<tr><td>${esc(f.numero_factura)}</td><td>${esc(f.proveedores?.nombre)}</td><td>${localDate(f.fecha)}</td><td>${esc(f.clientes?.nombre)}</td><td>${f.deleted_at?new Date(f.deleted_at).toLocaleString('es-NI'):'—'}</td><td><div class="actions"><button class="btn btn-primary btn-small" onclick="restoreInvoice(${f.factura_id})">Restaurar</button><button class="btn btn-outline btn-small" onclick="printInvoice(${f.factura_id})">Imprimir</button></div></td></tr>`).join('')||'<tr><td colspan="6">La papelera está vacía.</td></tr>';
}
$('reloadTrash').onclick=loadTrash;
window.restoreInvoice=async id=>{
  if(!isAdmin()){alert('Solo una administradora puede restaurar facturas.');return;}
  if(!confirm('¿Restaurar esta factura? Volverá al listado activo con el mismo número.'))return;
  const {error}=await db.rpc('restaurar_factura',{p_factura_id:Number(id)});
  if(error){alert(error.message);return;}
  setMessage('trashMessage','Factura restaurada correctamente.');
  await loadTrash();await loadInvoices();await loadDashboard();
};

$('createBackup').onclick=async()=>{
  const btn=$('createBackup');btn.disabled=true;setMessage('backupMessage','Preparando respaldo…');
  try{
    if(!window.JSZip)throw new Error('No se pudo cargar el componente de archivos ZIP.');
    const zip=new JSZip();
    const tables=['profiles','proveedores','factura_contadores','clientes','facturas','detalles_factura'];
    const backup={application:'JGGOLDNICSA',generated_at:new Date().toISOString(),generated_by:currentUser.email,tables:{},notes:'Incluye datos de las tablas y, cuando se descargan correctamente, las fotografías privadas de cédulas en la carpeta fotos_cedula.'};
    for(const table of tables){setMessage('backupMessage',`Respaldando ${table}…`);const {data,error}=await db.from(table).select('*');if(error)throw error;backup.tables[table]=data||[];}
    zip.file('respaldo-datos.json',JSON.stringify(backup,null,2));
    const clients=backup.tables.clientes||[];let photosDone=0,photosSkipped=0;
    for(let i=0;i<clients.length;i++){
      const path=clients[i].foto_cedula;if(!path)continue;
      setMessage('backupMessage',`Descargando fotografías ${i+1} de ${clients.length}…`);
      try{const {data,error}=await db.storage.from('documentos-clientes').createSignedUrl(path,180);if(error||!data?.signedUrl)throw error||new Error('URL no disponible');const res=await fetch(data.signedUrl);if(!res.ok)throw new Error('Descarga no disponible');const blob=await res.blob();const ext=(path.split('.').pop()||'jpg').replace(/[^a-z0-9]/gi,'');zip.file(`fotos_cedula/${String(i+1).padStart(4,'0')}-${clients[i].cliente_id}.${ext}`,blob);photosDone++;}
      catch(e){photosSkipped++;}
    }
    zip.file('LEEME.txt',`RESPALDO JGGOLDNICSA\nFecha: ${new Date().toLocaleString('es-NI')}\nRegistros incluidos: ${tables.map(t=>`${t}: ${(backup.tables[t]||[]).length}`).join(', ')}\nFotos descargadas: ${photosDone}\nFotos omitidas: ${photosSkipped}\n\nContiene información confidencial y fotografías de identificación. Mantenga este archivo protegido. Este archivo es una exportación; no restaura automáticamente una base de datos.`);
    setMessage('backupMessage','Comprimiendo archivo…');const blob=await zip.generateAsync({type:'blob',compression:'DEFLATE',compressionOptions:{level:5}});
    downloadBlob(blob,`JGGOLDNICSA-respaldo-${new Date().toISOString().replace(/[:.]/g,'-')}.zip`);
    setMessage('backupMessage',`Respaldo descargado. Fotos incluidas: ${photosDone}; omitidas: ${photosSkipped}.`);
  }catch(err){setMessage('backupMessage',err.message||'No se pudo crear el respaldo.',true);}
  finally{btn.disabled=false;}
};

async function renderInvoiceDocument(id, autoPrint=true){
  const {data:f,error}=await db.from('facturas')
    .select('*,clientes(*),proveedores(nombre),detalles_factura(*)')
    .eq('factura_id',id).single();
  if(error){alert(error.message);return;}

  // La fotografía de cédula permanece en Storage privado y se consulta con URL firmada.
  let photo='';
  if(f.clientes?.foto_cedula){
    const {data,error:photoError}=await db.storage.from('documentos-clientes')
      .createSignedUrl(f.clientes.foto_cedula,120);
    if(!photoError) photo=data?.signedUrl||'';
  }

  const details=f.detalles_factura||[];
  const total=details.reduce((sum,d)=>sum+Number(d.precio_total||0),0);
  const totalGramos=details.reduce((sum,d)=>sum+Number(d.gramos||0),0);

  $('printArea').innerHTML=`
    <style>
      .rg-print{max-width:1080px;margin:20px auto;padding:30px 34px;background:#fff;color:#182a3b;
        font-family:Arial,Helvetica,sans-serif;border:1px solid #e7dfd1;box-shadow:0 8px 30px #14283b12}
      .rg-print *{box-sizing:border-box}
      .rg-print-head{display:grid;grid-template-columns:118px 1fr auto;gap:20px;align-items:center;
        border-bottom:3px solid #c49a4a;padding-bottom:18px}
      .rg-print-logo{width:112px;height:112px;object-fit:contain;border-radius:8px}
      .rg-print-brand{text-align:center}
      .rg-print-brand h1{font-family:Georgia,serif;font-size:27px;letter-spacing:2px;margin:0;color:#14283b}
      .rg-print-brand .company{font-size:10px;font-weight:700;letter-spacing:1px;margin:7px 0;color:#8b672d}
      .rg-print-brand p{font-size:10px;line-height:1.5;margin:3px 0;color:#455366}
      .rg-print-title{text-align:right;min-width:145px}
      .rg-print-title strong{display:block;font-family:Georgia,serif;font-size:20px;color:#14283b;letter-spacing:1px}
      .rg-print-title span{display:block;margin-top:8px;font-size:12px;color:#8b672d;font-weight:700}
      .rg-print-title small{display:block;margin-top:5px;color:#64748b;font-size:11px}
      .rg-print-client{display:grid;grid-template-columns:1fr 160px;gap:18px;margin:20px 0;padding:16px 18px;
        border:1px solid #e7dfd1;border-left:4px solid #c49a4a;border-radius:8px;background:#fcfbf8}
      .rg-print h2{font-family:Georgia,serif;font-size:16px;margin:0 0 12px;color:#14283b}
      .rg-client-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px 22px}
      .rg-client-grid p{margin:0;font-size:12px;color:#334155}
      .rg-client-grid b{color:#14283b}
      .rg-print-photo{width:150px;height:118px;object-fit:contain;border:1px solid #d9d4ca;border-radius:6px;background:white}
      .rg-no-photo{width:150px;height:118px;display:grid;place-items:center;border:1px dashed #c8c0b2;border-radius:6px;color:#788393;font-size:11px}
      .rg-section-title{display:flex;align-items:end;justify-content:space-between;margin:18px 0 9px}
      .rg-section-title h2{margin:0}
      .rg-section-title span{font-size:10px;color:#64748b}
      .rg-print-table{width:100%;border-collapse:collapse;table-layout:auto;font-size:10px}
      .rg-print-table th{background:#14283b;color:#fff;padding:9px 6px;border:1px solid #14283b;text-align:center;font-weight:700}
      .rg-print-table td{padding:8px 5px;border:1px solid #dedbd4;text-align:center;color:#263445;white-space:normal}
      .rg-print-table tbody tr:nth-child(even){background:#faf8f3}
      .rg-print-table tfoot td{background:#f4efe4;font-weight:700;color:#14283b}
      .rg-print-table .money{text-align:right;white-space:nowrap}
      .rg-print-totals{display:flex;justify-content:flex-end;gap:22px;flex-wrap:wrap;margin:12px 0 0;font-size:11px;color:#475569}
      .rg-print-totals strong{color:#14283b}
      .rg-print-grand{display:flex;justify-content:flex-end;align-items:center;gap:18px;margin:14px 0 20px;
        padding:13px 16px;background:#f5f0e6;border:1px solid #e6d8bd;border-radius:7px}
      .rg-print-grand span{font-size:12px;font-weight:700;color:#59472a;letter-spacing:.7px}
      .rg-print-grand strong{font-family:Georgia,serif;font-size:23px;color:#14283b}
      .rg-print-legal{padding:12px 14px;border-top:1px solid #e4ded3;border-bottom:1px solid #e4ded3;
        font-size:10px;line-height:1.55;color:#586474;text-align:justify}
      .rg-signatures{display:grid;grid-template-columns:1fr 1fr;gap:70px;margin:48px 22px 16px;text-align:center}
      .rg-signatures div{border-top:1px solid #64748b;padding-top:8px;font-size:10px;font-weight:700;letter-spacing:1px;color:#14283b}
      .rg-print-thanks{text-align:center;margin-top:22px;color:#98702f;font-family:Georgia,serif;font-weight:700;letter-spacing:1px}
      .rg-print-footer{text-align:center;margin-top:15px;padding-top:10px;border-top:1px solid #e6e0d5;color:#7b8490;font-size:9px;letter-spacing:.4px}
      .rg-print-button{display:block;margin:18px auto 0;background:#14283b;color:#fff;border:0;border-radius:6px;padding:10px 18px;font-weight:700;cursor:pointer}
      @page{size:landscape;margin:10mm}
      @media print{body{background:#fff!important}.rg-print{max-width:none;margin:0;padding:0;border:0;box-shadow:none}
        .rg-print-button{display:none!important}.rg-print-head{grid-template-columns:95px 1fr auto;gap:12px;padding-bottom:10px}
        .rg-print-logo{width:90px;height:90px}.rg-print-brand h1{font-size:23px}.rg-print-client{margin:12px 0;padding:10px 12px}
        .rg-print-table{font-size:9px}.rg-print-table th,.rg-print-table td{padding:6px 4px}
        .rg-signatures{margin-top:32px}.rg-print-legal{font-size:9px}}
      @media screen and (max-width:760px){.rg-print{padding:16px}.rg-print-head{grid-template-columns:70px 1fr}.rg-print-logo{width:68px;height:68px}
        .rg-print-title{grid-column:1/-1;text-align:center}.rg-print-client{grid-template-columns:1fr}.rg-client-grid{grid-template-columns:1fr}
        .rg-print-table{font-size:9px}.rg-print-table th,.rg-print-table td{padding:5px 3px}}
    </style>
    <article class="rg-print">
      <header class="rg-print-head">
        <img class="rg-print-logo" src="imagenes/logo.JPG" alt="River Gold - Julio Ríos">
        <div class="rg-print-brand">
          <h1>RIVER GOLD</h1>
          <p class="company">INVESTMENTS RIOS BRACKEIT GOLD NICARAGUA S.A.</p>
          <p><b>RUC:</b> ${esc(f.ruc)} &nbsp; <b>UAF:</b> ${esc(f.uag)}</p>
          <p><b>Teléfonos:</b> Tigo: 83785672 · Claro: 82265246 / 77473771</p>
          <p><b>Dirección:</b> Colonia Máximo Jerez, de Yantaza 3 andenes al norte.</p>
        </div>
        <div class="rg-print-title">
          <strong>RECIBO DE PAGO</strong>
          <span>N.º ${esc(f.numero_factura)}</span>
          <small>Fecha: ${localDate(f.fecha)}</small>
          <small>Proveedor: ${esc(f.proveedores?.nombre||'')}</small>
        </div>
      </header>

      <section class="rg-print-client">
        <div>
          <h2>Datos del cliente</h2>
          <div class="rg-client-grid">
            <p><b>Cliente:</b> ${esc(f.clientes?.nombre||'')}</p>
            <p><b>Identidad:</b> ${esc(f.clientes?.cedula||'')}</p>
            <p><b>Teléfono:</b> ${esc(f.clientes?.telefono||'')}</p>
            <p><b>Dirección:</b> ${esc(f.clientes?.direccion||'')}</p>
          </div>
        </div>
        <div>${photo?`<img class="rg-print-photo" src="${photo}" alt="Fotografía de cédula del cliente">`:`<div class="rg-no-photo">Fotografía no disponible</div>`}</div>
      </section>

      <div class="rg-section-title"><h2>Detalle del material recibido</h2><span>Valores expresados en córdobas (C$)</span></div>
      <table class="rg-print-table">
        <thead><tr>
          <th>Kilataje</th><th>Descripción</th><th>P. x gramo</th><th>P. Neto</th><th>Importe</th>
        </tr></thead>
        <tbody>${details.map(d=>`<tr>
          <td>${esc(d.kilataje)}</td>
          <td>${esc(d.descripcion)}</td>
          <td class="money">${money(d.precio_por_gramo)}</td>
          <td>${Number(d.gramos||0).toFixed(2)}</td>
          <td class="money">${money(d.precio_total)}</td>
        </tr>`).join('')}</tbody>
        <tfoot><tr>
          <td colspan="3">TOTALES</td>
          <td>${totalGramos.toFixed(2)}</td>
          <td class="money">${money(total)}</td>
        </tr></tfoot>
      </table>

      <div class="rg-print-grand"><span>IMPORTE TOTAL DEL RECIBO</span><strong>${money(total)}</strong></div>
      <div class="rg-print-legal"><b>DECLARACIÓN DE PERTENENCIA:</b> La persona cuyos datos se encuentran en este comprobante declara ser la legítima propietaria del material descrito y asume la responsabilidad correspondiente sobre su procedencia.</div>
      <div class="rg-signatures"><div>RECIBÍ CONFORME</div><div>ENTREGUÉ CONFORME</div></div>
      <div class="rg-print-thanks">¡Gracias por su confianza!</div>
      <footer class="rg-print-footer">Desarrollado por Nayely Rubí Miranda · © 2026 INVESTMENTS RIOS BRACKEIT GOLD NICARAGUA S.A. · Todos los derechos reservados.</footer>
      <div class="rg-screen-only" style="display:flex;justify-content:center;gap:10px;flex-wrap:wrap;margin-top:18px">
        <button class="rg-print-button" onclick="window.print()">Imprimir recibo</button>
        <button class="rg-print-button" style="background:#e9edf1;color:#14283b" onclick="window.closeInvoicePreview()">Volver al sistema</button>
      </div>
    </article>`;

  invoicePreviewReturnPage=currentPage;
  $('printArea').classList.remove('hidden');
  $('app').classList.add('hidden');
  // Esperar a que las imágenes estén listas antes de mostrar o imprimir el recibo.
  const images=[...$('printArea').querySelectorAll('img')];
  await Promise.all(images.map(img=>img.decode?img.decode().catch(()=>{}):new Promise(resolve=>{img.onload=resolve;img.onerror=resolve;})));
  if(autoPrint){
    window.print();
    window.onafterprint=()=>window.closeInvoicePreview();
  }
}
window.printInvoice=async id=>renderInvoiceDocument(id,true);
window.viewInvoice=async id=>{
  $('clientInvoicesDialog')?.close();
  return renderInvoiceDocument(id,false);
};
window.closeInvoicePreview=()=>{
  $('printArea').classList.add('hidden');
  $('app').classList.remove('hidden');
  const target=invoicePreviewReturnPage||'clients';
  showPage(target);
};

init();
