export type ArcadeMode = "math" | "order" | "odd" | "sequence" | "colors";
export type ArcadeConfig = {
  mode: ArcadeMode;
  difficulty: number;
  seconds: number;
  rulesVersion: number;
  rounds: {
    prompt: string;
    options: (number | string)[];
    answer?: number;
    promptColor?: string;
    optionColors?: string[];
  }[];
};
export const MAX_LEVEL: number;
export const CLEAR_SCORE: number;
export const levels: string[];
export const levelRules: { rounds: number; seconds: number }[];
export const levelDetails: Record<ArcadeMode, string>;
export const modes: {
  id: ArcadeMode;
  name: string;
  tag: string;
  description: string;
  symbol: string;
}[];
export function makeArcade(mode: ArcadeMode, level?: number): ArcadeConfig;
export function arcadeScore(config: ArcadeConfig, answers: number[]): number;
export function publicArcade(config: ArcadeConfig): ArcadeConfig;
