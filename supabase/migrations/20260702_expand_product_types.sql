-- DRESHUB: ručna migracija za tenisice i dukseve.
-- OVA DATOTEKA SE NE IZVRŠAVA AUTOMATSKI.

alter table public.products
  add column if not exists product_type text not null default 'jersey',
  add column if not exists brand text,
  add column if not exists color text,
  add column if not exists item_condition text,
  add column if not exists gender_category text,
  add column if not exists has_original_box boolean;

do $$ begin
  alter table public.products add constraint products_product_type_check
    check (product_type in ('jersey', 'sneaker', 'hoodie'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.products add constraint products_item_condition_check
    check (item_condition is null or item_condition in ('new', 'worn', 'very_good', 'damaged'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.products add constraint products_gender_category_check
    check (gender_category is null or gender_category in ('men', 'women', 'unisex'));
exception when duplicate_object then null; end $$;

update public.products set product_type = 'jersey' where product_type is null;

create index if not exists products_type_active_idx
  on public.products (product_type, is_archived, created_at desc);

create index if not exists products_brand_idx
  on public.products (brand);

comment on column public.products.product_type is 'jersey, sneaker ili hoodie';
comment on column public.products.item_condition is 'new, worn, very_good ili damaged';
comment on column public.products.gender_category is 'men, women ili unisex';
