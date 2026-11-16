-- Favorites nicknames: a short label a user gives a saved lot ("Class", "Work"), like Google Maps labels.
-- Signed-in users may update only the nickname, and only on their own favorites.
ALTER TABLE public.favorite_area
  ADD COLUMN IF NOT EXISTS nickname TEXT
  CONSTRAINT favorite_area_nickname_length CHECK (nickname IS NULL OR char_length(btrim(nickname)) BETWEEN 1 AND 30);

GRANT UPDATE (nickname) ON public.favorite_area TO authenticated;

DROP POLICY IF EXISTS "users rename own favorites" ON public.favorite_area;
CREATE POLICY "users rename own favorites" ON public.favorite_area
  FOR UPDATE TO authenticated
  USING (user_id IN (SELECT u.user_id FROM public.app_user u WHERE u.auth_id = (SELECT auth.uid())))
  WITH CHECK (user_id IN (SELECT u.user_id FROM public.app_user u WHERE u.auth_id = (SELECT auth.uid())));
