import { readStorage, writeStorage } from '../js/storage.js';
import { getSupabaseClient, isSupabaseConfigured, reportSupabaseError, throwIfSupabaseError } from './supabaseClient.js';

const KEY = 'dreshub.admin.transactions';
const META = { service: 'transactionService', table: 'transactions' };
const EXPENSE_TYPES = new Set(['Trošak', 'Povrat', 'Dostava', 'Carina', 'Popust']);

/** @param {Object} row Redak baze. @param {Array<Object>} [items=[]] Stavke prodaje. @returns {Object} UI transakcija. */
function fromDatabase(row, items = []) {
  return {
    ...row,
    date: row.created_at,
    sourceType: row.source_type,
    sourceId: row.source_id,
    paymentMethod: row.payment_method || '',
    salesChannel: row.sales_channel || '',
    voided: Boolean(row.is_voided),
    voidedAt: row.voided_at,
    source: [row.source_type, row.source_id ? `#${row.source_id}` : ''].filter(Boolean).join(' ') || '',
    items: items.map((item) => ({
      id: item.id,
      productId: item.product_id,
      name: item.product_name_snapshot,
      size: item.size_snapshot,
      player: item.player_name_snapshot,
      price: Number(item.price),
      costPrice: Number(item.cost_price_snapshot || 0),
      quantity: Number(item.quantity || 1)
    }))
  };
}

/** @param {Object} transaction Transakcija. @returns {Object} Redak baze. */
function toDatabase(transaction) {
  const sourceType = transaction.sourceType || String(transaction.source || 'Ručni unos').split('#')[0].trim();
  const sourceId = transaction.sourceId ?? (Number(String(transaction.source || '').match(/#(\d+)/)?.[1]) || null);
  return {
    type: transaction.type,
    amount: Number(transaction.amount),
    description: transaction.description || '',
    source_type: sourceType,
    source_id: sourceId,
    payment_method: transaction.paymentMethod || transaction.payment_method || null,
    sales_channel: transaction.salesChannel || transaction.sales_channel || null,
    ...(transaction.date ? { created_at: transaction.date } : {})
  };
}

/** @returns {Array<Object>} */
function localTransactions() {
  return readStorage(KEY, []);
}

/** @returns {Promise<Array<Object>>} Sve transakcije. */
export async function getTransactions() {
  const client = await getSupabaseClient();
  if (client) {
    const { data, error } = await client.from('transactions').select('*');
    if (error) {
      reportSupabaseError(error, { ...META, operation: 'dohvat transakcija', columns: ['created_at'] });
      return [];
    }
    const itemResult = await client.from('sale_items').select('*');
    if (itemResult.error) {
      reportSupabaseError(itemResult.error, {
        service: 'transactionService',
        table: 'sale_items',
        operation: 'dohvat stavki prodaje',
        columns: ['transaction_id', 'product_id']
      });
    }
    const byTransaction = new Map();
    for (const item of itemResult.data || []) {
      const key = String(item.transaction_id);
      const items = byTransaction.get(key) || [];
      items.push(item);
      byTransaction.set(key, items);
    }
    return (data ?? [])
      .map((row) => fromDatabase(row, byTransaction.get(String(row.id)) || []))
      .sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
  }
  return isSupabaseConfigured() ? [] : localTransactions();
}

/**
 * Atomski sprema prodaju, stavke i smanjuje zalihu.
 * @param {Array<{productId:string,price:number,quantity?:number}>} items Stavke.
 * @param {string} note Napomena.
 * @param {string} [paymentMethod='gotovina'] Način plaćanja.
 * @param {string} [salesChannel='uživo'] Kanal prodaje.
 * @param {string} [soldAt] Datum prodaje.
 * @returns {Promise<Object>} Rezultat prodaje.
 */
export async function createLiveSale(items, note = 'Prodano uživo', paymentMethod = 'gotovina', salesChannel = 'uživo', soldAt = new Date().toISOString()) {
  const client = await getSupabaseClient();
  if (!client) throw new Error('Prodaja uživo zahtijeva dostupnu Supabase vezu.');
  const payload = items.map((item) => ({
    product_id: String(item.productId),
    price: Number(item.price),
    quantity: Math.max(1, Number(item.quantity || 1))
  }));
  const { data, error } = await client.rpc('record_live_sale', {
    p_items: payload,
    p_note: note,
    p_payment_method: paymentMethod,
    p_sales_channel: salesChannel,
    p_sold_at: soldAt
  });
  throwIfSupabaseError(error, {
    service: 'transactionService',
    table: 'transactions + sale_items + products',
    operation: 'prodaja uživo',
    columns: ['quantity', 'is_archived', 'amount', 'payment_method', 'sales_channel', 'created_at']
  });
  return data;
}

/**
 * Uređuje prodaju i atomski usklađuje zalihu prema novim stavkama.
 * @param {string|number} transactionId ID transakcije.
 * @param {Array<{productId:string,price:number,quantity?:number}>} items Stavke.
 * @param {{description?:string,note?:string,paymentMethod?:string,salesChannel?:string,date?:string}} data Podaci prodaje.
 * @returns {Promise<Object>} Rezultat.
 */
export async function updateLiveSale(transactionId, items, data = {}) {
  const client = await getSupabaseClient();
  if (!client) throw new Error('Uređivanje prodaje zahtijeva dostupnu Supabase vezu.');
  const payload = items.map((item) => ({
    product_id: String(item.productId),
    price: Number(item.price),
    quantity: Math.max(1, Number(item.quantity || 1))
  }));
  const { data: result, error } = await client.rpc('update_live_sale', {
    p_transaction_id: String(transactionId),
    p_items: payload,
    p_note: data.note || data.description || 'Prodano',
    p_payment_method: data.paymentMethod || 'gotovina',
    p_sales_channel: data.salesChannel || 'uživo',
    p_sold_at: data.date || new Date().toISOString()
  });
  throwIfSupabaseError(error, {
    service: 'transactionService',
    table: 'transactions + sale_items + products',
    operation: 'uređivanje prodaje',
    columns: ['quantity', 'amount', 'payment_method', 'sales_channel', 'created_at']
  });
  return result;
}

/** Poništava prodaju i atomski vraća sve prodane komade. @param {string|number} transactionId ID. @returns {Promise<Object>} Rezultat. */
export async function voidLiveSale(transactionId) {
  const client = await getSupabaseClient();
  if (!client) throw new Error('Poništavanje prodaje zahtijeva dostupnu Supabase vezu.');
  const { data, error } = await client.rpc('void_live_sale', { p_transaction_id: String(transactionId) });
  throwIfSupabaseError(error, {
    service: 'transactionService',
    table: 'transactions + sale_items + products',
    operation: 'poništavanje prodaje',
    columns: ['is_voided', 'voided_at', 'quantity', 'is_archived']
  });
  return data;
}

/** @param {Object} transactionData Podaci. @returns {Promise<Object>} */
export async function createTransaction(transactionData) {
  const payload = { ...toDatabase(transactionData), created_at: transactionData.date || new Date().toISOString() };
  const client = await getSupabaseClient();
  if (client) {
    const { data, error } = await client.from('transactions').insert(payload).select().single();
    throwIfSupabaseError(error, { ...META, operation: 'stvaranje transakcije', columns: Object.keys(payload) });
    return fromDatabase(data);
  }
  if (isSupabaseConfigured()) throw new Error('Supabase transakcije trenutačno nisu dostupne.');
  const record = { id: Date.now(), ...transactionData, date: transactionData.date || payload.created_at };
  writeStorage(KEY, [record, ...localTransactions()]);
  return record;
}

/** @param {number|string} transactionId ID. @param {Object} transactionData Izmjene. @returns {Promise<Object|null>} */
export async function updateTransaction(transactionId, transactionData) {
  const client = await getSupabaseClient();
  if (client) {
    const current = (await getTransactions()).find((item) => String(item.id) === String(transactionId));
    if (!current) return null;
    const payload = toDatabase({ ...current, ...transactionData });
    const { data, error } = await client.from('transactions').update(payload).eq('id', String(transactionId)).select().single();
    throwIfSupabaseError(error, { ...META, operation: 'ažuriranje transakcije', columns: Object.keys(payload) });
    return fromDatabase(data);
  }
  if (isSupabaseConfigured()) throw new Error('Supabase transakcije trenutačno nisu dostupne.');
  const records = localTransactions();
  const record = records.find((item) => String(item.id) === String(transactionId));
  if (!record) return null;
  Object.assign(record, transactionData);
  writeStorage(KEY, records);
  return record;
}

/** @param {number|string} transactionId ID. @returns {Promise<void>} */
export async function deleteTransaction(transactionId) {
  const client = await getSupabaseClient();
  if (client) {
    const { error } = await client.from('transactions').delete().eq('id', String(transactionId));
    throwIfSupabaseError(error, { ...META, operation: 'brisanje transakcije', columns: ['id'] });
    return;
  }
  if (isSupabaseConfigured()) throw new Error('Supabase transakcije trenutačno nisu dostupne.');
  writeStorage(KEY, localTransactions().filter((item) => String(item.id) !== String(transactionId)));
}

/** @param {{from?:string,to?:string}} [filters={}] Filtri. @returns {Promise<Object>} */
export async function getFinanceSummary(filters = {}) {
  let records = (await getTransactions()).filter((item) => !item.voided);
  if (filters.from) records = records.filter((item) => new Date(item.date) >= new Date(filters.from));
  if (filters.to) records = records.filter((item) => new Date(item.date) <= new Date(filters.to));
  const sales = records.filter((item) => item.type === 'Prodaja').reduce((sum, item) => sum + Math.abs(Number(item.amount)), 0);
  const expenses = records.filter((item) => EXPENSE_TYPES.has(item.type)).reduce((sum, item) => sum + Math.abs(Number(item.amount)), 0);
  return { sales, expenses, profit: sales - expenses, count: records.length };
}
