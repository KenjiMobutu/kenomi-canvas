-- ============================================================
-- Plan G — ideas : ajout user_id + policy RLS
-- La table ideas n'a ni user_id ni venture_id.
-- On ajoute user_id nullable puis on l'assigne + NOT NULL.
-- ============================================================

-- 1. Ajouter la colonne user_id (nullable d'abord)
ALTER TABLE public.ideas ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id);

-- 2. Assigner les lignes existantes au premier utilisateur
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM auth.users) THEN
    RAISE EXCEPTION 'auth.users est vide — migration impossible';
  END IF;
END $$;

UPDATE public.ideas
SET user_id = (SELECT id FROM auth.users ORDER BY created_at LIMIT 1)
WHERE user_id IS NULL;

-- 3. Rendre NOT NULL
ALTER TABLE public.ideas ALTER COLUMN user_id SET NOT NULL;

-- 4. Index pour les performances RLS
CREATE INDEX IF NOT EXISTS ideas_user_id_idx ON public.ideas(user_id);

-- 5. Remplacer la policy service_role par une policy utilisateur
DROP POLICY IF EXISTS "Service role full access" ON public.ideas;

DO $$ BEGIN
  CREATE POLICY "ideas_own" ON public.ideas
    FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

COMMENT ON TABLE public.ideas IS
  'Idées studio. user_id NOT NULL + RLS depuis 2026-05-16 (Plan G).';
