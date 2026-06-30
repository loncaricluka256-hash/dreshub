import { getAllProducts, saveProducts } from './productService.js';
import { getSupabaseClient, isSupabaseConfigured, PRODUCT_IMAGES_BUCKET, reportSupabaseError, throwIfSupabaseError } from './supabaseClient.js';

/**
 * Uploada 1–5 slika proizvoda u Storage ili lokalni preview fallback.
 * @param {number|string} productId ID proizvoda.
 * @param {FileList|Array<File>} files Odabrane datoteke iz galerije ili mape.
 * @returns {Promise<Array<Object>>} Metapodaci slika.
 */
export async function uploadProductImages(productId, files) {
  const selected = [...files].slice(0, 5);
  if (!selected.length) return [];
  const client = await getSupabaseClient();
  if (client) {
    const uploaded = [];
    for (let index = 0; index < selected.length; index += 1) {
      const file = selected[index];
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '-');
      const path = `products/${productId}/${Date.now()+index}-${safeName}`;
      const { error: uploadError } = await client.storage.from(PRODUCT_IMAGES_BUCKET).upload(path, file, { upsert: false });
      throwIfSupabaseError(uploadError,{service:'imageService',table:'storage: product-images',operation:`Upload slike „${file.name}” nije uspio${String(uploadError?.message||'').toLowerCase().includes('row-level security')?' — Supabase Storage RLS policy blokira upload':''}`,columns:['product-images']});
      const { data: publicData } = client.storage.from(PRODUCT_IMAGES_BUCKET).getPublicUrl(path);
      const { data, error } = await client.from('product_images').insert({ product_id: productId, image_url: publicData.publicUrl, image_path: path, is_main: false, image_order: index }).select().single();
      throwIfSupabaseError(error,{service:'imageService',table:'product_images',operation:'Spremanje metapodataka slike nije uspjelo',columns:['product_id','image_url','image_path','is_main','image_order']});
      uploaded.push(data);
    }
    if(uploaded[0]?.image_url){let mainResult=await client.from('product_images').update({is_main:false}).eq('product_id',productId);throwIfSupabaseError(mainResult.error,{service:'imageService',table:'product_images',operation:'Reset glavne slike nakon uploada nije uspio',columns:['product_id','is_main']});mainResult=await client.from('product_images').update({is_main:true}).eq('id',uploaded[0].id).eq('product_id',productId);throwIfSupabaseError(mainResult.error,{service:'imageService',table:'product_images',operation:'Postavljanje glavne slike nakon uploada nije uspjelo',columns:['id','product_id','is_main']});const{error}=await client.from('products').update({main_image_url:uploaded[0].image_url}).eq('id',productId);throwIfSupabaseError(error,{service:'imageService',table:'products',operation:'Spremanje glavne slike proizvoda nije uspjelo',columns:['main_image_url']});}
    return uploaded;
  }
  if(isSupabaseConfigured())throw new Error('Supabase Storage trenutačno nije dostupan; slike nisu spremljene.');
  return selected.map((file,index)=>({id:`${productId}-preview-${index}`,productId:String(productId),imageUrl:null,imagePath:null,isMain:index===0,imageOrder:index,fileName:file.name}));
}

/** @param {number|string} productId ID proizvoda. @returns {Promise<Array<Object>>} Slike. */
export async function getProductImages(productId) {
  const client = await getSupabaseClient();
  if (client) { const { data, error } = await client.from('product_images').select('*').eq('product_id', productId).order('image_order'); if(!error)return data??[];reportSupabaseError(error,{service:'imageService',table:'product_images',operation:'dohvat slika proizvoda',columns:['product_id','image_order']});return[]; }
  if(isSupabaseConfigured())return[];
  const product=(await getAllProducts()).find((item)=>String(item.id)===String(productId));
  return (product?.images || []).map((url, index) => ({ id: `${productId}-${index}`, productId:String(productId), imageUrl: url, imagePath: null, isMain: index === 0, imageOrder: index }));
}

/** @param {number|string} productId ID proizvoda. @param {number|string} imageId ID slike. @returns {Promise<void>} */
export async function setMainProductImage(productId, imageId) {
  const client = await getSupabaseClient();
  if (client) { let result=await client.from('product_images').update({is_main:false}).eq('product_id',productId);throwIfSupabaseError(result.error,{service:'imageService',table:'product_images',operation:'Reset glavne slike nije uspio',columns:['is_main','product_id']});result=await client.from('product_images').update({is_main:true}).eq('id',imageId).eq('product_id',productId).select('image_url').single();throwIfSupabaseError(result.error,{service:'imageService',table:'product_images',operation:'Odabir glavne slike nije uspio',columns:['is_main','id','product_id','image_url']});if(result.data?.image_url){const update=await client.from('products').update({main_image_url:result.data.image_url}).eq('id',productId);throwIfSupabaseError(update.error,{service:'imageService',table:'products',operation:'Ažuriranje glavne slike proizvoda nije uspjelo',columns:['main_image_url']});}return; }
  if(isSupabaseConfigured())throw new Error('Supabase slike trenutačno nisu dostupne.');const products=await getAllProducts(),product=products.find((item)=>String(item.id)===String(productId));if(!product)return;const index=Number(String(imageId).split('-').pop());if(product.images[index])product.images=[product.images[index],...product.images.filter((_,i)=>i!==index)];saveProducts(products);
}

/** @param {number|string} imageId ID slike. @returns {Promise<void>} */
export async function deleteProductImage(imageId) {
  const client=await getSupabaseClient();
  if(client){const{data,error}=await client.from('product_images').select('image_path').eq('id',imageId).single();throwIfSupabaseError(error,'Slika nije pronađena');if(data?.image_path){const result=await client.storage.from(PRODUCT_IMAGES_BUCKET).remove([data.image_path]);throwIfSupabaseError(result.error,'Brisanje slike iz Storagea nije uspjelo');}const result=await client.from('product_images').delete().eq('id',imageId);throwIfSupabaseError(result.error,'Brisanje metapodataka slike nije uspjelo');return;}
  if(isSupabaseConfigured())throw new Error('Supabase slike trenutačno nisu dostupne.');const [productId,index]=String(imageId).split('-').map(Number),products=await getAllProducts(),product=products.find((item)=>item.id===productId);if(product){product.images.splice(index,1);saveProducts(products);}
}

/** @param {number|string} productId ID proizvoda. @param {Array<number|string>} orderedImageIds Poredani ID-jevi. @returns {Promise<void>} */
export async function reorderProductImages(productId, orderedImageIds) {
  const client=await getSupabaseClient();
  if(client){for(let index=0;index<orderedImageIds.length;index+=1){const{error}=await client.from('product_images').update({image_order:index}).eq('id',orderedImageIds[index]).eq('product_id',productId);throwIfSupabaseError(error,'Promjena redoslijeda slika nije uspjela');}return;}
  if(isSupabaseConfigured())throw new Error('Supabase slike trenutačno nisu dostupne.');const products=await getAllProducts(),product=products.find((item)=>String(item.id)===String(productId));if(!product)return;const current=[...product.images];product.images=orderedImageIds.map((id)=>current[Number(String(id).split('-').pop())]).filter(Boolean);saveProducts(products);
}
