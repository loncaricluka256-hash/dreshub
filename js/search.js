const LEAGUES = Object.freeze([
  { name: 'Bundesliga', aliases: ['bundesliga', 'bundes liga'], clubs: ['Bayern München', 'Borussia Dortmund', 'Bayer Leverkusen', 'RB Leipzig', 'Eintracht Frankfurt', 'Stuttgart', 'Wolfsburg', 'Borussia Mönchengladbach', 'Freiburg', 'Hoffenheim', 'Werder Bremen', 'Mainz'] },
  { name: 'La Liga', aliases: ['la liga', 'laliga', 'lalliga', 'primera liga', 'primiera liga'], clubs: ['Real Madrid', 'Barcelona', 'Atletico Madrid', 'Sevilla', 'Valencia', 'Villarreal', 'Real Sociedad', 'Athletic Bilbao', 'Real Betis', 'Girona', 'Celta Vigo'] },
  { name: 'Premier liga', aliases: ['premier', 'premier liga', 'premier league'], clubs: ['Manchester United', 'Manchester City', 'Liverpool', 'Arsenal', 'Chelsea', 'Tottenham', 'Newcastle United', 'Aston Villa', 'West Ham', 'Brighton', 'Everton'] },
  { name: 'Serie A', aliases: ['serie a', 'seria a'], clubs: ['Juventus', 'Inter', 'Milan', 'Napoli', 'Roma', 'Lazio', 'Atalanta', 'Fiorentina', 'Bologna', 'Torino'] },
  { name: 'Ligue 1', aliases: ['ligue 1', 'liga 1'], clubs: ['PSG', 'Marseille', 'Monaco', 'Lyon', 'Lille', 'Nice', 'Lens', 'Rennes'] },
  { name: 'Primeira Liga', aliases: ['primeira liga', 'portugalska liga'], clubs: ['Benfica', 'Porto', 'Sporting', 'Braga'] },
  { name: 'Eredivisie', aliases: ['eredivisie', 'eredivizija'], clubs: ['Ajax', 'PSV', 'Feyenoord', 'AZ Alkmaar', 'Twente'] },
  { name: 'Belgian Pro League', aliases: ['belgian pro league', 'belgijska liga'], clubs: ['Club Brugge', 'Anderlecht', 'Genk', 'Gent', 'Antwerp', 'Union SG'] },
  { name: 'Saudijska Arabijska prva liga', aliases: ['saudijska liga', 'saudijska arabija', 'saudi pro league'], clubs: ['Al Nassr', 'Al Hilal', 'Al Ittihad', 'Al Ahli', 'Al Ettifaq'] },
  { name: 'MLS', aliases: ['mls', 'major league soccer'], clubs: ['Inter Miami', 'LA Galaxy', 'LAFC', 'New York City FC', 'Atlanta United', 'Seattle Sounders'] },
  { name: 'HNL', aliases: ['hnl', 'hrvatska liga'], clubs: ['Dinamo Zagreb', 'Hajduk Split', 'Rijeka', 'Osijek', 'Lokomotiva', 'Varaždin', 'Slaven Belupo', 'Istra 1961', 'Gorica', 'Šibenik'] }
]);

/** Normalizira tekst za pretragu neovisnu o dijakritici i interpunkciji. */
export function normalizeSearchText(value) {
  return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('hr').replace(/[^a-z0-9]+/g, ' ').trim();
}

const NORMALIZED_LEAGUES = LEAGUES.map((league) => ({
  ...league,
  normalizedName: normalizeSearchText(league.name),
  normalizedAliases: league.aliases.map(normalizeSearchText),
  normalizedClubs: new Set(league.clubs.map(normalizeSearchText))
}));

function editDistance(a, b) {
  if (Math.abs(a.length - b.length) > 2) return 3;
  const row = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    let previous = row[0]; row[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const old = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, previous + (a[i - 1] === b[j - 1] ? 0 : 1));
      previous = old;
    }
  }
  return row[b.length];
}

function findLeague(query) {
  if (!query) return null;
  return NORMALIZED_LEAGUES.find((league) => league.normalizedAliases.some((alias) => alias === query || (query.length >= 5 && editDistance(alias, query) <= 2))) || null;
}

/**
 * Jednom priprema normalizirana polja svih proizvoda.
 * @param {Array<Object>} products Proizvodi iz postojećeg izvora podataka.
 * @returns {Array<Object>} Indeks spreman za brzo filtriranje.
 */
export function createProductSearchIndex(products) {
  return products.map((product, order) => {
    const name = normalizeSearchText(product.name);
    const club = normalizeSearchText(product.club);
    const player = normalizeSearchText(product.player);
    const fields = [product.name, product.club, product.player, product.description, product.version, product.type, product.badge, ...(product.labels || [])];
    return { product, order, name, club, player, haystack: normalizeSearchText(fields.filter(Boolean).join(' ')) };
  });
}

/**
 * Pretražuje indeks i rangira točne rezultate ispred djelomičnih.
 * @param {Array<Object>} index Indeks iz createProductSearchIndex.
 * @param {string} query Korisnički upit.
 * @returns {Array<Object>} Rangirani proizvodi.
 */
export function searchProductIndex(index, query) {
  const term = normalizeSearchText(query);
  if (!term) return index.map((entry) => entry.product);
  const league = findLeague(term);
  const tokens = term.split(' ').filter(Boolean);
  return index.map((entry) => {
    const inLeague = league?.normalizedClubs.has(entry.club);
    if (league && !inLeague) return null;
    if (!league && !tokens.every((token) => entry.haystack.includes(token))) return null;
    let score = inLeague ? 500 : 0;
    if (entry.name === term || entry.club === term) score += 1000;
    else if (entry.name.startsWith(term) || entry.club.startsWith(term)) score += 700;
    else if (entry.player === term) score += 650;
    else if (entry.haystack.includes(term)) score += 400;
    score += tokens.reduce((sum, token) => sum + (entry.name.startsWith(token) ? 40 : 0) + (entry.club.startsWith(token) ? 35 : 0) + (entry.player.startsWith(token) ? 30 : 0), 0);
    return { product: entry.product, score, order: entry.order };
  }).filter(Boolean).sort((a, b) => b.score - a.score || a.order - b.order).map((entry) => entry.product);
}

/** Vraća prijedloge liga, klubova i proizvoda iz stvarnog kataloga. */
export function getSearchSuggestions(index, query, limit = 8) {
  const term = normalizeSearchText(query);
  if (!term) return [];
  const candidates = [];
  NORMALIZED_LEAGUES.forEach((league) => {
    if (league.normalizedName.includes(term) || league.normalizedAliases.some((alias) => alias.includes(term))) candidates.push({ label: league.name, type: 'Liga', score: league.normalizedName.startsWith(term) ? 100 : 60 });
  });
  const seen = new Set(candidates.map((item) => normalizeSearchText(item.label)));
  index.forEach(({ product, club, player, name }) => {
    const values = [
      { label: product.club, type: 'Klub', value: club },
      { label: product.player && product.club ? `${product.club} ${product.player}` : product.player, type: 'Igrač', value: normalizeSearchText(`${product.club || ''} ${product.player || ''}`) },
      { label: product.name, type: 'Proizvod', value: name }
    ];
    values.forEach((item) => {
      const key = normalizeSearchText(item.label);
      if (!item.label || seen.has(key) || !item.value.includes(term)) return;
      seen.add(key); candidates.push({ label: item.label, type: item.type, score: item.value.startsWith(term) ? 90 : 50 });
    });
  });
  return candidates.sort((a, b) => b.score - a.score || a.label.localeCompare(b.label, 'hr')).slice(0, limit);
}

/** Kompatibilna pomoćna funkcija za izravnu pretragu liste proizvoda. */
export function searchProducts(products, query) {
  return searchProductIndex(createProductSearchIndex(products), query);
}
