import { readStorage, writeStorage } from '../js/storage.js';
import { getProductById, decrementProductQuantity, incrementProductQuantity } from './productService.js';
import { createTransaction } from './transactionService.js';
import { createChangeHistoryEntry } from './changeHistoryService.js';
import { getSettings } from './settingsService.js';
import { getSupabaseClient, isSupabaseConfigured, reportSupabaseError, throwIfSupabaseError } from './supabaseClient.js';

const KEY = 'dreshub.reservations';
const SETTINGS_KEY = 'dreshub.admin.settings';
let reservationCache = isSupabaseConfigured()?[]:readStorage(KEY, []);
let reservationChannel=null;

/** @param {Object} row Redak baze. @returns {Object} UI rezervacija. */
function fromDatabase(row,product=null) { return { id:row.id,productId:row.product_id,name:row.customer_name,phone:row.customer_phone,note:row.note||'',status:row.status,contacted:false,createdAt:row.created_at,expiresAt:row.expires_at,completedAt:row.completed_at,cancelledAt:row.cancelled_at,cancelReason:row.cancel_reason,items:[{productId:row.product_id,name:product?.name||`Proizvod #${row.product_id}`,image:product?.images?.[0]||'',size:product?.sizes?.[0]||'',quantity:1,price:Number(row.reserved_price||0)}] }; }

/** Učitava Supabase rezervacije u servisni cache. @returns {Promise<Array<Object>>} */
export async function hydrateReservations() {
  const client = await getSupabaseClient();
  if (client) { const { data, error } = await client.from('reservations').select('*'); if(!error)reservationCache=(await Promise.all((data??[]).map(async(row)=>fromDatabase(row,await getProductById(row.product_id))))).sort((a,b)=>new Date(b.createdAt||0)-new Date(a.createdAt||0));else{reportSupabaseError(error,{service:'reservationService',table:'reservations',operation:'dohvat rezervacija',columns:['*']});reservationCache=[];} }
  else reservationCache = isSupabaseConfigured()?[]:readStorage(KEY, []);
  return reservationCache;
}

/** @returns {Array<Object>} Trenutačno učitane rezervacije. */
export function getReservations() { return reservationCache; }

/** Prati promjene rezervacija iz Supabasea. @param {(reservations:Array<Object>)=>void} callback Poziv nakon promjene. @returns {Promise<()=>Promise<void>>} Odjava. */
export async function subscribeToReservationChanges(callback){
  const client=await getSupabaseClient();if(!client||reservationChannel)return async()=>{};
  reservationChannel=client.channel('dreshub-admin-reservations').on('postgres_changes',{event:'*',schema:'public',table:'reservations'},async()=>{await hydrateReservations();callback?.(reservationCache);}).subscribe();
  return async()=>{if(reservationChannel){await client.removeChannel(reservationChannel);reservationChannel=null;}};
}

/** @param {number|string} reservationId ID rezervacije. @returns {Object|null} */
export function getReservationById(reservationId) { return reservationCache.find((item)=>String(item.id)===String(reservationId))??null; }

/**
 * Stvara rezervaciju, smanjuje zalihe i sprema poslovni zapis.
 * @param {{productId?:string,items?:Array<Object>,name:string,phone:string,note?:string}} reservationData Podaci.
 * @returns {Promise<Object>} Rezervacija.
 */
export async function createReservation(reservationData) {
  const settings = isSupabaseConfigured()?await getSettings():readStorage(SETTINGS_KEY, { reservationHours: 48 });
  const createdAt = new Date(), expiresAt = new Date(createdAt.getTime() + Number(settings.reservationHours || 48) * 3600000);
  const requestedItems = reservationData.items?.length ? reservationData.items : [{ productId: String(reservationData.productId||''), quantity: 1 }];
  const items = [];
  for (const requested of requestedItems) {
    const productId=String(requested.productId||''),product = await getProductById(productId), quantity = Math.max(1, Number(requested.quantity || 1));
    if (!product || product.stock < quantity) continue;
    const reserved = await decrementProductQuantity(product.id, quantity);
    if (reserved) items.push({ productId: product.id, name: product.name, image: product.images[0], size: requested.size || product.sizes[0], quantity, price: product.price });
  }
  if (!items.length) throw new Error('Odabrani proizvod više nije dostupan.');
  const record = { name: reservationData.name, phone: reservationData.phone, note: reservationData.note || '', items, status: 'active', contacted: false, createdAt: createdAt.toISOString(), expiresAt: expiresAt.toISOString() };
  const client = await getSupabaseClient();
  if (client) {
    const payload = items.flatMap((item)=>Array.from({length:item.quantity},()=>({product_id:String(item.productId),customer_name:record.name,customer_phone:record.phone,note:record.note,status:record.status,reserved_price:Number(item.price),expires_at:record.expiresAt,created_at:record.createdAt})));
    const { data, error } = await client.from('reservations').insert(payload).select();
    if(error)for(const reservedItem of items)await incrementProductQuantity(reservedItem.productId,reservedItem.quantity);
    throwIfSupabaseError(error,{service:'reservationService',table:'reservations',operation:'stvaranje rezervacije',columns:Object.keys(payload)});
    const saved=await Promise.all((data??[]).map(async(row)=>fromDatabase(row,await getProductById(String(row.product_id)))));reservationCache=[...saved,...reservationCache];return saved[0];
  }
  if(isSupabaseConfigured())throw new Error('Supabase rezervacije trenutačno nisu dostupne.');
  const saved = { id: Date.now(), ...record }; reservationCache = [...reservationCache, saved]; writeStorage(KEY, reservationCache); window.dispatchEvent(new CustomEvent('dreshub:reservations-changed')); return saved;
}

/** @param {number|string} reservationId ID. @returns {Promise<Object|null>} */
export async function markReservationContacted(reservationId) { const reservation=getReservationById(reservationId);if(!reservation)return null;reservation.contacted=true;return reservation; }

/** @param {number|string} reservationId ID. @returns {Promise<Object|null>} */
export async function completeReservation(reservationId) {
  const reservation = getReservationById(reservationId); if (!reservation || reservation.status !== 'active') return null;
  const amount = reservation.items.reduce((sum, item) => sum + Number(item.price) * Number(item.quantity), 0);
  await createTransaction({ type: 'Prodaja', amount, description: `Prodaja za ${reservation.name}`, sourceType:'reservation',sourceId:reservation.id,date: new Date().toISOString() });
  const completed = await updateReservationFields(reservationId, { status: 'completed', completedAt: new Date().toISOString() });
  await createChangeHistoryEntry({ category: 'reservations',entityId:reservation.id,changeType:'complete', description: `Završena rezervacija #${reservation.id}`, oldValue: 'active', newValue: 'completed' });
  return completed;
}

/** @param {number|string} reservationId ID. @param {string} reason Razlog. @returns {Promise<Object|null>} */
export async function cancelReservation(reservationId, reason) { return releaseReservation(reservationId, 'cancelled', reason); }

/** @param {number|string} reservationId ID. @returns {Promise<Object|null>} */
export async function expireReservation(reservationId) { return releaseReservation(reservationId, 'expired', 'Rezervacija je istekla.'); }

/** @param {number|string} reservationId ID. @param {string} status Status. @param {string} reason Razlog. @returns {Promise<Object|null>} */
async function releaseReservation(reservationId, status, reason) {
  const reservation = getReservationById(reservationId); if (!reservation || reservation.status !== 'active') return null;
  for (const item of reservation.items) await incrementProductQuantity(item.productId, item.quantity);
  const updated = await updateReservationFields(reservationId, { status, cancelReason: reason, ...(status==='cancelled'?{cancelledAt:new Date().toISOString()}:{}) });
  await createChangeHistoryEntry({ category: 'reservations',entityId:reservation.id,changeType:status, description: `${status === 'cancelled' ? 'Otkazana' : 'Istekla'} rezervacija #${reservation.id}`, oldValue: 'active', newValue: status });
  return updated;
}

/** @param {number|string} reservationId ID. @param {Object} fields Polja. @returns {Promise<Object|null>} */
async function updateReservationFields(reservationId, fields) {
  const client = await getSupabaseClient();
  if (client) { const dbFields={};if('status'in fields)dbFields.status=fields.status;if('cancelReason'in fields)dbFields.cancel_reason=fields.cancelReason;if('completedAt'in fields)dbFields.completed_at=fields.completedAt;if('cancelledAt'in fields)dbFields.cancelled_at=fields.cancelledAt;const { data, error } = await client.from('reservations').update(dbFields).eq('id', String(reservationId)).select().single();throwIfSupabaseError(error,{service:'reservationService',table:'reservations',operation:'ažuriranje rezervacije',columns:Object.keys(dbFields)});const previous=getReservationById(reservationId),product=previous?.items?.[0]?{name:previous.items[0].name,images:[previous.items[0].image],sizes:[previous.items[0].size]}:null,updated=fromDatabase(data,product);updated.contacted=previous?.contacted||false;reservationCache=reservationCache.map((item)=>String(item.id)===String(updated.id)?updated:item);return updated; }
  if(isSupabaseConfigured())throw new Error('Supabase rezervacije trenutačno nisu dostupne.');
  const reservation=getReservationById(reservationId);if(!reservation)return null;Object.assign(reservation,fields);writeStorage(KEY,reservationCache);window.dispatchEvent(new CustomEvent('dreshub:reservations-changed'));return reservation;
}
