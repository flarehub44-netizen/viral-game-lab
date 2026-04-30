-- Drop daily challenge table (no longer used)
DROP TABLE IF EXISTS public.daily_scores;

-- Index to speed up leaderboard top-N queries
CREATE INDEX IF NOT EXISTS idx_scores_score_desc ON public.scores (score DESC);
