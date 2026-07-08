import { readStorage, writeStorage } from '../js/storage.js';
import { getSupabaseClient, isSupabaseConfigured, PRODUCT_IMAGES_BUCKET, reportSupabaseError, throwIfSupabaseError } from './supabaseClient.js';

const PRODUCTS_KEY = 'dreshub.products';
export const PRODUCT_PLACEHOLDER_IMAGE='assets/images/product-placeholder.svg';
let productCache = null;
let productChannel=null;

/** @param {Object|null} product Proizvod. @returns {string} Glavna slika ili placeholder. */
export function getProductMainImage(product){return product?.mainImageUrl||product?.images?.[0]||PRODUCT_PLACEHOLDER_IMAGE;}

/** @param {Object|null} product Proizvod. @param {number} [width=520] Ciljana širina. @returns {string} Optimizirana slika za kartice. */
export function getProductCardImage(product,width=520){const image=getProductMainImage(product);if(!image||image===PRODUCT_PLACEHOLDER_IMAGE)return image;try{const url=new URL(image,location.origin);if(!url.pathname.includes('/storage/v1/object/public/product-images/'))return image;url.pathname=url.pathname.replace('/storage/v1/object/public/','/storage/v1/render/image/public/');url.searchParams.set('width',String(width));url.searchParams.set('height',String(width));url.searchParams.set('resize','contain');url.searchParams.set('quality','72');return url.toString();}catch{return image;}}

/** Prati promjene proizvoda radi sinkronizacije zalihe među uređajima. @param {(products:Array<Object>)=>void} callback Poziv nakon promjene. @returns {Promise<()=>Promise<void>>} Odjava. */
export async function subscribeToProductChanges(callback,productTypes='jersey'){const client=await getSupabaseClient();if(!client||productChannel)return async()=>{};productChannel=client.channel('dreshub-public-products').on('postgres_changes',{event:'*',schema:'public',table:'products'},async()=>callback?.(productTypes==='jersey'?await getProducts():await getProductsByType(productTypes))).subscribe();return async()=>{if(productChannel){await client.removeChannel(productChannel);productChannel=null;}};}

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
  return { id:row.id,name:row.name,club:row.club||'',player:row.player||'',type:row.category,version:row.version||row.jersey_version||row.product_version||'',productType:row.product_type||'jersey',brand:row.brand||'',color:row.color||'',condition:row.item_condition||'',genderCategory:row.gender_category||'',hasOriginalBox:row.has_original_box,sizes,costPrice:Number(row.buy_price||0),price:Number(isOnSale?row.sale_price:row.sell_price||0),oldPrice:isOnSale?Number(row.sell_price||0):null,stock:Number(row.quantity||0),description:row.description||'',status:row.status,badge,labels:[badge].filter(Boolean),createdAt:row.created_at,updatedAt:row.updated_at,mainImageUrl,isOnSale,images,archived:Boolean(row.is_archived) };
}

/** @param {Object} product UI model. @returns {Object} Podaci za bazu. */
function toDatabase(product) {
  const { images=[] }=product;
  const productType=product.productType||product.product_type||'jersey';
  const persistentMainImage=product.mainImageUrl||product.main_image_url||images.find((url)=>typeof url==='string'&&!/^(data:image\/|blob:)/i.test(url))||null;
  const onSale=Boolean(product.isOnSale||product.oldPrice!=null),badge=product.badge||product.labels?.[0]||'';
  return {name:product.name,club:product.club||'',player:product.player||'',category:productType==='jersey'?(product.type||product.category||'club'):'club',product_type:productType,brand:product.brand||null,color:product.color||null,item_condition:product.condition||product.item_condition||null,gender_category:product.genderCategory||product.gender_category||null,has_original_box:productType==='sneaker'?Boolean(product.hasOriginalBox??product.has_original_box):null,version:product.version||'',size:Array.isArray(product.sizes)?product.sizes.join(', '):(product.size||''),buy_price:Number(product.costPrice??product.buy_price??0),sell_price:Number(onSale?(product.oldPrice??product.sell_price??product.price):(product.price??product.sell_price??0)),sale_price:onSale?Number(product.price??product.sale_price??0):null,is_on_sale:onSale,quantity:Number(product.stock??product.quantity??0),description:product.description||'',status:product.status||'active',main_image_url:persistentMainImage,is_new:badge==='NOVO',is_popular:badge==='POPULARNO',is_archived:Boolean(product.archived??product.is_archived)};
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
    return(await fetchSupabaseProducts(client)).filter((product)=>!product.archived&&product.productType==='jersey');
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

/** Dohvaća aktivne proizvode odabrane vrste isključivo iz Supabase kataloga. */
export async function getProductsByType(productTypes) {
  const allowed=new Set((Array.isArray(productTypes)?productTypes:[productTypes]).map(String));
  return (await getAllProducts()).filter((product)=>!product.archived&&allowed.has(product.productType));
}

/** Duplicira tenisice i kopira njihove Storage datoteke u folder novog proizvoda. */
async function duplicateProductWithImages(productId, expectedType) {
  const client = await getSupabaseClient();
  if (!client) throw new Error('Dupliciranje oglasa zahtijeva dostupnu Supabase vezu.');
  const original = await getProductById(productId);
  if (!original || original.productType !== expectedType) throw new Error('Proizvod za dupliciranje nije pronađen.');
  const duplicate = await createProduct({ ...original, id: undefined, name: expectedType === 'jersey' ? original.name : `Kopija - ${original.name}`, mainImageUrl: null, images: [], archived: false, createdAt: undefined, updatedAt: undefined });
  if(expectedType==='jersey'&&original.version)await setProductVersion(duplicate.id,original.version);
  const sourceImages = await client.from('product_images').select('*').eq('product_id', productId).order('image_order');
  throwIfSupabaseError(sourceImages.error, { service: 'productService', table: 'product_images', operation: 'dohvat slika za dupliciranje', columns: ['product_id'] });
  const copiedPaths = [];
  try {
    for (let index = 0; index < (sourceImages.data || []).length; index += 1) {
      const image = sourceImages.data[index];
      const extension = String(image.image_path || 'image.jpg').split('.').pop();
      const path = `products/${duplicate.id}/${Date.now() + index}-duplicate.${extension}`;
      const copied = await client.storage.from(PRODUCT_IMAGES_BUCKET).copy(image.image_path, path);
      throwIfSupabaseError(copied.error, { service: 'productService', table: 'storage: product-images', operation: 'kopiranje slike oglasa', columns: ['image_path'] });
      copiedPaths.push(path);
      const { data: publicData } = client.storage.from(PRODUCT_IMAGES_BUCKET).getPublicUrl(path);
      const inserted = await client.from('product_images').insert({ product_id: duplicate.id, image_url: publicData.publicUrl, image_path: path, is_main: Boolean(image.is_main), image_order: Number(image.image_order ?? index) });
      throwIfSupabaseError(inserted.error, { service: 'productService', table: 'product_images', operation: 'spremanje kopirane slike', columns: ['product_id', 'image_url', 'image_path', 'is_main', 'image_order'] });
      if (image.is_main) {
        const updated = await client.from('products').update({ main_image_url: publicData.publicUrl }).eq('id', duplicate.id);
        throwIfSupabaseError(updated.error, { service: 'productService', table: 'products', operation: 'postavljanje glavne slike kopije', columns: ['main_image_url'] });
      }
    }
    const duplicatedImages = await client.from('product_images').select('id,image_url,is_main').eq('product_id', duplicate.id).order('image_order');
    throwIfSupabaseError(duplicatedImages.error, { service: 'productService', table: 'product_images', operation: 'provjera glavne slike kopije', columns: ['id', 'image_url', 'is_main', 'image_order'] });
    if (duplicatedImages.data?.length && !duplicatedImages.data.some((image) => image.is_main)) {
      const first = duplicatedImages.data[0];
      const marked = await client.from('product_images').update({ is_main: true }).eq('id', first.id);
      throwIfSupabaseError(marked.error, { service: 'productService', table: 'product_images', operation: 'postavljanje prve kopirane slike kao glavne', columns: ['is_main', 'id'] });
      const updated = await client.from('products').update({ main_image_url: first.image_url }).eq('id', duplicate.id);
      throwIfSupabaseError(updated.error, { service: 'productService', table: 'products', operation: 'postavljanje main_image_url kopije', columns: ['main_image_url'] });
    }
    return getProductById(duplicate.id);
  } catch (error) {
    if (copiedPaths.length) await client.storage.from(PRODUCT_IMAGES_BUCKET).remove(copiedPaths);
    await client.from('products').delete().eq('id', duplicate.id);
    throw error;
  }
}

/** Duplicira tenisice zajedno s neovisnim kopijama svih Storage slika. */
export function duplicateSneakerProduct(productId){return duplicateProductWithImages(productId,'sneaker');}

/** Duplicira dres zajedno s neovisnim kopijama svih Storage slika. */
export function duplicateJerseyProduct(productId){return duplicateProductWithImages(productId,'jersey');}

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

/** Trajno sprema verziju dresa u stupac verzije koji postoji u Supabase retku. */
export async function setProductVersion(productId, version) {
  const normalizedVersion=String(version||'').trim();
  if(!normalizedVersion)throw new Error('Verzija dresa ne smije biti prazna.');
  const client=await getSupabaseClient();
  if(!client)throw new Error('Spremanje verzije zahtijeva dostupnu Supabase vezu.');
  const current=await client.from('products').select('*').eq('id',productId).single();
  throwIfSupabaseError(current.error,{service:'productService',table:'products',operation:'dohvat stupca verzije',columns:['id','version','jersey_version','product_version']});
  const candidates=['version','jersey_version','product_version'];
  const column=candidates.find((name)=>Object.hasOwn(current.data||{},name)&&String(current.data[name]||'').trim())||candidates.find((name)=>Object.hasOwn(current.data||{},name));
  if(!column)throw new Error('U products tablici nije pronađen stupac za verziju dresa.');
  const saved=await client.from('products').update({[column]:normalizedVersion}).eq('id',productId).select(column).single();
  throwIfSupabaseError(saved.error,{service:'productService',table:'products',operation:'spremanje verzije dresa',columns:[column]});
  if(String(saved.data?.[column]||'').trim()!==normalizedVersion)throw new Error('Supabase nije potvrdio spremljenu verziju dresa.');
  return normalizedVersion;
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
