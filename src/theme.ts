// Sistema de design compartilhado: paleta clara e colorida, gradientes, sombras e níveis de rank.
export const palette = {
  bg: "#F5F6FC",
  bgAlt: "#FFFFFF",
  surface: "#FFFFFF",
  surfaceAlt: "#F0F2FA",
  surfaceRaised: "#FFFFFF",
  border: "#E5E8F3",
  borderActive: "#C9D0FA",
  text: "#1E2233",
  textDim: "#5B6072",
  textFaint: "#646981",
  cyan: "#087E8B",
  violet: "#6742DB",
  amber: "#FF9F1C",
  pink: "#FF4D8D",
  green: "#187A3D",
  red: "#E11D48",
  gold: "#FFB703",
};
// Tema da partida da Arena Rush. O app inteiro é claro e continua sendo —
// mas o campo de batalha em rosa/lilás pastel dizia "passatempo", não
// "duelo", e tropa colorida sobre fundo claro tem menos contraste do que
// merece. A arena é o único lugar escuro do app: comunica o que é e faz as
// duas cores dos lados saltarem.
export const arena = {
  bg: "#0E1222",
  surface: "#171C30",
  surfaceAlt: "#1F2540",
  border: "#2C3454",
  text: "#F2F4FF",
  textDim: "#A9B0D0",
  textFaint: "#7C85AB",
  lane: ["#151A2E", "#1B2340", "#141A2C"] as const,
  // Versões claras dos acentos: verde/vermelho/âmbar da paleta clara ficam
  // escuros demais sobre o fundo da arena e perdem contraste justamente nos
  // avisos que mais importam (crítico, morte súbita, conexão).
  good: "#3DDC97",
  warn: "#FFC14D",
  danger: "#FF6584",
};
export const gradients = {
  hero: ["#6742DB", "#086E7A"] as const,
  brand: ["#7C5CFF", "#12B8C4"] as const,
  primaryButton: ["#7049DB", "#5040D1"] as const,
  success: ["#34D399", "#16A34A"] as const,
  danger: ["#FB7185", "#E11D48"] as const,
  gold: ["#FFD166", "#FF9F1C"] as const,
  card: ["#FFFFFF", "#F7F8FF"] as const,
  cardActive: ["#EFEAFF", "#E1F8FB"] as const,
};
export const gameColors: Record<string, readonly [string, string]> = {
  math: ["#FF9F1C", "#FF7A00"],
  order: ["#12B8C4", "#0E93A0"],
  odd: ["#FF4D8D", "#E0367A"],
  sequence: ["#7C5CFF", "#5B4FE8"],
  colors: ["#22C55E", "#16A34A"],
  timer: ["#12B8C4", "#0E93A0"],
  reflex: ["#FF4D8D", "#E0367A"],
  aim: ["#E11D48", "#B0123A"],
  memory: ["#7C5CFF", "#5B4FE8"],
};
export const radius = { sm: 10, md: 14, lg: 20, xl: 28, pill: 999 };
export const shadow = {
  soft: {
    shadowColor: "#2A2F55",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.1,
    shadowRadius: 16,
    elevation: 4,
  },
  glow: (color: string) => ({
    shadowColor: color,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 14,
    elevation: 8,
  }),
};
// Clareia (amount > 0) ou escurece (amount < 0) uma cor em direção a
// branco/preto — usado pelo personagem (Character.tsx, Ticket 32) pra
// simular luz e sombra numa superfície curva sem precisar de motor 3D.
export function shade(hex: string, amount: number): string {
  const n = hex.replace("#", "");
  const target = amount > 0 ? 255 : 0;
  const t = Math.min(1, Math.abs(amount));
  const channel = (i: number) => {
    const v = parseInt(n.slice(i, i + 2), 16);
    return Math.round(v + (target - v) * t)
      .toString(16)
      .padStart(2, "0");
  };
  return `#${channel(0)}${channel(2)}${channel(4)}`;
}
export function contrastText(hex: string): string {
  const n = hex.replace("#", "");
  const luminance = (color: string) => {
    const parts = [0, 2, 4].map((i) => {
      const v = parseInt(color.slice(i, i + 2), 16) / 255;
      return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    });
    return parts[0] * 0.2126 + parts[1] * 0.7152 + parts[2] * 0.0722;
  };
  const light = luminance(n),
    dark = luminance("1E2233");
  return (light + 0.05) / (dark + 0.05) >= 1.05 / (light + 0.05)
    ? "#1E2233"
    : "#FFFFFF";
}

export type Rank = {
  name: string;
  icon: string;
  colors: readonly [string, string];
};
const ranks: Rank[] = [
  { name: "Bronze", icon: "🥉", colors: ["#E3A369", "#B97A3E"] },
  { name: "Prata", icon: "🥈", colors: ["#C7D0E3", "#8E97AE"] },
  { name: "Ouro", icon: "🥇", colors: ["#FFD166", "#FFB703"] },
  { name: "Platina", icon: "💠", colors: ["#12B8C4", "#0E93A0"] },
  { name: "Diamante", icon: "💎", colors: ["#7C5CFF", "#5B4FE8"] },
  { name: "Lendário", icon: "👑", colors: ["#FF4D8D", "#E0367A"] },
];
// Divisão da Arena Rush, a partir da nota do duelo em tempo real
// (server/arena-rating.mjs). Nome diferente de propósito: "patente" é da fila
// competitiva e continua vindo só de lá — são dois números medindo coisas
// diferentes, e chamar os dois de patente seria mentir sobre isso. O visual é
// o mesmo (mesmas cores e ícones) pra não inventar uma segunda linguagem.
const ARENA_TIER_FLOOR = [0, 900, 1050, 1200, 1350, 1500];
export function arenaTierFor(rating: number): Rank {
  let index = 0;
  for (let i = 0; i < ARENA_TIER_FLOOR.length; i++)
    if (rating >= ARENA_TIER_FLOOR[i]!) index = i;
  return ranks[index]!;
}

/** Nota que falta pra próxima divisão — null quando já está na última. */
export function nextArenaTier(rating: number): { tier: Rank; missing: number } | null {
  const next = ARENA_TIER_FLOOR.findIndex((floor) => rating < floor);
  if (next === -1) return null;
  return { tier: ranks[next]!, missing: ARENA_TIER_FLOOR[next]! - rating };
}

export function rankFor(level: number): Rank {
  const idx = Math.min(ranks.length - 1, Math.floor((level - 1) / 5));
  return ranks[idx];
}
export function medal(index: number): string {
  return index === 0 ? "🥇" : index === 1 ? "🥈" : index === 2 ? "🥉" : "";
}
