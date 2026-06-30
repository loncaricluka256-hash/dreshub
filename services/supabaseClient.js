/**
 * Supabase konfiguracija. Vrijednosti će se unijeti u Fazi 4.
 * Mogu se zadati i prije učitavanja modula kroz globalne
 * `DRESHUB_SUPABASE_URL` i `DRESHUB_SUPABASE_ANON_KEY` vrijednosti.
 */
export const SUPABASE_URL =
  globalThis.DRESHUB_SUPABASE_URL || "https://okmtrzfbagowwufzzvfw.supabase.co";
export const SUPABASE_ANON_KEY =
  globalThis.DRESHUB_SUPABASE_ANON_KEY ||
  "sb_publishable_aSZ01dCJ14GA5UM57se31A_X7rgZj-N";
export const PRODUCT_IMAGES_BUCKET = "product-images";

let clientPromise = null;
let clientInitializationFailed = false;

/** @returns {boolean} True kada su URL i anon key stvarno uneseni. */
export function isSupabaseConfigured() {
  return Boolean(
    SUPABASE_URL &&
    SUPABASE_ANON_KEY &&
    !SUPABASE_URL.includes("YOUR_SUPABASE") &&
    !SUPABASE_ANON_KEY.includes("YOUR_SUPABASE") &&
    /^https:\/\//.test(SUPABASE_URL),
  );
}

/**
 * Inicijalizira i vraća Supabase klijent ili null kada konfiguracija ne postoji.
 * Biblioteka se učitava tek kada je Supabase konfiguriran, pa fallback nema mrežnu ovisnost.
 * @returns {Promise<Object|null>} Supabase klijent ili null.
 */
export async function getSupabaseClient() {
  if (!isSupabaseConfigured()) return null;
  if (clientInitializationFailed) return null;
  if (!clientPromise) {
    clientPromise =
      import("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm").then(
        ({ createClient }) => createClient(SUPABASE_URL, SUPABASE_ANON_KEY),
      ).catch((error) => {
        reportSupabaseError(error, { service: 'supabaseClient', table: 'n/a', operation: 'inicijalizacija klijenta' });
        clientInitializationFailed = true;
        return null;
      });
  }
  return clientPromise;
}

/**
 * Ispisuje strukturiranu Supabase dijagnostiku bez rušenja aplikacije.
 * @param {Object} error Supabase ili mrežna greška.
 * @param {{service:string,table:string,operation:string,columns?:Array<string>}} meta Kontekst.
 * @returns {void}
 */
export function reportSupabaseError(error, meta) {
  const message = error?.message || String(error || 'Nepoznata greška');
  const columnMatch = message.match(/(?:column|stupac)\s+["']?(?:[a-zA-Z0-9_]+\.)?([a-zA-Z0-9_]+)["']?/i);
  const missingColumn = columnMatch?.[1] || error?.details?.match(/(?:column|stupac)\s+["']?([a-zA-Z0-9_]+)["']?/i)?.[1] || null;
  console.error('[DresHub Supabase]', {
    service: meta.service,
    table: meta.table,
    operation: meta.operation,
    column: missingColumn || meta.columns?.join(', ') || 'nije utvrđen',
    code: error?.code || 'HTTP/NETWORK',
    message,
    details: error?.details || null,
    hint: error?.hint || null,
    fallback: isSupabaseConfigured() ? 'isključen (Supabase-only)' : 'Local Storage'
  });
}

/**
 * Pretvara Supabase grešku u konzistentnu aplikacijsku grešku.
 * @param {Object|null} error Supabase greška.
 * @param {string} context Opis operacije.
 * @returns {void}
 * @throws {Error} Kada Supabase vrati grešku.
 */
export function throwIfSupabaseError(error, context) {
  if (error) {
    const meta = typeof context === 'string'
      ? { service: 'nepoznat servis', table: 'nepoznata tablica', operation: context }
      : context;
    reportSupabaseError(error, meta);
    throw new Error(`${meta.operation}: ${error.message || "nepoznata pogreška"}`);
  }
}
