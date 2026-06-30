/**
 * Čita JSON vrijednost iz lokalne pohrane.
 * @param {string} key Ključ vrijednosti.
 * @param {*} [fallback=null] Vrijednost ako zapis ne postoji ili nije ispravan.
 * @returns {*} Spremljena ili zamjenska vrijednost.
 */
export function readStorage(key,fallback=null){try{return JSON.parse(localStorage.getItem(key))??fallback;}catch{return fallback;}}

/**
 * Sprema vrijednost u lokalnu pohranu kao JSON.
 * @param {string} key Ključ vrijednosti.
 * @param {*} value Vrijednost za spremanje.
 * @returns {void}
 */
export function writeStorage(key,value){
  const sanitize=(entry)=>{
    if(typeof entry==='string'&&(/^(data:image\/|blob:)/i.test(entry)))return null;
    if(Array.isArray(entry))return entry.map(sanitize).filter((item)=>item!==null);
    if(entry&&typeof entry==='object')return Object.fromEntries(Object.entries(entry).map(([name,item])=>[name,sanitize(item)]).filter(([,item])=>item!==null));
    return entry;
  };
  try{localStorage.setItem(key,JSON.stringify(sanitize(value)));}
  catch(error){if(error?.name==='QuotaExceededError')throw new Error('Lokalna pohrana je puna. Slike se ne spremaju lokalno; pokušajte ponovno nakon osvježavanja.');throw error;}
}
