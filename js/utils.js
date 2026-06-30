/** Postavlja tekuću godinu u označene elemente. @returns {void} */
export function setCurrentYear() {
  document.querySelectorAll('[data-current-year]').forEach((element) => {
    element.textContent = new Date().getFullYear();
  });
}

/**
 * Formatira broj kao cijenu u eurima.
 * @param {number} value Novčana vrijednost.
 * @returns {string} Lokalizirana cijena.
 */
export function formatPrice(value) {
  return new Intl.NumberFormat('hr-HR', { style: 'currency', currency: 'EUR' }).format(value);
}

/**
 * Pretvara vrijednost u siguran tekst za umetanje u HTML.
 * @param {*} value Vrijednost za prikaz.
 * @returns {string} Tekst s escapiranim HTML znakovima.
 */
export function escapeHTML(value) {
  return String(value).replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  })[character]);
}

/**
 * Prikazuje kratku obavijest korisniku.
 * @param {string} message Tekst obavijesti.
 * @returns {void}
 */
export function showToast(message) {
  let toast = document.querySelector('[data-toast]');
  if (!toast) {
    toast = document.createElement('div');
    toast.className = 'toast';
    toast.dataset.toast = '';
    toast.setAttribute('role', 'status');
    document.body.append(toast);
  }
  toast.textContent = message;
  toast.classList.add('show');
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => toast.classList.remove('show'), 2400);
}

/** @type {number|undefined} */
showToast.timer = undefined;
