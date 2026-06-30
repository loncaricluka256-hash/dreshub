import { readStorage, writeStorage } from '../js/storage.js';
import { getSupabaseClient, isSupabaseConfigured, reportSupabaseError, throwIfSupabaseError } from './supabaseClient.js';

const KEY = 'dreshub.admin.changes';

/**
 * Dohvaća povijest promjena uz opcionalne filtre.
 * @param {{category?:string, from?:string, to?:string}} [filters={}] Filtri.
 * @returns {Promise<Array<Object>>} Audit zapisi.
 */
export async function getChangeHistory(filters = {}) {
  const client = await getSupabaseClient();
  if (client) {
    let query = client.from('change_history').select('*');
    if (filters.category) query = query.eq('entity_type', filters.category);
    const { data, error } = await query;
    if(!error){let records=(data??[]).map((entry)=>({...entry,category:entry.entity_type,entityId:entry.entity_id,changeType:entry.change_type,date:entry.created_at,oldValue:entry.old_value,newValue:entry.new_value,admin:entry.admin_name})).sort((a,b)=>new Date(b.date||0)-new Date(a.date||0));if(filters.from)records=records.filter((entry)=>new Date(entry.date)>=new Date(filters.from));if(filters.to)records=records.filter((entry)=>new Date(entry.date)<=new Date(filters.to));return records;}
    reportSupabaseError(error,{service:'changeHistoryService',table:'change_history',operation:'dohvat povijesti promjena',columns:['created_at','entity_type']});
  }
  if(isSupabaseConfigured())return[];
  return readStorage(KEY, []).filter((entry) => (!filters.category || entry.category === filters.category)
    && (!filters.from || new Date(entry.date) >= new Date(filters.from))
    && (!filters.to || new Date(entry.date) <= new Date(filters.to)));
}

/**
 * Stvara audit zapis odvojen od financijskih transakcija.
 * @param {Object} entryData Podaci promjene.
 * @returns {Promise<Object>} Novi zapis.
 */
export async function createChangeHistoryEntry(entryData) {
  const client = await getSupabaseClient();
  if (client) {
    const payload = { entity_type: entryData.entityType||entryData.category, entity_id:entryData.entityId||null, change_type:entryData.changeType||'update', description: entryData.description, old_value: entryData.oldValue??null, new_value: entryData.newValue??null, admin_name: entryData.admin || 'Admin' };
    const { data, error } = await client.from('change_history').insert(payload).select().single();
    throwIfSupabaseError(error,{service:'changeHistoryService',table:'change_history',operation:'stvaranje audit zapisa',columns:Object.keys(payload)});
    return{...data,category:data.entity_type,entityId:data.entity_id,changeType:data.change_type,date:data.created_at,oldValue:data.old_value,newValue:data.new_value,admin:data.admin_name};
  }
  if(isSupabaseConfigured())throw new Error('Supabase povijest promjena trenutačno nije dostupna.');
  const record = { id: entryData.id || Date.now() + Math.random(), date: entryData.date || new Date().toISOString(), admin: 'Admin', ...entryData };
  writeStorage(KEY, [record, ...readStorage(KEY, [])]);
  return record;
}
