import { getProductCardImage, getProductMainImage, getProducts } from '../services/productService.js';
import { isFavorite } from '../services/favoritesService.js';
import { escapeHTML, formatPrice } from './utils.js';

const PAGE_SIZE = 32;
const renderState = new Map();
let paginationBound = false;

/** @returns {Promise<Array<Object>>} Popis proizvoda iz servisnog sloja. */
export async function loadProducts() {
  return getProducts();
}

/** Prikazuje lagani skeleton dok se katalog dohvaća. @param {string} [selector='[data-product-grid]'] Selektor mreže. @returns {void} */
export function renderProductSkeletons(selector = '[data-product-grid]') {
  const grid = document.querySelector(selector);
  if (!grid) return;
  grid.innerHTML = Array.from({ length: 8 }, () => '<article class="product-card product-card-skeleton" aria-hidden="true"><div class="card-media"></div><div class="card-content"><span></span><strong></strong><p></p><p></p></div></article>').join('');
}

function productSignature(products) {
  return products.map((product) => String(product.id)).join('|');
}

function scrollToProductList(selector) {
  const grid = document.querySelector(selector);
  const target = document.querySelector('[data-product-count]')?.closest('.section-heading') || grid;
  if (!target) return;
  const headerOffset = document.querySelector('.site-header')?.offsetHeight || 80;
  const top = Math.max(0, window.scrollY + target.getBoundingClientRect().top - headerOffset - 16);
  window.scrollTo({ top, behavior: 'smooth' });
}

function ensurePaginationHandler() {
  if (paginationBound) return;
  paginationBound = true;
  document.addEventListener('click', (event) => {
    const button = event.target.closest('[data-product-page]');
    if (!button) return;
    const selector = button.dataset.productGrid || '[data-product-grid]';
    const state = renderState.get(selector);
    const page = Number(button.dataset.productPage);
    if (!state || button.disabled || !Number.isFinite(page)) return;
    renderProducts(state.products, selector, { page });
    scrollToProductList(selector);
  });
}

function getPaginationPages(current, total) {
  if (total <= 7) return Array.from({ length: total }, (_, index) => index + 1);
  const pages = new Set([1, total, current, current - 1, current + 1]);
  if (current <= 3) [2, 3, 4].forEach((page) => pages.add(page));
  if (current >= total - 2) [total - 1, total - 2, total - 3].forEach((page) => pages.add(page));
  return [...pages].filter((page) => page >= 1 && page <= total).sort((a, b) => a - b);
}

function renderPagination(grid, selector, total, page, pageSize) {
  const existing = grid.nextElementSibling?.matches?.('[data-pagination-wrap]') ? grid.nextElementSibling : null;
  if (!total) {
    existing?.remove();
    return;
  }
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const current = Math.min(Math.max(1, page), totalPages);
  const from = (current - 1) * pageSize + 1;
  const to = Math.min(current * pageSize, total);
  const buttons = getPaginationPages(current, totalPages).map((number, index, list) => {
    const ellipsis = index && number - list[index - 1] > 1 ? '<span class="pagination-ellipsis">…</span>' : '';
    return `${ellipsis}<button type="button" data-product-page="${number}" data-product-grid="${escapeHTML(selector)}" class="${number === current ? 'active' : ''}" aria-current="${number === current ? 'page' : 'false'}">${number}</button>`;
  }).join('');
  const html = `<nav class="product-pagination" data-pagination-wrap aria-label="Paginacija proizvoda"><p>Prikazano ${from}–${to} od ${total} proizvoda</p><div><button type="button" data-product-page="${current - 1}" data-product-grid="${escapeHTML(selector)}" ${current === 1 ? 'disabled' : ''}>‹ Prethodna</button>${buttons}<button type="button" data-product-page="${current + 1}" data-product-grid="${escapeHTML(selector)}" ${current === totalPages ? 'disabled' : ''}>Sljedeća ›</button></div></nav>`;
  if (existing) existing.outerHTML = html;
  else grid.insertAdjacentHTML('afterend', html);
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
  const isJersey = product.productType === 'jersey';
  const conditionLabels = { new: 'Novo', worn: 'Nošeno', very_good: 'Vrlo dobro', damaged: 'Oštećeno' };
  const favorite = isFavorite(product.id);
  const template = document.getElementById('product-card-template');
  if (!template) throw new Error('Predložak kartice proizvoda nije učitan.');
  const values = {
    id: product.id,
    badgeClass: `badge-${String(product.badge || product.productType).toLowerCase().replaceAll(' ', '-').replace(/[^a-z0-9-]/g, '')}`,
    badge: escapeHTML(product.badge || (product.productType === 'sneaker' ? 'TENISICE' : 'DUKS')),
    favoriteClass: favorite ? 'active' : '',
    favoriteLabel: favorite ? 'Ukloni iz omiljenih' : 'Dodaj u omiljene',
    favoritePressed: favorite,
    favoriteIcon: favorite ? '♥' : '♡',
    image: escapeHTML(getProductCardImage(product)),
    originalImage: escapeHTML(getProductMainImage(product)),
    name: escapeHTML(product.name),
    club: escapeHTML(isJersey ? product.club : product.brand),
    player: escapeHTML(isJersey ? product.player : product.color),
    version: escapeHTML(isJersey ? product.version : conditionLabels[product.condition] || product.condition),
    metaLabel1: isJersey ? 'Igrač' : 'Boja',
    metaLabel2: isJersey ? 'Verzija' : 'Stanje',
    metaLabel3: isJersey ? 'Veličine' : 'Veličina',
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
 * @param {{page?:number,pageSize?:number}} [options] Opcije paginacije.
 * @returns {void}
 */
export function renderProducts(products, selector = '[data-product-grid]', options = {}) {
  const grid = document.querySelector(selector);
  if (!grid) return;
  const paginate = options.paginate ?? selector === '[data-product-grid]';
  if (paginate) ensurePaginationHandler();
  const signature = productSignature(products);
  const previous = renderState.get(selector);
  const pageSize = options.pageSize || previous?.pageSize || PAGE_SIZE;
  const sameResults = previous?.signature === signature;
  const totalPages = Math.max(1, Math.ceil(products.length / pageSize));
  const requestedPage = paginate && sameResults && options.page ? Number(options.page) : 1;
  const currentPage = Math.min(Math.max(1, requestedPage), totalPages);
  const start = (currentPage - 1) * pageSize;
  const visibleProducts = paginate ? products.slice(start, start + pageSize) : products;
  renderState.set(selector, { products, signature, page: currentPage, pageSize });
  grid.innerHTML = visibleProducts.length
    ? visibleProducts.map(createProductCard).join('')
    : '<div class="empty-state grid-empty"><span aria-hidden="true">⌕</span><h2>Nema rezultata</h2><p>Pokušajte promijeniti pretragu ili odabrane filtre.</p></div>';
  if (paginate) renderPagination(grid, selector, products.length, currentPage, pageSize);
  else if (grid.nextElementSibling?.matches?.('[data-pagination-wrap]')) grid.nextElementSibling.remove();
  const count = selector === '[data-product-grid]' ? document.querySelector('[data-product-count]') : null;
  if (count) count.textContent = `${products.length} ${products.length === 1 ? 'proizvod' : 'proizvoda'}`;
}
