-- DRESHUB – Prodavači, nova jednostavna verzija
-- Ručno pokrenuti u Supabase SQL Editoru prije nove implementacije modula.
--
-- Ova migracija namjerno uklanja staru kompleksnu seller strukturu ako postoji
-- i kreira samo tablice koje su potrebne za dogovoreni minimalni modul.

create extension if not exists pgcrypto;

drop table if exists public.seller_activity cascade;
drop table if exists public.seller_physical_items cascade;
drop table if exists public.seller_listings cascade;
drop table if exists public.sellers cascade;

create table public.sellers (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.seller_listings (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references public.sellers(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  quantity integer not null check (quantity > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (seller_id, product_id)
);

create table public.seller_physical_items (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references public.sellers(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  quantity integer not null check (quantity > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (seller_id, product_id)
);

create index seller_listings_seller_id_idx on public.seller_listings(seller_id);
create index seller_listings_product_id_idx on public.seller_listings(product_id);
create index seller_physical_items_seller_id_idx on public.seller_physical_items(seller_id);
create index seller_physical_items_product_id_idx on public.seller_physical_items(product_id);

create or replace function public.set_sellers_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger sellers_set_updated_at
before update on public.sellers
for each row execute function public.set_sellers_updated_at();

create trigger seller_listings_set_updated_at
before update on public.seller_listings
for each row execute function public.set_sellers_updated_at();

create trigger seller_physical_items_set_updated_at
before update on public.seller_physical_items
for each row execute function public.set_sellers_updated_at();

alter table public.sellers enable row level security;
alter table public.seller_listings enable row level security;
alter table public.seller_physical_items enable row level security;

create policy "sellers_select" on public.sellers for select using (true);
create policy "sellers_insert" on public.sellers for insert with check (true);
create policy "sellers_update" on public.sellers for update using (true) with check (true);
create policy "sellers_delete" on public.sellers for delete using (true);

create policy "seller_listings_select" on public.seller_listings for select using (true);
create policy "seller_listings_insert" on public.seller_listings for insert with check (true);
create policy "seller_listings_update" on public.seller_listings for update using (true) with check (true);
create policy "seller_listings_delete" on public.seller_listings for delete using (true);

create policy "seller_physical_items_select" on public.seller_physical_items for select using (true);
create policy "seller_physical_items_insert" on public.seller_physical_items for insert with check (true);
create policy "seller_physical_items_update" on public.seller_physical_items for update using (true) with check (true);
create policy "seller_physical_items_delete" on public.seller_physical_items for delete using (true);
