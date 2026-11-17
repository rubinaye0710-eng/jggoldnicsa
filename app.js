const { createClient } = supabase;
const db = createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
const $ = (id) => document.getElementById(id);
let providers = [], invoices = [];
const money = n => 'C$ ' + Number(n || 0).toLocaleString('es-NI',{minimumFractionDigits:2,maximumFractionDigits:2});
const esc = s => String(s ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function msg(t){$('formMessage').textContent=t}
function showPage(page){
 $('invoicePage').classList.toggle('hidden',page!=='invoices'); $('newPage').classList.toggle('hidden',page!=='new');
 $('pageTitle').textContent=page==='new'?'Crear factura':'Facturas';
 document.querySelectorAll('.nav').forEach(b=>b.classList.toggle('active',b.dataset.page===page));
 if(page==='invoices') loadInvoices();
 if(page==='new'){ $('invoiceForm').reset(); $('itemRows').innerHTML=''; addItem(); updateTotal(); loadNextNumber(); msg('');}
}
async function init(){
 if(!window.SUPABASE_URL || window.SUPABASE_URL.includes('TU-PROYECTO')){$('loginError').textContent='Configura config.js con las credenciales de Supabase.';return;}
 const {data:{session}}=await db.auth.getSession(); if(session) enter(session.user);
}
function enter(user){$('login').classList.add('hidden');$('app').classList.remove('hidden');$('userEmail').textContent=user.email||'';showPage('invoices');}
$('loginForm').addEventListener('submit',async e=>{e.preventDefault();$('loginError').textContent='Validando…';const {data,error}=await db.auth.signInWithPassword({email:$('email').value,password:$('password').value});if(error){$('loginError').textContent=error.message;return;}enter(data.user);});
$('logout').onclick=async()=>{await db.auth.signOut();$('app').classList.add('hidden');$('login').classList.remove('hidden');};
document.querySelectorAll('.nav').forEach(b=>b.onclick=()=>showPage(b.dataset.page));
$('goNew').onclick=()=>showPage('new');$('cancel').onclick=()=>showPage('invoices');
$('menu').onclick=()=>$('app').classList.toggle('menu-open');
$('refresh').onclick=loadInvoices;$('filter').oninput=renderInvoices;
async function loadInvoices(){
 $('invoiceRows').innerHTML='<tr><td colspan="5">Cargando…</td></tr>';
 const {data,error}=await db.from('facturas').select('factura_id,numero_factura,fecha,proveedores(nombre),clientes(nombre)').order('factura_id',{ascending:false});
 if(error){$('invoiceRows').innerHTML=`<tr><td colspan="5">${esc(error.message)}</td></tr>`;return;}
 invoices=data||[];renderInvoices();
}
function renderInvoices(){
 const term=$('filter').value.toLowerCase();
 const rows=invoices.filter(f=>[f.numero_factura,f.proveedores?.nombre,f.clientes?.nombre,f.fecha].join(' ').toLowerCase().includes(term));
 $('invoiceRows').innerHTML=rows.length?rows.map(f=>`<tr><td>${esc(f.numero_factura)}</td><td>${esc(f.proveedores?.nombre)}</td><td>${esc(f.fecha)}</td><td>${esc(f.clientes?.nombre)}</td><td><div class="actions"><button onclick="printInvoice(${f.factura_id})">Imprimir</button><button class="danger" onclick="deleteInvoice(${f.factura_id})">Eliminar</button></div></td></tr>`).join(''):'<tr><td colspan="5">No hay facturas para mostrar.</td></tr>';
}
window.deleteInvoice=async id=>{if(!confirm('¿Eliminar esta factura? Esta acción no se puede deshacer.'))return;const {error}=await db.from('facturas').delete().eq('factura_id',id);if(error)alert(error.message);else loadInvoices();};
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
 tr.querySelectorAll('input').forEach(i=>i.addEventListener('input',updateTotal));$('itemRows').appendChild(tr);
}
$('addItem').onclick=addItem;
function updateTotal(){let total=0;document.querySelectorAll('#itemRows tr').forEach(tr=>{const val=k=>Number(tr.querySelector(`[data-k="${k}"]`).value)||0;const sub=val('gramos')*val('precio_por_gramo');tr.querySelector('[data-k="precio_total"]').value=sub.toFixed(2);total+=sub;});$('grandTotal').textContent=money(total);}
$('searchClient').onclick=async()=>{
 const ced=$('clientSearch').value.trim();if(!ced)return;
 const {data,error}=await db.from('clientes').select('nombre,telefono,cedula,direccion').ilike('cedula',`%${ced}%`).limit(10);
 if(error){$('clientResults').textContent=error.message;return;}
 $('clientResults').innerHTML=(data||[]).map(c=>`<div class="client-result"><span>${esc(c.cedula)} · ${esc(c.nombre)} · ${esc(c.telefono||'')}</span><button type="button" data-client="${esc(JSON.stringify(c))}">Seleccionar</button></div>`).join('')||'Sin coincidencias';
 $('clientResults').querySelectorAll('button').forEach(b=>b.onclick=()=>{const c=JSON.parse(b.dataset.client);$('invoiceForm').elements.clienteNombre.value=c.nombre;$('invoiceForm').elements.telefono.value=c.telefono||'';$('invoiceForm').elements.cedula.value=c.cedula;$('invoiceForm').elements.clienteDireccion.value=c.direccion||'';});
};
$('invoiceForm').addEventListener('submit',async e=>{
 e.preventDefault();const form=e.currentTarget;const b=$('saveInvoice');b.disabled=true;msg('Guardando factura…');
 try{
  const fd=new FormData(form), file=fd.get('fotoCedula');
  if(!file||!file.size)throw Error('Adjunta la foto de la cédula.');
  if(!file.type.startsWith('image/'))throw Error('El archivo debe ser una imagen.');
  const path=`cedulas/${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g,'_')}`;
  const up=await db.storage.from('documentos-clientes').upload(path,file,{upsert:false,contentType:file.type});
  if(up.error)throw up.error;
  const details=[...$('itemRows').querySelectorAll('tr')].map(tr=>{const o={};tr.querySelectorAll('[data-k]').forEach(i=>o[i.dataset.k]=i.value);return o;});
  if(!details.length)throw Error('Agrega al menos un detalle.');
  const payload={cliente:{nombre:fd.get('clienteNombre'),telefono:fd.get('telefono'),cedula:fd.get('cedula'),direccion:fd.get('clienteDireccion'),foto_cedula:path},
   proveedor_id:Number(fd.get('proveedor')),ruc:fd.get('ruc'),uag:fd.get('uag'),detalles:details};
  const {data,error}=await db.rpc('crear_factura', {p_payload:payload});
  if(error)throw error;
  alert('Factura guardada correctamente.');showPage('invoices');
 }catch(err){msg(err.message||'No fue posible guardar la factura.');}
 finally{b.disabled=false;}
});
window.printInvoice=async id=>{
 const {data:f,error}=await db.from('facturas').select('*,clientes(*),proveedores(nombre),detalles_factura(*)').eq('factura_id',id).single();
 if(error){alert(error.message);return;}
 let photo='';
 if(f.clientes.foto_cedula){const {data}=await db.storage.from('documentos-clientes').createSignedUrl(f.clientes.foto_cedula,120);photo=data?.signedUrl||'';}
 const details=f.detalles_factura||[];const total=details.reduce((a,d)=>a+Number(d.precio_total||0),0);
 $('printArea').innerHTML=`<article class="print-sheet"><div class="print-head"><img src="imagenes/logo.JPG"><div class="center"><b>INVESTMENTS RIOS BRACKEIT GOLD NICARAGUA S.A.</b><p>RUC: ${esc(f.ruc)} &nbsp; UAF: ${esc(f.uag)}</p><p>Proveedor: ${esc(f.proveedores.nombre)} &nbsp; Factura Nº ${esc(f.numero_factura)}</p><p>Teléfonos: Tigo: 83785672 · Claro: 82265246 / 77473771</p><p>Dirección: Colonia Maximo Jerez de Yantaza 3 andenes al norte.</p><b>COMPROBANTE DE COMPRA DE MATERIAL</b></div></div><p style="text-align:right">Fecha: ${esc(f.fecha)}</p><hr><div class="print-client"><div><h2>Detalles del Proveedor</h2><p>Cédula: ${esc(f.clientes.cedula)}</p><p>Nombre: ${esc(f.clientes.nombre)}</p><p>Teléfono: ${esc(f.clientes.telefono)}</p><p>Dirección: ${esc(f.clientes.direccion)}</p></div>${photo?`<img src="${photo}">`:''}</div><hr><h2>Detalles del Producto</h2><table><thead><tr><th>Descripción</th><th>Cantidad</th><th>Fecha entrega</th><th>Cierre</th><th>Gramos</th><th>Precio x G</th><th>Kilataje</th><th>Onzas netas</th><th>Punto</th><th>Subtotal</th></tr></thead><tbody>${details.map(d=>`<tr><td>${esc(d.descripcion)}</td><td>${esc(d.cantidad)}</td><td>${esc(d.fecha_entrega)}</td><td>${esc(d.cierre)}</td><td>${esc(d.gramos)}</td><td>${esc(d.precio_por_gramo)}</td><td>${esc(d.kilataje)}</td><td>${esc(d.onzas)}</td><td>${esc(d.punto)}</td><td>${money(d.precio_total)}</td></tr>`).join('')}</tbody><tfoot><tr><th colspan="9">TOTAL VENTA</th><th>${money(total)}</th></tr></tfoot></table><div class="print-footer"><p><b>DECLARACIÓN JURADA DE PERTENENCIA:</b><br>La persona cuyos datos se encuentran en la parte superior declara bajo juramento que es el único y legítimo propietario de los bienes descritos y asumirá la responsabilidad correspondiente frente a terceros y autoridades competentes.</p><p>ACEPTACIÓN: Al firmar este recibo, el vendedor declara estar conforme con la descripción y el monto pagado por los artículos vendidos.</p><p>COMPRADOR: ____________________ &nbsp; VENDEDOR: ____________________<br>N.º DE CÉDULA: ____________________</p><b>¡Gracias por su compra!</b></div><button class="print-button" onclick="window.print()">Imprimir factura</button></article>`;
 $('printArea').classList.remove('hidden');$('app').classList.add('hidden');window.print();window.onafterprint=()=>{$('printArea').classList.add('hidden');$('app').classList.remove('hidden');};
};
init();
