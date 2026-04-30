-- Daily challenge scores (ranking diário separado por seed)
CREATE TABLE public.daily_scores (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  date_key TEXT NOT NULL,
  nickname TEXT NOT NULL,
  score INTEGER NOT NULL,
  max_multiplier INTEGER NOT NULL,
  duration_seconds INTEGER NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_daily_scores_date_score ON public.daily_scores(date_key, score DESC);

ALTER TABLE public.daily_scores ENABLE ROW LEVEL SECURITY;

-- Public read (leaderboard visível pra todos)
CREATE POLICY "Daily scores viewable by everyone"
ON public.daily_scores
FOR SELECT
USING (true);

-- Insert/update somente via edge function com service role (sem policy = bloqueado para anon)