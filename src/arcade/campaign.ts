import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";
import { CampaignProgress, mergeCampaign } from "../../shared/progression.mjs";
import { modes } from "../../shared/arcade.mjs";
import { captureSession } from "../api";
const key = (mode: string, uid?: string) =>
  uid ? `duelou.campaign.v3.${uid}.${mode}` : `duelou.campaign.v2.${mode}`;
const read = (k: string) =>
  Platform.OS === "web"
    ? Promise.resolve(localStorage.getItem(k))
    : SecureStore.getItemAsync(k);
const write = async (k: string, value: string) => {
  if (Platform.OS === "web") localStorage.setItem(k, value);
  else await SecureStore.setItemAsync(k, value);
};
const queues = new Map<string, Promise<unknown>>();
function exclusive<T>(k: string, fn: () => Promise<T>): Promise<T> {
  const next = (queues.get(k) || Promise.resolve()).catch(() => {}).then(fn);
  queues.set(k, next);
  void next
    .finally(() => {
      if (queues.get(k) === next) queues.delete(k);
    })
    .catch(() => {});
  return next;
}
export async function readCampaign(
  mode: string,
  uid?: string,
): Promise<CampaignProgress> {
  const raw = await read(key(mode, uid));
  if (!raw) return { unlocked: 1, best: {} };
  try {
    const data = JSON.parse(raw);
    if (
      !Number.isInteger(data.unlocked) ||
      data.unlocked < 1 ||
      data.unlocked > 30 ||
      !data.best ||
      typeof data.best !== "object"
    )
      throw Error();
    const best: Record<string, number> = {};
    for (const [level, score] of Object.entries(data.best))
      if (
        /^(?:[1-9]|[12][0-9]|30)$/.test(level) &&
        typeof score === "number" &&
        Number.isInteger(score) &&
        score >= 0 &&
        score <= 1000
      )
        best[level] = score;
    return { unlocked: data.unlocked, best };
  } catch {
    return { unlocked: 1, best: {} };
  }
}
export async function saveCampaign(
  mode: string,
  progress: CampaignProgress,
  uid?: string,
): Promise<CampaignProgress> {
  return exclusive(key(mode, uid), async () => {
    const merged = mergeCampaign(await readCampaign(mode, uid), progress);
    await write(key(mode, uid), JSON.stringify(merged));
    return merged;
  });
}
export async function campaignSyncEnabled(uid?: string) {
  return !!uid && (await read(`duelou.campaign.sync.${uid}`)) === "true";
}
export async function setCampaignSync(uid: string, enabled: boolean) {
  await write(`duelou.campaign.sync.${uid}`, String(enabled));
}
export async function syncCampaign(
  mode: string,
  uid: string,
  request = captureSession(),
) {
  const local = await readCampaign(mode, uid);
  const remote = await request<CampaignProgress>(`/v1/campaign/${mode}`, local);
  return saveCampaign(mode, remote, uid);
}
export async function importAndSyncCampaigns(
  uid: string,
  request = captureSession(),
) {
  for (const mode of modes) {
    await saveCampaign(mode.id, await readCampaign(mode.id), uid);
    await syncCampaign(mode.id, uid, request);
  }
}
