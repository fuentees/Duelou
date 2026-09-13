import { Platform, NativeModules } from "react-native";
import * as SecureStore from "expo-secure-store";
const source = NativeModules.SourceCode?.scriptURL as string | undefined;
const host = source?.match(/^https?:\/\/([^/:]+)/)?.[1] || "localhost";
export const API_URL =
  process.env.EXPO_PUBLIC_API_URL ||
  "http://" +
    (Platform.OS === "web" ? globalThis.location.hostname : host) +
    ":3001";
// Mesmo host/porta do API_URL, só trocando o esquema — usado pelo socket
// da Arena Rush online (src/arena/useArenaSocket.ts). Não dá pra reaproveitar
// API_URL com fetch() pra isso: WebSocket precisa do próprio protocolo.
export const WS_URL =
  process.env.EXPO_PUBLIC_WS_URL || API_URL.replace(/^http/, "ws");
let token = "";
const key = "duelou.session.v1";
export async function restore() {
  token =
    Platform.OS === "web"
      ? sessionStorage.getItem(key) || ""
      : (await SecureStore.getItemAsync(key)) || "";
  return !!token;
}
export async function remember(value: string) {
  token = value;
  if (Platform.OS === "web") sessionStorage.setItem(key, value);
  else await SecureStore.setItemAsync(key, value);
}
export async function forget() {
  token = "";
  if (Platform.OS === "web") sessionStorage.removeItem(key);
  else await SecureStore.deleteItemAsync(key);
}
export async function api<T = any>(
  path: string,
  body?: unknown,
  method?: string,
  sessionToken = token,
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(API_URL + path, {
      method: method || (body === undefined ? "GET" : "POST"),
      headers: {
        "Content-Type": "application/json",
        ...(sessionToken ? { Authorization: "Bearer " + sessionToken } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
    const data = await response.json();
    if (!response.ok) throw Error(data.error || "Falha na solicitação");
    return data;
  } catch (e) {
    if (
      e instanceof Error &&
      (e.name === "AbortError" ||
        e.message === "Network request failed" ||
        e.message === "Failed to fetch")
    )
      throw Error(
        "Não foi possível alcançar o servidor. Verifique a conexão e o endereço da API.",
      );
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

// Token da sessão atual, pra montar a URL do WebSocket (que não tem como
// mandar um header Authorization no handshake, diferente de fetch()).
export function getSessionToken() {
  return token;
}

// Vincula sincronizações à sessão original, mesmo se o usuário trocar de conta.
export function captureSession() {
  const sessionToken = token;
  return <T = any>(path: string, body?: unknown, method?: string) =>
    api<T>(path, body, method, sessionToken);
}
