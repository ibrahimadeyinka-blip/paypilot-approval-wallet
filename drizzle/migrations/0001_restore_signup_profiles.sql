DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

INSERT INTO public.profiles (id, display_name)
SELECT u.id,
       COALESCE(NULLIF(btrim(u.raw_user_meta_data ->> 'display_name'), ''), NULLIF(split_part(u.email, '@', 1), ''), 'Vigil user')
FROM auth.users u
ON CONFLICT (id) DO NOTHING;