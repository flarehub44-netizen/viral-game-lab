
-- PIX / wallet flow (server-only)
REVOKE EXECUTE ON FUNCTION public.confirm_pix_deposit(text, numeric, jsonb) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.create_pix_deposit_pending(uuid, numeric, timestamptz, text) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.finalize_pix_deposit_pending(uuid, text, text) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.cancel_pix_deposit_pending(uuid) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.finalize_pix_withdrawal(uuid, text) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.reverse_pix_withdrawal(uuid) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.request_pix_withdrawal(uuid, numeric, text, text, text, text) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.apply_syncpay_cashout_webhook(text, text, jsonb) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.register_webhook_event(text, text, text, text, jsonb, text) FROM anon, authenticated, public;

-- Admin functions (server-only via admin-action edge function)
REVOKE EXECUTE ON FUNCTION public.admin_unban_user(uuid, uuid) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.admin_ban_user(uuid, uuid) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.admin_set_feature_flag(uuid, text, boolean, smallint) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.admin_log_action(uuid, text, uuid, jsonb) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.admin_credit_wallet(uuid, uuid, numeric, text) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.admin_debit_wallet(uuid, uuid, numeric, text) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.admin_set_age_confirmed(uuid, uuid, boolean) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.admin_set_kyc(uuid, uuid, text) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.admin_delete_sandbox_rounds(uuid) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.admin_search_users(uuid, text, integer) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.admin_sandbox_round(uuid, numeric, numeric, numeric, numeric, jsonb, text, integer, integer, text, text) FROM anon, authenticated, public;

-- LGPD / fraud / observabilidade (server-only)
REVOKE EXECUTE ON FUNCTION public.process_lgpd_deletion(uuid) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.auto_process_lgpd_deletions() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.request_lgpd_deletion(uuid, text) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.log_data_access_event(uuid, uuid, text, jsonb) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.log_fraud_signal(uuid, uuid, text, smallint, jsonb) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.guard_request_rate(uuid, text, text, text, integer, integer) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.close_stale_open_rounds(integer) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.get_user_pix_identity(uuid) FROM anon, authenticated, public;
