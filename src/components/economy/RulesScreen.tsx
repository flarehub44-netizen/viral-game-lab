import { ArrowLeft } from "lucide-react";
import {
  BET_AMOUNTS,
  DEFAULT_META_MULTIPLIER,
  MAX_STAKE,
  MIN_STAKE,
  TARGET_RTP,
} from "@/game/economy/constants";
import { theoreticalRtp } from "@/game/economy/multiplierTable";

interface Props {
  onBack: () => void;
}

export const RulesScreen = ({ onBack }: Props) => {
  const rtpDiscretePct = (theoreticalRtp() * 100).toFixed(1);
  const meta = DEFAULT_META_MULTIPLIER;

  return (
    <div className="absolute inset-0 flex flex-col bg-gradient-to-b from-[hsl(270_45%_10%)] via-background to-background overflow-y-auto">
      <div className="flex items-center gap-3 px-4 pt-5 pb-3 border-b border-border shrink-0 sticky top-0 bg-background/95 backdrop-blur z-10">
        <button
          type="button"
          onClick={onBack}
          className="p-2 rounded-lg bg-card/60 border border-border text-muted-foreground hover:text-foreground"
          aria-label="Voltar"
        >
          <ArrowLeft size={18} />
        </button>
        <h2 className="text-lg font-black uppercase tracking-wide">Regras</h2>
      </div>

      <div className="flex-1 px-5 py-6 space-y-5 max-w-md mx-auto w-full text-sm leading-relaxed">
        <section className="space-y-2">
          <h3 className="text-xs font-black uppercase tracking-widest text-muted-foreground">
            Objetivo
          </h3>
          <p className="text-muted-foreground">
            Divida as bolas neon para atravessar barreiras e revelar a rodada. O multiplicador da entrada é
            definido ao iniciar a partida (servidor na conta, ou sorteio local na demo).
          </p>
        </section>

        <section className="space-y-2">
          <h3 className="text-xs font-black uppercase tracking-widest text-muted-foreground">
            Apostas
          </h3>
          <p className="text-muted-foreground">
            Valores fixos de entrada (créditos):{" "}
            <span className="text-foreground font-semibold">{BET_AMOUNTS.join(", ")}</span> — entre R${" "}
            {MIN_STAKE} e R$ {MAX_STAKE} por rodada.
          </p>
        </section>

        <section className="space-y-2">
          <h3 className="text-xs font-black uppercase tracking-widest text-muted-foreground">
            Meta e pagamento
          </h3>
          <p className="text-muted-foreground">
            Modo <span className="text-foreground font-semibold">meta {meta}x</span>: o pagamento é entrada ×
            multiplicador sorteado. RTP teórico da tabela discreta (informação ao jogador):{" "}
            <span className="text-foreground font-semibold">~{rtpDiscretePct}%</span>. Constante de referência em
            simulações legadas: ~{(TARGET_RTP * 100).toFixed(1)}%.
          </p>
        </section>

        <section className="space-y-2">
          <h3 className="text-xs font-black uppercase tracking-widest text-muted-foreground">
            Durante a partida
          </h3>
          <p className="text-muted-foreground">
            Não há resgate antecipado (cashout) durante a jogada. Segure o botão de menu para sair; na conta,
            a rodada já foi liquidada no servidor ao iniciar.
          </p>
        </section>

        <section className="space-y-2">
          <h3 className="text-xs font-black uppercase tracking-widest text-muted-foreground">
            Idade e responsabilidade
          </h3>
          <p className="text-muted-foreground">
            Proibido para menores de 18 anos. Jogue com responsabilidade. Créditos na demo são fictícios e não
            têm valor monetário.
          </p>
        </section>
      </div>
    </div>
  );
};
