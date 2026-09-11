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
  textFaint: "#6E7391",
  cyan: "#0EA5B7",
  violet: "#7C5CFF",
  amber: "#FF9F1C",
  pink: "#FF4D8D",
  green: "#16A34A",
  red: "#E11D48",
  gold: "#FFB703",
};
export const gradients = {
  hero: ["#7C5CFF", "#12B8C4"] as const,
  brand: ["#7C5CFF", "#12B8C4"] as const,
  primaryButton: ["#8A6BFF", "#5B4FE8"] as const,
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
export function contrastText(hex: string): string {
  const n = hex.replace("#", "");
  const r = parseInt(n.substring(0, 2), 16),
    g = parseInt(n.substring(2, 4), 16),
    b = parseInt(n.substring(4, 6), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 > 160 ? "#1E2233" : "#FFFFFF";
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
export function rankFor(level: number): Rank {
  const idx = Math.min(ranks.length - 1, Math.floor((level - 1) / 5));
  return ranks[idx];
}
export function medal(index: number): string {
  return index === 0 ? "🥇" : index === 1 ? "🥈" : index === 2 ? "🥉" : "";
}
