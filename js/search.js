// Faza 0: javno sučelje za buduću pretragu.
/**
 * Filtrira proizvode prema tekstualnom upitu.
 * @param {Array<Object>} products Proizvodi za pretraživanje.
 * @param {string} query Tekst upita.
 * @returns {Array<Object>} Proizvodi koji odgovaraju upitu.
 */
export function searchProducts(products,query){const term=query.trim().toLowerCase();return products.filter(p=>p.name.toLowerCase().includes(term));}
