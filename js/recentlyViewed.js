import { readStorage, writeStorage } from './storage.js';

const RECENT_KEY = 'dreshub.recent';
const MAX_RECENT = 4;

/**
 * Sprema proizvod na početak popisa nedavno pregledanih.
 * @param {number} productId Identifikator proizvoda.
 * @returns {void}
 */
export function addRecentlyViewed(productId) {
  const id=String(productId);
  const recent=readStorage(RECENT_KEY,[]).map(String).filter((item)=>item!==id);
  writeStorage(RECENT_KEY, [id, ...recent].slice(0, MAX_RECENT));
}

/** @returns {Array<number>} Identifikatori nedavno pregledanih proizvoda. */
export function getRecentlyViewed() {
  return readStorage(RECENT_KEY,[]).map(String);
}
