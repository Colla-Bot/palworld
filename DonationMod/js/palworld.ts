import { apiBaseUrl, apiPassword } from "./config.json";

export interface Player {
  name: string;
  accountName: string;
  playerId: string;
  userId: string;
  ip: string;
  ping: number;
  location_x: number;
  location_y: number;
  level: number;
  building_count: number;
}

interface Metrics {
  serverfps: number;
  currentplayernum: number;
  serverframetime: number;
  maxplayernum: number;
  uptime: number;
  days: number;
}

interface Players {
  players: Player[];
}

interface BanRequest {
  userid: string;
}

interface ShutdownRequest {
  waittime: number;
}

interface Message {
  message: string;
}

export async function fetchPalworld(path: "/metrics"): Promise<Metrics>;
export async function fetchPalworld(path: "/players"): Promise<Players>;
export async function fetchPalworld(
  path: "/ban",
  body: BanRequest & Message
): Promise<string>;
export async function fetchPalworld(
  path: "/unban",
  body: BanRequest
): Promise<string>;
export async function fetchPalworld(
  path: "/announce",
  body: Message
): Promise<string>;
export async function fetchPalworld(
  path: "/shutdown",
  body: ShutdownRequest & Message
): Promise<string>;
export async function fetchPalworld(path: string, body?: any): Promise<any> {
  const res = await fetch(`${apiBaseUrl}${path}`, {
    method: body == null ? "GET" : "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`admin:${apiPassword}`).toString(
        "base64"
      )}`,
      ...(body != null ? { "Content-Type": "application/json" } : {}),
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`REST API responded with ${res.status}`);
  }
  return body == null ? res.json() : res.text();
}
