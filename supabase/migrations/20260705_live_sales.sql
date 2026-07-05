-- Ručno pokrenuti u Supabase SQL Editoru prije korištenja prodaje uživo.
-- Ne mijenja postojeće retke; sale_items nasljeđuje stvarne ID tipove iz baze.

create extension if not exists pgcrypto;

create table if not exists public.sale_items as
select t.id as transaction_id, p.id as product_id,
       p.name::text as product_name_snapshot,
       p.size::text as size_snapshot,
       p.player::text as player_name_snapshot,
       0::numeric as price, 1::integer as quantity, now() as created_at
from public.transactions t cross join public.products p
where false;

alter table public.sale_items add column if not exists id uuid default gen_random_uuid();
alter table public.sale_items alter column id set not null;
alter table public.sale_items alter column price set not null;
alter table public.sale_items alter column quantity set not null;
alter table public.sale_items alter column quantity set default 1;

do $$ begin
  alter table public.sale_items add constraint sale_items_pkey primary key (id);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.sale_items add constraint sale_items_transaction_id_fkey
    foreign key (transaction_id) references public.transactions(id) on delete cascade;
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.sale_items add constraint sale_items_product_id_fkey
    foreign key (product_id) references public.products(id) on delete restrict;
exception when duplicate_object then null; end $$;
create index if not exists sale_items_transaction_id_idx on public.sale_items(transaction_id);
create index if not exists sale_items_product_id_idx on public.sale_items(product_id);

alter table public.sale_items enable row level security;
drop policy if exists "sale_items_select" on public.sale_items;
create policy "sale_items_select" on public.sale_items for select using (true);

-- Atomski zapisuje jednu transakciju, sve stavke i smanjuje zalihu.
create or replace function public.record_live_sale(p_items jsonb, p_note text default 'Prodano uživo')
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_transaction_id public.transactions.id%type;
  v_item jsonb;
  v_product public.products%rowtype;
  v_total numeric := 0;
  v_count integer := 0;
begin
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Odaberite barem jedan dres.';
  end if;

  -- Zaključavanje redaka sprječava dvostruki klik i paralelnu prodaju istog komada.
  for v_item in select value from jsonb_array_elements(p_items)
  loop
    select * into v_product from public.products
      where id::text = v_item->>'product_id' and product_type = 'jersey'
      for update;
    if not found then raise exception 'Dres % nije pronađen.', v_item->>'product_id'; end if;
    if coalesce(v_product.quantity, 0) < 1 then raise exception 'Dres "%" više nije na stanju.', v_product.name; end if;
    if coalesce((v_item->>'price')::numeric, 0) < 0 then raise exception 'Prodajna cijena nije ispravna.'; end if;
    v_total := v_total + (v_item->>'price')::numeric;
    v_count := v_count + 1;
  end loop;

  insert into public.transactions(type, amount, description, source_type, source_id, created_at)
  values ('Prodaja', v_total, 'Prodaja uživo – ' || v_count || case when v_count=1 then ' dres' else ' dresa' end ||
          case when nullif(trim(p_note),'') is not null then ' · ' || trim(p_note) else '' end,
          'live_sale', null, now()) returning id into v_transaction_id;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    select * into v_product from public.products where id::text = v_item->>'product_id' for update;
    insert into public.sale_items(transaction_id, product_id, product_name_snapshot, size_snapshot,
                                  player_name_snapshot, price, quantity)
    values(v_transaction_id, v_product.id, v_product.name, v_product.size, v_product.player,
           (v_item->>'price')::numeric, 1);
    update public.products
      set quantity = quantity - 1,
          is_archived = case when quantity - 1 = 0 then true else is_archived end,
          updated_at = now()
      where id = v_product.id;
  end loop;

  return jsonb_build_object('transaction_id', v_transaction_id, 'amount', v_total,
                            'count', v_count, 'note', coalesce(nullif(trim(p_note),''),'Prodano uživo'));
end;
$$;

grant execute on function public.record_live_sale(jsonb,text) to anon, authenticated;
