export type ArcadeMode =
  | "math"
  | "order"
  | "odd"
  | "sequence"
  | "colors"
  | "timer"
  | "reflex"
  | "aim"
  | "memory";
export type ArcadeConfig = {
  mode: ArcadeMode;
  difficulty: number;
  seconds: number;
  rulesVersion: number;
  rounds: {
    targetMs?: number;
    toleranceMs?: number;
    hideAfterMs?: number | null;
    waitMs?: number;
    sequence?: number[];
    flashMs?: number;
    x?: number;
    y?: number;
    radius?: number;
    spawnMs?: number;
    visMs?: number;
    explanation?: string;
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
export function makeArcade(
  mode: ArcadeMode,
  level?: number,
  random?: () => number,
): ArcadeConfig;
export function arcadeScore(config: ArcadeConfig, answers: number[]): number;
export function publicArcade(config: ArcadeConfig): ArcadeConfig;
export function performanceLabel(score: number): string;
export function resultDetails(
  config: ArcadeConfig,
  answers: number[],
): string[];
export function minimumAttemptMs(
  config: ArcadeConfig,
  answers: number[],
): number;
