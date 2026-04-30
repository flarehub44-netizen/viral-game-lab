// ============================================================================
// Gera um PNG 1080x1080 do score para compartilhamento social.
// ============================================================================

export interface ShareCardData {
  score: number;
  maxMultiplier: number;
  durationSeconds: number;
  nickname: string;
  challengeUrl: string;
}

export async function generateShareCard(data: ShareCardData): Promise<Blob | null> {
  const size = 1080;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const c = canvas.getContext("2d");
  if (!c) return null;

  // Fundo gradiente neon
  const bg = c.createLinearGradient(0, 0, size, size);
  bg.addColorStop(0, "hsl(260, 60%, 8%)");
  bg.addColorStop(1, "hsl(240, 60%, 3%)");
  c.fillStyle = bg;
  c.fillRect(0, 0, size, size);

  // Orbs de fundo
  const orb = (x: number, y: number, r: number, hue: number, alpha: number) => {
    const g = c.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `hsla(${hue}, 100%, 60%, ${alpha})`);
    g.addColorStop(1, `hsla(${hue}, 100%, 50%, 0)`);
    c.fillStyle = g;
    c.fillRect(0, 0, size, size);
  };
  orb(180, 200, 420, 180, 0.45);
  orb(900, 850, 480, 320, 0.4);
  orb(540, 540, 600, 270, 0.18);

  // Grid sutil
  c.strokeStyle = "hsla(180, 50%, 50%, 0.06)";
  c.lineWidth = 1;
  for (let y = 60; y < size; y += 60) {
    c.beginPath();
    c.moveTo(0, y);
    c.lineTo(size, y);
    c.stroke();
  }

  // Título "NEON SPLIT"
  c.textAlign = "center";
  c.textBaseline = "middle";
  c.shadowColor = "hsl(180, 100%, 60%)";
  c.shadowBlur = 30;
  c.fillStyle = "hsl(180, 100%, 70%)";
  c.font = "900 96px Inter, system-ui, sans-serif";
  c.fillText("NEON", size / 2 - 130, 180);
  c.shadowColor = "hsl(320, 100%, 60%)";
  c.fillStyle = "hsl(320, 100%, 70%)";
  c.fillText("SPLIT", size / 2 + 140, 180);

  // Nickname
  c.shadowBlur = 0;
  c.fillStyle = "hsla(0, 0%, 100%, 0.6)";
  c.font = "500 36px Inter, system-ui, sans-serif";
  c.fillText(`@${data.nickname}`, size / 2, 270);

  // Score gigante
  c.shadowColor = "hsl(180, 100%, 60%)";
  c.shadowBlur = 40;
  c.fillStyle = "hsl(180, 100%, 80%)";
  c.font = "900 220px Inter, system-ui, sans-serif";
  c.fillText(data.score.toLocaleString(), size / 2, 500);

  c.shadowBlur = 0;
  c.fillStyle = "hsla(0, 0%, 100%, 0.5)";
  c.font = "600 28px Inter, system-ui, sans-serif";
  c.fillText("PONTOS", size / 2, 620);

  // Stats secundárias
  const drawStat = (x: number, label: string, value: string, hue: number) => {
    c.shadowColor = `hsl(${hue}, 100%, 60%)`;
    c.shadowBlur = 20;
    c.fillStyle = `hsl(${hue}, 100%, 75%)`;
    c.font = "900 80px Inter, system-ui, sans-serif";
    c.fillText(value, x, 770);
    c.shadowBlur = 0;
    c.fillStyle = "hsla(0, 0%, 100%, 0.5)";
    c.font = "600 22px Inter, system-ui, sans-serif";
    c.fillText(label, x, 830);
  };
  drawStat(size / 2 - 200, "MULTI MAX", `×${data.maxMultiplier}`, 320);
  drawStat(size / 2 + 200, "TEMPO", `${data.durationSeconds}s`, 55);

  // CTA
  c.fillStyle = "hsla(0, 0%, 100%, 0.85)";
  c.font = "700 36px Inter, system-ui, sans-serif";
  c.fillText("👉 BATA MEU SCORE", size / 2, 960);
  c.fillStyle = "hsla(180, 80%, 70%, 0.7)";
  c.font = "500 22px Inter, system-ui, sans-serif";
  const url = data.challengeUrl.length > 50 ? data.challengeUrl.slice(0, 50) + "…" : data.challengeUrl;
  c.fillText(url, size / 2, 1010);

  return new Promise((resolve) => {
    canvas.toBlob((b) => resolve(b), "image/png", 0.92);
  });
}

export async function shareCard(data: ShareCardData): Promise<"shared" | "downloaded" | "failed"> {
  const blob = await generateShareCard(data);
  if (!blob) return "failed";
  const file = new File([blob], "neon-split.png", { type: "image/png" });
  const text = `Fiz ${data.score.toLocaleString()} pontos no Neon Split! Consegue mais?`;
  // Tenta share nativo com arquivo (mobile)
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (nav.canShare && nav.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], text, url: data.challengeUrl, title: "Neon Split" });
      return "shared";
    } catch {
      // usuário cancelou — não é erro
      return "shared";
    }
  }
  // Fallback: download
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `neon-split-${data.score}.png`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  return "downloaded";
}
