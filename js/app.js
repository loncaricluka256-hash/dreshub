import { initComponents } from './components.js';
import { createProductCard, loadProducts, renderProducts } from './products.js';
import { initFilters } from './filters.js';
import { isFavorite, toggleFavorite } from '../services/favoritesService.js';
import { addToCart } from '../services/cartService.js';
import { getRecentlyViewed } from './recentlyViewed.js';
import { initReservationModal, openReservationModal } from './reservationModal.js';
import { initLightbox } from './lightbox.js';
import { showToast } from './utils.js';
import { subscribeToProductChanges } from '../services/productService.js';

/**
 * Povezuje akcije kartica proizvoda koristeći delegaciju događaja.
 * @param {Array<Object>} products Svi proizvodi.
 * @returns {void}
 */
function initProductActions() {
  document.addEventListener('click', async (event) => {
    const favoriteButton = event.target.closest('[data-favorite]');
    const reserveButton = event.target.closest('[data-reserve]');
    const cartButton = event.target.closest('[data-add-cart]');
    if (favoriteButton) {
      event.preventDefault();
      const active = toggleFavorite(favoriteButton.dataset.favorite);
      favoriteButton.classList.toggle('active', active);
      favoriteButton.setAttribute('aria-pressed', String(active));
      favoriteButton.setAttribute('aria-label', active ? 'Ukloni iz omiljenih' : 'Dodaj u omiljene');
      favoriteButton.querySelector('span').textContent = active ? '♥' : '♡';
      showToast(active ? 'Dodano u omiljene.' : 'Uklonjeno iz omiljenih.');
    }
    if (reserveButton) await openReservationModal(reserveButton.dataset.reserve);
    if (cartButton) {
      addToCart(cartButton.dataset.addCart);
      showToast('Proizvod je dodan u košaricu.');
    }
  });
  window.addEventListener('dreshub:favorites-changed', () => {
    document.querySelectorAll('[data-favorite]').forEach((button) => {
      const active=isFavorite(button.dataset.favorite);
      button.classList.toggle('active', active);
      button.querySelector('span').textContent = active ? '♥' : '♡';
    });
  });
}

/**
 * Pokreće katalog početne stranice i stranice pretrage.
 * @returns {Promise<void>}
 */
async function init() {
  try {
    await initComponents();
    initReservationModal();
    initLightbox();
    const products = await loadProducts();
    renderProducts(products);
    const catalogFilters = initFilters(products, renderProducts);
    initProductActions();
    window.addEventListener('dreshub:reservation-created',async(event)=>{const fresh=(await loadProducts()).find((product)=>String(product.id)===String(event.detail?.productId));if(!fresh)return;document.querySelectorAll('[data-product-id]').forEach((card)=>{if(String(card.dataset.productId)===String(fresh.id))card.outerHTML=createProductCard(fresh);});});
    await subscribeToProductChanges((freshProducts)=>{products.splice(0,products.length,...freshProducts);catalogFilters.rebuild();});

    const recentIds = getRecentlyViewed();
    const recentSection = document.querySelector('[data-recent-section]');
    const recentProducts=recentIds.map((id)=>products.find((product)=>String(product.id)===String(id))).filter(Boolean);
    if (recentSection && recentProducts.length) {
      recentSection.hidden = false;
      renderProducts(recentProducts, '[data-recent-grid]');
    }
  } catch (error) {
    const grid = document.querySelector('[data-product-grid]');
    if (grid) grid.innerHTML = `<div class="empty-state"><h2>Nešto nije u redu</h2><p>${error.message}</p></div>`;
  }
}

init();
