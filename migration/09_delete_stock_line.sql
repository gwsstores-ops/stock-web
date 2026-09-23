-- Delete a single stock line, used to remove a duplicate or a line entered in error.
-- Callable ONLY with the server's service key: anon/authenticated cannot execute it.
-- Adds a function only; changes no data. Rollback: drop function delete_stock_line(bigint);

create or replace function delete_stock_line(p_id bigint) returns boolean
language sql as $$
  delete from stock_line where id = p_id returning true;
$$;

revoke all on function delete_stock_line(bigint) from public, anon, authenticated;
grant execute on function delete_stock_line(bigint) to service_role;
