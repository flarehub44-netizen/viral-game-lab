#!/usr/bin/env node
/**
 * Verifica se as duas cópias da tabela de multiplicadores estão sincronizadas.
 * Execute com: node scripts/check-multiplier-sync.js
 * Retorna exit code 1 se houver divergência.
 */

import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const CLIENT_PATH = resolve(__dirname, "../src/game/economy/multiplierTable.ts");
const SERVER_PATH = resolve(
  __dirname,
  "../supabase/functions/_shared/multiplierTable.ts",
);

function extractTiers(content) {
  // Extrai o bloco MULTIPLIER_TIERS = [ ... ]
  // [^=]* captura a anotação de tipo TypeScript opcional (ex: ": MultiplierTier[]")
  const match = content.match(/MULTIPLIER_TIERS[^=]*=\s*(\[[\s\S]*?\n\];)/);
  if (!match) return null;
  return match[1]
    .replace(/\/\/[^\n]*/g, "") // remove comentários de linha
    .replace(/\s+/g, " ")       // normaliza espaços
    .trim();
}

const clientContent = readFileSync(CLIENT_PATH, "utf8");
const serverContent = readFileSync(SERVER_PATH, "utf8");

const clientTiers = extractTiers(clientContent);
const serverTiers = extractTiers(serverContent);

if (!clientTiers) {
  console.error("ERRO: Não foi possível extrair MULTIPLIER_TIERS do arquivo cliente.");
  process.exit(1);
}
if (!serverTiers) {
  console.error("ERRO: Não foi possível extrair MULTIPLIER_TIERS do arquivo servidor.");
  process.exit(1);
}

if (clientTiers !== serverTiers) {
  console.error("DIVERGÊNCIA detectada em MULTIPLIER_TIERS:");
  console.error("\nCliente (src/game/economy/multiplierTable.ts):");
  console.error(clientTiers.slice(0, 300));
  console.error("\nServidor (supabase/functions/_shared/multiplierTable.ts):");
  console.error(serverTiers.slice(0, 300));
  process.exit(1);
}

console.log("OK: MULTIPLIER_TIERS está sincronizado entre cliente e servidor.");
process.exit(0);
