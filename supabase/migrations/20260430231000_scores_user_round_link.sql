-- Vincula scores a usuários e rodadas para bloquear fabricação de pontuações.
-- Colunas opcionais (nullable) para não quebrar dados históricos.

ALTER TABLE public.scores
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS round_id uuid REFERENCES public.game_rounds(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS scores_user_id_idx ON public.scores (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS scores_round_id_idx ON public.scores (round_id);

-- Unique por round: um round só pode gerar um score
CREATE UNIQUE INDEX IF NOT EXISTS scores_round_id_unique_idx
  ON public.scores (round_id)
  WHERE round_id IS NOT NULL;
