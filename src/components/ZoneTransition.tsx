interface Props {
  zone?: number;
}

export const ZoneTransition = ({ zone }: Props) => {
  if (!zone) return null;
  return (
    <div className="absolute top-20 left-1/2 -translate-x-1/2 pointer-events-none z-20">
      <div className="rounded-full border border-secondary/40 bg-secondary/15 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-secondary">
        Zona {zone} atingida
      </div>
    </div>
  );
};
