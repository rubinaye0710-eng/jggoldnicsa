const { createClient } = supabase;
const db = createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
const $ = (id) => document.getElementById(id);
let currentUser = null;
let currentProfile = { role: 'staff', full_name: '' };
let invoices = [];
let clientRowsCache = [];
let reportRowsCache = [];
const PAGE_TITLES = { dashboard:'Resumen general', invoices:'Facturas', new:'Nueva factura', clients:'Clientes', reports:'Reportes', users:'Usuarios y accesos', backup:'Respaldos' };
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
  $('login').classList.add('hidden'); $('app').classList.remove('hidden');
  $('todayLabel').textContent=new Date().toLocaleDateString('es-NI',{day:'2-digit',month:'short',year:'numeric'});
  await loadProfile();
  showPage('dashboard');
}
async function loadProfile(){
  const {data,error}=await db.from('profiles').select('full_name,role').eq('id',currentUser.id).maybeSingle();
  if(error || !data){ currentProfile={role:'staff',full_name:currentUser.email?.split('@')[0]||'Usuario'}; $('profileNotice').textContent='No se encontró el perfil de acceso. Solicita al administrador completar la configuración de roles en Supabase.'; $('profileNotice').classList.remove('hidden'); }
  else {currentProfile=data; $('profileNotice').classList.add('hidden');}
  const displayName=currentProfile.full_name||currentUser.email||'Usuario';
  $('userName').textContent=displayName; $('userRole').textContent=isAdmin()?'Administrador':'Personal'; $('userAvatar').textContent=initials(displayName);
  document.querySelectorAll('.admin-only').forEach(el=>el.classList.toggle('hidden',!isAdmin()));
  document.querySelector('.admin-label').classList.toggle('hidden',!isAdmin());
}
function showPage(page){
  if(['users','backup'].includes(page) && !isAdmin()){alert('Esta sección está disponible únicamente para administradores.');page='dashboard';}
  document.querySelectorAll('.page-section').forEach(s=>s.classList.add('hidden'));
  const map={dashboard:'dashboardPage',invoices:'invoicePage',new:'newPage',clients:'clientsPage',reports:'reportsPage',users:'usersPage',backup:'backupPage'};
  $(map[page]).classList.remove('hidden');
  $('pageTitle').textContent=PAGE_TITLES[page]||'RIVER GOLD';
  document.querySelectorAll('.nav').forEach(b=>b.classList.toggle('active',b.dataset.page===page));
  $('app').classList.remove('menu-open');
  if(page==='dashboard') loadDashboard();
  if(page==='invoices') loadInvoices();
  if(page==='new') resetInvoiceForm();
  if(page==='clients') loadClients();
  if(page==='reports') loadReports();
  if(page==='users') loadUsers();
}
async function logout(){await db.auth.signOut();currentUser=null;$('app').classList.add('hidden');$('login').classList.remove('hidden');$('loginForm').reset();}
$('loginForm').addEventListener('submit',async e=>{
  e.preventDefault();$('loginError').textContent='Validando acceso…';
  const {data,error}=await db.auth.signInWithPassword({email:$('email').value,password:$('password').value});
  if(error){$('loginError').textContent='No fue posible iniciar sesión. Verifica el correo y la contraseña.';return;}
  $('loginError').textContent=''; await enter(data.user);
});
$('logout').onclick=logout;
document.querySelectorAll('[data-page]').forEach(b=>b.addEventListener('click',()=>showPage(b.dataset.page)));
$('menu').onclick=()=>$('app').classList.toggle('menu-open');
$('dashboardNew').onclick=()=>showPage('new'); $('goNew').onclick=()=>showPage('new'); $('cancel').onclick=()=>showPage('invoices');

async function fetchInvoices(){
  const {data,error}=await db.from('facturas').select('factura_id,numero_factura,fecha,ruc,uag,proveedor_id,proveedores(nombre),clientes(cliente_id,nombre,cedula),detalles_factura(detalle_id,precio_total,gramos,onzas)').order('factura_id',{ascending:false});
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

async function loadInvoices(){
  $('invoiceRows').innerHTML='<tr><td colspan="5">Cargando…</td></tr>';
  try{invoices=await fetchInvoices();renderInvoices();}
  catch(error){$('invoiceRows').innerHTML=`<tr><td colspan="5">${esc(error.message)}</td></tr>`;}
}
function renderInvoices(){
  const term=$('filter').value.toLowerCase();
  const rows=invoices.filter(f=>[f.numero_factura,f.proveedores?.nombre,f.clientes?.nombre,f.fecha].join(' ').toLowerCase().includes(term));
  $('invoiceRows').innerHTML=rows.length?rows.map(f=>`<tr><td>${esc(f.numero_factura)}</td><td>${esc(f.proveedores?.nombre)}</td><td>${localDate(f.fecha)}</td><td>${esc(f.clientes?.nombre)}</td><td><div class="actions"><button class="btn btn-outline btn-small" onclick="printInvoice(${f.factura_id})">Imprimir</button>${isAdmin()?`<button class="danger" onclick="deleteInvoice(${f.factura_id})">Eliminar</button>`:''}</div></td></tr>`).join(''):'<tr><td colspan="5">No hay facturas para mostrar.</td></tr>';
}
$('filter').oninput=renderInvoices; $('refresh').onclick=loadInvoices;
window.deleteInvoice=async id=>{if(!isAdmin()){alert('Solo un administrador puede eliminar facturas.');return;}if(!confirm('¿Eliminar esta factura? Esta acción no se puede deshacer.'))return;const {error}=await db.from('facturas').delete().eq('factura_id',id);if(error)alert(error.message);else{await loadInvoices();await loadDashboard();}};

function resetInvoiceForm(){ $('invoiceForm').reset(); $('itemRows').innerHTML=''; addItem(); updateTotal(); loadNextNumber(); setMessage('formMessage',''); }
async function loadNextNumber(){
  const provider=Number($('provider').value);
  const {data,error}=await db.from('factura_contadores').select('contador_actual').eq('proveedor_id',provider).maybeSingle();
  $('invoiceNumber').value=error?'No disponible':String((data?.contador_actual??0)+1);
}
$('provider').onchange=loadNextNumber;
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
    if(!file||!file.size)throw Error('Adjunta la foto de la cédula.');
    if(!file.type.startsWith('image/'))throw Error('El archivo debe ser una imagen.');
    uploadedPath=`cedulas/${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g,'_')}`;
    const up=await db.storage.from('documentos-clientes').upload(uploadedPath,file,{upsert:false,contentType:file.type}); if(up.error)throw up.error;
    const details=[...$('itemRows').querySelectorAll('tr')].map(tr=>{const o={};tr.querySelectorAll('[data-k]').forEach(i=>o[i.dataset.k]=i.value);return o;});
    if(!details.length)throw Error('Agrega al menos un detalle.');
    const payload={cliente:{nombre:fd.get('clienteNombre'),telefono:fd.get('telefono'),cedula:fd.get('cedula'),direccion:fd.get('clienteDireccion'),foto_cedula:uploadedPath},proveedor_id:Number(fd.get('proveedor')),ruc:fd.get('ruc'),uag:fd.get('uag'),detalles:details};
    const {error}=await db.rpc('crear_factura',{p_payload:payload}); if(error)throw error;
    alert('Factura guardada correctamente.');showPage('invoices');
  }catch(err){if(uploadedPath)await db.storage.from('documentos-clientes').remove([uploadedPath]);setMessage('formMessage',err.message||'No fue posible guardar la factura.',true);}
  finally{b.disabled=false;}
});

async function loadClients(){
  $('clientRows').innerHTML='<tr><td colspan="5">Cargando…</td></tr>';
  const {data,error}=await db.from('clientes').select('cliente_id,nombre,cedula,telefono,direccion,created_at').order('cliente_id',{ascending:false});
  if(error){$('clientRows').innerHTML=`<tr><td colspan="5">${esc(error.message)}</td></tr>`;return;}
  clientRowsCache=data||[];renderClients();
}
function renderClients(){const term=$('clientFilter').value.toLowerCase();const rows=clientRowsCache.filter(c=>[c.nombre,c.cedula,c.telefono,c.direccion].join(' ').toLowerCase().includes(term));$('clientRows').innerHTML=rows.map(c=>`<tr><td>${esc(c.nombre)}</td><td>${esc(c.cedula)}</td><td>${esc(c.telefono)}</td><td>${esc(c.direccion)}</td><td>${c.created_at?new Date(c.created_at).toLocaleDateString('es-NI'):'—'}</td></tr>`).join('')||'<tr><td colspan="5">No hay clientes para mostrar.</td></tr>';}
$('clientFilter').oninput=renderClients; $('reloadClients').onclick=loadClients;

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
  if(body)options.body=body;
  const {data,error}=await db.functions.invoke('admin-users',options);
  if(error)throw error; if(data?.error)throw new Error(data.error); return data;
}
async function loadUsers(){
  $('userRows').innerHTML='<tr><td colspan="5">Cargando…</td></tr>';
  try{
    const result=await invokeAdmin('list');
    $('userRows').innerHTML=(result.users||[]).map(u=>`<tr><td>${esc(u.full_name||'—')}</td><td>${esc(u.email)}</td><td><select class="role-select" data-user-id="${esc(u.id)}"><option value="staff" ${u.role==='staff'?'selected':''}>Personal</option><option value="admin" ${u.role==='admin'?'selected':''}>Administrador</option></select></td><td>${u.last_sign_in_at?new Date(u.last_sign_in_at).toLocaleString('es-NI'):'Sin acceso'}</td><td><span class="status-pill ${u.banned_until?'inactive':''}">${u.banned_until?'Suspendido':'Activo'}</span></td></tr>`).join('')||'<tr><td colspan="5">No hay usuarios registrados.</td></tr>';
    $('userRows').querySelectorAll('select').forEach(sel=>sel.onchange=async()=>{if(!confirm('¿Cambiar el rol de este usuario?')){await loadUsers();return;}try{await invokeAdmin('update',{user_id:sel.dataset.userId,role:sel.value});alert('Rol actualizado.');}catch(e){alert(e.message);await loadUsers();}});
  }catch(err){$('userRows').innerHTML=`<tr><td colspan="5">${esc(err.message)}<br><small>Verifica que la función admin-users esté desplegada y que tu cuenta tenga rol administrador.</small></td></tr>`;}
}
$('reloadUsers').onclick=loadUsers;
$('userForm').addEventListener('submit',async e=>{
  e.preventDefault();const b=$('createUserBtn');b.disabled=true;setMessage('userMessage','Creando usuario…');
  try{const fd=new FormData(e.currentTarget);await invokeAdmin('create',{email:fd.get('email'),password:fd.get('password'),full_name:fd.get('full_name'),role:fd.get('role')});e.currentTarget.reset();setMessage('userMessage','Usuario creado correctamente.');await loadUsers();}
  catch(err){setMessage('userMessage',err.message,true);}
  finally{b.disabled=false;}
});

$('createBackup').onclick=async()=>{
  const btn=$('createBackup');btn.disabled=true;setMessage('backupMessage','Preparando respaldo…');
  try{
    if(!window.JSZip)throw new Error('No se pudo cargar el componente de archivos ZIP.');
    const zip=new JSZip();
    const tables=['proveedores','factura_contadores','clientes','facturas','detalles_factura'];
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

window.printInvoice=async id=>{
  const {data:f,error}=await db.from('facturas').select('*,clientes(*),proveedores(nombre),detalles_factura(*)').eq('factura_id',id).single();
  if(error){alert(error.message);return;}
  let photo='';if(f.clientes.foto_cedula){const {data}=await db.storage.from('documentos-clientes').createSignedUrl(f.clientes.foto_cedula,120);photo=data?.signedUrl||'';}
  const details=f.detalles_factura||[];const total=details.reduce((a,d)=>a+Number(d.precio_total||0),0);
  $('printArea').innerHTML=`<article class="print-sheet"><div class="print-head"><img src="imagenes/logo.JPG"><div class="center"><b>INVESTMENTS RIOS BRACKEIT GOLD NICARAGUA S.A.</b><p>RUC: ${esc(f.ruc)} &nbsp; UAF: ${esc(f.uag)}</p><p>Proveedor: ${esc(f.proveedores.nombre)} &nbsp; Factura Nº ${esc(f.numero_factura)}</p><p>Teléfonos: Tigo: 83785672 · Claro: 82265246 / 77473771</p><p>Dirección: Colonia Maximo Jerez de Yantaza 3 andenes al norte.</p><b>COMPROBANTE DE COMPRA DE MATERIAL</b></div></div><p style="text-align:right">Fecha: ${localDate(f.fecha)}</p><hr><div class="print-client"><div><h2>Detalles del Proveedor</h2><p>Cédula: ${esc(f.clientes.cedula)}</p><p>Nombre: ${esc(f.clientes.nombre)}</p><p>Teléfono: ${esc(f.clientes.telefono)}</p><p>Dirección: ${esc(f.clientes.direccion)}</p></div>${photo?`<img src="${photo}">`:''}</div><hr><h2>Detalles del Producto</h2><table><thead><tr><th>Descripción</th><th>Cantidad</th><th>Fecha entrega</th><th>Cierre</th><th>Gramos</th><th>Precio x G</th><th>Kilataje</th><th>Onzas netas</th><th>Punto</th><th>Subtotal</th></tr></thead><tbody>${details.map(d=>`<tr><td>${esc(d.descripcion)}</td><td>${esc(d.cantidad)}</td><td>${localDate(d.fecha_entrega)}</td><td>${esc(d.cierre)}</td><td>${esc(d.gramos)}</td><td>${esc(d.precio_por_gramo)}</td><td>${esc(d.kilataje)}</td><td>${esc(d.onzas)}</td><td>${esc(d.punto)}</td><td>${money(d.precio_total)}</td></tr>`).join('')}</tbody><tfoot><tr><th colspan="9">TOTAL VENTA</th><th>${money(total)}</th></tr></tfoot></table><div class="print-footer"><p><b>DECLARACIÓN JURADA DE PERTENENCIA:</b><br>La persona cuyos datos se encuentran en la parte superior declara bajo juramento que es el único y legítimo propietario de los bienes descritos y asumirá la responsabilidad correspondiente frente a terceros y autoridades competentes.</p><p>ACEPTACIÓN: Al firmar este recibo, el vendedor declara estar conforme con la descripción y el monto pagado por los artículos vendidos.</p><p>COMPRADOR: ____________________ &nbsp; VENDEDOR: ____________________<br>N.º DE CÉDULA: ____________________</p><b>¡Gracias por su compra!</b></div><button class="print-button" onclick="window.print()">Imprimir factura</button></article>`;
  $('printArea').classList.remove('hidden');$('app').classList.add('hidden');window.print();window.onafterprint=()=>{$('printArea').classList.add('hidden');$('app').classList.remove('hidden');};
};

init();
