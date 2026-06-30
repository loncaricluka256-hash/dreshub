import { createReservation } from '../services/reservationService.js';
import { getProductById } from '../services/productService.js';
import { showToast } from './utils.js';

let activeReservation = null;

/**
 * Otvara modal rezervacije za proizvod.
 * @param {number} productId Identifikator proizvoda.
 * @returns {Promise<void>}
 */
export async function openReservationModal(productId) {
  const dialog = document.querySelector('[data-component="reservation-modal"]');
  const product = await getProductById(productId);
  if (!dialog || !product || product.stock < 1) return;
  activeReservation = { productId: product.id };
  dialog.querySelector('[data-reservation-product]').textContent = product.name;
  dialog.querySelector('form').reset();
  dialog.querySelector('[data-reservation-success]').hidden = true;
  dialog.querySelector('[data-reservation-form]').hidden = false;
  dialog.showModal();
}

/**
 * Otvara modal za zajedničku rezervaciju stavki košarice.
 * @param {Array<{productId:number, quantity:number}>} items Stavke košarice.
 * @returns {void}
 */
export function openCartReservationModal(items) {
  const dialog = document.querySelector('[data-component="reservation-modal"]');
  if (!dialog || !items.length) return;
  activeReservation = { items };
  const quantity = items.reduce((total, item) => total + item.quantity, 0);
  dialog.querySelector('[data-reservation-product]').textContent = `${quantity} ${quantity === 1 ? 'dres' : 'dresa'} iz košarice`;
  dialog.querySelector('form').reset();
  dialog.querySelector('[data-reservation-success]').hidden = true;
  dialog.querySelector('[data-reservation-form]').hidden = false;
  dialog.showModal();
}

/** Povezuje obrazac i kontrole modala rezervacije. @returns {void} */
export function initReservationModal() {
  const dialog = document.querySelector('[data-component="reservation-modal"]');
  if (!dialog) return;
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog || event.target.closest('[data-close-modal]')) dialog.close();
  });
  dialog.querySelector('form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    await createReservation({
      ...activeReservation,
      name: String(data.get('name')).trim(),
      phone: String(data.get('phone')).trim(),
      note: String(data.get('note')).trim()
    });
    form.hidden = true;
    dialog.querySelector('[data-reservation-success]').hidden = false;
    showToast('Rezervacija je uspješno zaprimljena.');
  });
}
