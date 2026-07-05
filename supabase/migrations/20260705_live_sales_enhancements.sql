-- Pokrenuti NAKON 20260705_live_sales.sql.
alter table public.transactions add column if not exists payment_method text;
alter table public.transactions add column if not exists sales_channel text;
alter table public.transactions add column if not exists is_voided boolean not null default false;
alter table public.transactions add column if not exists voided_at timestamptz;
alter table public.sale_items add column if not exists cost_price_snapshot numeric not null default 0;

-- Uklanja prvu verziju funkcije kako Supabase RPC ne bi imao dvosmislen overload.
drop function if exists public.record_live_sale(jsonb,text);

create or replace function public.record_live_sale(
  p_items jsonb,
  p_note text default 'Prodano uživo',
  p_payment_method text default 'gotovina',
  p_sales_channel text default 'uživo'
) returns jsonb
language plpgsql security definer set search_path=public
as $$
declare
  v_transaction_id public.transactions.id%type;
  v_item jsonb;
  v_product public.products%rowtype;
  v_total numeric := 0;
  v_count integer := 0;
begin
  if jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 then raise exception 'Odaberite barem jedan dres.'; end if;
  for v_item in select value from jsonb_array_elements(p_items) loop
    select * into v_product from public.products where id::text=v_item->>'product_id' and product_type='jersey' for update;
    if not found then raise exception 'Dres % nije pronađen.',v_item->>'product_id'; end if;
    if coalesce(v_product.quantity,0)<1 then raise exception 'Dres "%" više nije na stanju.',v_product.name; end if;
    if coalesce((v_item->>'price')::numeric,0)<0 then raise exception 'Prodajna cijena nije ispravna.'; end if;
    v_total:=v_total+(v_item->>'price')::numeric; v_count:=v_count+1;
  end loop;
  insert into public.transactions(type,amount,description,source_type,source_id,created_at,payment_method,sales_channel,is_voided)
  values('Prodaja',v_total,'Prodaja – '||v_count||case when v_count=1 then ' dres' else ' dresa' end||case when nullif(trim(p_note),'') is not null then ' · '||trim(p_note) else '' end,'live_sale',null,now(),p_payment_method,p_sales_channel,false)
  returning id into v_transaction_id;
  for v_item in select value from jsonb_array_elements(p_items) loop
    select * into v_product from public.products where id::text=v_item->>'product_id' for update;
    insert into public.sale_items(transaction_id,product_id,product_name_snapshot,size_snapshot,player_name_snapshot,price,quantity,cost_price_snapshot)
    values(v_transaction_id,v_product.id,v_product.name,v_product.size,v_product.player,(v_item->>'price')::numeric,1,coalesce(v_product.buy_price,0));
    update public.products set quantity=quantity-1,is_archived=case when quantity-1=0 then true else is_archived end,updated_at=now() where id=v_product.id;
  end loop;
  return jsonb_build_object('transaction_id',v_transaction_id,'amount',v_total,'count',v_count);
end; $$;

create or replace function public.void_live_sale(p_transaction_id text)
returns jsonb language plpgsql security definer set search_path=public
as $$
declare v_transaction public.transactions%rowtype; v_item public.sale_items%rowtype; v_count integer:=0;
begin
  select * into v_transaction from public.transactions where id::text=p_transaction_id for update;
  if not found or v_transaction.type<>'Prodaja' then raise exception 'Prodajna transakcija nije pronađena.'; end if;
  if coalesce(v_transaction.is_voided,false) then raise exception 'Prodaja je već poništena.'; end if;
  for v_item in select * from public.sale_items where transaction_id=v_transaction.id loop
    update public.products set quantity=quantity+v_item.quantity,is_archived=false,updated_at=now() where id=v_item.product_id;
    v_count:=v_count+v_item.quantity;
  end loop;
  if v_count=0 then raise exception 'Transakcija nema stavke koje se mogu vratiti.'; end if;
  update public.transactions set is_voided=true,voided_at=now() where id=v_transaction.id;
  return jsonb_build_object('transaction_id',v_transaction.id,'restored_items',v_count);
end; $$;

grant execute on function public.record_live_sale(jsonb,text,text,text) to anon,authenticated;
grant execute on function public.void_live_sale(text) to anon,authenticated;
