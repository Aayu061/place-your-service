-- Keep the free Render PYS API awake during business hours (owner-approved 2026-11-26, "Keep API awake").
--
-- Render's free web services sleep after ~15 minutes without traffic; the first customer after that waits for a cold
-- start. GitHub's 13-minute keepalive schedule turned out to run only ~4 times a day. Supabase's own scheduler
-- (pg_cron) + HTTP client (pg_net) ping the API every 10 minutes instead.
--
-- Safeguard: Render's free plan has 750 instance-hours per month shared by ALL free services in the workspace;
-- running 24/7 (~744 h) could exhaust them and suspend every free service. So the ping runs only from 02:00 to 16:59
-- UTC = 07:30 to 22:29 IST (~15 h/day, ~465 h/month). Outside those hours the API may sleep as before.
-- The cheap /api/v1/health endpoint is used (no database query). No secrets are involved.
-- Undo: select cron.unschedule('pys-keep-awake'); select cron.unschedule('pys-keep-awake-cleanup');

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Re-running this file replaces the jobs instead of duplicating them.
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname IN ('pys-keep-awake', 'pys-keep-awake-cleanup');

SELECT cron.schedule(
  'pys-keep-awake',
  '*/10 2-16 * * *',
  $$SELECT net.http_get(url := 'https://place-your-service-api.onrender.com/api/v1/health', timeout_milliseconds := 60000)$$
);

-- Keep the scheduler's own run history small (pg_net already drops its responses after 6 hours).
SELECT cron.schedule(
  'pys-keep-awake-cleanup',
  '15 0 * * *',
  $$DELETE FROM cron.job_run_details WHERE end_time < now() - interval '7 days'$$
);
