import { readStorage, writeStorage } from '../js/storage.js';

const FAVORITES_KEY = 'dreshub.favorites';

/** @returns {Array<number>} Identifikatori omiljenih proizvoda. */
export function getFavorites() {
  return readStorage(FAVORITES_KEY, []);
}

/**
 * Provjerava nalazi li se proizvod u favoritima.
 * @param {number} productId Identifikator proizvoda.
 * @returns {boolean} True kada je proizvod spremljen.
 */
export function isFavorite(productId) {
  return getFavorites().includes(Number(productId));
}

/**
 * Dodaje ili uklanja proizvod iz favorita.
 * @param {number} productId Identifikator proizvoda.
 * @returns {boolean} Novo stanje favorita.
 */
export function toggleFavorite(productId) {
  const id = Number(productId);
  const favorites = getFavorites();
  const active = !favorites.includes(id);
  writeStorage(FAVORITES_KEY, active ? [...favorites, id] : favorites.filter((item) => item !== id));
  window.dispatchEvent(new CustomEvent('dreshub:favorites-changed'));
  return active;
}
