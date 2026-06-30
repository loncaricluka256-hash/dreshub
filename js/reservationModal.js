import { createReservation } from '../services/reservationService.js';
import { getProductById } from '../services/productService.js';
import { showToast } from './utils.js';

let activeReservation = null;

/**
 * Otvara modal rezervacije za proizvod.
 * @param {string} productId UUID proizvoda.
 * @returns {Promise<void>}
 */
export async function openReservationModal(productId) {
  const dialog = document.querySelector('[data-component="reservation-modal"]');
  const id=String(productId||''),product = await getProductById(id);
  if (!dialog || !product || product.stock < 1) return;
  activeReservation = { productId: String(product.id) };
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
  activeReservation = { items:items.map((item)=>({...item,productId:String(item.productId)})) };
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
    const submit=form.querySelector('[type="submit"]');submit.disabled=true;
    try{
      const reservation=await createReservation({...activeReservation,name:String(data.get('name')).trim(),phone:String(data.get('phone')).trim(),note:String(data.get('note')).trim()});
      if(!reservation)throw new Error('Supabase nije vratio spremljenu rezervaciju.');
      form.hidden=true;dialog.querySelector('[data-reservation-success]').hidden=false;
      window.dispatchEvent(new CustomEvent('dreshub:reservation-created',{detail:{productId:reservation.productId}}));
      showToast('Rezervacija je uspješno spremljena.');
    }catch(error){console.error('[DresHub rezervacije]',{service:'reservationService',table:'reservations',operation:'spremanje rezervacije',message:error.message});showToast(`Rezervacija nije spremljena: ${error.message}`);}
    finally{submit.disabled=false;}
  });
}
