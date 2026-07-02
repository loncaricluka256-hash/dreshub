import { getAllProducts, getProductById, getProductMainImage, saveProducts, duplicateSneakerProduct, duplicateJerseyProduct } from '../services/productService.js';
import {
  initializeAdminData, refreshAdminCollections, getCollection, saveCollection, recordChange, saveProduct, adjustProductStock,
  setProductArchived, deleteProduct, updateReservation, getAdminSettings, saveAdminSettings, exportAllData
} from '../services/adminService.js';
import { getReservations, subscribeToReservationChanges } from '../services/reservationService.js';
import { createPurchaseOrder, updatePurchaseOrder, finalizePurchaseOrder, copyPurchaseOrder } from '../services/purchaseOrderService.js';
import { createTransaction } from '../services/transactionService.js';
import { createNote, updateNote, deleteNote, archiveNote, completeNote } from '../services/noteService.js';
import { uploadProductImages, getProductImages, setMainProductImage, replaceProductImage, deleteProductImage, reorderProductImages } from '../services/imageService.js';
import { getAdminPassword } from '../services/settingsService.js';
import { formatPrice, escapeHTML } from './utils.js';

const viewNames = {
  otherProducts: 'Tenisice i duksevi',
  dashboard: 'Dashboard', products: 'Proizvodi', reservations: 'Rezervacije', orders: 'Narudžbe',
  finance: 'Financije', notes: 'Bilješke', changes: 'Povijest promjena', transactions: 'Povijest transakcija', settings: 'Postavke'
};
const negativeTypes = new Set(['Trošak', 'Povrat', 'Dostava', 'Carina', 'Popust']);
let reservationRealtimeStarted=false;
let products = [];
let orderDraft = [];
let activeReservationStatus = 'active';
let activeOrderStatus = 'open';

/** Prikazuje kratku admin obavijest. @param {string} message Poruka. @returns {void} */
function toast(message) {
  const element = document.querySelector('[data-toast]');
  element.textContent = message;
  element.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => element.classList.remove('show'), 2300);
}
toast.timer = null;

/** @param {string|Date} value Datum. @param {boolean} [withTime=true] Prikaži vrijeme. @returns {string} */
function formatDate(value, withTime = true) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('hr-HR', withTime ? { dateStyle: 'medium', timeStyle: 'short' } : { dateStyle: 'medium' }).format(new Date(value));
}

/** @param {string} period Razdoblje. @returns {Date|null} Početni datum. */
function periodStart(period) {
  const now = new Date();
  if (period === 'today') return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (period === 'week') return new Date(now.getTime() - 7 * 86400000);
  if (period === 'month') return new Date(now.getFullYear(), now.getMonth(), 1);
  return null;
}

/** @param {Array<Object>} records Zapisi. @param {string} period Razdoblje. @param {string} [field='date'] Polje datuma. @returns {Array<Object>} */
function filterByPeriod(records, period, field = 'date') {
  const start = periodStart(period);
  return start ? records.filter((record) => new Date(record[field]) >= start) : records;
}

/** Prebacuje vidljivi admin prikaz. @param {string} name Identifikator prikaza. @returns {void} */
function showView(name) {
  document.querySelectorAll('[data-view]').forEach((view) => view.classList.toggle('active', view.dataset.view === name));
  document.querySelectorAll('[data-view-target]').forEach((button) => button.classList.toggle('active', button.dataset.viewTarget === name));
  document.querySelector('[data-current-view]').textContent = viewNames[name];
  document.querySelector('[data-admin-sidebar]').classList.remove('open');
  location.hash = name;
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/** @param {string} title Naslov. @param {string|number} value Vrijednost. @param {string} icon Ikona. @param {string} [hint=''] Pomoćni tekst. @param {string} [className=''] Klasa. @returns {string} */
function metricCard(title, value, icon, hint = '', className = '') {
  return `<article class="metric-card ${className}"><header>${escapeHTML(title)}<span>${icon}</span></header><strong>${escapeHTML(value)}</strong><small>${escapeHTML(hint)}</small></article>`;
}

/** Osvježava sve podatkovne prikaze. @returns {Promise<void>} */
async function refreshAll() {
  await refreshAdminCollections();
  products = await getAllProducts();
  renderDashboard(); renderProducts(); renderOtherProducts(); renderReservations(); renderOrders(); renderFinance(); renderNotes(); renderChanges(); renderTransactions(); renderSettingsOptions();
  document.querySelectorAll('[data-active-reservations]').forEach((element) => element.textContent = getReservations().filter((item) => item.status === 'active').length);
}

/** Prikazuje dashboard kartice i sažetke. @returns {void} */
function renderDashboard() {
  const reservations = getReservations();
  const transactions = getCollection('transactions');
  const notes = getCollection('notes');
  const activeProducts = products.filter((product) => !product.archived);
  const sales = transactions.filter((item) => item.type === 'Prodaja').reduce((sum, item) => sum + Math.abs(item.amount), 0);
  const costs = transactions.filter((item) => negativeTypes.has(item.type)).reduce((sum, item) => sum + Math.abs(item.amount), 0);
  const todaySales = filterByPeriod(transactions.filter((item) => item.type === 'Prodaja'), 'today').reduce((sum, item) => sum + Math.abs(item.amount), 0);
  const stockValue = activeProducts.reduce((sum, product) => sum + Number(product.costPrice || 0) * product.stock, 0);
  const lowStock = activeProducts.filter((product) => product.stock <= 2);
  document.querySelector('[data-dashboard-date]').textContent = new Intl.DateTimeFormat('hr-HR', { dateStyle: 'full' }).format(new Date());
  document.querySelector('[data-metrics]').innerHTML = [
    metricCard('Ukupno proizvoda', activeProducts.length, '◈', `${products.filter((item) => item.archived).length} arhiviranih`),
    metricCard('Dresova na stanju', activeProducts.reduce((sum, item) => sum + item.stock, 0), '▦', 'Ukupan broj komada'),
    metricCard('Aktivne rezervacije', reservations.filter((item) => item.status === 'active').length, '◷', 'Čekaju obradu', 'warning'),
    metricCard('Današnja prodaja', formatPrice(todaySales), '↗', 'Završene rezervacije', 'positive'),
    metricCard('Ukupan profit', formatPrice(sales - costs), '€', 'Prodaja minus troškovi', sales - costs >= 0 ? 'positive' : 'negative'),
    metricCard('Ukupni troškovi', formatPrice(costs), '↘', 'Sve evidentirane obveze', 'negative'),
    metricCard('Vrijednost robe', formatPrice(stockValue), '◇', 'Po kupovnoj cijeni'),
    metricCard('Pri kraju zalihe', lowStock.length, '!', 'Dva ili manje komada', lowStock.length ? 'warning' : '')
  ].join('');
  document.querySelector('[data-dashboard-reservations]').innerHTML = reservations.slice().sort((a,b) => new Date(b.createdAt)-new Date(a.createdAt)).slice(0,5).map((item) => `<div class="data-row"><div class="data-row-main"><strong>${escapeHTML(item.name)}</strong><small>${escapeHTML(item.items?.[0]?.name || 'Više proizvoda')} · ${formatDate(item.createdAt)}</small></div><span class="status-pill ${item.status}">${statusLabel(item.status)}</span></div>`).join('') || emptyAdmin('Nema rezervacija.');
  document.querySelector('[data-low-stock]').innerHTML = lowStock.slice(0,6).map((product) => `<div class="data-row"><div class="data-row-main"><strong>${escapeHTML(product.name)}</strong><small>${escapeHTML(product.club)}</small></div><span class="data-row-value">${product.stock} kom</span></div>`).join('') || emptyAdmin('Zalihe su stabilne.');
  document.querySelector('[data-reminders]').innerHTML = notes.filter((note) => note.status !== 'Završena' && note.status !== 'Arhivirana').sort((a,b) => Number(b.pinned)-Number(a.pinned)).slice(0,5).map((note) => `<div class="data-row"><div class="data-row-main"><strong>${note.pinned ? '◆ ' : ''}${escapeHTML(note.title)}</strong><small>${escapeHTML(note.priority)} · ${note.dueDate ? formatDate(note.dueDate,false) : 'Bez roka'}</small></div></div>`).join('') || emptyAdmin('Nema aktivnih podsjetnika.');
  document.querySelector('[data-dashboard-transactions]').innerHTML = transactions.slice().sort((a,b) => new Date(b.date)-new Date(a.date)).slice(0,5).map((item) => `<div class="data-row"><div class="data-row-main"><strong>${escapeHTML(item.description)}</strong><small>${escapeHTML(item.type)} · ${formatDate(item.date)}</small></div><span class="data-row-value">${formatPrice(item.amount)}</span></div>`).join('') || emptyAdmin('Nema transakcija.');
}

/** @param {string} message Tekst praznog stanja. @returns {string} */
function emptyAdmin(message) { return `<div class="empty-admin">${escapeHTML(message)}</div>`; }

/** @param {string} status Status rezervacije. @returns {string} */
function statusLabel(status) { return ({ active:'Aktivna', completed:'Završena', cancelled:'Otkazana', expired:'Istekla' })[status] || status; }

/** Prikazuje tablični popis proizvoda. @returns {void} */
function renderProducts() {
  const query = (document.querySelector('[data-product-search]')?.value || '').toLocaleLowerCase('hr');
  const status = document.querySelector('[data-product-status]')?.value || 'active';
  const filtered = products.filter((product) => product.productType === 'jersey' && (status === 'all' || (status === 'archived') === Boolean(product.archived)) && `${product.name} ${product.club} ${product.player}`.toLocaleLowerCase('hr').includes(query));
  document.querySelector('[data-products-summary]').textContent = `${filtered.length} proizvoda · ${filtered.reduce((sum,item)=>sum+item.stock,0)} komada`;
  document.querySelector('[data-products-list]').innerHTML = filtered.map((product) => `<article class="admin-product" data-admin-product="${escapeHTML(product.id)}"><img src="${escapeHTML(getProductMainImage(product))}" alt="${escapeHTML(product.name)}"><div class="admin-product-info"><strong>${escapeHTML(product.name)}</strong><small>${escapeHTML(product.club)} · ${escapeHTML(product.player)} · ${escapeHTML(product.version)}</small></div><span class="product-tag">${escapeHTML(product.badge)}</span><div class="stock-stepper"><button data-stock="-1" aria-label="Smanji">−</button><output>${product.stock}</output><button data-stock="1" aria-label="Povećaj">+</button></div><div class="admin-product-price"><strong>${formatPrice(product.price)}</strong><small>Nabava ${formatPrice(product.costPrice || 0)}</small></div><div class="row-actions"><button data-edit-product title="Uredi">✎</button><button data-archive-product title="${product.archived?'Vrati':'Arhiviraj'}">${product.archived?'↥':'▣'}</button><button class="danger" data-delete-product title="Obriši">×</button></div></article>`).join('') || emptyAdmin('Nema proizvoda za odabrani prikaz.');
}

/** Otvara formu proizvoda. @param {Object|null} product Postojeći proizvod. @returns {void} */
function setupOtherProductsAdminUI(){
  const dresList=document.querySelector('[data-products-list]'),addDuplicateButtons=()=>dresList?.querySelectorAll('[data-admin-product] .row-actions').forEach((actions)=>{if(!actions.querySelector('[data-duplicate-product]'))actions.insertAdjacentHTML('afterbegin','<button data-duplicate-product title="Dupliciraj dres">⧉</button>');});if(dresList)new MutationObserver(addDuplicateButtons).observe(dresList,{childList:true});
  const productNav=document.querySelector('[data-view-target="products"]');
  if(productNav&&!document.querySelector('[data-view-target="otherProducts"]'))productNav.insertAdjacentHTML('afterend','<button data-view-target="otherProducts"><span>◆</span>Tenisice i duksevi</button>');
  const productView=document.querySelector('[data-view="products"]');
  if(productView){productView.querySelector('h1').textContent='Dresovi';const addButton=productView.querySelector('[data-open-product]');if(addButton)addButton.textContent='+ Dodaj dres';}
  if(productView&&!document.querySelector('[data-view="otherProducts"]'))productView.insertAdjacentHTML('afterend','<section class="admin-view" data-view="otherProducts"><header class="view-header"><div><p class="eyebrow">Ostali proizvodi</p><h1>Tenisice i duksevi</h1><p>Odvojeno upravljanje ponudom izvan kataloga dresova.</p></div><div class="other-product-create"><button class="admin-primary-action" data-open-other="sneaker">+ Dodaj tenisice</button><button class="admin-secondary-action" data-open-other="hoodie">+ Dodaj duks</button><button class="admin-secondary-action" data-prefill-nike>Pripremi Nike primjer</button></div></header><div class="admin-toolbar"><label class="admin-search">⌕<input type="search" data-other-product-search placeholder="Pretraži naziv, brend ili boju…"></label><select data-other-product-type><option value="all">Tenisice i duksevi</option><option value="sneaker">Tenisice</option><option value="hoodie">Duksevi</option></select><span data-other-products-summary></span></div><div class="product-admin-list" data-other-products-list></div></section>');
  const form=document.querySelector('[data-product-form]'),imageLabel=form?.elements.images?.closest('label');
  if(form&&imageLabel&&!form.elements.productType)imageLabel.insertAdjacentHTML('beforebegin','<input type="hidden" name="productType" value="jersey"><label class="other-product-field">Brend<input name="brand"></label><label class="other-product-field">Boja<input name="color"></label><label class="other-product-field">Stanje<select name="condition"><option value="new">Novo</option><option value="worn">Nošeno</option><option value="very_good">Vrlo dobro</option><option value="damaged">Oštećeno</option></select></label><label class="other-product-field">Spol / kategorija<select name="genderCategory"><option value="men">Muški</option><option value="women">Ženski</option><option value="unisex">Unisex</option></select></label><label class="other-product-field sneaker-only checkbox-field"><input type="checkbox" name="hasOriginalBox"> Originalna kutija</label>');
}

function renderOtherProducts(){const list=document.querySelector('[data-other-products-list]');if(!list)return;const query=(document.querySelector('[data-other-product-search]')?.value||'').toLocaleLowerCase('hr'),type=document.querySelector('[data-other-product-type]')?.value||'all',items=products.filter((product)=>['sneaker','hoodie'].includes(product.productType)&&(type==='all'||product.productType===type)&&`${product.name} ${product.brand} ${product.color}`.toLocaleLowerCase('hr').includes(query));document.querySelector('[data-other-products-summary]').textContent=`${items.length} proizvoda`;list.innerHTML=items.map((product)=>`<article class="admin-product" data-other-product="${escapeHTML(product.id)}"><img src="${escapeHTML(getProductMainImage(product))}" alt="${escapeHTML(product.name)}"><div class="admin-product-info"><strong>${escapeHTML(product.name)}</strong><small>${product.productType==='sneaker'?'Tenisice':'Duks'} · ${escapeHTML(product.brand)} · ${escapeHTML(product.sizes.join(', '))}</small></div><span class="product-tag">${product.productType==='sneaker'?'TENISICE':'DUKS'}</span><div class="stock-stepper"><output>${product.stock}</output></div><div class="admin-product-price"><strong>${formatPrice(product.price)}</strong></div><div class="row-actions">${product.productType==='sneaker'?'<button data-duplicate-other title="Dupliciraj">⧉</button>':''}<button data-edit-other title="Uredi">✎</button><button class="danger" data-delete-other title="Obriši">×</button></div></article>`).join('')||emptyAdmin('Nema tenisica ili dukseva za odabrani prikaz.');}

async function removeOtherProduct(product){const images=await getProductImages(product.id);for(const image of images)await deleteProductImage(product.id,image.id);await deleteProduct(product.id);}

async function prefillNikeExample(){await openProductDialog(null,'sneaker');const form=document.querySelector('[data-product-form]');form.elements.name.value='Nike Air Force 1';form.elements.brand.value='Nike';form.elements.sizes.value='44';form.elements.costPrice.value='50';form.elements.price.value='80';form.elements.stock.value='3';form.elements.color.value='bijela';form.elements.condition.value='new';form.elements.genderCategory.value='unisex';form.elements.hasOriginalBox.checked=false;form.elements.description.value='Nove bijele Nike Air Force 1 tenisice.';toast('Podaci su pripremljeni. Dodajte priložene fotografije kroz polje Slike i spremite oglas.');}

async function openProductDialog(product = null, requestedType = 'jersey') {
  const dialog = document.querySelector('[data-product-dialog]');
  const form = dialog.querySelector('form');
  releaseImagePreviews(form); form.reset(); form.elements.id.value = product?.id || '';
  const productType=product?.productType||requestedType;form.elements.productType.value=productType;
  form.elements.sizes.placeholder=productType==='sneaker'?'npr. 42.5':productType==='hoodie'?'XS, S, M, L, XL ili XXL':'S, M, L';
  const isJersey=productType==='jersey';
  ['club','player','version'].forEach((name)=>{const field=form.elements[name],label=field?.closest('label');if(label)label.hidden=!isJersey;if(field){field.required=isJersey;if(!isJersey)field.value='';}});
  form.querySelectorAll('.other-product-field').forEach((field)=>field.hidden=isJersey||field.classList.contains('sneaker-only')&&productType!=='sneaker');
  ['brand','color','condition','genderCategory'].forEach((name)=>{if(form.elements[name])form.elements[name].required=!isJersey;});
  dialog.querySelector('[data-product-dialog-title]').textContent = product ? `Uredi ${productType==='sneaker'?'tenisice':productType==='hoodie'?'duks':'proizvod'}` : productType==='sneaker'?'Nove tenisice':productType==='hoodie'?'Novi duks':'Novi proizvod';
  if (product) ['name','club','player','type','version','costPrice','stock','badge','description'].forEach((key) => { if(form.elements[key]) form.elements[key].value = product[key] ?? ''; });
  form.elements.price.value = product ? (product.oldPrice || product.price) : '';
  form.elements.oldPrice.value = product?.oldPrice ? product.price : '';
  form.elements.sizes.value = product?.sizes?.join(', ') || '';
  if(!isJersey){form.elements.brand.value=product?.brand||'';form.elements.color.value=product?.color||'';form.elements.condition.value=product?.condition||'new';form.elements.genderCategory.value=product?.genderCategory||'unisex';form.elements.hasOriginalBox.checked=Boolean(product?.hasOriginalBox);form.elements.costPrice.value=product?.costPrice||0;form.elements.badge.value=product?.badge||'NOVO';}
  form.imageItems = [];
  form.deletedImageIds = [];
  if (product?.id) {
    const storedImages = await getProductImages(product.id);
    form.imageItems = storedImages.map((image,index)=>({kind:'existing',id:image.id,url:image.image_url,path:image.image_path,isMain:Boolean(image.is_main),order:Number(image.image_order??index)}));
    if(form.imageItems.length&&!form.imageItems.some((image)=>image.isMain))form.imageItems[0].isMain=true;
  }
  renderImagePreview(form);
  dialog.showModal();
}

/** Prikazuje slike proizvoda i omogućuje izbor glavne slike. @param {Array<string>} images Slike. @returns {void} */
function renderImagePreview(form) {
  const images=form.imageItems||[],preview=form.querySelector('[data-image-preview]');
  if(!images.length){preview.innerHTML='<div class="image-preview-empty">Proizvod trenutačno nema slika. Bit će prikazan placeholder.</div>';return;}
  preview.innerHTML=images.map((image,index)=>`<article class="image-editor-card ${image.isMain?'active':''}" data-image-key="${escapeHTML(image.id??image.key)}" draggable="true"><div class="image-editor-visual"><img src="${escapeHTML(image.previewUrl||image.url)}" alt="Slika proizvoda ${index+1}">${image.isMain?'<strong>Glavna slika</strong>':''}${image.replacementFile?'<small>Zamjena odabrana</small>':''}</div><div class="image-editor-actions"><button type="button" data-image-main ${image.isMain?'disabled':''}>${image.isMain?'Glavna':'Postavi glavnu'}</button><button type="button" data-image-replace>Zamijeni</button><button type="button" data-image-delete class="danger">Obriši</button><div><button type="button" data-image-left ${index===0?'disabled':''} aria-label="Pomakni lijevo">←</button><span>${index+1}</span><button type="button" data-image-right ${index===images.length-1?'disabled':''} aria-label="Pomakni desno">→</button></div></div></article>`).join('');
}

/** Prikazuje rezervacije odabranog statusa. @returns {void} */
function renderReservations() {
  const reservations = getReservations().filter((item) => item.status === activeReservationStatus).sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt));
  document.querySelector('[data-reservations-list]').innerHTML = reservations.map((item) => {
    const total = item.items.reduce((sum,entry)=>sum+entry.price*entry.quantity,0);
    return `<article class="reservation-row" data-reservation="${item.id}"><div><span class="row-label">Kupac</span><span class="row-text">${escapeHTML(item.name)}</span></div><div><span class="row-label">Proizvod</span><span class="row-text">${escapeHTML(item.items.map((entry)=>entry.name).join(', '))}</span></div><div><span class="row-label">Vrijeme</span><span class="row-text">${formatDate(item.createdAt)}</span></div><div><span class="row-label">Vrijednost</span><span class="row-text">${formatPrice(total)}</span></div><span class="status-pill ${item.status}">${statusLabel(item.status)}</span></article>`;
  }).join('') || emptyAdmin(`Nema rezervacija u kategoriji „${statusLabel(activeReservationStatus)}”.`);
}

/** Otvara detalje rezervacije. @param {Object} reservation Rezervacija. @returns {void} */
function openReservationDetail(reservation) {
  const dialog = document.querySelector('[data-reservation-dialog]');
  const first = reservation.items[0];
  dialog.querySelector('[data-reservation-detail]').innerHTML = `<header><div><p class="eyebrow">Rezervacija #${reservation.id}</p><h2>${escapeHTML(reservation.name)}</h2></div><button data-close-dialog>×</button></header><img class="reservation-detail-image" src="${escapeHTML(first?.image || '')}" alt="${escapeHTML(first?.name || '')}"><div class="detail-block"><dl><div><dt>Telefon</dt><dd><a href="tel:${escapeHTML(reservation.phone)}">${escapeHTML(reservation.phone)}</a></dd></div><div><dt>Proizvod</dt><dd>${escapeHTML(reservation.items.map((item)=>`${item.name} × ${item.quantity}`).join(', '))}</dd></div><div><dt>Veličina</dt><dd>${escapeHTML(reservation.items.map((item)=>item.size).join(', '))}</dd></div><div><dt>Napomena</dt><dd>${escapeHTML(reservation.note || 'Nema napomene')}</dd></div><div><dt>Rezervirano</dt><dd>${formatDate(reservation.createdAt)}</dd></div><div><dt>Istječe</dt><dd>${formatDate(reservation.expiresAt)}</dd></div></dl></div><div class="reservation-actions">${reservation.status==='active'?`<button data-contacted="${reservation.id}">${reservation.contacted?'Kontaktiran ✓':'Označi kao kontaktiran'}</button><a href="tel:${escapeHTML(reservation.phone)}">Nazovi</a><a href="https://wa.me/${escapeHTML(reservation.phone.replace(/\D/g,''))}" target="_blank" rel="noopener">WhatsApp</a><button class="sell" data-complete-reservation="${reservation.id}">Zaključi kao prodano</button><button class="cancel" data-cancel-reservation="${reservation.id}">Otkaži rezervaciju</button>`:''}</div>`;
  dialog.showModal();
}

/** Prikazuje kartice narudžbi. @returns {void} */
function renderOrders() {
  const orders = getCollection('orders').filter((order)=>order.status===activeOrderStatus).sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt));
  document.querySelector('[data-orders-list]').innerHTML = orders.map((order)=>{
    const pieces=order.items.reduce((s,i)=>s+Number(i.quantity),0), cost=order.items.reduce((s,i)=>s+Number(i.quantity)*Number(i.costPrice),0), sales=order.items.reduce((s,i)=>s+Number(i.quantity)*Number(i.price),0);
    return `<article class="order-card" data-order="${order.id}"><header><div><p class="eyebrow">#${order.id}</p><h2>${escapeHTML(order.title)}</h2></div><span class="status-pill ${order.status==='closed'?'completed':''}">${order.status==='open'?'Otvorena':'Zaključena'}</span></header><div class="order-stats"><div><small>Komada</small><strong>${pieces}</strong></div><div><small>Trošak</small><strong>${formatPrice(cost)}</strong></div><div><small>Prodajna vrijednost</small><strong>${formatPrice(sales)}</strong></div><div><small>Procjena profita</small><strong>${formatPrice(sales-cost)}</strong></div></div><div class="card-actions">${order.status==='open'?`<button data-edit-order>Uredi</button><button class="primary" data-close-order>Zaključi</button>`:`<button data-copy-order>Kopiraj u novu</button>`}</div></article>`;
  }).join('') || emptyAdmin('Nema narudžbi u ovom prikazu.');
}

/** Prikazuje stavke nacrta narudžbe. @returns {void} */
function renderOrderDraft() {
  document.querySelector('[data-order-items]').innerHTML = orderDraft.map((item,index)=>`<div class="order-item-edit" data-order-item="${index}"><input data-order-field="name" value="${escapeHTML(item.name)}" placeholder="Naziv"><input type="number" min="1" data-order-field="quantity" value="${item.quantity}" title="Količina"><input type="number" min="0" step=".01" data-order-field="costPrice" value="${item.costPrice}" title="Kupovna cijena"><input type="number" min="0" step=".01" data-order-field="price" value="${item.price}" title="Prodajna cijena"><input data-order-field="size" value="${escapeHTML(item.size)}" title="Veličina"><select data-order-field="version" title="Verzija"><option ${item.version==='Fan Version'?'selected':''}>Fan Version</option><option ${item.version==='Player Version'?'selected':''}>Player Version</option><option ${item.version==='Retro'?'selected':''}>Retro</option></select><input data-order-field="note" value="${escapeHTML(item.note||'')}" placeholder="Napomena"><button type="button" data-remove-order-item>×</button></div>`).join('') || emptyAdmin('Dodajte barem jedan proizvod.');
}

/** Otvara formu narudžbe. @param {Object|null} order Postojeća narudžba. @returns {void} */
function openOrderDialog(order=null) {
  const form=document.querySelector('[data-order-form]'); form.reset(); form.dataset.orderId=order?.id||''; orderDraft=order?structuredClone(order.items):[];
  if(order){form.elements.title.value=order.title;form.elements.note.value=order.note||'';}
  const select=document.querySelector('[data-order-product-select]'); select.innerHTML=products.filter(p=>!p.archived).map(p=>`<option value="${p.id}">${escapeHTML(p.name)}</option>`).join('');
  renderOrderDraft(); document.querySelector('[data-order-dialog]').showModal();
}

/** Prikazuje financijske sažetke i transakcije. @returns {void} */
function renderFinance() {
  const period=document.querySelector('[data-finance-period]')?.value||'all', type=document.querySelector('[data-finance-type]')?.value||'all';
  let transactions=filterByPeriod(getCollection('transactions'),period);
  if(type==='sales')transactions=transactions.filter(i=>i.type==='Prodaja'); if(type==='expenses')transactions=transactions.filter(i=>negativeTypes.has(i.type)); if(type==='profit')transactions=transactions.filter(i=>i.type==='Profit');
  const all=getCollection('transactions'), sales=all.filter(i=>i.type==='Prodaja').reduce((s,i)=>s+Math.abs(i.amount),0), costs=all.filter(i=>negativeTypes.has(i.type)).reduce((s,i)=>s+Math.abs(i.amount),0), stockValue=products.filter(p=>!p.archived).reduce((s,p)=>s+Number(p.costPrice||0)*p.stock,0), sold=getReservations().filter(r=>r.status==='completed').reduce((s,r)=>s+r.items.reduce((x,i)=>x+i.quantity,0),0);
  document.querySelector('[data-finance-metrics]').innerHTML=[metricCard('Ukupna prodaja',formatPrice(sales),'↗','Sve prodaje','positive'),metricCard('Ukupni troškovi',formatPrice(costs),'↘','Nabava i ostali troškovi','negative'),metricCard('Ukupni profit',formatPrice(sales-costs),'€','Prodaja minus troškovi',sales-costs>=0?'positive':'negative'),metricCard('Vrijednost zalihe',formatPrice(stockValue),'◇','Po kupovnoj cijeni'),metricCard('Prodano dresova',sold,'▦','Završene rezervacije')].join('');
  document.querySelector('[data-finance-list]').innerHTML=transactionRows(transactions);
}

/** @param {Array<Object>} transactions Transakcije. @returns {string} */
function transactionRows(transactions) { return transactions.slice().sort((a,b)=>new Date(b.date)-new Date(a.date)).map(item=>`<article class="transaction-row"><div><span class="row-label">Datum</span><span class="row-text">${formatDate(item.date)}</span></div><div><span class="row-label">Opis</span><span class="row-text">${escapeHTML(item.description)}</span></div><div><span class="row-label">Tip</span><span class="row-text">${escapeHTML(item.type)}</span></div><div><span class="row-label">Izvor</span><span class="row-text">${escapeHTML(item.source||'Ručni unos')}</span></div><strong class="transaction-amount ${item.amount>=0&&!negativeTypes.has(item.type)?'positive':'negative'}">${formatPrice(item.amount)}</strong></article>`).join('')||emptyAdmin('Nema transakcija za odabrane filtre.'); }

/** Prikazuje bilješke. @returns {void} */
function renderNotes() {
  const status=document.querySelector('[data-note-status]')?.value||'all', priority=document.querySelector('[data-note-priority]')?.value||'all';
  const notes=getCollection('notes').filter(n=>(status==='all'||n.status===status)&&(priority==='all'||n.priority===priority)).sort((a,b)=>Number(b.pinned)-Number(a.pinned)||new Date(b.createdAt)-new Date(a.createdAt));
  document.querySelector('[data-notes-list]').innerHTML=notes.map(note=>{const id=escapeHTML(String(note.id));return`<article class="note-card ${note.pinned?'pinned':''}" data-note="${id}" data-id="${id}"><header><div><p class="eyebrow">${escapeHTML(note.type)}</p><h2>${note.pinned?'◆ ':''}${escapeHTML(note.title)}</h2></div><span class="status-pill">${escapeHTML(note.status)}</span></header><p>${escapeHTML(note.description||'Bez opisa')}</p><div class="note-meta"><span class="priority-${note.priority}">${escapeHTML(note.priority)}</span>${(note.tags||[]).map(tag=>`<span>#${escapeHTML(tag)}</span>`).join('')}</div><time>${note.dueDate?`Rok: ${formatDate(note.dueDate,false)}`:'Bez roka'}</time><div class="card-actions"><button type="button" data-edit-note data-id="${id}">Uredi</button>${note.status!=='Završena'?`<button type="button" data-complete-note data-id="${id}">Završi</button>`:''}<button type="button" data-archive-note data-id="${id}">Arhiviraj</button><button type="button" data-delete-note data-id="${id}">Obriši</button></div></article>`;}).join('')||emptyAdmin('Nema bilješki za odabrane filtre.');
}

/** Otvara formu bilješke. @param {Object|null} note Bilješka. @returns {void} */
function openNoteDialog(note=null) {
  const dialog=document.querySelector('[data-note-dialog]'), form=dialog.querySelector('form'); form.reset(); form.elements.id.value=note?.id||''; dialog.querySelector('[data-note-title]').textContent=note?'Uredi bilješku':'Nova bilješka';
  if(note){['title','description','type','amount','dueDate','priority','status','productId','orderId'].forEach(k=>{if(form.elements[k])form.elements[k].value=note[k]??''});form.elements.tags.value=(note.tags||[]).join(', ');form.elements.pinned.checked=Boolean(note.pinned);}
  dialog.showModal();
}

/** Prikazuje audit povijest. @returns {void} */
function renderChanges() {
  const category=document.querySelector('[data-change-category]')?.value||'all',period=document.querySelector('[data-change-period]')?.value||'all';
  let changes=filterByPeriod(getCollection('changes'),period); if(category!=='all')changes=changes.filter(c=>c.category===category);
  document.querySelector('[data-changes-list]').innerHTML=changes.map(change=>`<article class="history-row"><div><span class="row-label">Datum i vrijeme</span><span class="row-text">${formatDate(change.date)}</span></div><div><span class="row-label">Tip</span><span class="row-text">${escapeHTML(change.category)}</span></div><div><span class="row-label">Opis</span><span class="row-text">${escapeHTML(change.description)}</span></div><span class="history-values">${escapeHTML(JSON.stringify(change.oldValue))} → ${escapeHTML(JSON.stringify(change.newValue))}</span><span class="row-text">${escapeHTML(change.admin)}</span></article>`).join('')||emptyAdmin('Povijest promjena je prazna.');
}

/** Prikazuje financijsku povijest. @returns {void} */
function renderTransactions() { const type=document.querySelector('[data-transaction-type]')?.value||'all'; const items=getCollection('transactions').filter(i=>type==='all'||i.type===type); document.querySelector('[data-transactions-list]').innerHTML=transactionRows(items); }

/** Popunjava obrasce postavki i povezane select kontrole. @returns {void} */
function renderSettingsOptions() {
  const settings=getAdminSettings(), form=document.querySelector('[data-settings-form]');
  document.documentElement.dataset.adminTheme = settings.theme || 'dark';
  ['storeName','email','phoneLuki','phoneBlaz','instagram','notification','reservationHours','theme'].forEach(key=>{if(form.elements[key])form.elements[key].value=settings[key]??''}); form.elements.notificationVisible.checked=Boolean(settings.notificationVisible); form.elements.badges.value=(settings.badges||[]).join(', ');
  document.querySelector('[data-note-product]').innerHTML='<option value="">Nije povezano</option>'+products.filter(p=>!p.archived).map(p=>`<option value="${p.id}">${escapeHTML(p.name)}</option>`).join('');
  document.querySelector('[data-note-order]').innerHTML='<option value="">Nije povezano</option>'+getCollection('orders').map(o=>`<option value="${o.id}">${escapeHTML(o.title)}</option>`).join('');
}

/** Čita do pet slika kao lokalne data URL previewe. @param {FileList} files Slike. @returns {Promise<Array<string>>} */
async function readImages(files) { return Promise.all([...files].slice(0,5).map(file=>new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(file);}))); }

/** Stvara privremene URL-ove za preview bez Base64 konverzije. @param {FileList|Array<File>} files Slike. @returns {Array<string>} */
function createImagePreviews(files){return[...files].slice(0,5).map((file)=>URL.createObjectURL(file));}

/** Oslobađa privremene preview URL-ove forme proizvoda. @param {HTMLFormElement} form Forma. @returns {void} */
function releaseImagePreviews(form){(form.imageItems||[]).forEach((image)=>{if(String(image.previewUrl||'').startsWith('blob:'))URL.revokeObjectURL(image.previewUrl);});form.imageItems=[];form.deletedImageIds=[];}

/** Zaključuje narudžbu, ažurira zalihu i financije. @param {Object} order Narudžba. @returns {Promise<void>} */
async function closeOrder(order) {
  if(!confirm(`Zaključiti narudžbu „${order.title}”? Nakon toga se više ne može uređivati.`))return;
  await finalizePurchaseOrder(order.id);
  toast('Narudžba je zaključena i zaliha je ažurirana.');await refreshAll();
}

/** Povezuje globalnu navigaciju i akcije stranice. @returns {void} */
function bindNavigation() {
  document.addEventListener('click',async(event)=>{
    const cancelButton = event.target.closest('button[value="cancel"], [data-dialog-cancel]');
    if (cancelButton) { event.preventDefault(); cancelButton.closest('dialog')?.close(); return; }
    const view=event.target.closest('[data-view-target],[data-view-jump]'); if(view)showView(view.dataset.viewTarget||view.dataset.viewJump);
    if(event.target.closest('[data-admin-menu]'))document.querySelector('[data-admin-sidebar]').classList.toggle('open');
    if(event.target.closest('[data-logout]')){sessionStorage.removeItem('dreshub.admin.auth');location.reload();}
    if(event.target.closest('[data-open-product]'))openProductDialog();
    if(event.target.closest('[data-open-order]'))openOrderDialog();
    if(event.target.closest('[data-open-note]'))openNoteDialog();
    if(event.target.closest('[data-open-transaction]')){const form=document.querySelector('[data-transaction-form]');form.reset();form.elements.date.value=new Date().toISOString().slice(0,16);document.querySelector('[data-transaction-dialog]').showModal();}
    if(event.target.closest('[data-close-dialog]'))event.target.closest('dialog').close();
  });
}

/** Povezuje CRUD akcije proizvoda. @returns {void} */
function bindProducts() {
  document.querySelector('[data-product-search]').addEventListener('input',renderProducts); document.querySelector('[data-product-status]').addEventListener('change',renderProducts);
  document.querySelector('[data-other-product-search]')?.addEventListener('input',renderOtherProducts);document.querySelector('[data-other-product-type]')?.addEventListener('change',renderOtherProducts);
  document.querySelectorAll('[data-open-other]').forEach((button)=>button.addEventListener('click',()=>openProductDialog(null,button.dataset.openOther)));
  document.querySelector('[data-prefill-nike]')?.addEventListener('click',prefillNikeExample);
  document.querySelector('[data-other-products-list]')?.addEventListener('click',async(event)=>{const row=event.target.closest('[data-other-product]');if(!row)return;const product=products.find((item)=>String(item.id)===String(row.dataset.otherProduct));if(!product)return;if(event.target.closest('[data-edit-other]'))await openProductDialog(product,product.productType);if(event.target.closest('[data-delete-other]')&&confirm(`Trajno obrisati „${product.name}”?`)){await removeOtherProduct(product);toast('Proizvod je obrisan.');await refreshAll();}if(event.target.closest('[data-duplicate-other]')){try{const copy=await duplicateSneakerProduct(product.id);toast('Oglas i slike su duplicirani.');await refreshAll();await openProductDialog(copy,'sneaker');}catch(error){toast(`Dupliciranje nije uspjelo: ${error.message}`);}}});
  document.querySelector('[data-products-list]').addEventListener('click',async(event)=>{const row=event.target.closest('[data-admin-product]');if(!row)return;const id=row.dataset.adminProduct,product=products.find(p=>String(p.id)===String(id));if(!product)return;if(event.target.closest('[data-stock]')){await adjustProductStock(id,Number(event.target.closest('[data-stock]').dataset.stock));await refreshAll();}if(event.target.closest('[data-edit-product]'))openProductDialog(product);if(event.target.closest('[data-archive-product]')){const willArchive=!product.archived;await setProductArchived(id,willArchive);toast(willArchive?'Proizvod je arhiviran.':'Proizvod je vraćen.');await refreshAll();}if(event.target.closest('[data-delete-product]')&&confirm(`Trajno obrisati „${product.name}”?`)){await deleteProduct(id);toast('Proizvod je obrisan.');await refreshAll();}});
  document.addEventListener('click',async(event)=>{const button=event.target.closest('[data-duplicate-product]');if(!button)return;const row=button.closest('[data-admin-product]'),product=products.find((item)=>String(item.id)===String(row?.dataset.adminProduct));if(!product)return;button.disabled=true;try{const copy=await duplicateJerseyProduct(product.id);toast('Dres i sve slike su duplicirani.');await refreshAll();await openProductDialog(copy,'jersey');}catch(error){console.error('[DresHub Admin] Dupliciranje dresa nije uspjelo.',error);toast(`Dupliciranje dresa nije uspjelo: ${error.message}`);}finally{button.disabled=false;}});
  const form=document.querySelector('[data-product-form]');
  const replaceInput=document.createElement('input');replaceInput.type='file';replaceInput.accept='image/*';replaceInput.hidden=true;form.append(replaceInput);
  form.elements.images.addEventListener('change',()=>{const remaining=Math.max(0,5-(form.imageItems||[]).length),files=[...form.elements.images.files].slice(0,remaining);if(!remaining){toast('Proizvod može imati najviše 5 slika.');form.elements.images.value='';return;}if(form.elements.images.files.length>remaining)toast(`Dodano je ${remaining} slika; proizvod može imati najviše 5.`);for(const file of files)(form.imageItems||=[]).push({kind:'new',key:crypto.randomUUID(),file,previewUrl:URL.createObjectURL(file),isMain:false});if(form.imageItems.length&&!form.imageItems.some((image)=>image.isMain))form.imageItems[0].isMain=true;form.elements.images.value='';renderImagePreview(form);});
  document.querySelector('[data-product-dialog]').addEventListener('close',()=>releaseImagePreviews(form));
  document.querySelector('[data-image-preview]').addEventListener('click',(event)=>{const card=event.target.closest('[data-image-key]');if(!card)return;const items=form.imageItems||[],index=items.findIndex((image)=>String(image.id??image.key)===card.dataset.imageKey);if(index<0)return;if(event.target.closest('[data-image-main]'))items.forEach((image,itemIndex)=>image.isMain=itemIndex===index);if(event.target.closest('[data-image-delete]')){const[removed]=items.splice(index,1);if(removed.kind==='existing')form.deletedImageIds.push(removed.id);if(String(removed.previewUrl||'').startsWith('blob:'))URL.revokeObjectURL(removed.previewUrl);if(removed.isMain&&items[0])items[0].isMain=true;}if(event.target.closest('[data-image-replace]')){form.replaceImageIndex=index;replaceInput.value='';replaceInput.click();return;}if(event.target.closest('[data-image-left]')&&index>0)[items[index-1],items[index]]=[items[index],items[index-1]];if(event.target.closest('[data-image-right]')&&index<items.length-1)[items[index+1],items[index]]=[items[index],items[index+1]];renderImagePreview(form);});
  replaceInput.addEventListener('change',()=>{const file=replaceInput.files[0],item=(form.imageItems||[])[form.replaceImageIndex];if(!file||!item)return;if(String(item.previewUrl||'').startsWith('blob:'))URL.revokeObjectURL(item.previewUrl);item.previewUrl=URL.createObjectURL(file);if(item.kind==='new')item.file=file;else item.replacementFile=file;renderImagePreview(form);});
  const preview=document.querySelector('[data-image-preview]');preview.addEventListener('dragstart',(event)=>{const card=event.target.closest('[data-image-key]');if(card)event.dataTransfer.setData('text/plain',card.dataset.imageKey);});preview.addEventListener('dragover',(event)=>{if(event.target.closest('[data-image-key]'))event.preventDefault();});preview.addEventListener('drop',(event)=>{const target=event.target.closest('[data-image-key]');if(!target)return;event.preventDefault();const key=event.dataTransfer.getData('text/plain'),items=form.imageItems||[],from=items.findIndex((image)=>String(image.id??image.key)===key),to=items.findIndex((image)=>String(image.id??image.key)===target.dataset.imageKey);if(from<0||to<0||from===to)return;const[moved]=items.splice(from,1);items.splice(to,0,moved);renderImagePreview(form);});
  form.addEventListener('submit',async(event)=>{
    event.preventDefault();
    const submitButton=form.querySelector('[type="submit"]');
    submitButton.disabled=true;
    try {
      const data=new FormData(form),existing=products.find(p=>String(p.id)===String(data.get('id'))),images=(existing?.images||[]).filter((url)=>!/^(data:image\/|blob:)/i.test(url)),regularPrice=Number(data.get('price')),promoPrice=data.get('oldPrice')?Number(data.get('oldPrice')):null;
      const productType=data.get('productType')||'jersey',sizes=data.get('sizes').split(',').map(x=>x.trim()).filter(Boolean);if(productType!=='jersey'&&sizes.length!==1)throw new Error('Za tenisice i dukseve unesite jednu veličinu po oglasu.');if(productType==='hoodie'&&!['XS','S','M','L','XL','XXL'].includes(sizes[0]?.toUpperCase()))throw new Error('Dopuštene veličine duksa su XS, S, M, L, XL i XXL.');if(productType==='sneaker'&&!/^\d{1,2}(\.5)?$/.test(sizes[0]||''))throw new Error('Veličina tenisica mora biti broj, primjerice 42 ili 42.5.');const persisted=await saveProduct({id:data.get('id')||undefined,productType,name:data.get('name').trim(),club:productType==='jersey'?data.get('club').trim():'',player:productType==='jersey'?data.get('player').trim():'',type:productType==='jersey'?data.get('type'):productType,version:productType==='jersey'?data.get('version'):'',brand:productType==='jersey'?'':data.get('brand').trim(),color:productType==='jersey'?'':data.get('color').trim(),condition:productType==='jersey'?'':data.get('condition'),genderCategory:productType==='jersey'?'':data.get('genderCategory'),hasOriginalBox:productType==='sneaker'&&data.get('hasOriginalBox')==='on',sizes,costPrice:Number(data.get('costPrice')),price:promoPrice||regularPrice,oldPrice:promoPrice?regularPrice:null,stock:Number(data.get('stock')),badge:data.get('badge'),labels:[data.get('badge')],description:data.get('description').trim(),images,createdAt:existing?.createdAt||new Date().toISOString()});
      if(!persisted?.id)throw new Error('Proizvod nije spremljen u bazu.');
      let imageWarning=false;
      try {
        for(const imageId of form.deletedImageIds||[])await deleteProductImage(persisted.id,imageId);
        for(const image of (form.imageItems||[]).filter((item)=>item.kind==='existing'&&item.replacementFile))await replaceProductImage(persisted.id,image.id,image.replacementFile);
        const newItems=(form.imageItems||[]).filter((item)=>item.kind==='new'),uploaded=await uploadProductImages(persisted.id,newItems.map((item)=>item.file));
        newItems.forEach((item,index)=>{item.id=uploaded[index]?.id;item.kind='existing';});
        const ordered=(form.imageItems||[]).map((item)=>item.id).filter(Boolean);
        if(ordered.length)await reorderProductImages(persisted.id,ordered);
        const main=(form.imageItems||[]).find((item)=>item.isMain&&item.id)||(form.imageItems||[]).find((item)=>item.id);
        if(main)await setMainProductImage(persisted.id,main.id);
      } catch(error) {
        imageWarning=true;
        console.error('[DresHub Admin] Proizvod je spremljen, ali spremanje slika nije uspjelo.',error);
      }
      releaseImagePreviews(form);
      document.querySelector('[data-product-dialog]').close();
      toast(imageWarning?'Proizvod je spremljen, ali slike nisu učitane. Provjerite Storage postavke.':'Proizvod je spremljen.');
      await refreshAll();
    } catch(error) {
      console.error('[DresHub Admin] Spremanje proizvoda nije uspjelo.',error);
      toast(`Spremanje proizvoda nije uspjelo: ${error.message||'nepoznata greška'}`);
    } finally {
      submitButton.disabled=false;
    }
  });
}

/** Povezuje akcije rezervacija. @returns {void} */
function bindReservations() {
  document.querySelector('[data-reservation-tabs]').addEventListener('click',(event)=>{const button=event.target.closest('[data-status]');if(!button)return;activeReservationStatus=button.dataset.status;document.querySelectorAll('[data-status]').forEach(b=>b.classList.toggle('active',b===button));renderReservations();});
  document.querySelector('[data-reservations-list]').addEventListener('click',(event)=>{const row=event.target.closest('[data-reservation]');if(row)openReservationDetail(getReservations().find(r=>String(r.id)===String(row.dataset.reservation)));});
  document.querySelector('[data-reservation-dialog]').addEventListener('click',async(event)=>{const id=event.target.dataset.contacted||event.target.dataset.completeReservation||event.target.dataset.cancelReservation;if(event.target.dataset.contacted){await updateReservation(id,'contacted');toast('Rezervacija je označena kao kontaktirana.');document.querySelector('[data-reservation-dialog]').close();await refreshAll();}if(event.target.dataset.completeReservation){await updateReservation(id,'completed');toast('Prodaja je evidentirana.');document.querySelector('[data-reservation-dialog]').close();await refreshAll();}if(event.target.dataset.cancelReservation){const reason=prompt('Razlog otkazivanja:');if(reason!==null){await updateReservation(id,'cancelled',reason);toast('Rezervacija je otkazana i količina vraćena.');document.querySelector('[data-reservation-dialog]').close();await refreshAll();}}});
}

/** Povezuje izradu i zaključivanje narudžbi. @returns {void} */
function bindOrders() {
  document.querySelector('[data-order-tabs]').addEventListener('click',(event)=>{const button=event.target.closest('[data-order-status]');if(!button)return;activeOrderStatus=button.dataset.orderStatus;document.querySelectorAll('[data-order-status]').forEach(b=>b.classList.toggle('active',b===button));renderOrders();});
  document.querySelector('[data-add-order-product]').addEventListener('click',()=>{const selectedId=document.querySelector('[data-order-product-select]').value,p=products.find(x=>String(x.id)===String(selectedId));if(p){orderDraft.push({productId:p.id,name:p.name,quantity:1,costPrice:p.costPrice||0,price:p.price,size:p.sizes[0],version:p.version,note:''});renderOrderDraft();}});
  document.querySelector('[data-add-order-custom]').addEventListener('click',()=>{orderDraft.push({productId:null,name:'Novi proizvod',quantity:1,costPrice:0,price:0,size:'M',version:'Fan Version',note:''});renderOrderDraft();});
  document.querySelector('[data-order-items]').addEventListener('input',(event)=>{const row=event.target.closest('[data-order-item]');if(row&&event.target.dataset.orderField){orderDraft[Number(row.dataset.orderItem)][event.target.dataset.orderField]=event.target.type==='number'?Number(event.target.value):event.target.value;}});
  document.querySelector('[data-order-items]').addEventListener('click',(event)=>{const row=event.target.closest('[data-order-item]');if(row&&event.target.closest('[data-remove-order-item]')){orderDraft.splice(Number(row.dataset.orderItem),1);renderOrderDraft();}});
  document.querySelector('[data-order-form]').addEventListener('submit',async(event)=>{event.preventDefault();if(!orderDraft.length){toast('Dodajte barem jedan proizvod.');return;}const form=event.currentTarget,id=Number(form.dataset.orderId),order={title:form.elements.title.value.trim(),note:form.elements.note.value.trim(),items:structuredClone(orderDraft),status:'open'};if(id)await updatePurchaseOrder(id,order);else await createPurchaseOrder(order);document.querySelector('[data-order-dialog]').close();toast('Otvorena narudžba je spremljena.');await refreshAll();});
  document.querySelector('[data-orders-list]').addEventListener('click',async(event)=>{const card=event.target.closest('[data-order]');if(!card)return;const order=getCollection('orders').find(o=>o.id===Number(card.dataset.order));if(event.target.closest('[data-edit-order]'))openOrderDialog(order);if(event.target.closest('[data-close-order]'))await closeOrder(order);if(event.target.closest('[data-copy-order]')){await copyPurchaseOrder(order.id);toast('Narudžba je kopirana.');await refreshAll();}});
}

/** Povezuje financijske filtre i ručni unos. @returns {void} */
function bindFinance() {
  document.querySelector('[data-finance-period]').addEventListener('change',renderFinance);document.querySelector('[data-finance-type]').addEventListener('change',renderFinance);document.querySelector('[data-transaction-type]').addEventListener('change',renderTransactions);
  document.querySelector('[data-transaction-form]').addEventListener('submit',async(event)=>{event.preventDefault();const data=new FormData(event.currentTarget),type=data.get('type'),raw=Number(data.get('amount')),amount=negativeTypes.has(type)?-Math.abs(raw):Math.abs(raw),record={type,amount,description:data.get('description').trim(),source:'Ručni unos',date:new Date(data.get('date')).toISOString()};await createTransaction(record);recordChange('finance',`Ručna transakcija: ${record.description}`,null,record);document.querySelector('[data-transaction-dialog]').close();toast('Transakcija je dodana.');await refreshAll();});
}

/** Povezuje upravljanje bilješkama. @returns {void} */
function bindNotes() {
  document.querySelector('[data-note-status]').addEventListener('change',renderNotes);document.querySelector('[data-note-priority]').addEventListener('change',renderNotes);
  document.querySelector('[data-note-form]').addEventListener('submit',async(event)=>{event.preventDefault();const form=event.currentTarget,submit=form.querySelector('[type="submit"]');submit.disabled=true;try{const data=new FormData(form),id=data.get('id'),existing=getCollection('notes').find(n=>String(n.id)===String(id)),note={title:data.get('title').trim(),description:data.get('description').trim(),type:data.get('type'),amount:data.get('amount')?Number(data.get('amount')):null,dueDate:data.get('dueDate')||null,priority:data.get('priority'),status:data.get('status'),tags:data.get('tags').split(',').map(x=>x.trim()).filter(Boolean),productId:data.get('productId')||null,orderId:data.get('orderId')||null,pinned:data.get('pinned')==='on'};if(existing)await updateNote(id,note);else await createNote(note);recordChange('notes',existing?`Uređena bilješka: ${note.title}`:`Dodana bilješka: ${note.title}`,existing||null,note);document.querySelector('[data-note-dialog]').close();toast('Bilješka je spremljena.');await refreshAll();}catch(error){console.error('[DresHub Bilješke]',{service:'noteService',table:'notes',operation:'spremanje bilješke',message:error.message});toast(`Bilješka nije spremljena: ${error.message}`);}finally{submit.disabled=false;}});
  document.querySelector('[data-notes-list]').addEventListener('click',async(event)=>{
    const button=event.target.closest('[data-edit-note],[data-complete-note],[data-archive-note],[data-delete-note]');if(!button)return;
    const noteId=button.dataset.id||button.closest('[data-id]')?.dataset.id||button.closest('[data-note]')?.dataset.note;
    if(!noteId){console.warn('[DresHub Bilješke] Kliknuti gumb nema data-id; akcija je prekinuta.',button);return;}
    const note=getCollection('notes').find((item)=>String(item.id)===String(noteId));
    if(!note){console.warn('[DresHub Bilješke] Bilješka nije pronađena; akcija je prekinuta.',{noteId});return;}
    try{
      if(button.matches('[data-edit-note]')){openNoteDialog(note);return;}
      if(button.matches('[data-complete-note]')){await completeNote(noteId);recordChange('notes',`Završena bilješka: ${note.title}`,'Aktivna','Završena');}
      else if(button.matches('[data-archive-note]')){await archiveNote(noteId);recordChange('notes',`Arhivirana bilješka: ${note.title}`,null,'Arhivirana');}
      else if(button.matches('[data-delete-note]')){if(!confirm('Obrisati bilješku?'))return;await deleteNote(noteId);recordChange('notes',`Obrisana bilješka: ${note.title}`,note,null);}
      await refreshAll();
    }catch(error){console.error('[DresHub Bilješke]',{service:'noteService',table:'notes',operation:'akcija bilješke',noteId,message:error.message});toast(`Akcija nije uspjela: ${error.message}`);}
  });
}

/** Povezuje filtre povijesti. @returns {void} */
function bindHistories(){document.querySelector('[data-change-category]').addEventListener('change',renderChanges);document.querySelector('[data-change-period]').addEventListener('change',renderChanges);}

/** Povezuje spremanje, export i import postavki. @returns {void} */
function bindSettings() {
  document.querySelector('[data-settings-form]').addEventListener('submit',async(event)=>{event.preventDefault();const form=event.currentTarget,data=new FormData(form),settings=getAdminSettings(),newPassword=data.get('newPassword');if(newPassword&&String(data.get('securityAnswer')).trim().toLocaleLowerCase('hr')!=='tili'){toast('Odgovor na sigurnosno pitanje nije točan.');return;}const logoFile=form.elements.logo.files[0],logo=logoFile?(await readImages([logoFile]))[0]:settings.logo;const next={...settings,storeName:data.get('storeName').trim(),email:data.get('email').trim(),phoneLuki:data.get('phoneLuki').trim(),phoneBlaz:data.get('phoneBlaz').trim(),instagram:data.get('instagram').trim(),notification:data.get('notification').trim(),notificationVisible:data.get('notificationVisible')==='on',reservationHours:Number(data.get('reservationHours')),theme:data.get('theme'),badges:data.get('badges').split(',').map(x=>x.trim()).filter(Boolean),logo,adminPassword:newPassword||settings.adminPassword};await saveAdminSettings(next);form.elements.newPassword.value='';form.elements.securityAnswer.value='';document.documentElement.dataset.adminTheme=next.theme;toast('Postavke su spremljene.');await refreshAll();});
  document.querySelector('[data-export]').addEventListener('click',async()=>{const data=await exportAllData(),blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=`dreshub-backup-${new Date().toISOString().slice(0,10)}.json`;link.click();URL.revokeObjectURL(url);toast('Export je pripremljen.');});
  document.querySelector('[data-import]').addEventListener('change',async(event)=>{const file=event.target.files[0];if(!file)return;try{const data=JSON.parse(await file.text());if(data.products)saveProducts(data.products);['reservations','orders','transactions','notes','changes'].forEach(key=>{if(Array.isArray(data[key]))saveCollection(key,data[key]);});if(data.settings)saveAdminSettings(data.settings);toast('Backup je uspješno uvezen.');await refreshAll();}catch{toast('Backup datoteka nije ispravna.');}});
}

/** Pokreće admin aplikaciju nakon provjere prijave. @returns {Promise<void>} */
async function startAdmin() {
  const login=document.querySelector('[data-admin-login]'),app=document.querySelector('[data-admin-app]');
  setupOtherProductsAdminUI();
  bindNavigation();bindProducts();bindReservations();bindOrders();bindFinance();bindNotes();bindHistories();bindSettings();
  const showApp=()=>{login.hidden=true;app.hidden=false;showView(location.hash.slice(1) in viewNames?location.hash.slice(1):'dashboard');};
  const loadData=async()=>{
    try { await initializeAdminData(); }
    catch (error) { console.error('[DresHub Admin] Inicijalizacija jednog modula nije uspjela. Admin ostaje dostupan bez Local Storage fallbacka.',error); }
    try { await refreshAll(); }
    catch (error) { console.error('[DresHub Admin] Dio dashboard podataka nije moguće prikazati.',error); }
    if(!reservationRealtimeStarted){reservationRealtimeStarted=true;await subscribeToReservationChanges(()=>{renderDashboard();renderReservations();document.querySelectorAll('[data-active-reservations]').forEach((element)=>element.textContent=getReservations().filter((item)=>item.status==='active').length);});}
  };
  if(sessionStorage.getItem('dreshub.admin.auth')==='true'){showApp();void loadData();}
  document.querySelector('[data-login-form]').addEventListener('submit',async(event)=>{
    event.preventDefault();
    const password=String(new FormData(event.currentTarget).get('password')||'');
    let resolvedPassword;
    try{resolvedPassword=await Promise.race([getAdminPassword(),new Promise((_,reject)=>setTimeout(()=>reject(new Error('Supabase settings upit je istekao.')),8000))]);}
    catch(error){console.error('[DresHub Admin]',{service:'settingsService',table:'settings',operation:'admin prijava',message:error.message});document.querySelector('[data-login-error]').textContent='Admin prijava nije dostupna: provjerite Supabase settings tablicu.';return;}
    const accepted=password===String(resolvedPassword);
    if(accepted){sessionStorage.setItem('dreshub.admin.auth','true');document.querySelector('[data-login-error]').textContent='';showApp();void loadData();}
    else document.querySelector('[data-login-error]').textContent='Neispravna lozinka.';
  });
}

startAdmin();
