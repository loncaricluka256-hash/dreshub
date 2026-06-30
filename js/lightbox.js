let images = [];
let activeIndex = 0;

/** Prikazuje trenutačnu sliku lightbox galerije. @returns {void} */
function renderActiveImage() {
  const dialog = document.querySelector('[data-component="lightbox"]');
  if (!dialog || !images.length) return;
  dialog.querySelector('[data-lightbox-image]').src = images[activeIndex];
  dialog.querySelector('[data-lightbox-counter]').textContent = `${activeIndex + 1} / ${images.length}`;
}

/**
 * Otvara lightbox s galerijom.
 * @param {Array<string>} gallery Slike galerije.
 * @param {number} [startIndex=0] Početni indeks.
 * @returns {void}
 */
export function openLightbox(gallery, startIndex = 0) {
  const dialog = document.querySelector('[data-component="lightbox"]');
  if (!dialog || !gallery.length) return;
  images = gallery;
  activeIndex = startIndex;
  renderActiveImage();
  dialog.showModal();
}

/** Povezuje kontrole lightboxa. @returns {void} */
export function initLightbox() {
  const dialog = document.querySelector('[data-component="lightbox"]');
  if (!dialog) return;
  dialog.addEventListener('click', (event) => {
    const action = event.target.closest('[data-lightbox-action]')?.dataset.lightboxAction;
    if (event.target === dialog || action === 'close') return dialog.close();
    if (action === 'next') activeIndex = (activeIndex + 1) % images.length;
    if (action === 'previous') activeIndex = (activeIndex - 1 + images.length) % images.length;
    if (action) renderActiveImage();
  });
  dialog.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowRight') { activeIndex = (activeIndex + 1) % images.length; renderActiveImage(); }
    if (event.key === 'ArrowLeft') { activeIndex = (activeIndex - 1 + images.length) % images.length; renderActiveImage(); }
  });
}
