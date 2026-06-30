import { readStorage, writeStorage } from '../js/storage.js';
import { getSupabaseClient, isSupabaseConfigured, reportSupabaseError, throwIfSupabaseError } from './supabaseClient.js';

const KEY='dreshub.admin.settings';
const META={service:'settingsService',table:'settings'};
const FALLBACK_PASSWORD='admin';
const KEY_TO_UI={admin_password:'adminPassword',store_name:'storeName',phone_luki:'phoneLuki',phone_blaz:'phoneBlaz',notification_visible:'notificationVisible',reservation_hours:'reservationHours'};
const KEY_TO_DB=Object.fromEntries(Object.entries(KEY_TO_UI).map(([database,ui])=>[ui,database]));
let settingsCache={};

/** @param {string} key DB ključ. @returns {string} UI ključ. */
function toUiKey(key){return KEY_TO_UI[key]||key;}
/** @param {string} key UI ključ. @returns {string} DB ključ. */
function toDatabaseKey(key){return KEY_TO_DB[key]||key;}
/** @param {*} value Vrijednost iz baze. @returns {*} */
function parseSettingValue(value){if(typeof value!=='string')return value;try{return JSON.parse(value);}catch{return value;}}
/** @returns {Object|null} Lokalni fallback samo bez Supabase konfiguracije. */
function localSettings(){return readStorage(KEY,null);}

/** @returns {Promise<Object>} Sve postavke. */
export async function getSettings(){
  const client=await getSupabaseClient();
  if(client){const{data,error}=await client.from('settings').select('key, value');if(!error){settingsCache=Object.fromEntries((data??[]).map((entry)=>[toUiKey(entry.key),parseSettingValue(entry.value)]));return settingsCache;}reportSupabaseError(error,{...META,operation:'dohvat postavki',columns:['key','value']});return{};}
  if(isSupabaseConfigured())return{};
  const local=localSettings();if(local)return local;
  try{const response=await fetch('data/demo-settings.json');if(response.ok)return await response.json();}catch{}
  return{storeName:'DresHub',adminPassword:FALLBACK_PASSWORD,reservationHours:48};
}

/** @param {string} key Ključ. @returns {Promise<*>} */
export async function getSetting(key){return(await getSettings())[toUiKey(key)];}

/** @param {string} key Ključ. @param {*} value Vrijednost. @returns {Promise<*>} */
export async function updateSetting(key,value){
  const uiKey=toUiKey(key),client=await getSupabaseClient();
  if(client){const{error}=await client.from('settings').upsert({key:toDatabaseKey(uiKey),value},{onConflict:'key'});throwIfSupabaseError(error,{...META,operation:'ažuriranje postavke',columns:['key','value']});settingsCache={...settingsCache,[uiKey]:value};return value;}
  if(isSupabaseConfigured())throw new Error('Supabase postavke trenutačno nisu dostupne.');
  const next={...(await getSettings()),[uiKey]:value};writeStorage(KEY,next);return value;
}

/** @param {Object} settings Postavke. @returns {Promise<Object>} */
export async function updateMultipleSettings(settings){
  const client=await getSupabaseClient();
  if(client){const rows=Object.entries(settings).map(([key,value])=>({key:toDatabaseKey(key),value})),{error}=await client.from('settings').upsert(rows,{onConflict:'key'});throwIfSupabaseError(error,{...META,operation:'ažuriranje više postavki',columns:['key','value']});settingsCache={...settingsCache,...settings};return settingsCache;}
  if(isSupabaseConfigured())throw new Error('Supabase postavke trenutačno nisu dostupne.');
  const next={...(await getSettings()),...settings};writeStorage(KEY,next);return next;
}

/** @returns {Promise<string>} Lozinka iz `settings.admin_password`. */
export async function getAdminPassword(){
  const settings=await getSettings();
  if(isSupabaseConfigured()){if(!settings.adminPassword)throw new Error('Postavka admin_password nije pronađena u Supabase tablici settings.');return String(settings.adminPassword);}
  return String(settings.adminPassword||FALLBACK_PASSWORD);
}

/** @param {string} answer Odgovor. @returns {boolean} */
export function verifyPasswordChangeSecurityAnswer(answer){return String(answer).trim().toLocaleLowerCase('hr')==='tili';}
/** @param {string} newPassword Nova lozinka. @param {string} securityAnswer Odgovor. @returns {Promise<boolean>} */
export async function changeAdminPassword(newPassword,securityAnswer){if(!verifyPasswordChangeSecurityAnswer(securityAnswer))return false;if(String(newPassword).length<4)throw new Error('Lozinka mora imati najmanje 4 znaka.');await updateSetting('admin_password',newPassword);return true;}
