# DresHub

DresHub je modularan korisnički webshop za nogometne dresove izrađen u čistom HTML-u, CSS-u i JavaScriptu. Korisnički frontend Faze 1 je konačna osnova aplikacije; u kasnijim fazama mijenja se izvor podataka i dodaje administracija, bez prepisivanja korisničkog sučelja.

## Pokretanje

Projekt koristi ES module, `fetch` i ponovno iskoristive HTML komponente, zato ga treba otvoriti preko lokalnog web-poslužitelja. Primjer: u mapi `DresHub` pokrenuti `npx serve .` ili ekvivalentan lokalni poslužitelj.

## Arhitektura

- Korijenski HTML dokumenti predstavljaju katalog, detalje proizvoda, košaricu, favorite, kontakt, pretragu i admin placeholder.
- `components/` sadrži zajednički navbar, footer, karticu, rezervacijski modal i lightbox.
- `css/` dijeli stilove po komponentama i stranicama; `variables.css` je jedini izvor dizajnerskih vrijednosti.
- `js/` sadrži prikaz, upravljanje stranicama i male UI module.
- `services/` je podatkovna granica. Trenutačno koristi JSON i Local Storage; kasnije se unutrašnjost servisa može zamijeniti Supabase pozivima.
- `data/` sadrži demo proizvode i javne postavke trgovine.
- `assets/` sadrži lokalne slike, ikone i buduće varijante logotipa.

## Implementirano u Fazi 1

- live pretraga, šest skupina filtera i pet načina sortiranja
- responzivni katalog i detaljne kartice proizvoda
- galerija, lightbox i priprema za 1–5 slika
- simulirana rezervacija u Local Storageu
- košarica s količinama, brisanjem i ukupnom cijenom
- favoriti i nedavno pregledani proizvodi
- zajedničke komponente, kontakt stranica i responzivna navigacija

Sve javne JavaScript funkcije dokumentiraju se JSDoc komentarima. Svaki modul ima jednu jasno definiranu odgovornost, a podatkovna logika ostaje odvojena od prikaza.

## Admin aplikacija — Faza 2

`admin.html` je cjelovita responzivna poslovna aplikacija s prijavom, dashboardom i odvojenim radnim prikazima za proizvode, rezervacije, narudžbe, financije, bilješke, povijest promjena, povijest transakcija i postavke.

Početna lokalna admin lozinka je `admin`. Može se promijeniti u postavkama nakon potvrde sigurnosnog pitanja. Admin podaci koriste servisni sloj i Local Storage, pa će kasniji prijelaz na Supabase zahtijevati zamjenu implementacije servisa, ne korisničkog sučelja.

Važni automatizirani tokovi:

- rezervacija smanjuje dostupnu zalihu
- otkazivanje aktivne rezervacije vraća količinu
- završena rezervacija stvara prodajnu transakciju
- zaključena narudžba povećava zalihu i stvara trošak
- promjene proizvoda, cijena i količina ulaze u audit povijest
- otvorene narudžbe ne utječu na zalihu ni financije

## Priprema za Supabase — Faza 3

Servisni sloj sada automatski bira podatkovni adapter. Dok su `SUPABASE_URL` i `SUPABASE_ANON_KEY` placeholderi, aplikacija radi potpuno jednako kao prije preko demo JSON-a i Local Storagea. Nakon unosa stvarne konfiguracije servisi koriste Supabase tablice i Storage bucket `product-images`.

Pripremljene su granice za tablice `products`, `product_images`, `reservations`, `purchase_orders`, `purchase_order_items`, `transactions`, `change_history`, `notes` i `settings`. SQL struktura namjerno nije uključena u ovoj fazi.

Novi domenski servisi:

- `supabaseClient.js` — konfiguracija, odgođena inicijalizacija i provjera dostupnosti
- `imageService.js` — Storage upload, glavna slika, brisanje i redoslijed
- `purchaseOrderService.js` — otvorene i zaključene narudžbe sa stavkama
- `transactionService.js` — financijske transakcije i sažeci
- `noteService.js` — bilješke i njihovi statusi
- `changeHistoryService.js` — audit povijest odvojena od financija

UI ne uvozi Supabase klijent i ne odlučuje o izvoru podataka. Tu odluku donose isključivo servisi.

## Otpornost admin prijave

Admin prijava registrira se prije učitavanja dashboard podataka. Greška u proizvodima, bilješkama, transakcijama ili drugom servisu zato ne ruši cijelu admin aplikaciju. Kada je Supabase konfiguriran, prijava koristi isključivo postavku `admin_password` iz tablice `settings`; Local Storage fallback za poslovne i admin podatke tada je isključen.

Bilješke koriste stupac `is_pinned`, a transakcije `created_at`. Svaki neuspjeli Supabase upit ispisuje strukturiranu dijagnostiku sa servisom, tablicom, operacijom, kodom i prepoznatim/problematičnim stupcem, nakon čega servis koristi Local Storage fallback.
