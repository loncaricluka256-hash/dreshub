import { readStorage, writeStorage } from '../js/storage.js';
import { getSupabaseClient, isSupabaseConfigured, reportSupabaseError, throwIfSupabaseError } from './supabaseClient.js';

const KEY = 'dreshub.admin.notes';
const META = { service: 'noteService', table: 'notes' };

/** @param {Object} row Redak baze. @returns {Object} UI bilješka. */
function fromDatabase(row) { return { id:row.id,title:row.title,description:row.content||'',type:row.type,amount:row.amount,dueDate:row.deadline,priority:row.priority,status:row.status,pinned:Boolean(row.is_pinned),tags:row.tags||[],productId:row.linked_type==='product'?row.linked_id:null,orderId:row.linked_type==='purchase_order'?row.linked_id:null,linkedType:row.linked_type,linkedId:row.linked_id,createdAt:row.created_at,updatedAt:row.updated_at }; }
/** @param {Object} note Bilješka. @returns {Object} Redak baze. */
function toDatabase(note) { const linkedType=note.linkedType||(note.productId?'product':note.orderId?'purchase_order':null),linkedId=note.linkedId||note.productId||note.orderId||null;return {title:note.title,content:note.description||'',type:note.type,amount:note.amount??null,deadline:note.dueDate||null,priority:note.priority,status:note.status,is_pinned:Boolean(note.pinned),linked_type:linkedType,linked_id:linkedId,tags:note.tags||[]}; }
/** @returns {Array<Object>} Lokalni fallback. */
function localNotes() { return readStorage(KEY, []); }

/** @returns {Promise<Array<Object>>} Sve bilješke. */
export async function getNotes() {
  const client = await getSupabaseClient();
  if (client) {
    const { data, error } = await client.from('notes').select('*');
    if (!error) return(data??[]).map(fromDatabase).sort((a,b)=>Number(b.pinned)-Number(a.pinned)||new Date(b.createdAt||0)-new Date(a.createdAt||0));
    reportSupabaseError(error,{...META,operation:'dohvat bilješki',columns:['*']});
  }
  return isSupabaseConfigured()?[]:localNotes();
}

/** @param {number|string} noteId ID. @returns {Promise<Object|null>} */
export async function getNoteById(noteId) { return (await getNotes()).find((note) => note.id === Number(noteId)) ?? null; }

/** @param {Object} noteData Podaci. @returns {Promise<Object>} */
export async function createNote(noteData) {
  const client=await getSupabaseClient();
  if(client){const payload=toDatabase(noteData),{data,error}=await client.from('notes').insert(payload).select().single();throwIfSupabaseError(error,{...META,operation:'stvaranje bilješke',columns:Object.keys(payload)});return fromDatabase(data);}
  if(isSupabaseConfigured())throw new Error('Supabase bilješke trenutačno nisu dostupne.');
  const note={id:Date.now(),createdAt:new Date().toISOString(),pinned:false,status:'Aktivna',...noteData};writeStorage(KEY,[note,...localNotes()]);return note;
}

/** @param {number|string} noteId ID. @param {Object} noteData Izmjene. @returns {Promise<Object|null>} */
export async function updateNote(noteId,noteData){const client=await getSupabaseClient();if(client){const current=await getNoteById(noteId);if(!current)return null;const payload=toDatabase({...current,...noteData}),{data,error}=await client.from('notes').update(payload).eq('id',noteId).select().single();throwIfSupabaseError(error,{...META,operation:'ažuriranje bilješke',columns:Object.keys(payload)});return fromDatabase(data);}if(isSupabaseConfigured())throw new Error('Supabase bilješke trenutačno nisu dostupne.');const notes=localNotes(),note=notes.find((item)=>item.id===Number(noteId));if(!note)return null;Object.assign(note,noteData);writeStorage(KEY,notes);return note;}

/** @param {number|string} noteId ID. @returns {Promise<void>} */
export async function deleteNote(noteId){const client=await getSupabaseClient();if(client){const{error}=await client.from('notes').delete().eq('id',noteId);throwIfSupabaseError(error,{...META,operation:'brisanje bilješke',columns:['id']});return;}if(isSupabaseConfigured())throw new Error('Supabase bilješke trenutačno nisu dostupne.');writeStorage(KEY,localNotes().filter((item)=>item.id!==Number(noteId)));}
/** @param {number|string} noteId ID. @returns {Promise<Object|null>} */
export async function archiveNote(noteId){return updateNote(noteId,{status:'Arhivirana'});}
/** @param {number|string} noteId ID. @returns {Promise<Object|null>} */
export async function pinNote(noteId){return updateNote(noteId,{pinned:true});}
/** @param {number|string} noteId ID. @returns {Promise<Object|null>} */
export async function unpinNote(noteId){return updateNote(noteId,{pinned:false});}
/** @param {number|string} noteId ID. @returns {Promise<Object|null>} */
export async function completeNote(noteId){return updateNote(noteId,{status:'Završena'});}
