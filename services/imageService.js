import { getAllProducts, saveProducts } from './productService.js';
import { getSupabaseClient, isSupabaseConfigured, PRODUCT_IMAGES_BUCKET, reportSupabaseError, throwIfSupabaseError } from './supabaseClient.js';

function safeFileName(name) { return String(name || 'image').replace(/[^a-zA-Z0-9._-]/g, '-'); }
function storagePath(productId, file, suffix = 0) { return `products/${productId}/${Date.now() + suffix}-${safeFileName(file.name)}`; }

async function uploadFile(client, productId, file, suffix = 0) {
  const path = storagePath(productId, file, suffix);
  const { error } = await client.storage.from(PRODUCT_IMAGES_BUCKET).upload(path, file, { upsert: false });
  throwIfSupabaseError(error, { service: 'imageService', table: 'storage: product-images', operation: `Upload slike „${file.name}” nije uspio${String(error?.message || '').toLowerCase().includes('row-level security') ? ' — Supabase Storage RLS policy blokira upload' : ''}`, columns: ['product-images'] });
  const { data } = client.storage.from(PRODUCT_IMAGES_BUCKET).getPublicUrl(path);
  return { image_url: data.publicUrl, image_path: path };
}

/**
 * Dodaje slike iza postojećih slika proizvoda, bez promjene trenutačne glavne slike.
 * @param {number|string} productId ID proizvoda.
 * @param {FileList|Array<File>} files Nove datoteke.
 * @returns {Promise<Array<Object>>} Spremljeni redovi iz product_images.
 */
export async function uploadProductImages(productId, files) {
  const selected = [...files].slice(0, 5);
  if (!selected.length) return [];
  const client = await getSupabaseClient();
  if (client) {
    const existing = await getProductImages(productId);
    const available = Math.max(0, 5 - existing.length);
    const accepted = selected.slice(0, available);
    const startOrder = existing.reduce((maximum, image) => Math.max(maximum, Number(image.image_order ?? -1)), -1) + 1;
    const uploaded = [];
    for (let index = 0; index < accepted.length; index += 1) {
      const storage = await uploadFile(client, productId, accepted[index], index);
      const { data, error } = await client.from('product_images').insert({ product_id: productId, ...storage, is_main: false, image_order: startOrder + index }).select().single();
      if (error) await client.storage.from(PRODUCT_IMAGES_BUCKET).remove([storage.image_path]);
      throwIfSupabaseError(error, { service: 'imageService', table: 'product_images', operation: 'Spremanje metapodataka slike nije uspjelo', columns: ['product_id', 'image_url', 'image_path', 'is_main', 'image_order'] });
      uploaded.push(data);
    }
    return uploaded;
  }
  if (isSupabaseConfigured()) throw new Error('Supabase Storage trenutačno nije dostupan; slike nisu spremljene.');
  return selected.map((file, index) => ({ id: `${productId}-preview-${index}`, product_id: String(productId), image_url: null, image_path: null, is_main: index === 0, image_order: index, file_name: file.name }));
}

/** @param {number|string} productId ID proizvoda. @returns {Promise<Array<Object>>} Slike poredane za galeriju. */
export async function getProductImages(productId) {
  const client = await getSupabaseClient();
  if (client) {
    const { data, error } = await client.from('product_images').select('*').eq('product_id', productId).order('image_order');
    if (!error) return data ?? [];
    reportSupabaseError(error, { service: 'imageService', table: 'product_images', operation: 'dohvat slika proizvoda', columns: ['product_id', 'image_order'] });
    return [];
  }
  if (isSupabaseConfigured()) return [];
  const product = (await getAllProducts()).find((item) => String(item.id) === String(productId));
  return (product?.images || []).map((url, index) => ({ id: `${productId}-${index}`, product_id: String(productId), image_url: url, image_path: null, is_main: index === 0, image_order: index }));
}

/** Postavlja jednu sliku kao glavnu i usklađuje products.main_image_url. */
export async function setMainProductImage(productId, imageId) {
  const client = await getSupabaseClient();
  if (client) {
    let result = await client.from('product_images').update({ is_main: false }).eq('product_id', productId);
    throwIfSupabaseError(result.error, { service: 'imageService', table: 'product_images', operation: 'Reset glavne slike nije uspio', columns: ['is_main', 'product_id'] });
    result = await client.from('product_images').update({ is_main: true }).eq('id', imageId).eq('product_id', productId).select('image_url').single();
    throwIfSupabaseError(result.error, { service: 'imageService', table: 'product_images', operation: 'Odabir glavne slike nije uspio', columns: ['is_main', 'id', 'product_id', 'image_url'] });
    const update = await client.from('products').update({ main_image_url: result.data?.image_url || null }).eq('id', productId);
    throwIfSupabaseError(update.error, { service: 'imageService', table: 'products', operation: 'Ažuriranje glavne slike proizvoda nije uspjelo', columns: ['main_image_url'] });
    return;
  }
  if (isSupabaseConfigured()) throw new Error('Supabase slike trenutačno nisu dostupne.');
  const products = await getAllProducts(), product = products.find((item) => String(item.id) === String(productId));
  if (!product) return;
  const index = Number(String(imageId).split('-').pop());
  if (product.images[index]) product.images = [product.images[index], ...product.images.filter((_, itemIndex) => itemIndex !== index)];
  saveProducts(products);
}

/** Zamjenjuje datoteku postojeće slike, zadržavajući njezin ID, redoslijed i status glavne slike. */
export async function replaceProductImage(productId, imageId, file) {
  const client = await getSupabaseClient();
  if (!client) {
    if (isSupabaseConfigured()) throw new Error('Supabase slike trenutačno nisu dostupne.');
    throw new Error('Zamjena slike dostupna je kada je Supabase konfiguriran.');
  }
  const { data: current, error: findError } = await client.from('product_images').select('*').eq('id', imageId).eq('product_id', productId).single();
  throwIfSupabaseError(findError, { service: 'imageService', table: 'product_images', operation: 'Slika za zamjenu nije pronađena', columns: ['id', 'product_id'] });
  const storage = await uploadFile(client, productId, file);
  const { data, error } = await client.from('product_images').update(storage).eq('id', imageId).eq('product_id', productId).select().single();
  if (error) await client.storage.from(PRODUCT_IMAGES_BUCKET).remove([storage.image_path]);
  throwIfSupabaseError(error, { service: 'imageService', table: 'product_images', operation: 'Zamjena metapodataka slike nije uspjela', columns: ['image_url', 'image_path'] });
  if (current.is_main) {
    const update = await client.from('products').update({ main_image_url: storage.image_url }).eq('id', productId);
    throwIfSupabaseError(update.error, { service: 'imageService', table: 'products', operation: 'Ažuriranje glavne slike nakon zamjene nije uspjelo', columns: ['main_image_url'] });
  }
  if (current.image_path) {
    const removed = await client.storage.from(PRODUCT_IMAGES_BUCKET).remove([current.image_path]);
    if (removed.error) reportSupabaseError(removed.error, { service: 'imageService', table: 'storage: product-images', operation: 'Čišćenje stare zamijenjene slike', columns: ['image_path'] });
  }
  return data;
}

/** Briše sliku i automatski bira sljedeću glavnu sliku ili postavlja placeholder stanje. */
export async function deleteProductImage(productId, imageId) {
  const client = await getSupabaseClient();
  if (client) {
    const { data: current, error: findError } = await client.from('product_images').select('*').eq('id', imageId).eq('product_id', productId).single();
    throwIfSupabaseError(findError, { service: 'imageService', table: 'product_images', operation: 'Slika za brisanje nije pronađena', columns: ['id', 'product_id'] });
    const deleted = await client.from('product_images').delete().eq('id', imageId).eq('product_id', productId);
    throwIfSupabaseError(deleted.error, { service: 'imageService', table: 'product_images', operation: 'Brisanje metapodataka slike nije uspjelo', columns: ['id', 'product_id'] });
    const remaining = await getProductImages(productId);
    if (remaining[0] && (current.is_main || !remaining.some((image) => image.is_main))) await setMainProductImage(productId, remaining[0].id);
    if (!remaining.length) {
      const update = await client.from('products').update({ main_image_url: null }).eq('id', productId);
      throwIfSupabaseError(update.error, { service: 'imageService', table: 'products', operation: 'Uklanjanje glavne slike proizvoda nije uspjelo', columns: ['main_image_url'] });
    }
    if (current.image_path) {
      const removed = await client.storage.from(PRODUCT_IMAGES_BUCKET).remove([current.image_path]);
      if (removed.error) reportSupabaseError(removed.error, { service: 'imageService', table: 'storage: product-images', operation: 'Brisanje datoteke slike', columns: ['image_path'] });
    }
    return remaining;
  }
  if (isSupabaseConfigured()) throw new Error('Supabase slike trenutačno nisu dostupne.');
  const products = await getAllProducts(), product = products.find((item) => String(item.id) === String(productId));
  if (product) { const index = Number(String(imageId).split('-').pop()); product.images.splice(index, 1); saveProducts(products); }
  return [];
}

/** Sprema redoslijed galerije u postojeći image_order stupac. */
export async function reorderProductImages(productId, orderedImageIds) {
  const client = await getSupabaseClient();
  if (client) {
    for (let index = 0; index < orderedImageIds.length; index += 1) {
      const { error } = await client.from('product_images').update({ image_order: index }).eq('id', orderedImageIds[index]).eq('product_id', productId);
      throwIfSupabaseError(error, { service: 'imageService', table: 'product_images', operation: 'Promjena redoslijeda slika nije uspjela', columns: ['image_order', 'id', 'product_id'] });
    }
    return;
  }
  if (isSupabaseConfigured()) throw new Error('Supabase slike trenutačno nisu dostupne.');
  const products = await getAllProducts(), product = products.find((item) => String(item.id) === String(productId));
  if (!product) return;
  const current = [...product.images];
  product.images = orderedImageIds.map((id) => current[Number(String(id).split('-').pop())]).filter(Boolean);
  saveProducts(products);
}
