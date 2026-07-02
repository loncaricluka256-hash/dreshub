import { readStorage, writeStorage } from '../js/storage.js';
import { getSupabaseClient, isSupabaseConfigured, reportSupabaseError, throwIfSupabaseError } from './supabaseClient.js';

const PRODUCTS_KEY = 'dreshub.products';
export const PRODUCT_PLACEHOLDER_IMAGE='assets/images/product-placeholder.svg';
let productCache = null;
let productChannel=null;

/** @param {Object|null} product Proizvod. @returns {string} Glavna slika ili placeholder. */
export function getProductMainImage(product){return product?.mainImageUrl||product?.images?.[0]||PRODUCT_PLACEHOLDER_IMAGE;}

/** Prati promjene proizvoda radi sinkronizacije zalihe među uređajima. @param {(products:Array<Object>)=>void} callback Poziv nakon promjene. @returns {Promise<()=>Promise<void>>} Odjava. */
export async function subscribeToProductChanges(callback){const client=await getSupabaseClient();if(!client||productChannel)return async()=>{};productChannel=client.channel('dreshub-public-products').on('postgres_changes',{event:'*',schema:'public',table:'products'},async()=>callback?.(await getProducts())).subscribe();return async()=>{if(productChannel){await client.removeChannel(productChannel);productChannel=null;}};}

/** Uklanja privremene i Base64 slike iz lokalnog modela. @param {Object} product Proizvod. @returns {Object} */
function lightweightProduct(product) {
  const images=(product.images||[]).filter((url)=>typeof url==='string'&&!/^(data:image\/|blob:)/i.test(url));
  const { product_images, ...rest }=product;
  return {...rest,images,mainImageUrl:product.mainImageUrl||product.main_image_url||images[0]||null};
}

try {
  if(isSupabaseConfigured())localStorage.removeItem(PRODUCTS_KEY);
  else{const storedProducts=readStorage(PRODUCTS_KEY,null);if(storedProducts){localStorage.removeItem(PRODUCTS_KEY);writeStorage(PRODUCTS_KEY,storedProducts.map(lightweightProduct));}}
} catch(error) { console.warn('[DresHub productService] Čišćenje starog cachea nije uspjelo.',error); }

/** Spaja Supabase rezultate s lokalnim zapisima koji čekaju sinkronizaciju. @param {Array<Object>} remote Udaljeni proizvodi. @returns {Array<Object>} */
function withPendingProducts(remote) {
  if(isSupabaseConfigured())return remote;
  const remoteIds=new Set(remote.map((product)=>String(product.id)));
  return [...readStorage(PRODUCTS_KEY,[]).filter((product)=>product.syncPending&&!remoteIds.has(String(product.id))),...remote];
}

/** @param {Object} row Supabase redak. @returns {Object} UI model proizvoda. */
function fromDatabase(row) {
  const imageRows = [...(row.product_images || [])].sort((a, b) => Number(a.image_order??0)-Number(b.image_order??0));
  const relatedUrls=imageRows.map((image)=>image.image_url).filter(Boolean),databaseMainIsValid=Boolean(row.main_image_url&&(!relatedUrls.length||relatedUrls.includes(row.main_image_url)));
  const relatedMain=imageRows.find((image)=>image.is_main)?.image_url,mainImageUrl=(databaseMainIsValid?row.main_image_url:null)||relatedMain||imageRows[0]?.image_url||row.main_image_url||null;
  const orderedImages=imageRows.map((image)=>image.image_url).filter(Boolean),images=(orderedImages.length?orderedImages:[mainImageUrl]).filter((url,index,list)=>url&&list.indexOf(url)===index);
  const isOnSale=Boolean(row.is_on_sale&&row.sale_price!=null),badge=row.is_new?'NOVO':row.is_popular?'POPULARNO':isOnSale?'AKCIJA':Number(row.quantity)===1?'ZADNJI KOMAD':'';
  const sizes=Array.isArray(row.size)?row.size:String(row.size||'').split(',').map((value)=>value.trim()).filter(Boolean);
  return { id:row.id,name:row.name,club:row.club,player:row.player,type:row.category,version:row.version,sizes,costPrice:Number(row.buy_price||0),price:Number(isOnSale?row.sale_price:row.sell_price||0),oldPrice:isOnSale?Number(row.sell_price||0):null,stock:Number(row.quantity||0),description:row.description||'',status:row.status,badge,labels:[badge].filter(Boolean),createdAt:row.created_at,updatedAt:row.updated_at,mainImageUrl,isOnSale,images,archived:Boolean(row.is_archived) };
}

/** @param {Object} product UI model. @returns {Object} Podaci za bazu. */
function toDatabase(product) {
  const { images=[] }=product;
  const persistentMainImage=product.mainImageUrl||product.main_image_url||images.find((url)=>typeof url==='string'&&!/^(data:image\/|blob:)/i.test(url))||null;
  const onSale=Boolean(product.isOnSale||product.oldPrice!=null),badge=product.badge||product.labels?.[0]||'';
  return {name:product.name,club:product.club,player:product.player,category:product.type||product.category,version:product.version,size:Array.isArray(product.sizes)?product.sizes.join(', '):(product.size||''),buy_price:Number(product.costPrice??product.buy_price??0),sell_price:Number(onSale?(product.oldPrice??product.sell_price??product.price):(product.price??product.sell_price??0)),sale_price:onSale?Number(product.price??product.sale_price??0):null,is_on_sale:onSale,quantity:Number(product.stock??product.quantity??0),description:product.description||'',status:product.status||'active',main_image_url:persistentMainImage,is_new:badge==='NOVO',is_popular:badge==='POPULARNO',is_archived:Boolean(product.archived??product.is_archived)};
}

/** Grupira slike isključivo po pripadajućem `product_id`. @param {Array<Object>} productRows Proizvodi. @param {Array<Object>} imageRows Slike. @returns {Array<Object>} UI proizvodi. */
export function mapProductsWithImages(productRows,imageRows){
  const imagesByProduct=new Map();
  for(const image of imageRows){const key=String(image.product_id),items=imagesByProduct.get(key)||[];items.push(image);imagesByProduct.set(key,items);}
  return productRows.map((row)=>fromDatabase({...row,product_images:imagesByProduct.get(String(row.id))||[]}));
}

/** Dohvaća proizvode i slike odvojenim upitima radi jasne dijagnostike. @param {Object} client Supabase klijent. @returns {Promise<Array<Object>>} */
async function fetchSupabaseProducts(client){
  const productsResult=await client.from('products').select('*');
  if(productsResult.error){reportSupabaseError(productsResult.error,{service:'productService',table:'products',operation:'dohvat proizvoda',columns:['*']});return[];}
  const imagesResult=await client.from('product_images').select('*');
  if(imagesResult.error)reportSupabaseError(imagesResult.error,{service:'productService',table:'product_images',operation:'dohvat slika proizvoda',columns:['product_id','image_url','image_path','is_main','image_order']});
  return mapProductsWithImages(productsResult.data??[],imagesResult.data??[]).sort((a,b)=>new Date(b.createdAt||0)-new Date(a.createdAt||0));
}

/** @returns {Promise<Array<Object>>} Aktivni proizvodi. */
export async function getProducts() {
  const client = await getSupabaseClient();
  if (client) {
    return(await fetchSupabaseProducts(client)).filter((product)=>!product.archived);
  }
  const stored = readStorage(PRODUCTS_KEY, null);
  if (stored) return stored.filter((product) => !product.archived);
  if (productCache) return productCache.filter((product) => !product.archived);
  if (isSupabaseConfigured()) return [];
  const response = await fetch('data/demo-products.json');
  if (!response.ok) throw new Error('Proizvodi trenutačno nisu dostupni.');
  productCache = (await response.json()).map((product) => ({ archived: false, costPrice: Number((product.price * .52).toFixed(2)), labels: [product.badge], ...product }));
  writeStorage(PRODUCTS_KEY, productCache);
  return productCache;
}

/** @returns {Promise<Array<Object>>} Proizvodi uključujući arhivirane. */
export async function getAllProducts() {
  const client = await getSupabaseClient();
  if (client) return fetchSupabaseProducts(client);
  if(isSupabaseConfigured())return[];await getProducts(); return readStorage(PRODUCTS_KEY, productCache ?? []);
}

/**
 * Sprema skup lokalnih proizvoda. Koristi ga Local Storage adapter i migracije.
 * @param {Array<Object>} products Proizvodi.
 * @returns {Array<Object>} Spremljeni proizvodi.
 */
export function saveProducts(products) { if(isSupabaseConfigured())throw new Error('Proizvodi se ne smiju spremati u Local Storage dok je Supabase konfiguriran.');productCache = products.map(lightweightProduct); writeStorage(PRODUCTS_KEY, productCache); window.dispatchEvent(new CustomEvent('dreshub:products-changed')); return productCache; }

/** @param {number|string} productId ID proizvoda. @returns {Promise<Object|null>} */
export async function getProductById(productId) {
  const client = await getSupabaseClient();
  if (client) { const { data, error } = await client.from('products').select('*').eq('id', productId).single(); if (!error){const images=await client.from('product_images').select('*').eq('product_id',productId);if(images.error)reportSupabaseError(images.error,{service:'productService',table:'product_images',operation:'dohvat slika proizvoda',columns:['product_id']});return fromDatabase({...data,product_images:images.data??[]});}if(error?.code!=='PGRST116')reportSupabaseError(error,{service:'productService',table:'products',operation:'dohvat proizvoda po ID-u',columns:['id']});return null; }
  return (await getAllProducts()).find((product) => String(product.id)===String(productId)) ?? null;
}

/** @param {Object} productData Podaci proizvoda. @returns {Promise<Object>} */
export async function createProduct(productData) {
  const client = await getSupabaseClient();
  if (client) { const payload=toDatabase({archived:false,...productData}),{data,error}=await client.from('products').insert(payload).select().single();throwIfSupabaseError(error,{service:'productService',table:'products',operation:'stvaranje proizvoda',columns:Object.keys(payload)});return fromDatabase({...data,product_images:[]}); }
  if(isSupabaseConfigured())throw new Error('Supabase proizvodi trenutačno nisu dostupni.');
  const products = await getAllProducts(), product = { archived: false, createdAt: new Date().toISOString(), labels: productData.labels || [productData.badge].filter(Boolean), ...productData, id: productData.id || Date.now(), ...(client?{syncPending:true}:{}) }; products.unshift(product); saveProducts(products); return product;
}

/** @param {number|string} productId ID. @param {Object} productData Izmjene. @returns {Promise<Object|null>} */
export async function updateProduct(productId, productData) {
  const client = await getSupabaseClient();
  if (client) { const current=await getProductById(productId);if(!current)return null;const payload=toDatabase({...current,...productData}),{data,error}=await client.from('products').update(payload).eq('id',productId).select().single();throwIfSupabaseError(error,{service:'productService',table:'products',operation:'ažuriranje proizvoda',columns:Object.keys(payload)});return fromDatabase({...data,product_images:productData.product_images||[]}); }
  if(isSupabaseConfigured())throw new Error('Supabase proizvodi trenutačno nisu dostupni.');
  const products = await getAllProducts(), product = products.find((item) => String(item.id)===String(productId)); if (!product) return null; Object.assign(product, productData, { id: product.id, updatedAt: new Date().toISOString() }); saveProducts(products); return product;
}

/** @param {number|string} productId ID. @returns {Promise<Object|null>} */
export async function archiveProduct(productId) { return updateProduct(productId, { archived: true }); }

/** @param {number|string} productId ID. @returns {Promise<void>} */
export async function deleteProduct(productId) { const client=await getSupabaseClient();if(client){const{error}=await client.from('products').delete().eq('id',String(productId));throwIfSupabaseError(error,{service:'productService',table:'products',operation:'brisanje proizvoda',columns:['id']});return;}if(isSupabaseConfigured())throw new Error('Supabase proizvodi trenutačno nisu dostupni.');saveProducts((await getAllProducts()).filter((item)=>String(item.id)!==String(productId))); }

/** @param {number|string} productId ID. @param {number} amount Količina. @returns {Promise<Object|null>} */
export async function incrementProductQuantity(productId, amount) { const product=await getProductById(productId);return product?updateProduct(productId,{stock:Number(product.stock)+Math.abs(Number(amount))}):null; }

/** @param {number|string} productId ID. @param {number} amount Količina. @returns {Promise<Object|null>} */
export async function decrementProductQuantity(productId, amount) { const product=await getProductById(productId);if(!product||product.stock<Math.abs(Number(amount)))return null;return updateProduct(productId,{stock:Math.max(0,Number(product.stock)-Math.abs(Number(amount)))}); }

/** @param {number|string} productId ID. @param {Array<string>} labels Oznake. @returns {Promise<Object|null>} */
export async function setProductLabels(productId, labels) { return updateProduct(productId, { labels, badge: labels[0] || '' }); }

/** @param {number|string} productId ID. @param {{active:boolean,regularPrice:number,salePrice?:number}} saleData Akcija. @returns {Promise<Object|null>} */
export async function setProductSale(productId, saleData) { return updateProduct(productId, saleData.active ? { price: Number(saleData.salePrice), oldPrice: Number(saleData.regularPrice), isOnSale: true } : { price: Number(saleData.regularPrice), oldPrice: null, isOnSale: false }); }

/** @param {number} productId ID. @param {number} [quantity=1] Rezervirana količina. @returns {Promise<Object|null>} */
export async function reserveProductStock(productId, quantity = 1) { return decrementProductQuantity(productId, quantity); }
