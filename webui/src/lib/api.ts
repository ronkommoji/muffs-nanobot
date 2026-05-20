import type {
  ChatSummary,
  ImageGenerationSettingsUpdate,
  ProviderSettingsUpdate,
  SettingsPayload,
  SettingsUpdate,
  SidebarStatePayload,
  SlashCommand,
  WebSearchSettingsUpdate,
  WebuiThreadPersistedPayload,
} from "./types";

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = "ApiError";
  }
}

async function request<T>(
  url: string,
  token: string,
  init?: RequestInit,
): Promise<T> {
  // Pass the nanobot token via ``?token=`` rather than ``Authorization: Bearer``.
  // When nanobot is fronted by a reverse proxy doing HTTP Basic Auth (e.g. Caddy
  // ``basicauth``), an explicit ``Authorization: Bearer`` header overrides the
  // browser's cached Basic creds, the proxy answers 401 + WWW-Authenticate: Basic,
  // and the browser pops the sign-in dialog on every API call.
  const sep = url.includes("?") ? "&" : "?";
  const res = await fetch(`${url}${sep}token=${encodeURIComponent(token)}`, {
    ...(init ?? {}),
    credentials: "same-origin",
  });
  if (!res.ok) {
    throw new ApiError(res.status, `HTTP ${res.status}`);
  }
  return (await res.json()) as T;
}

function splitKey(key: string): { channel: string; chatId: string } {
  const idx = key.indexOf(":");
  if (idx === -1) return { channel: "", chatId: key };
  return { channel: key.slice(0, idx), chatId: key.slice(idx + 1) };
}

export async function listSessions(
  token: string,
  base: string = "",
): Promise<ChatSummary[]> {
  type Row = {
    key: string;
    created_at: string | null;
    updated_at: string | null;
    title?: string;
    preview?: string;
    run_started_at?: number | null;
  };
  const body = await request<{ sessions: Row[] }>(
    `${base}/api/sessions`,
    token,
  );
  return body.sessions.map((s) => ({
    key: s.key,
    ...splitKey(s.key),
    createdAt: s.created_at,
    updatedAt: s.updated_at,
    title: s.title ?? "",
    preview: s.preview ?? "",
    runStartedAt: s.run_started_at ?? null,
  }));
}

/** Disk-backed WebUI display thread snapshot (separate from agent session). */
export async function fetchWebuiThread(
  token: string,
  key: string,
  base: string = "",
): Promise<WebuiThreadPersistedPayload | null> {
  const url = `${base}/api/sessions/${encodeURIComponent(key)}/webui-thread`;
  try {
    return await request<WebuiThreadPersistedPayload>(url, token);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
}

export async function deleteSession(
  token: string,
  key: string,
  base: string = "",
): Promise<boolean> {
  const body = await request<{ deleted: boolean }>(
    `${base}/api/sessions/${encodeURIComponent(key)}/delete`,
    token,
  );
  return body.deleted;
}

// ---------------------------------------------------------------------------
// Dashboard API
// ---------------------------------------------------------------------------

export interface MemoryFiles {
  soul: string;
  user: string;
  memory: string;
}

export async function fetchMemory(
  token: string,
  base: string = "",
): Promise<MemoryFiles> {
  const body = await request<{ files: MemoryFiles }>(`${base}/api/memory`, token);
  return body.files;
}

export async function fetchSystemPrompt(
  token: string,
  base: string = "",
): Promise<string> {
  const body = await request<{ prompt: string }>(`${base}/api/system-prompt`, token);
  return body.prompt;
}

export interface CronSchedule {
  kind: "cron" | "every" | "at";
  expr?: string | null;
  everyMs?: number | null;
  atMs?: number | null;
  tz?: string | null;
}

export interface CronRunRecord {
  runAtMs: number;
  status: string;
  durationMs: number;
  error?: string | null;
}

export interface CronJob {
  id: string;
  name: string;
  enabled: boolean;
  schedule: CronSchedule;
  payload: { message: string; deliver: boolean; channel?: string | null };
  state: {
    nextRunAtMs?: number | null;
    lastRunAtMs?: number | null;
    lastStatus?: string | null;
    lastError?: string | null;
    runHistory: CronRunRecord[];
  };
  createdAtMs: number;
  updatedAtMs: number;
}

export async function fetchCronJobs(
  token: string,
  base: string = "",
): Promise<CronJob[]> {
  const body = await request<{ jobs: CronJob[] }>(`${base}/api/cron/jobs`, token);
  return body.jobs;
}

export async function toggleCronJob(
  token: string,
  jobId: string,
  base: string = "",
): Promise<{ id: string; enabled: boolean }> {
  return request(`${base}/api/cron/jobs/${encodeURIComponent(jobId)}/toggle`, token);
}

export async function runCronJob(
  token: string,
  jobId: string,
  base: string = "",
): Promise<{ id: string; status: string }> {
  return request(`${base}/api/cron/jobs/${encodeURIComponent(jobId)}/run`, token);
}

export async function fetchSettings(
  token: string,
  base: string = "",
): Promise<SettingsPayload> {
  return request<SettingsPayload>(`${base}/api/settings`, token);
}

export async function listSlashCommands(
  token: string,
  base: string = "",
): Promise<SlashCommand[]> {
  type Row = {
    command: string;
    title: string;
    description: string;
    icon: string;
    arg_hint?: string;
  };
  const body = await request<{ commands: Row[] }>(`${base}/api/commands`, token);
  return body.commands
    .filter((command) => !["/stop", "/restart"].includes(command.command))
    .map((command) => ({
      command: command.command,
      title: command.title,
      description: command.description,
      icon: command.icon,
      argHint: command.arg_hint ?? "",
    }));
}

export async function fetchSidebarState(
  token: string,
  base: string = "",
): Promise<SidebarStatePayload> {
  return request<SidebarStatePayload>(`${base}/api/webui/sidebar-state`, token);
}

export async function updateSidebarState(
  token: string,
  state: SidebarStatePayload,
  base: string = "",
): Promise<SidebarStatePayload> {
  const query = new URLSearchParams();
  query.set("state", JSON.stringify(state));
  return request<SidebarStatePayload>(
    `${base}/api/webui/sidebar-state/update?${query}`,
    token,
  );
}

export async function updateSettings(
  token: string,
  update: SettingsUpdate,
  base: string = "",
): Promise<SettingsPayload> {
  const query = new URLSearchParams();
  if (update.modelPreset !== undefined) {
    query.set("model_preset", update.modelPreset ?? "default");
  }
  if (update.model !== undefined) query.set("model", update.model);
  if (update.provider !== undefined) query.set("provider", update.provider);
  if (update.timezone !== undefined) query.set("timezone", update.timezone);
  if (update.botName !== undefined) query.set("bot_name", update.botName);
  if (update.botIcon !== undefined) query.set("bot_icon", update.botIcon);
  if (update.toolHintMaxLength !== undefined) {
    query.set("tool_hint_max_length", String(update.toolHintMaxLength));
  }
  return request<SettingsPayload>(`${base}/api/settings/update?${query}`, token);
}

export async function updateProviderSettings(
  token: string,
  update: ProviderSettingsUpdate,
  base: string = "",
): Promise<SettingsPayload> {
  const query = new URLSearchParams();
  query.set("provider", update.provider);
  if (update.apiKey !== undefined) query.set("api_key", update.apiKey);
  if (update.apiBase !== undefined) query.set("api_base", update.apiBase);
  return request<SettingsPayload>(
    `${base}/api/settings/provider/update?${query}`,
    token,
  );
}

export async function updateWebSearchSettings(
  token: string,
  update: WebSearchSettingsUpdate,
  base: string = "",
): Promise<SettingsPayload> {
  const query = new URLSearchParams();
  query.set("provider", update.provider);
  if (update.apiKey !== undefined) query.set("api_key", update.apiKey);
  if (update.baseUrl !== undefined) query.set("base_url", update.baseUrl);
  if (update.maxResults !== undefined) query.set("max_results", String(update.maxResults));
  if (update.timeout !== undefined) query.set("timeout", String(update.timeout));
  if (update.useJinaReader !== undefined) {
    query.set("use_jina_reader", String(update.useJinaReader));
  }
  return request<SettingsPayload>(
    `${base}/api/settings/web-search/update?${query}`,
    token,
  );
}

export async function updateImageGenerationSettings(
  token: string,
  update: ImageGenerationSettingsUpdate,
  base: string = "",
): Promise<SettingsPayload> {
  const query = new URLSearchParams();
  query.set("enabled", String(update.enabled));
  query.set("provider", update.provider);
  query.set("model", update.model);
  query.set("default_aspect_ratio", update.defaultAspectRatio);
  query.set("default_image_size", update.defaultImageSize);
  query.set("max_images_per_turn", String(update.maxImagesPerTurn));
  return request<SettingsPayload>(
    `${base}/api/settings/image-generation/update?${query}`,
    token,
  );
}
