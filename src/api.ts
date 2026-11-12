export type Summary = {
  statement: string;
  items: { label: string; value: string }[];
  questions: string[];
  ruleVersion: string;
};
export type Intake = {
  id: string;
  answers: Record<string, string | string[]>;
  mode: "simple" | "detailed";
  revision: number;
  status: string;
  stage: string;
  source: string;
  actor: string;
  created: string;
  updated: string;
  submissions: {
    id: string;
    version: number;
    answers: Record<string, string | string[]>;
    mode: string;
    actor: string;
    created: string;
  }[];
  notes?: { id: string; body: string; actor: string; created: string }[];
  summary?: Summary;
};
let csrf = "";
export const setCsrf = (v: string) => {
  csrf = v;
};
export async function api<T>(
  url: string,
  options: { method?: string; body?: unknown; capability?: string } = {},
): Promise<T> {
  const r = await fetch(url, {
    method: options.method ?? "GET",
    credentials: "same-origin",
    headers: {
      ...(options.body !== undefined
        ? { "Content-Type": "application/json" }
        : {}),
      ...(csrf ? { "X-CSRF-Token": csrf } : {}),
      ...(options.capability
        ? { Authorization: "Bearer " + options.capability }
        : {}),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  if (!r.ok) {
    let msg = "请求失败，请保留当前内容后重试";
    try {
      msg = (await r.json()).error ?? msg;
    } catch {}
    throw new Error(msg);
  }
  return r.json();
}
export async function download(url: string, name: string) {
  const r = await fetch(url, { credentials: "same-origin" });
  if (!r.ok) {
    let message = "导出失败，请确认登录状态";
    try {
      message = (await r.json()).error ?? message;
    } catch {}
    throw new Error(message);
  }
  const blob = await r.blob(),
    u = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = u;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(u), 1000);
}
export const key = () => {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
};
