-- Ručno pokrenuti u Supabase SQL Editoru prije korištenja multi-selecta bilješki.
-- Tipovi note_id i product_id preuzimaju se iz postojećih tablica.

create table if not exists public.note_products as
select n.id as note_id, p.id as product_id, now() as created_at
from public.notes n cross join public.products p
where false;

do $$ begin
  alter table public.note_products add constraint note_products_pkey primary key (note_id, product_id);
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.note_products add constraint note_products_note_id_fkey
    foreign key (note_id) references public.notes(id) on delete cascade;
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.note_products add constraint note_products_product_id_fkey
    foreign key (product_id) references public.products(id) on delete cascade;
exception when duplicate_object then null; end $$;

create index if not exists note_products_product_id_idx on public.note_products(product_id);
alter table public.note_products alter column created_at set default now();

-- Prenosi postojeću pojedinačnu vezu bez uklanjanja legacy podataka.
insert into public.note_products (note_id, product_id)
select n.id, p.id
from public.notes n
join public.products p on p.id::text = n.linked_id::text
where n.linked_type = 'product'
on conflict do nothing;

alter table public.note_products enable row level security;
drop policy if exists "note_products_select" on public.note_products;
drop policy if exists "note_products_insert" on public.note_products;
drop policy if exists "note_products_delete" on public.note_products;
create policy "note_products_select" on public.note_products for select using (true);
create policy "note_products_insert" on public.note_products for insert with check (true);
create policy "note_products_delete" on public.note_products for delete using (true);
