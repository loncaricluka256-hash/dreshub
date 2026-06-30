import { initComponents } from './components.js';
import { getProducts } from '../services/productService.js';
import { getCart, updateCartQuantity, removeFromCart } from '../services/cartService.js';
import { initReservationModal, openCartReservationModal } from './reservationModal.js';
import { formatPrice, showToast } from './utils.js';

let products = [];

/** Prikazuje trenutačni sadržaj košarice. @returns {void} */
function renderCart() {
  const root = document.querySelector('[data-cart]');
  const cart = getCart();
  const items = cart.map((entry) => ({ ...entry, product: products.find((product)=>String(product.id)===String(entry.productId)) })).filter((entry) => entry.product);
  if (!items.length) {
    root.innerHTML = '<div class="empty-state"><span aria-hidden="true">◎</span><h2>Košarica je prazna</h2><p>Odaberite dres i vratite se kada pronađete svoj favorit.</p><a class="button button-primary" href="index.html">Pregledaj dresove</a></div>';
    return;
  }
  const total = items.reduce((sum, item) => sum + item.product.price * item.quantity, 0);
  root.innerHTML = `
    <div class="cart-layout">
      <div class="cart-items">
        ${items.map(({ product, quantity }) => `<article class="cart-item" data-cart-item="${product.id}">
          <a href="product.html?id=${product.id}" class="cart-image"><img src="${product.images[0]}" alt="${product.name}"></a>
          <div class="cart-item-info"><p>${product.club}</p><h2><a href="product.html?id=${product.id}">${product.name}</a></h2><span>${product.player} · ${product.version}</span></div>
          <div class="quantity-control" aria-label="Količina"><button type="button" data-quantity="minus" aria-label="Smanji količinu">−</button><output>${quantity}</output><button type="button" data-quantity="plus" aria-label="Povećaj količinu">+</button></div>
          <strong class="cart-line-price">${formatPrice(product.price * quantity)}</strong>
          <button class="remove-button" type="button" data-remove aria-label="Ukloni ${product.name}">×</button>
        </article>`).join('')}
      </div>
      <aside class="cart-summary"><p class="eyebrow">Sažetak</p><div><span>Broj artikala</span><strong>${items.reduce((sum, item) => sum + item.quantity, 0)}</strong></div><div class="cart-total"><span>Ukupno</span><strong>${formatPrice(total)}</strong></div><button class="button button-primary" type="button" data-cart-reserve>Rezerviraj košaricu</button><small>Rezervacija ne predstavlja naplatu.</small></aside>
    </div>`;
}

/** Povezuje kontrole količine i uklanjanja stavki. @returns {void} */
function initCartActions() {
  document.querySelector('[data-cart]').addEventListener('click', (event) => {
    if (event.target.closest('[data-cart-reserve]')) {
      openCartReservationModal(getCart());
      return;
    }
    const item = event.target.closest('[data-cart-item]');
    if (!item) return;
    const id=item.dataset.cartItem;
    const current=getCart().find((entry)=>String(entry.productId)===String(id));
    if (event.target.closest('[data-remove]')) {
      removeFromCart(id); showToast('Proizvod je uklonjen.'); renderCart();
    }
    const action = event.target.closest('[data-quantity]')?.dataset.quantity;
    if (action && current) {
      const product=products.find((entry)=>String(entry.id)===String(id));
      const next = action === 'plus' ? Math.min(current.quantity + 1, product.stock) : current.quantity - 1;
      updateCartQuantity(id, next);
      renderCart();
    }
  });
}

/** Pokreće stranicu košarice. @returns {Promise<void>} */
export async function initCart() {
  await initComponents();
  initReservationModal();
  products = await getProducts();
  renderCart();
  initCartActions();
}

initCart();
