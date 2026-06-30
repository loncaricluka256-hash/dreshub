import { initComponents } from './components.js';

/** Pokreće zajedničke komponente jednostavne sadržajne stranice. @returns {Promise<void>} */
async function init() {
  await initComponents();
}

init();
