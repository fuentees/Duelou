import { palette } from "../theme";

// A paleta compartilhada não tem um azul de verdade (cyan/violet são os mais
// próximos, mas nenhum lê como "time azul" claramente) — cor local só pra
// distinguir os dois lados da Arena, junto com a paleta existente pro resto
// (rosa já existe em src/theme.ts).
export const PLAYER_COLOR = "#2D6CDF";
export const ENEMY_COLOR = palette.pink;
