import { initComponents } from './components.js';
import { getProducts } from '../services/productService.js';
import { getFavorites, toggleFavorite } from '../services/favoritesService.js';
import { renderProducts } from './products.js';
import { initReservationModal, openReservationModal } from './reservationModal.js';
import { showToast } from './utils.js';

let products = [];

/** Prikazuje spremljene omiljene proizvode. @returns {void} */
function renderFavorites() {
  const ids = getFavorites();
  renderProducts(products.filter((product) => ids.includes(product.id)));
}

/** Pokreće stranicu omiljenih proizvoda. @returns {Promise<void>} */
export async function initFavorites() {
  await initComponents();
  initReservationModal();
  products = await getProducts();
  renderFavorites();
  document.querySelector('[data-product-grid]').addEventListener('click', async (event) => {
    const favorite = event.target.closest('[data-favorite]');
    const reserve = event.target.closest('[data-reserve]');
    if (favorite) {
      toggleFavorite(favorite.dataset.favorite);
      showToast('Uklonjeno iz omiljenih.');
      renderFavorites();
    }
    if (reserve) await openReservationModal(reserve.dataset.reserve);
  });
}

initFavorites();
