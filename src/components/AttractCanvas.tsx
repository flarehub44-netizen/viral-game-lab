import { useEffect, useRef } from "react";
import { GameEngine } from "@/game/engine";
import { getSelectedSkin } from "@/game/skins";

/** Demo loop do jogo rodando ao fundo do menu — sem colisão, sem game over. */
export const AttractCanvas = () => {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const skin = getSelectedSkin();
    const engine = new GameEngine(
      canvas,
      {
        onStatsChange: () => {},
        onGameOver: () => {},
      },
      { hues: skin.hues, attract: true },
    );
    const onResize = () => engine.handleResize();
    window.addEventListener("resize", onResize);
    engine.start();
    return () => {
      window.removeEventListener("resize", onResize);
      engine.stop();
    };
  }, []);

  return (
    <canvas
      ref={ref}
      className="absolute inset-0 w-full h-full block opacity-40"
      aria-hidden
    />
  );
};
