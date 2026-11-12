DROP POLICY IF EXISTS select_all_products ON public.products;
CREATE POLICY select_visible_products ON public.products
  FOR SELECT TO authenticated
  USING (status = 'active' OR auth.uid() = seller_id);