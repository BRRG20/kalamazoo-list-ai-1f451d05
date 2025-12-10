-- Remove the public SELECT policy that exposes email addresses
DROP POLICY IF EXISTS "Anyone can check authorized emails" ON public.authorized_emails;

-- The is_email_authorized() function is SECURITY DEFINER so it can still access the table
-- No new policy needed - the function bypasses RLS