import { readStorage, writeStorage } from '../js/storage.js';
import { getAllProducts, saveProducts, createProduct, updateProduct, archiveProduct, deleteProduct as removeProduct, incrementProductQuantity, decrementProductQuantity } from './productService.js';
import { getReservations, hydrateReservations, markReservationContacted, completeReservation, cancelReservation, expireReservation } from './reservationService.js';
import { isSupabaseConfigured } from './supabaseClient.js';
import { getPurchaseOrders } from './purchaseOrderService.js';
import { getTransactions } from './transactionService.js';
import { getNotes } from './noteService.js';
import { getChangeHistory, createChangeHistoryEntry } from './changeHistoryService.js';
import { getSettings, updateMultipleSettings } from './settingsService.js';

const KEYS = {
  reservations: 'dreshub.reservations', orders: 'dreshub.admin.orders', transactions: 'dreshub.admin.transactions',
  notes: 'dreshub.admin.notes', changes: 'dreshub.admin.changes', settings: 'dreshub.admin.settings'
};
const memoryCollections={orders:[],transactions:[],notes:[],changes:[],settings:{}};

/** @param {string} collection Naziv kolekcije. @returns {Array<Object>} Zapisi kolekcije. */
export function getCollection(collection) {
  return isSupabaseConfigured()?(memoryCollections[collection]||[]):readStorage(KEYS[collection], []);
}

/** @param {string} collection Naziv kolekcije. @param {Array<Object>} records Zapisi. @returns {Array<Object>} */
export function saveCollection(collection, records) {
  if(isSupabaseConfigured())throw new Error(`${collection} se ne smije spremati u Local Storage dok je Supabase konfiguriran.`);
  writeStorage(KEYS[collection], records);
  window.dispatchEvent(new CustomEvent(`dreshub:${collection}-changed`));
  return records;
}

/** Osvježava memorijski prikaz admin kolekcija iz Supabasea bez rušenja drugih modula. @returns {Promise<void>} */
export async function refreshAdminCollections(){
  if(!isSupabaseConfigured())return;
  const tasks={orders:getPurchaseOrders(),transactions:getTransactions(),notes:getNotes(),changes:getChangeHistory(),settings:getSettings()};
  const entries=Object.entries(tasks),results=await Promise.allSettled(entries.map(([,task])=>task));
  results.forEach((result,index)=>{const name=entries[index][0];if(result.status==='fulfilled')memoryCollections[name]=result.value;else console.error('[DresHub Admin]',{service:'adminService',table:name,operation:'osvježavanje admin kolekcije',message:result.reason?.message||String(result.reason)});});
  await hydrateReservations();
}

/**
 * Inicijalizira trajne admin kolekcije smislenim početnim podacima.
 * @returns {Promise<void>}
 */
export async function initializeAdminData() {
  const products = await getAllProducts();
  await hydrateReservations();
  if (isSupabaseConfigured()) {
    Object.values(KEYS).forEach((key)=>localStorage.removeItem(key));
    localStorage.removeItem('dreshub.products');
    await refreshAdminCollections();
    for (const reservation of getReservations().filter((item) => item.status === 'active' && new Date(item.expiresAt) <= new Date())) await expireReservation(reservation.id);
    return;
  }
  if (!readStorage(KEYS.settings, null) && !isSupabaseConfigured()) writeStorage(KEYS.settings, {
    storeName: 'DresHub', phoneLuki: '0981888236', phoneBlaz: '0998258395', email: 'loncaricluka256@gmail.com',
    instagram: '@dreshub', notification: 'Besplatna dostava za 2 ili više dresova', notificationVisible: true,
    reservationHours: 48, theme: 'dark', badges: ['NOVO', 'POPULARNO', 'AKCIJA', 'ZADNJI KOMAD'], adminPassword: 'admin'
  });
  if (!readStorage(KEYS.transactions, null) && !isSupabaseConfigured()) writeStorage(KEYS.transactions, [
    { id: 101, type: 'Prodaja', amount: 89.8, description: 'Prodaja 2 dresa', source: 'Rezervacija #1001', date: new Date(Date.now() - 86400000).toISOString() },
    { id: 102, type: 'Trošak', amount: -180, description: 'Nabava novih dresova', source: 'Narudžba #501', date: new Date(Date.now() - 5 * 86400000).toISOString() }
  ]);
  if (!readStorage(KEYS.notes, null) && !isSupabaseConfigured()) writeStorage(KEYS.notes, [
    { id: 201, title: 'Provjeriti novu pošiljku', description: 'Usporediti veličine i količine.', type: 'Narudžba', amount: null, dueDate: new Date(Date.now() + 86400000).toISOString().slice(0,10), priority: 'Visok', status: 'Aktivna', tags: ['nabava'], productId: null, orderId: null, pinned: true, createdAt: new Date().toISOString() }
  ]);
  if (!readStorage(KEYS.orders, null) && !isSupabaseConfigured()) writeStorage(KEYS.orders, []);
  if (!readStorage(KEYS.changes, null) && !isSupabaseConfigured()) writeStorage(KEYS.changes, []);
  if (!getReservations().length && !isSupabaseConfigured()) writeStorage(KEYS.reservations, [
    { id: 1001, name: 'Ivan Horvat', phone: '0981234567', note: 'Molim veličinu L.', items: [{ productId: products[0].id, name: products[0].name, image: products[0].images[0], size: 'L', quantity: 1, price: products[0].price }], status: 'active', contacted: false, createdAt: new Date(Date.now() - 2 * 3600000).toISOString(), expiresAt: new Date(Date.now() + 46 * 3600000).toISOString() },
    { id: 1002, name: 'Marko Kovač', phone: '0992223344', note: '', items: [{ productId: products[1].id, name: products[1].name, image: products[1].images[0], size: 'M', quantity: 1, price: products[1].price }], status: 'completed', contacted: true, createdAt: new Date(Date.now() - 3 * 86400000).toISOString(), expiresAt: new Date(Date.now() - 86400000).toISOString() }
  ]);
  else {
    const reservations = getReservations();
    let productsChanged = false;
    reservations.forEach((reservation) => {
      if (reservation.status === 'received') reservation.status = 'active';
      if (!reservation.items?.length && reservation.productId) {
        const product=products.find((item)=>String(item.id)===String(reservation.productId));
        if (product) reservation.items = [{ productId: product.id, name: product.name, image: product.images[0], size: product.sizes[0], quantity: 1, price: product.price }];
      }
      reservation.createdAt ||= new Date(reservation.id || Date.now()).toISOString();
      reservation.expiresAt ||= new Date(new Date(reservation.createdAt).getTime() + 48 * 3600000).toISOString();
      reservation.contacted ??= false;
      if (reservation.status === 'active' && new Date(reservation.expiresAt) <= new Date()) {
        reservation.status = 'expired';
        reservation.items?.forEach((entry) => {
          const product=products.find((item)=>String(item.id)===String(entry.productId));
          if (product) { product.stock += Number(entry.quantity || 1); productsChanged = true; }
        });
      }
    });
    writeStorage(KEYS.reservations, reservations);
    if (productsChanged) saveProducts(products);
  }
  await hydrateReservations();
}

/**
 * Dodaje zapis u povijest promjena.
 * @param {string} category Kategorija promjene.
 * @param {string} description Opis.
 * @param {*} oldValue Stara vrijednost.
 * @param {*} newValue Nova vrijednost.
 * @returns {Object} Novi zapis.
 */
export function recordChange(category, description, oldValue = null, newValue = null) {
  const record = { id: Date.now() + Math.random(), date: new Date().toISOString(), category, description, oldValue, newValue, admin: 'Admin' };
  if (isSupabaseConfigured()) void createChangeHistoryEntry(record).catch((error)=>console.error('[DresHub Admin]',{service:'changeHistoryService',table:'change_history',operation:'spremanje povijesti promjena',message:error.message}));
  else saveCollection('changes', [record, ...getCollection('changes')]);
  return record;
}

/** @param {Object} product Podaci proizvoda. @returns {Promise<Object>} Spremljeni proizvod. */
export async function saveProduct(product) {
  const products = await getAllProducts();
  const index = products.findIndex((item) => String(item.id)===String(product.id));
  const existing = index >= 0 ? products[index] : null;
  const saved = { archived: false, ...existing, ...product, id: existing?.id ?? Date.now(), updatedAt: new Date().toISOString() };
  const persisted = existing ? await updateProduct(existing.id, saved) : await createProduct(saved);
  recordChange('products', existing ? `Uređen proizvod: ${saved.name}` : `Dodan proizvod: ${saved.name}`, existing, saved);
  if (existing && (existing.price !== saved.price || existing.oldPrice !== saved.oldPrice || existing.costPrice !== saved.costPrice)) {
    recordChange('prices', `Promjena cijene: ${saved.name}`, { costPrice: existing.costPrice, price: existing.price, oldPrice: existing.oldPrice }, { costPrice: saved.costPrice, price: saved.price, oldPrice: saved.oldPrice });
  }
  if (existing && existing.stock !== saved.stock) recordChange('quantities', `Promjena količine: ${saved.name}`, existing.stock, saved.stock);
  return persisted;
}

/** @param {number} productId ID proizvoda. @param {number} delta Promjena količine. @returns {Promise<Object|null>} */
export async function adjustProductStock(productId, delta) {
  const products = await getAllProducts();
  const product = products.find((item) => String(item.id)===String(productId));
  if (!product) return null;
  const oldStock = product.stock;
  const updated = Number(delta) >= 0 ? await incrementProductQuantity(productId, delta) : await decrementProductQuantity(productId, Math.abs(delta));
  recordChange('quantities', `Promjena količine: ${product.name}`, oldStock, updated?.stock ?? oldStock);
  return updated;
}

/** @param {number} productId ID proizvoda. @param {boolean} archived Novo stanje. @returns {Promise<void>} */
export async function setProductArchived(productId, archived) {
  const products = await getAllProducts();
  const product = products.find((item) => String(item.id)===String(productId));
  if (!product) return;
  if (archived) await archiveProduct(productId); else await updateProduct(productId, { archived: false });
  recordChange('products', `${archived ? 'Arhiviran' : 'Vraćen'} proizvod: ${product.name}`, !archived, archived);
}

/** @param {number} productId ID proizvoda. @returns {Promise<void>} */
export async function deleteProduct(productId) {
  const products = await getAllProducts();
  const product = products.find((item) => String(item.id)===String(productId));
  await removeProduct(productId);
  if (product) recordChange('products', `Obrisan proizvod: ${product.name}`, product, null);
}

/**
 * Mijenja status rezervacije i izvršava pripadajuće poslovne posljedice.
 * @param {number} reservationId ID rezervacije.
 * @param {string} status Novi status.
 * @param {string} [reason=''] Razlog otkazivanja.
 * @returns {Promise<Object|null>} Ažurirana rezervacija.
 */
export async function updateReservation(reservationId, status, reason = '') {
  const reservations = getReservations();
  const reservation=reservations.find((item)=>String(item.id)===String(reservationId));
  if (!reservation) return null;
  const oldStatus = reservation.status;
  if (status === 'completed') return completeReservation(reservationId);
  if (status === 'cancelled') return cancelReservation(reservationId, reason);
  if (status === 'expired') return expireReservation(reservationId);
  if (status === 'contacted') return markReservationContacted(reservationId);
  recordChange('reservations', `Rezervacija #${reservation.id}: ${oldStatus} → ${status}`, oldStatus, status);
  return reservation;
}

/** @returns {Object} Trenutačne javne i admin postavke. */
export function getAdminSettings() { return isSupabaseConfigured()?memoryCollections.settings:readStorage(KEYS.settings, {}); }

/** @param {Object} settings Postavke. @returns {Object} Spremljene postavke. */
export async function saveAdminSettings(settings) {
  const old = getAdminSettings();
  if(isSupabaseConfigured())memoryCollections.settings=await updateMultipleSettings(settings);
  else writeStorage(KEYS.settings, settings);
  recordChange('settings', 'Ažurirane postavke trgovine', old, settings);
  return settings;
}

/** @returns {Object} Potpuni backup podataka aplikacije. */
export async function exportAllData() {
  return { exportedAt: new Date().toISOString(), products: await getAllProducts(), reservations: getReservations(), orders: getCollection('orders'), transactions: getCollection('transactions'), notes: getCollection('notes'), changes: getCollection('changes'), settings: getAdminSettings() };
}
