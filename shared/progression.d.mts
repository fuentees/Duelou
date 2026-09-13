export type CampaignProgress = {
  unlocked: number;
  best: Record<string, number>;
};
export const chapterNames: string[];
export function chapterFor(
  mode: string,
  level: number,
): { number: number; name: string; lesson: string; mastery: boolean };
export function starsFor(score: number, mode?: string, level?: number): number;
export function recordProgress(
  progress: CampaignProgress,
  level: number,
  score: number,
  mode?: string,
): CampaignProgress;
export function ratingName(rating: number): string;
export function ratingChange(
  a: number,
  b: number,
  outcome: number,
  played: number,
): number;
export function dailyRandom(date: string): () => number;

export function campaignGoals(
  mode?: string,
  level?: number,
): { clear: number; excellent: number };
export function mergeCampaign(
  a: CampaignProgress,
  b: CampaignProgress,
): CampaignProgress;
