interface Props {
  multiplier: number;
  currentZone?: number;
  nextZoneThreshold?: number;
  stake?: number;
  barriersPassed?: number;
}

export const ClimbHUD = ({
  multiplier,
  currentZone,
  nextZoneThreshold,
  stake = 0,
  barriersPassed = 0,
}: Props) => {
  const payout = stake * multiplier;
  return (
    <div className="absolute top-12 right-3 z-20 pointer-events-none rounded-lg border border-border bg-card/70 px-2.5 py-2 text-[10px] leading-tight">
      <div className="text-muted-foreground uppercase tracking-widest">CLIMB</div>
      <div className="text-sm font-black tabular-nums text-glow-cyan">x{multiplier.toFixed(2)}</div>
      <div className="text-muted-foreground tabular-nums">Pag.: R$ {payout.toFixed(2)}</div>
      {currentZone != null && <div className="text-muted-foreground">Zona {currentZone}</div>}
      {nextZoneThreshold != null && (
        <div className="text-muted-foreground tabular-nums">Próx: x{nextZoneThreshold.toFixed(2)}</div>
      )}
      <div className="text-muted-foreground">Barreiras: {barriersPassed}</div>
    </div>
  );
};
