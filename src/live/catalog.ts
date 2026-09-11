export type Game = "timer" | "reflex" | "memory";
export const catalog: { id: Game; name: string; icon: string; desc: string }[] = [
  {
    id: "timer",
    name: "5,00 cravado",
    icon: "◷",
    desc: "Precisão contra o relógio",
  },
  {
    id: "reflex",
    name: "Reflexo relâmpago",
    icon: "ϟ",
    desc: "Espere o sinal. Vença a pressa.",
  },
  {
    id: "memory",
    name: "Memória turbo",
    icon: "▦",
    desc: "Observe, memorize e repita.",
  },
];
export const title = (g: Game) => catalog.find((x) => x.id === g)!.name;
export const levelGuide: Record<Game, string[]> = {
  timer: [
    "Relógio visível. Treine parar em 5 segundos.",
    "O relógio some após 3 segundos. A precisão pesa mais.",
    "Só o primeiro segundo fica visível. Margem de erro menor.",
  ],
  reflex: [
    "Uma reação ao sinal. Espere antes de tocar.",
    "Três reações. Vale o tempo do meio, não apenas o melhor.",
    "Cinco reações. Mantenha a consistência sem antecipar o sinal.",
  ],
  memory: [
    "Quatro passos, com flashes de 550 ms.",
    "Seis passos, com flashes de 400 ms.",
    "Oito passos, com flashes de 280 ms.",
  ],
};
