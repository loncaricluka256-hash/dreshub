-- DRESHUB – modul Prodavači
-- Ručno pokrenuti u Supabase SQL Editoru prije korištenja odjeljka Admin → Prodavači.
-- Migracija ne briše postojeće podatke i oslanja se na postojeću tablicu public.products.

create table if not exists public.sellers (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  phone text,
  contact text,
  note text,
  started_at date not null default current_date,
  status text not null default 'active' check (status in ('active','inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.seller_listings (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references public.sellers(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  quantity integer not null default 0 check (quantity >= 0),
  status text not null default 'active' check (status in ('active','paused','removed')),
  note text,
  added_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (seller_id, product_id)
);

create table if not exists public.seller_physical_items (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references public.sellers(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  quantity integer not null default 0 check (quantity >= 0),
  handed_off_at timestamptz not null default now(),
  returned_at timestamptz,
  note text,
  return_note text,
  updated_at timestamptz not null default now(),
  unique (seller_id, product_id)
);

create table if not exists public.seller_activity (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references public.sellers(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  activity_type text not null,
  old_quantity integer,
  new_quantity integer,
  description text,
  created_at timestamptz not null default now()
);

create index if not exists sellers_status_idx on public.sellers(status);
create index if not exists seller_listings_seller_idx on public.seller_listings(seller_id);
create index if not exists seller_listings_product_idx on public.seller_listings(product_id);
create index if not exists seller_listings_status_idx on public.seller_listings(status);
create index if not exists seller_physical_seller_idx on public.seller_physical_items(seller_id);
create index if not exists seller_physical_product_idx on public.seller_physical_items(product_id);
create index if not exists seller_activity_seller_idx on public.seller_activity(seller_id, created_at desc);
create index if not exists seller_activity_product_idx on public.seller_activity(product_id);
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists sellers_set_updated_at on public.sellers;
create trigger sellers_set_updated_at
before update on public.sellers
for each row execute function public.set_updated_at();

drop trigger if exists seller_listings_set_updated_at on public.seller_listings;
create trigger seller_listings_set_updated_at
before update on public.seller_listings
for each row execute function public.set_updated_at();

drop trigger if exists seller_physical_set_updated_at on public.seller_physical_items;
create trigger seller_physical_set_updated_at
before update on public.seller_physical_items
for each row execute function public.set_updated_at();

alter table public.sellers enable row level security;
alter table public.seller_listings enable row level security;
alter table public.seller_physical_items enable row level security;
alter table public.seller_activity enable row level security;

drop policy if exists "sellers_all" on public.sellers;
drop policy if exists "seller_listings_all" on public.seller_listings;
drop policy if exists "seller_physical_all" on public.seller_physical_items;
drop policy if exists "seller_activity_all" on public.seller_activity;

create policy "sellers_all" on public.sellers for all using (true) with check (true);
create policy "seller_listings_all" on public.seller_listings for all using (true) with check (true);
create policy "seller_physical_all" on public.seller_physical_items for all using (true) with check (true);
create policy "seller_activity_all" on public.seller_activity for all using (true) with check (true);
