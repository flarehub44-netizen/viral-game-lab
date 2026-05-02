import { ArrowLeft, Target, Check, Flag, Gift, Loader2 } from "lucide-react";
import { useState, useEffect } from "react";
import { loadProgression, getRunGoals, type ProgressionProfile } from "@/game/progression";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { trackMetaCustom } from "@/lib/metaPixel";

interface Props {
  onBack: () => void;
  progressionProfile?: ProgressionProfile;
}

const CLAIMED_KEY = "ns_mission_claims_v1";

function loadLocalClaims(): Record<string, true> {
  try {
    const raw = localStorage.getItem(CLAIMED_KEY);
    if (!raw) return {};
    return JSON.parse(raw) ?? {};
  } catch {
    return {};
  }
}

function saveLocalClaim(key: string) {
  const all = loadLocalClaims();
  all[key] = true;
  try {
    localStorage.setItem(CLAIMED_KEY, JSON.stringify(all));
  } catch {
    void 0;
  }
}

function todayKey(missionId: string): string {
  const d = new Date();
  const seed = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
  return `${seed}:${missionId}`;
}

export const MissionsPanel = ({ onBack, progressionProfile = "default" }: Props) => {
  const { session } = useAuth();
  const data = loadProgression(progressionProfile);
  const runGoals = getRunGoals();
  const isReal = progressionProfile === "default" && !!session;

  const [claimed, setClaimed] = useState<Record<string, true>>({});
  const [loadingId, setLoadingId] = useState<string | null>(null);

  useEffect(() => {
    setClaimed(loadLocalClaims());
  }, []);

  async function claim(missionId: string) {
    if (!isReal) return;
    setLoadingId(missionId);
    try {
      const { data: result, error } = await supabase.functions.invoke("claim-mission", {
        body: { mission_id: missionId },
      });
      if (error) throw error;
      const key = todayKey(missionId);
      saveLocalClaim(key);
      setClaimed((p) => ({ ...p, [key]: true }));
      const amount = Number(result?.bonus_amount ?? 0);
      toast.success(`+R$ ${amount.toFixed(2)} de bônus creditado!`);
    } catch (err: any) {
      const msg = String(err?.message || err?.context?.error || "");
      if (msg.includes("already_claimed")) {
        const key = todayKey(missionId);
        saveLocalClaim(key);
        setClaimed((p) => ({ ...p, [key]: true }));
        toast.info("Você já reclamou essa missão hoje");
      } else if (msg.includes("no_qualifying_rounds_today")) {
        toast.error("Jogue ao menos 1 rodada real hoje para reclamar");
      } else {
        toast.error("Falha ao reclamar bônus");
      }
    } finally {
      setLoadingId(null);
    }
  }

  return (
    <div className="absolute inset-0 flex flex-col p-6 bg-gradient-to-b from-background via-background to-card overflow-y-auto">
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={onBack}
          className="p-2 rounded-md bg-card/60 backdrop-blur border border-border text-muted-foreground hover:text-foreground"
          aria-label="Voltar"
        >
          <ArrowLeft size={18} />
        </button>
        <div>
          <h2 className="text-2xl font-black text-glow-cyan flex items-center gap-2">
            <Target size={22} /> Missões
          </h2>
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground">
            Reseta à meia-noite{isReal ? " — completas pagam R$ 0,10 de bônus" : ""}
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        {data.missions.list.map((m) => {
          const pct = Math.min(100, (m.progress / m.goal) * 100);
          const claimKey = todayKey(m.id);
          const wasClaimed = claimed[claimKey] === true;
          const canClaim = isReal && m.done && !wasClaimed;
          return (
            <div
              key={m.id}
              className={`rounded-xl border p-4 ${
                m.done
                  ? "border-primary bg-primary/10"
                  : "border-border bg-card/40"
              }`}
            >
              <div className="flex items-start justify-between gap-3 mb-2">
                <div className="text-sm font-bold">{m.label}</div>
                <div className="flex items-center gap-1 text-xs font-bold text-glow-yellow tabular-nums">
                  +{m.xp} XP
                  {m.done && <Check size={14} className="text-primary" />}
                </div>
              </div>
              <div className="h-2 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-primary to-secondary transition-all"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground mt-1 tabular-nums">
                {Math.min(m.progress, m.goal)} / {m.goal}
              </div>
              {isReal && m.done && (
                <div className="mt-3">
                  {wasClaimed ? (
                    <div className="text-[11px] uppercase tracking-widest text-primary font-bold flex items-center gap-1">
                      <Check size={12} /> Bônus reclamado
                    </div>
                  ) : (
                    <button
                      onClick={() => claim(m.id)}
                      disabled={!canClaim || loadingId === m.id}
                      className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-primary to-secondary text-primary-foreground text-xs font-bold py-2 hover:opacity-90 disabled:opacity-50"
                    >
                      {loadingId === m.id ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        <Gift size={14} />
                      )}
                      Reclamar R$ 0,10 de bônus
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div className="mt-6">
        <h3 className="text-xs uppercase tracking-widest text-muted-foreground mb-2">
          Metas de rodada
        </h3>
        <div className="flex flex-col gap-2">
          {runGoals.map((goal) => (
            <div key={goal.id} className="rounded-xl border border-border bg-card/40 p-3 flex items-center gap-2">
              <Flag size={14} className="text-accent" />
              <div className="text-sm">{goal.label}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
