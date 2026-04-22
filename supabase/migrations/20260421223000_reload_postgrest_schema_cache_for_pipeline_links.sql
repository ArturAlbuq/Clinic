-- Forca o PostgREST a recarregar o schema cache para expor
-- pipeline_item_queue_items via API REST/Supabase client.
notify pgrst, 'reload schema';
