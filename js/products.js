import { getProductMainImage, getProducts } from '../services/productService.js';
import { isFavorite } from '../services/favoritesService.js';
import { escapeHTML, formatPrice } from './utils.js';

/** @returns {Promise<Array<Object>>} Popis proizvoda iz servisnog sloja. */
export async function loadProducts() {
  return getProducts();
}

/**
 * Vraća korisnički status zalihe proizvoda.
 * @param {Object} product Proizvod.
 * @returns {{label:string, className:string}} Tekst i CSS klasa statusa.
 */
export function getStockStatus(product) {
  if (product.stock < 1) return { label: 'Rasprodano', className: 'sold-out' };
  if (product.stock === 1) return { label: 'Još samo 1 komad', className: 'last-one' };
  return { label: 'Na stanju', className: 'in-stock' };
}

/**
 * Izrađuje HTML kartice proizvoda.
 * @param {Object} product Proizvod za prikaz.
 * @returns {string} HTML kartice.
 */
export function createProductCard(product) {
  const status = getStockStatus(product);
  const isJersey=product.productType==='jersey',conditionLabels={new:'Novo',worn:'Nošeno',very_good:'Vrlo dobro',damaged:'Oštećeno'};
  const favorite = isFavorite(product.id);
  const template = document.getElementById('product-card-template');
  if (!template) throw new Error('Predložak kartice proizvoda nije učitan.');
  const values = {
    id: product.id,
    badgeClass: `badge-${String(product.badge||product.productType).toLowerCase().replaceAll(' ', '-').replace(/[^a-z0-9-]/g, '')}`,
    badge: escapeHTML(product.badge||(product.productType==='sneaker'?'TENISICE':'DUKS')),
    favoriteClass: favorite ? 'active' : '',
    favoriteLabel: favorite ? 'Ukloni iz omiljenih' : 'Dodaj u omiljene',
    favoritePressed: favorite,
    favoriteIcon: favorite ? '♥' : '♡',
    image: escapeHTML(getProductMainImage(product)),
    name: escapeHTML(product.name),
    club: escapeHTML(isJersey?product.club:product.brand),
    player: escapeHTML(isJersey?product.player:product.color),
    version: escapeHTML(isJersey?product.version:conditionLabels[product.condition]||product.condition),
    metaLabel1:isJersey?'Igrač':'Boja',metaLabel2:isJersey?'Verzija':'Stanje',metaLabel3:isJersey?'Veličine':'Veličina',
    sizes: escapeHTML(product.sizes.join(', ')),
    stockClass: status.className,
    stockLabel: status.label,
    oldPrice: product.oldPrice ? `<del>${formatPrice(product.oldPrice)}</del>` : '',
    price: formatPrice(product.price),
    disabled: product.stock < 1 ? 'disabled' : ''
  };
  return Object.entries(values).reduce((html, [key, value]) => html.replaceAll(`{{${key}}}`, String(value)), template.innerHTML);
}

/**
 * Prikazuje proizvode unutar zadane mreže.
 * @param {Array<Object>} products Proizvodi za prikaz.
 * @param {string} [selector='[data-product-grid]'] Selektor mreže.
 * @returns {void}
 */
export function renderProducts(products, selector = '[data-product-grid]') {
  const grid = document.querySelector(selector);
  if (!grid) return;
  grid.innerHTML = products.length
    ? products.map(createProductCard).join('')
    : '<div class="empty-state grid-empty"><span aria-hidden="true">⌕</span><h2>Nema rezultata</h2><p>Pokušajte promijeniti pretragu ili odabrane filtre.</p></div>';
  const count = document.querySelector('[data-product-count]');
  if (count) count.textContent = `${products.length} ${products.length === 1 ? 'proizvod' : 'proizvoda'}`;
}
