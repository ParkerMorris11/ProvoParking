-- Authorized database connections only. Raw visits and links are not browser-readable.
SELECT
  count(*) FILTER (WHERE l.parking_session_id IS NOT NULL) AS account_sessions,
  avg(extract(epoch FROM (l.completed_at-v.opened_at))/60.0) FILTER (WHERE l.parking_session_id IS NOT NULL) AS account_average_minutes,
  count(*) FILTER (WHERE l.guest_session_id IS NOT NULL) AS client_reported_guest_sessions,
  avg(extract(epoch FROM (l.completed_at-v.opened_at))/60.0) FILTER (WHERE l.guest_session_id IS NOT NULL) AS client_reported_guest_average_minutes
FROM visit_metrics_private.visit_link l JOIN public.app_visit v ON v.id=l.visit_id;
