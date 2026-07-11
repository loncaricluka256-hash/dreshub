import { getSupabaseClient, throwIfSupabaseError } from './supabaseClient.js';

const META = { service: 'sellerService', table: 'sellers' };
const LISTINGS_META = { service: 'sellerService', table: 'seller_listings' };
const PHYSICAL_META = { service: 'sellerService', table: 'seller_physical_items' };

/** @param {Object} row Supabase redak. @returns {Object} ProdavaĂ„Ĺ¤ za UI. */
function fromDatabase(row) {
  return {
    id: row.id,
    name: row.name || '',
    note: row.note || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    listings: [],
    physicalItems: []
  };
}

/** @param {Object} row Supabase redak. @returns {Object} Oglas prodavaĂ„Ĺ¤a. */
function listingFromDatabase(row) {
  return {
    id: row.id,
    sellerId: row.seller_id,
    productId: row.product_id,
    quantity: Number(row.quantity || 0),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

/** @param {Object} row Supabase redak. @returns {Object} FiziĂ„Ĺ¤ki predan proizvod. */
function physicalFromDatabase(row) {
  return {
    id: row.id,
    sellerId: row.seller_id,
    productId: row.product_id,
    quantity: Number(row.quantity || 0),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

/** @param {{name:string,note?:string}} seller ProdavaĂ„Ĺ¤ iz UI-a. @returns {Object} Redak za bazu. */
function toDatabase(seller) {
  return {
    name: String(seller.name || '').trim(),
    note: String(seller.note || '').trim() || null
  };
}

/** @returns {Promise<Object>} Supabase klijent. */
async function requireClient() {
  const client = await getSupabaseClient();
  if (!client) throw new Error('Supabase nije dostupan za modul ProdavaĂ„Ĺ¤i.');
  return client;
}

/** DohvaĂ„â€ˇa sve prodavaĂ„Ĺ¤e. @returns {Promise<Array<Object>>} */
export async function getSellers() {
  const client = await requireClient();
  const { data, error } = await client.from('sellers').select('*').order('name', { ascending: true });
  throwIfSupabaseError(error, { ...META, operation: 'dohvat prodavaĂ„Ĺ¤a', columns: ['id', 'name', 'note'] });
  const sellers = (data || []).map(fromDatabase);
  const { data: listings, error: listingsError } = await client.from('seller_listings').select('*');
  throwIfSupabaseError(listingsError, { ...LISTINGS_META, operation: 'dohvat oglasa prodavaĂ„Ĺ¤a', columns: ['seller_id', 'product_id', 'quantity'] });
  const { data: physicalItems, error: physicalError } = await client.from('seller_physical_items').select('*');
  throwIfSupabaseError(physicalError, { ...PHYSICAL_META, operation: 'dohvat fiziĂ„Ĺ¤ki predanih proizvoda', columns: ['seller_id', 'product_id', 'quantity'] });
  const bySeller = new Map(sellers.map((seller) => [String(seller.id), seller]));
  for (const row of listings || []) bySeller.get(String(row.seller_id))?.listings.push(listingFromDatabase(row));
  for (const row of physicalItems || []) bySeller.get(String(row.seller_id))?.physicalItems.push(physicalFromDatabase(row));
  return sellers;
}

/** Stvara novog prodavaĂ„Ĺ¤a. @param {{name:string,note?:string}} seller Podaci. @returns {Promise<Object>} */
export async function createSeller(seller) {
  const client = await requireClient();
  const payload = toDatabase(seller);
  if (!payload.name) throw new Error('Ime prodavaĂ„Ĺ¤a je obavezno.');
  const { data, error } = await client.from('sellers').insert(payload).select('*').single();
  throwIfSupabaseError(error, { ...META, operation: 'stvaranje prodavaĂ„Ĺ¤a', columns: Object.keys(payload) });
  return fromDatabase(data);
}

/** AÄąÄľurira prodavaĂ„Ĺ¤a. @param {string} sellerId ID. @param {{name:string,note?:string}} seller Podaci. @returns {Promise<Object>} */
export async function updateSeller(sellerId, seller) {
  const client = await requireClient();
  const payload = toDatabase(seller);
  if (!payload.name) throw new Error('Ime prodavaĂ„Ĺ¤a je obavezno.');
  const { data, error } = await client.from('sellers').update(payload).eq('id', String(sellerId)).select('*').single();
  throwIfSupabaseError(error, { ...META, operation: 'aÄąÄľuriranje prodavaĂ„Ĺ¤a', columns: Object.keys(payload) });
  return fromDatabase(data);
}

/** BriÄąË‡e prodavaĂ„Ĺ¤a. @param {string} sellerId ID. @returns {Promise<void>} */
export async function deleteSeller(sellerId) {
  const client = await requireClient();
  const { error } = await client.from('sellers').delete().eq('id', String(sellerId));
  throwIfSupabaseError(error, { ...META, operation: 'brisanje prodavaĂ„Ĺ¤a', columns: ['id'] });
}

/** Dodaje proizvode u oglaÄąË‡avanje ili poveĂ„â€ˇava postojeĂ„â€ˇu koliĂ„Ĺ¤inu. @param {string} sellerId ID prodavaĂ„Ĺ¤a. @param {Array<{productId:string,quantity:number}>} items Stavke. @returns {Promise<void>} */
export async function addSellerListings(sellerId, items) {
  const client = await requireClient();
  for (const item of items) {
    const quantity = Math.max(1, Number(item.quantity || 1));
    const productId = String(item.productId || '');
    if (!productId) throw new Error('Nedostaje ID proizvoda.');
    const current = await client.from('seller_listings').select('*').eq('seller_id', String(sellerId)).eq('product_id', productId).maybeSingle();
    throwIfSupabaseError(current.error, { ...LISTINGS_META, operation: 'dohvat postojeĂ„â€ˇeg oglasa', columns: ['seller_id', 'product_id'] });
    if (current.data) {
      const { error } = await client.from('seller_listings').update({ quantity: Number(current.data.quantity || 0) + quantity }).eq('id', current.data.id);
      throwIfSupabaseError(error, { ...LISTINGS_META, operation: 'poveĂ„â€ˇanje koliĂ„Ĺ¤ine oglasa', columns: ['quantity'] });
    } else {
      const payload = { seller_id: String(sellerId), product_id: productId, quantity };
      const { error } = await client.from('seller_listings').insert(payload);
      throwIfSupabaseError(error, { ...LISTINGS_META, operation: 'dodavanje proizvoda u oglaÄąË‡avanje', columns: Object.keys(payload) });
    }
  }
}

/** Dodaje fiziĂ„Ĺ¤ki predane proizvode i automatski ih dodaje u oglaÄąË‡avanje ako treba. @param {string} sellerId ID prodavaĂ„Ĺ¤a. @param {Array<{productId:string,quantity:number}>} items Stavke. @returns {Promise<void>} */
export async function addSellerPhysicalItems(sellerId, items) {
  const client = await requireClient();
  for (const item of items) {
    const quantity = Math.max(1, Number(item.quantity || 1));
    const productId = String(item.productId || '');
    if (!productId) throw new Error('Nedostaje ID proizvoda.');
    const current = await client.from('seller_physical_items').select('*').eq('seller_id', String(sellerId)).eq('product_id', productId).maybeSingle();
    throwIfSupabaseError(current.error, { ...PHYSICAL_META, operation: 'dohvat fiziĂ„Ĺ¤kog zapisa', columns: ['seller_id', 'product_id'] });
    if (current.data) {
      const { error } = await client.from('seller_physical_items').update({ quantity: Number(current.data.quantity || 0) + quantity }).eq('id', current.data.id);
      throwIfSupabaseError(error, { ...PHYSICAL_META, operation: 'poveĂ„â€ˇanje fiziĂ„Ĺ¤ke koliĂ„Ĺ¤ine', columns: ['quantity'] });
    } else {
      const payload = { seller_id: String(sellerId), product_id: productId, quantity };
      const { error } = await client.from('seller_physical_items').insert(payload);
      throwIfSupabaseError(error, { ...PHYSICAL_META, operation: 'spremanje fiziĂ„Ĺ¤ke predaje', columns: Object.keys(payload) });
    }

    const listing = await client.from('seller_listings').select('*').eq('seller_id', String(sellerId)).eq('product_id', productId).maybeSingle();
    throwIfSupabaseError(listing.error, { ...LISTINGS_META, operation: 'provjera oglasa nakon fiziĂ„Ĺ¤ke predaje', columns: ['seller_id', 'product_id'] });
    if (!listing.data) {
      const payload = { seller_id: String(sellerId), product_id: productId, quantity };
      const { error } = await client.from('seller_listings').insert(payload);
      throwIfSupabaseError(error, { ...LISTINGS_META, operation: 'automatsko dodavanje u oglaÄąË‡avanje nakon predaje', columns: Object.keys(payload) });
    }
  }
}

/** Uklanja proizvod iz oglaÄąË‡avanja prodavaĂ„Ĺ¤a. @param {string} sellerId ID prodavaĂ„Ĺ¤a. @param {string} productId ID proizvoda. @returns {Promise<void>} */

/** VraÄ‡a jedan fiziÄŤki komad prodavaÄŤa bez diranja oglaĹˇavanja. @param {string} sellerId ID prodavaÄŤa. @param {string} productId ID proizvoda. @returns {Promise<void>} */
export async function returnOneSellerPhysicalItem(sellerId, productId) {
  const client = await requireClient();
  const current = await client.from('seller_physical_items').select('*').eq('seller_id', String(sellerId)).eq('product_id', String(productId)).maybeSingle();
  throwIfSupabaseError(current.error, { ...PHYSICAL_META, operation: 'dohvat fiziÄŤkog zapisa za povrat jednog komada', columns: ['seller_id', 'product_id'] });
  if (!current.data) throw new Error('Ovaj proizvod nije fiziÄŤki kod prodavaÄŤa.');
  const nextQuantity = Number(current.data.quantity || 0) - 1;
  if (nextQuantity > 0) {
    const { error } = await client.from('seller_physical_items').update({ quantity: nextQuantity }).eq('id', current.data.id);
    throwIfSupabaseError(error, { ...PHYSICAL_META, operation: 'povrat jednog fiziÄŤkog komada', columns: ['quantity'] });
  } else {
    const { error } = await client.from('seller_physical_items').delete().eq('id', current.data.id);
    throwIfSupabaseError(error, { ...PHYSICAL_META, operation: 'brisanje fiziÄŤkog zapisa nakon povrata', columns: ['id'] });
  }
}

/** VraÄ‡a sve fiziÄŤke komade prodavaÄŤa bez diranja oglaĹˇavanja. @param {string} sellerId ID prodavaÄŤa. @param {string} productId ID proizvoda. @returns {Promise<void>} */
export async function returnAllSellerPhysicalItems(sellerId, productId) {
  const client = await requireClient();
  const { error } = await client.from('seller_physical_items').delete().eq('seller_id', String(sellerId)).eq('product_id', String(productId));
  throwIfSupabaseError(error, { ...PHYSICAL_META, operation: 'povrat svih fiziÄŤkih komada', columns: ['seller_id', 'product_id'] });
}
/** Smanjuje oglašenu količinu kod svih prodavača nakon prodaje. @param {string} productId ID proizvoda. @param {number} [soldQuantity=1] Prodana količina. @returns {Promise<Array<Object>>} Ažurirani prodavači. */
export async function syncSellerListingsAfterSale(productId, soldQuantity = 1) {
  const client = await requireClient();
  const quantity = Math.max(1, Number(soldQuantity || 1));
  const { data, error } = await client
    .from('seller_listings')
    .select('*, sellers(id, name)')
    .eq('product_id', String(productId));
  throwIfSupabaseError(error, { ...LISTINGS_META, operation: 'dohvat oglasa nakon prodaje', columns: ['product_id', 'quantity'] });
  const affected = [];
  for (const row of data || []) {
    const oldQuantity = Number(row.quantity || 0);
    const nextQuantity = Math.max(0, oldQuantity - quantity);
    if (nextQuantity > 0) {
      const update = await client.from('seller_listings').update({ quantity: nextQuantity }).eq('id', row.id);
      throwIfSupabaseError(update.error, { ...LISTINGS_META, operation: 'smanjenje oglašene količine nakon prodaje', columns: ['quantity'] });
    } else {
      const removal = await client.from('seller_listings').delete().eq('id', row.id);
      throwIfSupabaseError(removal.error, { ...LISTINGS_META, operation: 'uklanjanje oglasa nakon prodaje', columns: ['id'] });
    }
    affected.push({
      sellerId: row.seller_id,
      sellerName: row.sellers?.name || '',
      productId: row.product_id,
      oldQuantity,
      newQuantity: nextQuantity
    });
  }
  return affected;
}

export async function removeSellerListing(sellerId, productId) {
  const client = await requireClient();
  const { error } = await client.from('seller_listings').delete().eq('seller_id', String(sellerId)).eq('product_id', String(productId));
  throwIfSupabaseError(error, { ...LISTINGS_META, operation: 'uklanjanje proizvoda iz oglaÄąË‡avanja', columns: ['seller_id', 'product_id'] });
}
