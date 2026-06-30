/**
 * Povezuje mobilni izbornik s navigacijom i zaključava pozadinu dok je otvoren.
 * @returns {void}
 */
export function initNavbar() {
  const button = document.querySelector('.menu-toggle');
  const nav = document.querySelector('.main-nav');
  if (!button || !nav) return;
  button.addEventListener('click', () => {
    const open = nav.classList.toggle('open');
    button.setAttribute('aria-expanded', String(open));
    document.body.classList.toggle('menu-open', open);
  });
  nav.addEventListener('click', () => {
    nav.classList.remove('open');
    button.setAttribute('aria-expanded', 'false');
    document.body.classList.remove('menu-open');
  });
}
