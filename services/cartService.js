import { readStorage, writeStorage } from '../js/storage.js';

const CART_KEY = 'dreshub.cart';

/** @returns {Array<{productId:number, quantity:number}>} Trenutačne stavke košarice. */
export function getCart() {
  return readStorage(CART_KEY, []);
}

/**
 * Dodaje proizvod u košaricu ili povećava njegovu količinu.
 * @param {number} productId Identifikator proizvoda.
 * @param {number} [quantity=1] Količina za dodavanje.
 * @returns {Array<{productId:number, quantity:number}>} Ažurirana košarica.
 */
export function addToCart(productId, quantity = 1) {
  const cart = getCart();
  const item = cart.find((entry) => entry.productId === Number(productId));
  if (item) item.quantity += quantity;
  else cart.push({ productId: Number(productId), quantity });
  writeStorage(CART_KEY, cart);
  announceCartChange();
  return cart;
}

/**
 * Postavlja količinu proizvoda ili ga uklanja kada je količina manja od jedan.
 * @param {number} productId Identifikator proizvoda.
 * @param {number} quantity Nova količina.
 * @returns {Array<{productId:number, quantity:number}>} Ažurirana košarica.
 */
export function updateCartQuantity(productId, quantity) {
  const cart = getCart();
  const nextCart = quantity < 1
    ? cart.filter((entry) => entry.productId !== Number(productId))
    : cart.map((entry) => entry.productId === Number(productId) ? { ...entry, quantity } : entry);
  writeStorage(CART_KEY, nextCart);
  announceCartChange();
  return nextCart;
}

/** @param {number} productId Identifikator proizvoda. @returns {Array<Object>} Ažurirana košarica. */
export function removeFromCart(productId) {
  return updateCartQuantity(productId, 0);
}

/** @returns {number} Ukupan broj komada u košarici. */
export function getCartCount() {
  return getCart().reduce((total, item) => total + item.quantity, 0);
}

/** Obavještava sučelje da je košarica promijenjena. @returns {void} */
function announceCartChange() {
  window.dispatchEvent(new CustomEvent('dreshub:cart-changed'));
}
