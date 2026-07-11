-- DRESHUB – uređivanje i grupne prodaje
-- Pokrenuti nakon 20260705_universal_product_sales.sql.
-- Ne stvara paralelne tablice; koristi postojeće transactions i sale_items.

drop function if exists public.record_live_sale(jsonb,text,text,text);
drop function if exists public.record_live_sale(jsonb,text,text,text,numeric);
drop function if exists public.update_live_sale(text,jsonb,text,text,text,timestamptz);

create or replace function public.record_live_sale(
  p_items jsonb,
  p_note text default 'Prodano',
  p_payment_method text default 'gotovina',
  p_sales_channel text default 'uživo',
  p_sold_at timestamptz default now()
) returns jsonb
language plpgsql security definer set search_path=public
as $$
declare
  v_transaction_id public.transactions.id%type;
  v_item jsonb;
  v_product public.products%rowtype;
  v_total numeric := 0;
  v_quantity integer := 0;
  v_count integer := 0;
begin
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Odaberite barem jedan proizvod.';
  end if;

  for v_item in select value from jsonb_array_elements(p_items) loop
    v_quantity := greatest(1, coalesce((v_item->>'quantity')::integer, 1));
    select * into v_product from public.products where id::text = v_item->>'product_id' for update;
    if not found then raise exception 'Proizvod % nije pronađen.', v_item->>'product_id'; end if;
    if coalesce(v_product.quantity, 0) < v_quantity then
      raise exception 'Nema dovoljno komada za "%". Dostupno: %, traženo: %.', v_product.name, coalesce(v_product.quantity, 0), v_quantity;
    end if;
    if coalesce((v_item->>'price')::numeric, 0) < 0 then raise exception 'Prodajna cijena nije ispravna.'; end if;
    v_total := v_total + ((v_item->>'price')::numeric * v_quantity);
    v_count := v_count + v_quantity;
  end loop;

  insert into public.transactions(type, amount, description, source_type, source_id, created_at, payment_method, sales_channel, is_voided)
  values(
    'Prodaja',
    v_total,
    'Prodaja – ' || jsonb_array_length(p_items) || ' različita proizvoda – ' || v_count || ' komada' ||
      case when nullif(trim(p_note), '') is not null then ' · ' || trim(p_note) else '' end,
    'live_sale',
    null,
    coalesce(p_sold_at, now()),
    p_payment_method,
    p_sales_channel,
    false
  ) returning id into v_transaction_id;

  for v_item in select value from jsonb_array_elements(p_items) loop
    v_quantity := greatest(1, coalesce((v_item->>'quantity')::integer, 1));
    select * into v_product from public.products where id::text = v_item->>'product_id' for update;
    insert into public.sale_items(transaction_id, product_id, product_name_snapshot, size_snapshot, player_name_snapshot, price, quantity, cost_price_snapshot)
    values(v_transaction_id, v_product.id, v_product.name, v_product.size, v_product.player, (v_item->>'price')::numeric, v_quantity, coalesce(v_product.buy_price, 0));
    update public.products
      set quantity = quantity - v_quantity,
          is_archived = case when quantity - v_quantity = 0 then true else is_archived end,
          updated_at = now()
      where id = v_product.id;
  end loop;

  return jsonb_build_object('transaction_id', v_transaction_id, 'amount', v_total, 'count', v_count);
end;
$$;

create or replace function public.update_live_sale(
  p_transaction_id text,
  p_items jsonb,
  p_note text default 'Prodano',
  p_payment_method text default 'gotovina',
  p_sales_channel text default 'uživo',
  p_sold_at timestamptz default now()
) returns jsonb
language plpgsql security definer set search_path=public
as $$
declare
  v_transaction public.transactions%rowtype;
  v_old_item public.sale_items%rowtype;
  v_item jsonb;
  v_product public.products%rowtype;
  v_total numeric := 0;
  v_quantity integer := 0;
  v_count integer := 0;
begin
  select * into v_transaction from public.transactions where id::text = p_transaction_id for update;
  if not found or v_transaction.type <> 'Prodaja' then raise exception 'Prodajna transakcija nije pronađena.'; end if;
  if coalesce(v_transaction.is_voided, false) then raise exception 'Poništena prodaja se ne može uređivati.'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then raise exception 'Odaberite barem jedan proizvod.'; end if;

  -- Privremeno vraća staru prodaju na zalihu da se nova količina provjeri prema stvarnom stanju.
  for v_old_item in select * from public.sale_items where transaction_id = v_transaction.id loop
    update public.products
      set quantity = quantity + v_old_item.quantity,
          is_archived = false,
          updated_at = now()
      where id = v_old_item.product_id;
  end loop;

  for v_item in select value from jsonb_array_elements(p_items) loop
    v_quantity := greatest(1, coalesce((v_item->>'quantity')::integer, 1));
    select * into v_product from public.products where id::text = v_item->>'product_id' for update;
    if not found then raise exception 'Proizvod % nije pronađen.', v_item->>'product_id'; end if;
    if coalesce(v_product.quantity, 0) < v_quantity then
      raise exception 'Nema dovoljno komada za "%". Dostupno: %, traženo: %.', v_product.name, coalesce(v_product.quantity, 0), v_quantity;
    end if;
    if coalesce((v_item->>'price')::numeric, 0) < 0 then raise exception 'Prodajna cijena nije ispravna.'; end if;
    v_total := v_total + ((v_item->>'price')::numeric * v_quantity);
    v_count := v_count + v_quantity;
  end loop;

  delete from public.sale_items where transaction_id = v_transaction.id;

  update public.transactions
    set amount = v_total,
        description = 'Prodaja – ' || jsonb_array_length(p_items) || ' različita proizvoda – ' || v_count || ' komada' ||
          case when nullif(trim(p_note), '') is not null then ' · ' || trim(p_note) else '' end,
        payment_method = p_payment_method,
        sales_channel = p_sales_channel,
        created_at = coalesce(p_sold_at, created_at)
    where id = v_transaction.id;

  for v_item in select value from jsonb_array_elements(p_items) loop
    v_quantity := greatest(1, coalesce((v_item->>'quantity')::integer, 1));
    select * into v_product from public.products where id::text = v_item->>'product_id' for update;
    insert into public.sale_items(transaction_id, product_id, product_name_snapshot, size_snapshot, player_name_snapshot, price, quantity, cost_price_snapshot)
    values(v_transaction.id, v_product.id, v_product.name, v_product.size, v_product.player, (v_item->>'price')::numeric, v_quantity, coalesce(v_product.buy_price, 0));
    update public.products
      set quantity = quantity - v_quantity,
          is_archived = case when quantity - v_quantity = 0 then true else is_archived end,
          updated_at = now()
      where id = v_product.id;
  end loop;

  return jsonb_build_object('transaction_id', v_transaction.id, 'amount', v_total, 'count', v_count);
end;
$$;

grant execute on function public.record_live_sale(jsonb,text,text,text,timestamptz) to anon, authenticated;
grant execute on function public.update_live_sale(text,jsonb,text,text,text,timestamptz) to anon, authenticated;
