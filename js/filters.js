import { createProductSearchIndex, getSearchSuggestions, searchProductIndex } from './search.js';

/** Filtrira i sortira proizvode prema stanju kontrola kataloga. */
export function applyCatalogControls(products, form, searchIndex = createProductSearchIndex(products)) {
  const values = new FormData(form);
  const query = String(values.get('query') || '').trim();
  const type = String(values.get('type') || 'all');
  const size = String(values.get('size') || 'all');
  const version = String(values.get('version') || 'all');
  const price = String(values.get('price') || 'all');
  const availability = String(values.get('availability') || 'all');
  const sort = String(values.get('sort') || 'newest');
  const ranked = searchProductIndex(searchIndex, query);
  const rank = new Map(ranked.map((product, index) => [String(product.id), index]));
  const filtered = ranked.filter((product) => {
    const priceMatches = price === 'all' || (price === 'under40' && product.price < 40) || (price === '40to45' && product.price >= 40 && product.price <= 45) || (price === 'over45' && product.price > 45);
    return (type === 'all' || product.type === type)
      && (size === 'all' || (product.sizes || []).includes(size))
      && (version === 'all' || product.version === version)
      && priceMatches
      && (availability === 'all' || (availability === 'available' ? product.stock > 0 : product.stock < 1));
  });
  return [...filtered].sort((a, b) => {
    if (sort === 'price-asc') return a.price - b.price;
    if (sort === 'price-desc') return b.price - a.price;
    if (sort === 'name-asc') return a.name.localeCompare(b.name, 'hr');
    if (sort === 'name-desc') return b.name.localeCompare(a.name, 'hr');
    if (query) return rank.get(String(a.id)) - rank.get(String(b.id));
    return new Date(b.createdAt) - new Date(a.createdAt);
  });
}

/** Povezuje pametnu pretragu, prijedloge i responzivni panel filtera. */
export function initFilters(products, render) {
  const form = document.querySelector('[data-catalog-form]');
  if (!form) return { update() {}, rebuild() {} };
  const input = form.elements.query;
  const suggestions = form.querySelector('[data-search-suggestions]');
  const advanced = form.querySelector('[data-advanced-filters]');
  const primaryFilters = form.querySelector('.primary-filters');
  const filterPanel = form.querySelector('.filter-panel');
  const filterBar = form.querySelector('.filter-bar');
  const primaryHome = primaryFilters?.parentElement;
  const primaryNextSibling = primaryFilters?.nextElementSibling;
  const desktopToggle = form.querySelector('[data-filter-toggle]');
  const mobileToggle = form.querySelector('[data-mobile-filter-toggle]');
  const closeButton = form.querySelector('[data-filter-close]');
  let searchIndex = createProductSearchIndex(products);
  let frame = 0;

  const closeSuggestions = () => { if (suggestions) { suggestions.hidden = true; suggestions.innerHTML = ''; } };
  const renderSuggestions = () => {
    if (!suggestions) return;
    const items = getSearchSuggestions(searchIndex, input.value);
    suggestions.innerHTML = items.map((item) => `<button type="button" role="option" data-suggestion="${escapeAttribute(item.label)}"><span>${escapeHTML(item.label)}</span><small>${item.type}</small></button>`).join('');
    suggestions.hidden = !items.length;
  };
  const update = () => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => { render(applyCatalogControls(products, form, searchIndex)); renderSuggestions(); });
  };
  const setPanel = (open) => {
    advanced?.classList.toggle('open', open);
    advanced?.setAttribute('aria-hidden', String(!open));
    desktopToggle?.setAttribute('aria-expanded', String(open));
    mobileToggle?.setAttribute('aria-expanded', String(open));
    document.body.classList.toggle('filters-open', open && matchMedia('(max-width: 640px)').matches);
  };
  const arrangeFilters = () => {
    const mobile = matchMedia('(max-width: 640px)').matches;
    if (mobile && primaryFilters && filterPanel && primaryFilters.parentElement !== filterPanel) filterPanel.insertBefore(primaryFilters, filterBar);
    if (!mobile && primaryFilters && primaryHome && primaryFilters.parentElement !== primaryHome) primaryHome.insertBefore(primaryFilters, primaryNextSibling);
  };

  arrangeFilters();
  form.addEventListener('input', update);
  form.addEventListener('change', update);
  form.addEventListener('reset', () => window.setTimeout(() => { setPanel(false); closeSuggestions(); update(); }));
  desktopToggle?.addEventListener('click', () => setPanel(!advanced.classList.contains('open')));
  mobileToggle?.addEventListener('click', () => setPanel(true));
  closeButton?.addEventListener('click', () => setPanel(false));
  advanced?.addEventListener('click', (event) => { if (event.target === advanced) setPanel(false); });
  suggestions?.addEventListener('click', (event) => { const button = event.target.closest('[data-suggestion]'); if (!button) return; input.value = button.dataset.suggestion; closeSuggestions(); update(); });
  document.addEventListener('click', (event) => { if (!event.target.closest('.search-field')) closeSuggestions(); });
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape') { closeSuggestions(); setPanel(false); } });
  window.addEventListener('resize', () => { arrangeFilters(); if (!matchMedia('(max-width: 640px)').matches) document.body.classList.remove('filters-open'); });
  update();

  return {
    update,
    rebuild() { searchIndex = createProductSearchIndex(products); update(); }
  };
}

function escapeHTML(value) { const node = document.createElement('span'); node.textContent = String(value); return node.innerHTML; }
function escapeAttribute(value) { return escapeHTML(value).replace(/"/g, '&quot;'); }
