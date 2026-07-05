import { initComponents } from './components.js';
import { getProductById, getProductMainImage, getProducts, getProductsByType, subscribeToProductChanges } from '../services/productService.js';
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
  const mainIndex=Math.max(0,gallery.indexOf(getProductMainImage(product))),isJersey=product.productType==='jersey';
  const status = getStockStatus(product);
  const favorite = isFavorite(product.id);
  root.innerHTML = `
    <section class="product-gallery" aria-label="Galerija proizvoda">
      <button class="main-image" type="button" data-gallery-main aria-label="Povećaj sliku">
        <img src="${getProductMainImage(product)}" alt="${product.name}" data-main-product-image>
        <span>⌕ Povećaj</span>
      </button>
      <div class="thumbnail-list">
        ${gallery.map((image, index) => `<button class="thumbnail ${index === mainIndex ? 'active' : ''}" type="button" data-thumbnail="${index}"><img src="${image}" alt="${product.name}, slika ${index + 1}"></button>`).join('')}
      </div>
    </section>
    <section class="product-info">
      <p class="eyebrow">${isJersey?(product.type === 'club' ? 'Klupski dres' : 'Reprezentacija'):product.productType==='sneaker'?'Tenisice':'Duks'}</p>
      ${product.archived?'<p class="archived-product-label">Arhivirano / prodano</p>':''}
      <h1>${product.name}</h1>
      <p class="product-lead">${product.description}</p>
      <dl class="detail-list" ${isJersey?'':'hidden'}>
        <div><dt>Klub / reprezentacija</dt><dd>${product.club}</dd></div>
        <div><dt>Igrač</dt><dd>${product.player}</dd></div>
        <div><dt>Verzija</dt><dd>${product.version}</dd></div>
        <div><dt>Dostupne veličine</dt><dd>${product.sizes.join(', ')}</dd></div>
      </dl>
      ${isJersey?'':`<dl class="detail-list"><div><dt>Brend</dt><dd>${product.brand}</dd></div><div><dt>Stanje</dt><dd>${({new:'Novo',worn:'Nošeno',very_good:'Vrlo dobro',damaged:'Oštećeno'})[product.condition]||product.condition}</dd></div><div><dt>Boja</dt><dd>${product.color}</dd></div><div><dt>Veličina</dt><dd>${product.sizes.join(', ')}</dd></div><div><dt>Kategorija</dt><dd>${({men:'Muški',women:'Ženski',unisex:'Unisex'})[product.genderCategory]||product.genderCategory}</dd></div>${product.productType==='sneaker'?`<div><dt>Originalna kutija</dt><dd>${product.hasOriginalBox?'Da':'Ne'}</dd></div>`:''}</dl>`}
      <div class="stock-status ${status.className}"><span></span>${status.label}</div>
      <div class="detail-price">${product.oldPrice ? `<del>${formatPrice(product.oldPrice)}</del>` : ''}<strong>${formatPrice(product.price)}</strong></div>
      <div class="product-actions">
        <button class="button button-primary" type="button" data-reserve-detail ${product.stock < 1||product.archived ? 'disabled' : ''}>Rezerviraj</button>
        <button class="button button-ghost" type="button" data-cart-detail ${product.stock < 1||product.archived ? 'disabled' : ''}>Dodaj u košaricu</button>
        <button class="icon-button ${favorite ? 'active' : ''}" type="button" data-favorite-detail aria-label="Omiljeni" aria-pressed="${favorite}">${favorite ? '♥' : '♡'}</button>
      </div>
      <p class="purchase-note">Sigurna rezervacija bez plaćanja unaprijed. Javit ćemo vam se radi potvrde.</p>
    </section>`;

  const similar = products.filter((item) => item.id !== product.id && (isJersey?(item.club === product.club || item.type === product.type):item.productType===product.productType)).slice(0, 4);
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
  window.addEventListener('dreshub:reservation-created',async(event)=>{if(String(event.detail?.productId)!==String(product.id))return;const fresh=await getProductById(String(product.id));if(!fresh)return;const nextStatus=getStockStatus(fresh),statusElement=root.querySelector('.stock-status');statusElement.className=`stock-status ${nextStatus.className}`;statusElement.innerHTML=`<span></span>${nextStatus.label}`;root.querySelector('[data-reserve-detail]').disabled=fresh.stock<1;root.querySelector('[data-cart-detail]').disabled=fresh.stock<1;},{once:true});

  const similarGrid = document.querySelector('[data-similar-grid]');
  similarGrid.addEventListener('click', async (event) => {
    const reserve = event.target.closest('[data-reserve]');
    const favoriteButton = event.target.closest('[data-favorite]');
    if (reserve) await openReservationModal(reserve.dataset.reserve);
    if (favoriteButton) {
      const active=toggleFavorite(favoriteButton.dataset.favorite);
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
  const product=await getProductById(id),products=product?.productType==='jersey'?await getProducts():await getProductsByType(product?.productType||[]);
  if (!product) {
    document.querySelector('[data-product-detail]').innerHTML = '<div class="empty-state"><h1>Proizvod nije pronađen</h1><a class="button button-primary" href="index.html">Povratak na dresove</a></div>';
    return;
  }
  document.title = `${product.name} | DresHub`;
  addRecentlyViewed(product.id);
  renderProduct(product, products);
  await subscribeToProductChanges((freshProducts)=>{const fresh=freshProducts.find((item)=>String(item.id)===String(product.id));if(!fresh)return;const status=getStockStatus(fresh),root=document.querySelector('[data-product-detail]'),statusElement=root.querySelector('.stock-status');if(statusElement){statusElement.className=`stock-status ${status.className}`;statusElement.innerHTML=`<span></span>${status.label}`;}root.querySelector('[data-reserve-detail]').disabled=fresh.stock<1;root.querySelector('[data-cart-detail]').disabled=fresh.stock<1;},product.productType==='jersey'?'jersey':[product.productType]);
}

init();
