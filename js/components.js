import { initNavbar } from './navbar.js';
import { setCurrentYear } from './utils.js';
import { getCartCount } from '../services/cartService.js';
import { getFavorites } from '../services/favoritesService.js';
import { getSettings } from '../services/settingsService.js';

/**
 * Učitava zajedničku HTML komponentu u označeni utor.
 * @param {string} selector Selektor utora.
 * @param {string} path Putanja komponente.
 * @returns {Promise<void>}
 */
async function loadComponent(selector, path) {
  const slot = document.querySelector(selector);
  if (!slot) return;
  const response = await fetch(path);
  if (!response.ok) throw new Error(`Komponenta nije dostupna: ${path}`);
  slot.outerHTML = await response.text();
}

/**
 * Učitava ponovno iskoristivi HTML template u dokument.
 * @param {string} path Putanja datoteke predloška.
 * @param {string} templateId Očekivani identifikator template elementa.
 * @returns {Promise<void>}
 */
async function loadTemplate(path, templateId) {
  if (document.getElementById(templateId)) return;
  const response = await fetch(path);
  if (!response.ok) throw new Error(`Predložak nije dostupan: ${path}`);
  const holder = document.createElement('div');
  holder.hidden = true;
  holder.innerHTML = await response.text();
  document.body.append(holder);
}

/** Ažurira brojače košarice i favorita u navigaciji. @returns {void} */
export function updateHeaderCounters() {
  document.querySelectorAll('[data-cart-count]').forEach((element) => {
    element.textContent = String(getCartCount());
  });
  document.querySelectorAll('[data-favorites-count]').forEach((element) => {
    element.textContent = String(getFavorites().length);
  });
}

/**
 * Učitava i pokreće sve zajedničke komponente stranice.
 * @returns {Promise<void>}
 */
export async function initComponents() {
  await Promise.all([
    loadComponent('[data-navbar-slot]', 'components/navbar.html'),
    loadComponent('[data-footer-slot]', 'components/footer.html'),
    loadComponent('[data-reservation-slot]', 'components/reservation-modal.html'),
    loadComponent('[data-lightbox-slot]', 'components/lightbox.html'),
    loadTemplate('components/product-card.html', 'product-card-template')
  ]);
  const currentPage = location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.main-nav a').forEach((link) => {
    link.classList.toggle('active', link.getAttribute('href') === currentPage);
  });
  initNavbar();
  const settings = await getSettings();
  const notice = document.querySelector('.notice');
  if (notice) {
    notice.hidden = settings.notificationVisible === false;
    const noticeText = notice.querySelector('span');
    if (noticeText && settings.notification) noticeText.textContent = settings.notification;
  }
  document.querySelectorAll('.brand-copy strong').forEach((element) => {
    if (settings.storeName && settings.storeName !== 'DresHub') element.textContent = settings.storeName;
  });
  if (settings.logo) document.querySelectorAll('.brand-mark').forEach((element) => {
    const image = document.createElement('img');
    image.src = settings.logo;
    image.alt = '';
    element.replaceChildren(image);
  });
  setCurrentYear();
  updateHeaderCounters();
  window.addEventListener('dreshub:cart-changed', updateHeaderCounters);
  window.addEventListener('dreshub:favorites-changed', updateHeaderCounters);
}
