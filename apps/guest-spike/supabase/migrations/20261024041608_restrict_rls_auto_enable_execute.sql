-- Keep the internal RLS auto-enable event trigger, but remove direct external
-- execution of its SECURITY DEFINER function. The event trigger itself can
-- continue to invoke the function as its owner.

revoke execute on function public.rls_auto_enable() from public;
revoke execute on function public.rls_auto_enable() from anon;
revoke execute on function public.rls_auto_enable() from authenticated;
