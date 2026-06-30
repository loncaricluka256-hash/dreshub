import { initComponents } from './components.js';
import { getProductById, getProductMainImage, getProducts } from '../services/productService.js';
import { addToCart } from '../services/cartService.js';
import { isFavorite, toggleFavorite } from '../services/favoritesService.js';
import { addRecentlyViewed } from './recentlyViewed.js';
import { createProductCard, getStockStatus } from './products.js';
import { initReservationModal, openReservationModal } from './reservationModal.js';
import { initLightbox, openLightbox } from './lightbox.js';
import { formatPrice, showToast } from './utils.js';

/**
 * Prikazuje detalje proizvoda i povezuje korisničke akcije.
 * @param {Object} product Odabrani proizvod.
 * @param {Array<Object>} products Svi proizvodi.
 * @returns {void}
 */
function renderProduct(product, products) {
  const root = document.querySelector('[data-product-detail]');
  const gallery=product.images?.length?product.images:[getProductMainImage(product)];
  const status = getStockStatus(product);
  const favorite = isFavorite(product.id);
  root.innerHTML = `
    <section class="product-gallery" aria-label="Galerija proizvoda">
      <button class="main-image" type="button" data-gallery-main aria-label="Povećaj sliku">
        <img src="${getProductMainImage(product)}" alt="${product.name}" data-main-product-image>
        <span>⌕ Povećaj</span>
      </button>
      <div class="thumbnail-list">
        ${gallery.map((image, index) => `<button class="thumbnail ${index === 0 ? 'active' : ''}" type="button" data-thumbnail="${index}"><img src="${image}" alt="${product.name}, slika ${index + 1}"></button>`).join('')}
      </div>
    </section>
    <section class="product-info">
      <p class="eyebrow">${product.type === 'club' ? 'Klupski dres' : 'Reprezentacija'}</p>
      <h1>${product.name}</h1>
      <p class="product-lead">${product.description}</p>
      <dl class="detail-list">
        <div><dt>Klub / reprezentacija</dt><dd>${product.club}</dd></div>
        <div><dt>Igrač</dt><dd>${product.player}</dd></div>
        <div><dt>Verzija</dt><dd>${product.version}</dd></div>
        <div><dt>Dostupne veličine</dt><dd>${product.sizes.join(', ')}</dd></div>
      </dl>
      <div class="stock-status ${status.className}"><span></span>${status.label}</div>
      <div class="detail-price">${product.oldPrice ? `<del>${formatPrice(product.oldPrice)}</del>` : ''}<strong>${formatPrice(product.price)}</strong></div>
      <div class="product-actions">
        <button class="button button-primary" type="button" data-reserve-detail ${product.stock < 1 ? 'disabled' : ''}>Rezerviraj</button>
        <button class="button button-ghost" type="button" data-cart-detail ${product.stock < 1 ? 'disabled' : ''}>Dodaj u košaricu</button>
        <button class="icon-button ${favorite ? 'active' : ''}" type="button" data-favorite-detail aria-label="Omiljeni" aria-pressed="${favorite}">${favorite ? '♥' : '♡'}</button>
      </div>
      <p class="purchase-note">Sigurna rezervacija bez plaćanja unaprijed. Javit ćemo vam se radi potvrde.</p>
    </section>`;

  const similar = products.filter((item) => item.id !== product.id && (item.club === product.club || item.type === product.type)).slice(0, 4);
  document.querySelector('[data-similar-grid]').innerHTML = similar.map(createProductCard).join('');

  root.querySelectorAll('[data-thumbnail]').forEach((button) => button.addEventListener('click', () => {
    root.querySelector('[data-main-product-image]').src = gallery[Number(button.dataset.thumbnail)];
    root.querySelector('.thumbnail.active')?.classList.remove('active');
    button.classList.add('active');
  }));
  root.querySelector('[data-gallery-main]').addEventListener('click', () => {
    const active = root.querySelector('.thumbnail.active');
    openLightbox(gallery, Number(active?.dataset.thumbnail || 0));
  });
  root.querySelector('[data-reserve-detail]').addEventListener('click', () => openReservationModal(product.id));
  root.querySelector('[data-cart-detail]').addEventListener('click', () => {
    addToCart(product.id);
    showToast('Proizvod je dodan u košaricu.');
  });
  root.querySelector('[data-favorite-detail]').addEventListener('click', (event) => {
    const active = toggleFavorite(product.id);
    event.currentTarget.classList.toggle('active', active);
    event.currentTarget.textContent = active ? '♥' : '♡';
    event.currentTarget.setAttribute('aria-pressed', String(active));
    showToast(active ? 'Dodano u omiljene.' : 'Uklonjeno iz omiljenih.');
  });

  const similarGrid = document.querySelector('[data-similar-grid]');
  similarGrid.addEventListener('click', async (event) => {
    const reserve = event.target.closest('[data-reserve]');
    const favoriteButton = event.target.closest('[data-favorite]');
    if (reserve) await openReservationModal(Number(reserve.dataset.reserve));
    if (favoriteButton) {
      const active = toggleFavorite(Number(favoriteButton.dataset.favorite));
      favoriteButton.classList.toggle('active', active);
      favoriteButton.querySelector('span').textContent = active ? '♥' : '♡';
      showToast(active ? 'Dodano u omiljene.' : 'Uklonjeno iz omiljenih.');
    }
  });
}

/** Pokreće stranicu detalja proizvoda. @returns {Promise<void>} */
async function init() {
  await initComponents();
  initReservationModal();
  initLightbox();
  const id = new URLSearchParams(location.search).get('id');
  const [product, products] = await Promise.all([getProductById(id), getProducts()]);
  if (!product) {
    document.querySelector('[data-product-detail]').innerHTML = '<div class="empty-state"><h1>Proizvod nije pronađen</h1><a class="button button-primary" href="index.html">Povratak na dresove</a></div>';
    return;
  }
  document.title = `${product.name} | DresHub`;
  addRecentlyViewed(product.id);
  renderProduct(product, products);
}

init();
