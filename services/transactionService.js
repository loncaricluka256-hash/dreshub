import { readStorage, writeStorage } from '../js/storage.js';
import { getSupabaseClient, isSupabaseConfigured, reportSupabaseError, throwIfSupabaseError } from './supabaseClient.js';

const KEY='dreshub.admin.transactions';
const META={service:'transactionService',table:'transactions'};
const EXPENSE_TYPES=new Set(['Trošak','Povrat','Dostava','Carina','Popust']);
/** @param {Object} row Redak baze. @returns {Object} UI transakcija. */
function fromDatabase(row){return{...row,date:row.created_at,sourceType:row.source_type,sourceId:row.source_id,source:[row.source_type,row.source_id?`#${row.source_id}`:''].filter(Boolean).join(' ')||''};}
/** @param {Object} transaction Transakcija. @returns {Object} Redak baze. */
function toDatabase(transaction){const sourceType=transaction.sourceType||String(transaction.source||'Ručni unos').split('#')[0].trim(),sourceId=transaction.sourceId??(Number(String(transaction.source||'').match(/#(\d+)/)?.[1])||null);return{type:transaction.type,amount:Number(transaction.amount),description:transaction.description||'',source_type:sourceType,source_id:sourceId,...(transaction.date?{created_at:transaction.date}:{})};}
/** @returns {Array<Object>} */
function localTransactions(){return readStorage(KEY,[]);}

/** @returns {Promise<Array<Object>>} Sve transakcije. */
export async function getTransactions(){const client=await getSupabaseClient();if(client){const{data,error}=await client.from('transactions').select('*');if(!error)return(data??[]).map(fromDatabase).sort((a,b)=>new Date(b.date||0)-new Date(a.date||0));reportSupabaseError(error,{...META,operation:'dohvat transakcija',columns:['created_at']});return[];}return isSupabaseConfigured()?[]:localTransactions();}

/** @param {Object} transactionData Podaci. @returns {Promise<Object>} */
export async function createTransaction(transactionData){const payload={...toDatabase(transactionData),created_at:transactionData.date||new Date().toISOString()},client=await getSupabaseClient();if(client){const{data,error}=await client.from('transactions').insert(payload).select().single();throwIfSupabaseError(error,{...META,operation:'stvaranje transakcije',columns:Object.keys(payload)});return fromDatabase(data);}if(isSupabaseConfigured())throw new Error('Supabase transakcije trenutačno nisu dostupne.');const record={id:Date.now(),...transactionData,date:transactionData.date||payload.created_at};writeStorage(KEY,[record,...localTransactions()]);return record;}

/** @param {number|string} transactionId ID. @param {Object} transactionData Izmjene. @returns {Promise<Object|null>} */
export async function updateTransaction(transactionId,transactionData){const client=await getSupabaseClient();if(client){const current=(await getTransactions()).find((item)=>item.id===Number(transactionId));if(!current)return null;const payload=toDatabase({...current,...transactionData}),{data,error}=await client.from('transactions').update(payload).eq('id',transactionId).select().single();throwIfSupabaseError(error,{...META,operation:'ažuriranje transakcije',columns:Object.keys(payload)});return fromDatabase(data);}if(isSupabaseConfigured())throw new Error('Supabase transakcije trenutačno nisu dostupne.');const records=localTransactions(),record=records.find((item)=>item.id===Number(transactionId));if(!record)return null;Object.assign(record,transactionData);writeStorage(KEY,records);return record;}

/** @param {number|string} transactionId ID. @returns {Promise<void>} */
export async function deleteTransaction(transactionId){const client=await getSupabaseClient();if(client){const{error}=await client.from('transactions').delete().eq('id',transactionId);throwIfSupabaseError(error,{...META,operation:'brisanje transakcije',columns:['id']});return;}if(isSupabaseConfigured())throw new Error('Supabase transakcije trenutačno nisu dostupne.');writeStorage(KEY,localTransactions().filter((item)=>item.id!==Number(transactionId)));}

/** @param {{from?:string,to?:string}} [filters={}] Filtri. @returns {Promise<Object>} */
export async function getFinanceSummary(filters={}){let records=await getTransactions();if(filters.from)records=records.filter((item)=>new Date(item.date)>=new Date(filters.from));if(filters.to)records=records.filter((item)=>new Date(item.date)<=new Date(filters.to));const sales=records.filter((item)=>item.type==='Prodaja').reduce((sum,item)=>sum+Math.abs(Number(item.amount)),0),expenses=records.filter((item)=>EXPENSE_TYPES.has(item.type)).reduce((sum,item)=>sum+Math.abs(Number(item.amount)),0);return{sales,expenses,profit:sales-expenses,count:records.length};}
