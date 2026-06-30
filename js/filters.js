/**
 * Filtrira i sortira proizvode prema stanju kontrola kataloga.
 * @param {Array<Object>} products Izvorni proizvodi.
 * @param {HTMLFormElement} form Obrazac filtera.
 * @returns {Array<Object>} Filtrirani i sortirani proizvodi.
 */
export function applyCatalogControls(products, form) {
  const values = new FormData(form);
  const query = String(values.get('query') || '').trim().toLocaleLowerCase('hr');
  const type = String(values.get('type') || 'all');
  const size = String(values.get('size') || 'all');
  const version = String(values.get('version') || 'all');
  const price = String(values.get('price') || 'all');
  const availability = String(values.get('availability') || 'all');
  const sort = String(values.get('sort') || 'newest');

  const filtered = products.filter((product) => {
    const haystack = `${product.name} ${product.club} ${product.player} ${product.version}`.toLocaleLowerCase('hr');
    const priceMatches = price === 'all'
      || (price === 'under40' && product.price < 40)
      || (price === '40to45' && product.price >= 40 && product.price <= 45)
      || (price === 'over45' && product.price > 45);
    return (!query || haystack.includes(query))
      && (type === 'all' || product.type === type)
      && (size === 'all' || product.sizes.includes(size))
      && (version === 'all' || product.version === version)
      && priceMatches
      && (availability === 'all' || (availability === 'available' ? product.stock > 0 : product.stock < 1));
  });

  return [...filtered].sort((a, b) => {
    if (sort === 'price-asc') return a.price - b.price;
    if (sort === 'price-desc') return b.price - a.price;
    if (sort === 'name-asc') return a.name.localeCompare(b.name, 'hr');
    if (sort === 'name-desc') return b.name.localeCompare(a.name, 'hr');
    return new Date(b.createdAt) - new Date(a.createdAt);
  });
}

/**
 * Povezuje kontrole kataloga s funkcijom ponovnog prikaza.
 * @param {Array<Object>} products Proizvodi.
 * @param {(products:Array<Object>) => void} render Funkcija prikaza.
 * @returns {void}
 */
export function initFilters(products, render) {
  const form = document.querySelector('[data-catalog-form]');
  if (!form) return;
  const update = () => render(applyCatalogControls(products, form));
  form.addEventListener('input', update);
  form.addEventListener('change', update);
  form.addEventListener('reset', () => window.setTimeout(update));
}
