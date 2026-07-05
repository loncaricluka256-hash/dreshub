-- Ručno pokrenuti u Supabase SQL Editoru.
-- Skripta je idempotentna: naziv + veličina sprječavaju ponovni unos istog oglasa.

insert into public.products
  (name, club, player, category, version, size, buy_price, sell_price, sale_price,
   is_on_sale, quantity, description, status, main_image_url, is_new, is_popular,
   is_archived, product_type)
select
  'Borussia Dortmund Home Retro Dres', 'Borussia Dortmund', '-', 'club', 'Fan Version',
  'L', 15, 30, null, false, 1,
  'Klasični Borussia Dortmund retro domaći dres u prepoznatljivoj žuto-crnoj kombinaciji. Odličan izbor za navijače koji vole legendarni izgled kluba. Ugodan i kvalitetan materijal idealan je za svakodnevno nošenje ili kolekciju.',
  'active', null, true, false, false, 'jersey'
where not exists (select 1 from public.products where name = 'Borussia Dortmund Home Retro Dres' and size = 'L');

insert into public.products
  (name, club, player, category, version, size, buy_price, sell_price, sale_price,
   is_on_sale, quantity, description, status, main_image_url, is_new, is_popular,
   is_archived, product_type)
select
  'Argentina Black Special Edition - Lionel Messi #10', 'Argentina', 'Lionel Messi',
  'national', 'Fan Version', 'M', 10, 30, null, false, 1,
  'Posebno izdanje reprezentacije Argentine u elegantnoj crnoj izvedbi s plavim detaljima. Dres dolazi s tiskom Lionela Messija i brojem 10 te predstavlja odličan izbor za sve ljubitelje aktualnih svjetskih prvaka.',
  'active', null, true, false, false, 'jersey'
where not exists (select 1 from public.products where name = 'Argentina Black Special Edition - Lionel Messi #10' and size = 'M');

insert into public.products
  (name, club, player, category, version, size, buy_price, sell_price, sale_price,
   is_on_sale, quantity, description, status, main_image_url, is_new, is_popular,
   is_archived, product_type)
select
  'Portugal Away 2025', 'Portugal', '-', 'national', 'Fan Version', 'L', 10, 25,
  null, false, 1,
  'Gostujući dres reprezentacije Portugala modernog dizajna s upečatljivim uzorkom. Lagan i prozračan materijal pruža maksimalnu udobnost tijekom nošenja, bilo za navijanje ili rekreaciju.',
  'active', null, true, false, false, 'jersey'
where not exists (select 1 from public.products where name = 'Portugal Away 2025' and size = 'L');

insert into public.products
  (name, club, player, category, version, size, buy_price, sell_price, sale_price,
   is_on_sale, quantity, description, status, main_image_url, is_new, is_popular,
   is_archived, product_type)
select
  'Španjolska Home Retro Dres', 'Španjolska', 'Gavi', 'national', 'Fan Version', 'M',
  10, 30, null, false, 1,
  'Retro domaći dres reprezentacije Španjolske inspiriran legendarnim izdanjima iz prošlih godina. Minimalistički dizajn i kvalitetna izrada čine ga odličnim izborom za svakog navijača.',
  'active', null, true, false, false, 'jersey'
where not exists (select 1 from public.products where name = 'Španjolska Home Retro Dres' and size = 'M');

insert into public.products
  (name, club, player, category, version, size, buy_price, sell_price, sale_price,
   is_on_sale, quantity, description, status, main_image_url, is_new, is_popular,
   is_archived, product_type)
select
  'Argentina Retro 1994 - Diego Maradona #10', 'Argentina', 'Diego Maradona',
  'national', 'Retro', 'L', 15, 30, null, false, 1,
  'Legendarni retro dres Argentine iz 1994. godine s imenom Diega Maradone i brojem 10. Savršen izbor za kolekcionare i ljubitelje jednog od najvećih nogometaša svih vremena.',
  'active', null, true, false, false, 'jersey'
where not exists (select 1 from public.products where name = 'Argentina Retro 1994 - Diego Maradona #10' and size = 'L');

insert into public.products
  (name, club, player, category, version, size, buy_price, sell_price, sale_price,
   is_on_sale, quantity, description, status, main_image_url, is_new, is_popular,
   is_archived, product_type)
select
  'Argentina Retro 1994 - Diego Maradona #10', 'Argentina', 'Diego Maradona',
  'national', 'Retro', 'M', 15, 30, null, false, 1,
  'Legendarni retro dres Argentine iz 1994. godine s imenom Diega Maradone i brojem 10. Savršen izbor za kolekcionare i ljubitelje jednog od najvećih nogometaša svih vremena.',
  'active', null, true, false, false, 'jersey'
where not exists (select 1 from public.products where name = 'Argentina Retro 1994 - Diego Maradona #10' and size = 'M');

insert into public.products
  (name, club, player, category, version, size, buy_price, sell_price, sale_price,
   is_on_sale, quantity, description, status, main_image_url, is_new, is_popular,
   is_archived, product_type)
select
  'Inter Milan Away 2025/26 - Petar Sučić #8', 'Inter Milan', 'Petar Sučić',
  'club', 'Fan Version', 'M', 10, 25, null, false, 1,
  'Gostujući dres Inter Milana za sezonu 2025/26 u elegantnoj bijeloj izvedbi s modernim geometrijskim uzorkom. Dres dolazi s imenom hrvatskog reprezentativca Petra Sučića i brojem 8 te je izrađen od laganog i prozračnog materijala za maksimalnu udobnost.',
  'active', null, true, false, false, 'jersey'
where not exists (
  select 1 from public.products
  where name = 'Inter Milan Away 2025/26 - Petar Sučić #8' and size = 'M'
);

insert into public.products
  (name, club, player, category, version, size, buy_price, sell_price, sale_price,
   is_on_sale, quantity, description, status, main_image_url, is_new, is_popular,
   is_archived, product_type)
select
  'AC Milan Away 2025/26 - Luka Modrić #14', 'AC Milan', 'Luka Modrić',
  'club', 'Fan Version', 'L', 10, 25, null, false, 1,
  'Gostujući dres AC Milana za sezonu 2025/26 s tiskom Luke Modrića i brojem 14. Moderan dizajn, vrhunska udobnost i kvalitetna izrada čine ga odličnim izborom za navijače Milana i hrvatske nogometne legende.',
  'active', null, true, false, false, 'jersey'
where not exists (
  select 1 from public.products
  where name = 'AC Milan Away 2025/26 - Luka Modrić #14' and size = 'L'
);

insert into public.products
  (name, club, player, category, version, size, buy_price, sell_price, sale_price,
   is_on_sale, quantity, description, status, main_image_url, is_new, is_popular,
   is_archived, product_type)
select
  'Real Madrid Home Retro', 'Real Madrid', '-',
  'club', 'Fan Version', 'M', 10, 25, null, false, 1,
  'Klasični domaći dres Real Madrida inspiriran legendarnim izdanjima kluba. Prepoznatljiva bijela boja i bezvremenski dizajn čine ga savršenim izborom za sve navijače Kraljevskog kluba.',
  'active', null, true, false, false, 'jersey'
where not exists (
  select 1 from public.products
  where name = 'Real Madrid Home Retro' and size = 'M'
);

insert into public.products
  (name, club, player, category, version, size, buy_price, sell_price, sale_price,
   is_on_sale, quantity, description, status, main_image_url, is_new, is_popular,
   is_archived, product_type)
select
  'Barcelona Gostujući Komplet 2025/26', 'Barcelona', '-',
  'club', 'Fan Version', 'M', 15, 40, null, false, 1,
  'Komplet uključuje gostujući dres i odgovarajuće kratke hlače Barcelone za sezonu 2025/26. Atraktivna tamnoplava kombinacija s modernim detaljima pruža vrhunsku udobnost i idealna je za trening, rekreaciju ili navijanje.',
  'active', null, true, false, false, 'jersey'
where not exists (
  select 1 from public.products
  where name = 'Barcelona Gostujući Komplet 2025/26' and size = 'M'
);
