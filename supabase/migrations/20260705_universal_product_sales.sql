-- Pokrenuti nakon 20260705_live_sales_enhancements.sql.
-- Prodaju proširuje na sve product_type vrijednosti bez promjene strukture baze.

create or replace function public.record_live_sale(
  p_items jsonb,
  p_note text default 'Prodano',
  p_payment_method text default 'gotovina',
  p_sales_channel text default 'uživo'
) returns jsonb
language plpgsql security definer set search_path=public
as $$
declare
  v_transaction_id public.transactions.id%type;
  v_item jsonb;
  v_product public.products%rowtype;
  v_total numeric:=0;
  v_count integer:=0;
begin
  if jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 then raise exception 'Odaberite barem jedan proizvod.'; end if;
  for v_item in select value from jsonb_array_elements(p_items) loop
    select * into v_product from public.products where id::text=v_item->>'product_id' for update;
    if not found then raise exception 'Proizvod % nije pronađen.',v_item->>'product_id'; end if;
    if coalesce(v_product.quantity,0)<1 then raise exception 'Proizvod "%" više nije na stanju.',v_product.name; end if;
    if coalesce((v_item->>'price')::numeric,0)<0 then raise exception 'Prodajna cijena nije ispravna.'; end if;
    v_total:=v_total+(v_item->>'price')::numeric; v_count:=v_count+1;
  end loop;
  insert into public.transactions(type,amount,description,source_type,source_id,created_at,payment_method,sales_channel,is_voided)
  values('Prodaja',v_total,'Prodaja – '||v_count||case when v_count=1 then ' proizvod' else ' proizvoda' end||case when nullif(trim(p_note),'') is not null then ' · '||trim(p_note) else '' end,'live_sale',null,now(),p_payment_method,p_sales_channel,false)
  returning id into v_transaction_id;
  for v_item in select value from jsonb_array_elements(p_items) loop
    select * into v_product from public.products where id::text=v_item->>'product_id' for update;
    insert into public.sale_items(transaction_id,product_id,product_name_snapshot,size_snapshot,player_name_snapshot,price,quantity,cost_price_snapshot)
    values(v_transaction_id,v_product.id,v_product.name,v_product.size,v_product.player,(v_item->>'price')::numeric,1,coalesce(v_product.buy_price,0));
    update public.products set quantity=quantity-1,is_archived=case when quantity-1=0 then true else is_archived end,updated_at=now() where id=v_product.id;
  end loop;
  return jsonb_build_object('transaction_id',v_transaction_id,'amount',v_total,'count',v_count);
end; $$;

grant execute on function public.record_live_sale(jsonb,text,text,text) to anon,authenticated;
