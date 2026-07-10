import { getSupabaseClient, isSupabaseConfigured, reportSupabaseError, throwIfSupabaseError } from './supabaseClient.js';
import { getProductById } from './productService.js';
import { createChangeHistoryEntry } from './changeHistoryService.js';

const SERVICE = 'sellerService';

/** @param {Object} row Supabase seller redak. @returns {Object} UI prodavač. */
function sellerFromDatabase(row) {
  return {
    id: row.id,
    fullName: row.full_name,
    phone: row.phone || '',
    contact: row.contact || '',
    note: row.note || '',
    startedAt: row.started_at,
    status: row.status || 'active',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    listings: [],
    physicalItems: [],
    activities: [],
    notifications: []
  };
}

/** @param {Object} seller Prodavač. @returns {Object} Supabase payload. */
function sellerToDatabase(seller) {
  return {
    full_name: seller.fullName || seller.full_name,
    phone: seller.phone || null,
    contact: seller.contact || null,
    note: seller.note || null,
    started_at: seller.startedAt || seller.started_at || new Date().toISOString().slice(0, 10),
    status: seller.status || 'active'
  };
}

/** @param {Object} row Supabase redak. @returns {Object} UI oglas. */
function listingFromDatabase(row) {
  return {
    id: row.id,
    sellerId: row.seller_id,
    productId: row.product_id,
    quantity: Number(row.quantity || 0),
    status: row.status || 'active',
    note: row.note || '',
    addedAt: row.added_at,
    updatedAt: row.updated_at
  };
}

/** @param {Object} row Supabase redak. @returns {Object} UI fizička evidencija. */
function physicalFromDatabase(row) {
  return {
    id: row.id,
    sellerId: row.seller_id,
    productId: row.product_id,
    quantity: Number(row.quantity || 0),
    handedOffAt: row.handed_off_at,
    returnedAt: row.returned_at,
    note: row.note || '',
    returnNote: row.return_note || '',
    updatedAt: row.updated_at
  };
}

/** @param {Object} row Supabase redak. @returns {Object} UI aktivnost. */
function activityFromDatabase(row) {
  return {
    id: row.id,
    sellerId: row.seller_id,
    productId: row.product_id,
    type: row.activity_type,
    oldQuantity: row.old_quantity,
    newQuantity: row.new_quantity,
    description: row.description || '',
    createdAt: row.created_at
  };
}

/** @param {Object} row Supabase fizički redak. @returns {Object|null} UI zapis. */
function optionalPhysicalFromDatabase(row) {
  return row ? physicalFromDatabase(row) : null;
}

/** @returns {Promise<Object>} Supabase klijent ili jasna greška. */
async function requireClient() {
  const client = await getSupabaseClient();
  if (!client) throw new Error('Modul Prodavači zahtijeva dostupnu Supabase vezu.');
  return client;
}

/** @param {Object} client Supabase klijent. @param {Object} entry Aktivnost. @returns {Promise<void>} */
async function logSellerActivity(client, entry) {
  const payload = {
    seller_id: entry.sellerId,
    product_id: entry.productId || null,
    activity_type: entry.type,
    old_quantity: entry.oldQuantity ?? null,
    new_quantity: entry.newQuantity ?? null,
    description: entry.description || ''
  };
  const { error } = await client.from('seller_activity').insert(payload);
  throwIfSupabaseError(error, { service: SERVICE, table: 'seller_activity', operation: 'spremanje aktivnosti prodavača', columns: Object.keys(payload) });
}

/** @param {string} description Opis. @param {*} oldValue Stara vrijednost. @param {*} newValue Nova vrijednost. @returns {void} */
function recordGlobalSellerChange(description, oldValue = null, newValue = null) {
  void createChangeHistoryEntry({
    category: 'sellers',
    entityType: 'sellers',
    changeType: 'update',
    description,
    oldValue,
    newValue,
    admin: 'Admin'
  }).catch((error) => console.error('[DresHub Prodavači]', { service: 'changeHistoryService', table: 'change_history', operation: 'spremanje opće povijesti', message: error.message }));
}

/** @returns {Promise<Array<Object>>} Prodavači s povezanim oglasima, fizičkim stanjem, obavijestima i aktivnosti. */
export async function getSellers() {
  const client = await getSupabaseClient();
  if (!client) return isSupabaseConfigured() ? [] : [];
  const [sellerResult, listingResult, physicalResult, activityResult] = await Promise.all([
    client.from('sellers').select('*').order('updated_at', { ascending: false }),
    client.from('seller_listings').select('*'),
    client.from('seller_physical_items').select('*').gt('quantity', 0),
    client.from('seller_activity').select('*').order('created_at', { ascending: false }).limit(500)
  ]);
  if (sellerResult.error) {
    reportSupabaseError(sellerResult.error, { service: SERVICE, table: 'sellers', operation: 'dohvat prodavača', columns: ['*'] });
    return [];
  }
  for (const [result, table] of [[listingResult, 'seller_listings'], [physicalResult, 'seller_physical_items'], [activityResult, 'seller_activity']]) {
    if (result.error) reportSupabaseError(result.error, { service: SERVICE, table, operation: 'dohvat povezanih podataka prodavača', columns: ['*'] });
  }
  const sellers = (sellerResult.data || []).map(sellerFromDatabase);
  const bySeller = new Map(sellers.map((seller) => [String(seller.id), seller]));
  for (const row of listingResult.data || []) bySeller.get(String(row.seller_id))?.listings.push(listingFromDatabase(row));
  for (const row of physicalResult.data || []) bySeller.get(String(row.seller_id))?.physicalItems.push(physicalFromDatabase(row));
  for (const row of activityResult.data || []) bySeller.get(String(row.seller_id))?.activities.push(activityFromDatabase(row));
  return sellers;
}

/** @param {Object} seller Podaci prodavača. @returns {Promise<Object>} Novi prodavač. */
export async function createSeller(seller) {
  const client = await requireClient();
  const payload = sellerToDatabase(seller);
  const { data, error } = await client.from('sellers').insert(payload).select().single();
  throwIfSupabaseError(error, { service: SERVICE, table: 'sellers', operation: 'stvaranje prodavača', columns: Object.keys(payload) });
  recordGlobalSellerChange(`Dodan prodavač: ${payload.full_name}`, null, payload);
  return sellerFromDatabase(data);
}

/** @param {string} sellerId ID prodavača. @param {Object} seller Podaci. @returns {Promise<Object>} Ažuriran prodavač. */
export async function updateSeller(sellerId, seller) {
  const client = await requireClient();
  const payload = sellerToDatabase(seller);
  const { data, error } = await client.from('sellers').update(payload).eq('id', String(sellerId)).select().single();
  throwIfSupabaseError(error, { service: SERVICE, table: 'sellers', operation: 'ažuriranje prodavača', columns: Object.keys(payload) });
  recordGlobalSellerChange(`Ažuriran prodavač: ${payload.full_name}`, null, payload);
  return sellerFromDatabase(data);
}

/** @param {string} sellerId ID prodavača. @param {string} productId ID proizvoda. @param {Object} data Podaci oglasa. @returns {Promise<Object>} Oglas. */
export async function upsertSellerListing(sellerId, productId, data = {}) {
  const client = await requireClient();
  const payload = {
    seller_id: String(sellerId),
    product_id: String(productId),
    quantity: Math.max(0, Number(data.quantity ?? 0)),
    status: data.status || 'active',
    note: data.note || null
  };
  const previous = await client.from('seller_listings').select('*').eq('seller_id', sellerId).eq('product_id', productId).maybeSingle();
  if (previous.error) throwIfSupabaseError(previous.error, { service: SERVICE, table: 'seller_listings', operation: 'dohvat postojećeg oglasa', columns: ['seller_id', 'product_id'] });
  const { data: saved, error } = await client.from('seller_listings').upsert(payload, { onConflict: 'seller_id,product_id' }).select().single();
  throwIfSupabaseError(error, { service: SERVICE, table: 'seller_listings', operation: 'spremanje oglasa prodavača', columns: Object.keys(payload) });
  await logSellerActivity(client, {
    sellerId,
    productId,
    type: previous.data ? 'listing_updated' : 'listing_added',
    oldQuantity: previous.data?.quantity ?? null,
    newQuantity: payload.quantity,
    description: previous.data ? 'Oglas je ručno ažuriran.' : 'Proizvod je ručno dodan u ponudu prodavača.'
  });
  recordGlobalSellerChange('Ažuriran oglas prodavača', previous.data, payload);
  return listingFromDatabase(saved);
}

/** @param {string} sellerId ID prodavača. @param {string} productId ID proizvoda. @returns {Promise<void>} */
export async function removeSellerListing(sellerId, productId) {
  const client = await requireClient();
  const previous = await client.from('seller_listings').select('*').eq('seller_id', sellerId).eq('product_id', productId).maybeSingle();
  const { error } = await client.from('seller_listings').delete().eq('seller_id', String(sellerId)).eq('product_id', String(productId));
  throwIfSupabaseError(error, { service: SERVICE, table: 'seller_listings', operation: 'uklanjanje oglasa prodavača', columns: ['seller_id', 'product_id'] });
  await logSellerActivity(client, { sellerId, productId, type: 'listing_removed', oldQuantity: previous.data?.quantity ?? null, newQuantity: 0, description: 'Proizvod je uklonjen iz ponude prodavača.' });
  recordGlobalSellerChange('Uklonjen oglas prodavača', previous.data, null);
}

/** @param {string} sellerId ID prodavača. @param {Array<{productId:string,quantity:number}>} items Stavke. @param {Object} options Opcije. @returns {Promise<void>} */
export async function handoffSellerProducts(sellerId, items, options = {}) {
  const client = await requireClient();
  for (const item of items) {
    const product = await getProductById(item.productId);
    if (!product) throw new Error('Odabrani proizvod više nije dostupan.');
    const quantity = Math.max(1, Number(item.quantity || 1));
    if (quantity > Number(product.stock || 0)) throw new Error(`Nije moguće predati ${quantity} kom. proizvoda "${product.name}" jer je glavno stanje ${product.stock}.`);
    const current = await client.from('seller_physical_items').select('*').eq('seller_id', sellerId).eq('product_id', item.productId).maybeSingle();
    throwIfSupabaseError(current.error, { service: SERVICE, table: 'seller_physical_items', operation: 'dohvat fizičke evidencije', columns: ['seller_id', 'product_id'] });
    const nextQuantity = Number(current.data?.quantity || 0) + quantity;
    const physicalPayload = {
      seller_id: String(sellerId),
      product_id: String(item.productId),
      quantity: nextQuantity,
      handed_off_at: options.handedOffAt || new Date().toISOString(),
      note: options.note || current.data?.note || null,
      returned_at: null,
      return_note: null
    };
    const physical = await client.from('seller_physical_items').upsert(physicalPayload, { onConflict: 'seller_id,product_id' });
    throwIfSupabaseError(physical.error, { service: SERVICE, table: 'seller_physical_items', operation: 'spremanje fizičke predaje', columns: Object.keys(physicalPayload) });
    await logSellerActivity(client, { sellerId, productId: item.productId, type: current.data ? 'physical_added' : 'physical_handoff', oldQuantity: current.data?.quantity ?? 0, newQuantity: nextQuantity, description: `Fizički predano prodavaču: ${quantity} kom.` });

    const listing = await client.from('seller_listings').select('*').eq('seller_id', sellerId).eq('product_id', item.productId).maybeSingle();
    throwIfSupabaseError(listing.error, { service: SERVICE, table: 'seller_listings', operation: 'dohvat oglasa nakon predaje', columns: ['seller_id', 'product_id'] });
    const listingPayload = { seller_id: String(sellerId), product_id: String(item.productId), quantity: Math.max(0, Number(product.stock || 0)), status: 'active', note: listing.data?.note || options.note || null };
    const savedListing = await client.from('seller_listings').upsert(listingPayload, { onConflict: 'seller_id,product_id' });
    throwIfSupabaseError(savedListing.error, { service: SERVICE, table: 'seller_listings', operation: 'automatsko dodavanje proizvoda u ponudu', columns: Object.keys(listingPayload) });
    if (!listing.data) await logSellerActivity(client, { sellerId, productId: item.productId, type: 'listing_auto_added', oldQuantity: null, newQuantity: listingPayload.quantity, description: 'Proizvod je automatski dodan u oglašavanje nakon fizičke predaje.' });
  }
  recordGlobalSellerChange('Fizička predaja proizvoda prodavaču', null, { sellerId, items });
}

/** @param {string} sellerId ID prodavača. @param {string} productId ID proizvoda. @param {number} quantity Količina. @param {string} [note=''] Napomena. @returns {Promise<void>} */
export async function returnSellerPhysicalProduct(sellerId, productId, quantity, note = '') {
  const client = await requireClient();
  const current = await client.from('seller_physical_items').select('*').eq('seller_id', sellerId).eq('product_id', productId).maybeSingle();
  throwIfSupabaseError(current.error, { service: SERVICE, table: 'seller_physical_items', operation: 'dohvat fizičke evidencije za povrat', columns: ['seller_id', 'product_id'] });
  if (!current.data) throw new Error('Ovaj proizvod nije evidentiran kao fizički predan prodavaču.');
  const oldQuantity = Number(current.data.quantity || 0);
  const requested = Number(quantity || 0);
  if (!Number.isFinite(requested) || requested <= 0) throw new Error('Količina za povrat mora biti veća od 0.');
  if (requested > oldQuantity) throw new Error(`Nije moguće vratiti ${requested} kom. jer je fizički kod prodavača ${oldQuantity}.`);
  const returned = requested;
  const nextQuantity = Math.max(0, oldQuantity - returned);
  if (nextQuantity > 0) {
    const update = await client.from('seller_physical_items').update({ quantity: nextQuantity, returned_at: new Date().toISOString(), return_note: note || null }).eq('id', current.data.id);
    throwIfSupabaseError(update.error, { service: SERVICE, table: 'seller_physical_items', operation: 'spremanje djelomičnog povrata', columns: ['quantity', 'returned_at', 'return_note'] });
  } else {
    const removal = await client.from('seller_physical_items').delete().eq('id', current.data.id);
    throwIfSupabaseError(removal.error, { service: SERVICE, table: 'seller_physical_items', operation: 'uklanjanje vraćenog fizičkog proizvoda', columns: ['id'] });
  }
  await logSellerActivity(client, { sellerId, productId, type: 'physical_returned', oldQuantity, newQuantity: nextQuantity, description: `Fizički vraćeno: ${returned} kom.${note ? ` ${note}` : ''}` });
  recordGlobalSellerChange('Fizički proizvod vraćen od prodavača', oldQuantity, nextQuantity);
}

/** Vraća jedan fizički komad tako da prije izmjene uvijek čita svježi Supabase zapis. */
export async function returnOneSellerPhysicalProduct(sellerId, productId) {
  const client = await requireClient();
  const current = await client.from('seller_physical_items').select('*').eq('seller_id', String(sellerId)).eq('product_id', String(productId)).maybeSingle();
  throwIfSupabaseError(current.error, { service: SERVICE, table: 'seller_physical_items', operation: 'dohvat fizičkog zapisa za povrat jednog komada', columns: ['seller_id', 'product_id', 'quantity'] });
  if (!current.data) throw new Error('Fizički zapis za ovaj proizvod nije pronađen.');
  const oldQuantity = Number(current.data.quantity || 0);
  if (oldQuantity <= 0) throw new Error('Ovaj proizvod više nije fizički kod prodavača.');
  const nextQuantity = oldQuantity - 1;
  if (nextQuantity > 0) {
    const update = await client.from('seller_physical_items').update({ quantity: nextQuantity, returned_at: new Date().toISOString() }).eq('id', current.data.id);
    throwIfSupabaseError(update.error, { service: SERVICE, table: 'seller_physical_items', operation: 'povrat jednog fizičkog komada', columns: ['quantity', 'returned_at'] });
  } else {
    const removal = await client.from('seller_physical_items').delete().eq('id', current.data.id);
    throwIfSupabaseError(removal.error, { service: SERVICE, table: 'seller_physical_items', operation: 'brisanje fizičkog zapisa nakon povrata zadnjeg komada', columns: ['id'] });
  }
  await logSellerActivity(client, { sellerId, productId, type: 'physical_returned_one', oldQuantity, newQuantity: nextQuantity, description: 'Vraćen je jedan fizički komad.' });
  recordGlobalSellerChange('Vraćen jedan fizički proizvod od prodavača', oldQuantity, nextQuantity);
  return optionalPhysicalFromDatabase(nextQuantity > 0 ? { ...current.data, quantity: nextQuantity, returned_at: new Date().toISOString() } : null);
}

/** Vraća sve fizičke komade tako da prije brisanja uvijek čita svježi Supabase zapis. */
export async function returnAllSellerPhysicalProduct(sellerId, productId) {
  const client = await requireClient();
  const current = await client.from('seller_physical_items').select('*').eq('seller_id', String(sellerId)).eq('product_id', String(productId)).maybeSingle();
  throwIfSupabaseError(current.error, { service: SERVICE, table: 'seller_physical_items', operation: 'dohvat fizičkog zapisa za povrat svih komada', columns: ['seller_id', 'product_id', 'quantity'] });
  if (!current.data) throw new Error('Fizički zapis za ovaj proizvod nije pronađen.');
  const oldQuantity = Number(current.data.quantity || 0);
  const removal = await client.from('seller_physical_items').delete().eq('id', current.data.id);
  throwIfSupabaseError(removal.error, { service: SERVICE, table: 'seller_physical_items', operation: 'povrat svih fizičkih komada', columns: ['id'] });
  await logSellerActivity(client, { sellerId, productId, type: 'physical_returned_all', oldQuantity, newQuantity: 0, description: 'Vraćeni su svi fizički komadi.' });
  recordGlobalSellerChange('Vraćeni svi fizički proizvodi od prodavača', oldQuantity, 0);
  return { returnedQuantity: oldQuantity };
}

/** Sinkronizira aktivne oglase prodavača s glavnim stanjem proizvoda i po potrebi stvara obavijest. @param {string} productId ID proizvoda. @param {{reason?:string,soldQuantity?:number,notify?:boolean}} [options] Opcije. @returns {Promise<Object|null>} Rezultat. */
export async function syncSellerProductQuantity(productId, options = {}) {
  const client = await getSupabaseClient();
  if (!client) return null;
  const product = await getProductById(productId);
  if (!product) return null;
  const listings = await client.from('seller_listings').select('*, sellers(id, full_name, status)').eq('product_id', String(productId)).eq('status', 'active');
  if (listings.error) {
    reportSupabaseError(listings.error, { service: SERVICE, table: 'seller_listings', operation: 'sinkronizacija količina prodavača', columns: ['product_id', 'status', 'quantity'] });
    return null;
  }
  const activeListings = (listings.data || []).filter((listing) => listing.sellers?.status === 'active');
  if (!activeListings.length) return null;
  const nextQuantity = Math.max(0, Number(product.stock || 0));
  const changed = [];
  for (const listing of activeListings) {
    const oldQuantity = Number(listing.quantity || 0);
    if (oldQuantity !== nextQuantity) {
      const update = await client.from('seller_listings').update({ quantity: nextQuantity }).eq('id', listing.id);
      throwIfSupabaseError(update.error, { service: SERVICE, table: 'seller_listings', operation: 'usklađivanje količine oglasa', columns: ['quantity'] });
      await logSellerActivity(client, { sellerId: listing.seller_id, productId, type: options.reason || 'stock_sync', oldQuantity, newQuantity: nextQuantity, description: `Količina oglasa usklađena s glavnim stanjem (${oldQuantity} → ${nextQuantity}).` });
      changed.push(listing);
    }
  }
  const sellerNames = activeListings.map((listing) => listing.sellers?.full_name).filter(Boolean);
  return { productId, remainingQuantity: nextQuantity, sellers: sellerNames, changedCount: changed.length, soldQuantity: Math.max(0, Number(options.soldQuantity || 0)) };
}
