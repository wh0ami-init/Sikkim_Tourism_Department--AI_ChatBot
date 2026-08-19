/**
 * API client for the Sikkim Tourism Assistant backend.
 *
 * All paths use a relative `/api` base so they work in both dev (Vite proxies
 * `/api` → `localhost:8000`) and production (same-origin deployment).
 *
 * Naming convention:
 *  - `Raw*` interfaces reflect the Python/snake_case shape from the backend.
 *  - Public exported interfaces use camelCase for comfortable use in React.
 *  - Mapper functions (`map*`) translate Raw → public at the boundary.
 */

const BASE = "/api";

export function encodeBasicCredentials(username: string, password: string): string {
  const bytes = new TextEncoder().encode(`${username}:${password}`);
  return btoa(String.fromCharCode(...bytes));
}

/**
 * Generic fetch wrapper.
 *  - Throws a descriptive Error on any non-2xx response.
 *  - Accepts an optional AbortSignal so callers can cancel stale requests.
 */
async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    // Keep JSON content type when a call also supplies an auth header.
    // (The old order let `options.headers` replace this entire object.)
    headers: { "Content-Type": "application/json", ...options?.headers },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    let detail = text;
    try {
      const body = JSON.parse(text) as { detail?: unknown };
      if (typeof body.detail === "string") detail = body.detail;
      else if (Array.isArray(body.detail)) {
        detail = body.detail
          .map((item) => typeof item === "object" && item && "msg" in item ? String(item.msg) : String(item))
          .join(" ");
      }
    } catch { /* Non-JSON error responses retain their text. */ }
    throw new Error(`API error ${res.status}: ${detail || res.statusText}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

async function adminFetch<T>(
  path: string,
  encodedCredentials: string,
  options?: RequestInit,
): Promise<T> {
  return apiFetch<T>(`/admin${path}`, {
    ...options,
    headers: { Authorization: `Basic ${encodedCredentials}`, ...options?.headers },
  });
}

export interface AdminAuthStatus { setup_required: boolean }
export interface AdminAuthResult { status: string }

export function getAdminAuthStatus(): Promise<AdminAuthStatus> {
  return apiFetch<AdminAuthStatus>("/admin/auth/status");
}

export function loginAdmin(username: string, password: string): Promise<AdminAuthResult> {
  return apiFetch<AdminAuthResult>("/admin/auth/login", {
    method: "POST", body: JSON.stringify({ username, password }),
  });
}

export function setupAdmin(
  username: string, password: string, setupKey: string,
): Promise<AdminAuthResult> {
  return apiFetch<AdminAuthResult>("/admin/auth/setup", {
    method: "POST", body: JSON.stringify({ username, password }),
    headers: { "X-Admin-Key": setupKey },
  });
}

export function changeAdminCredentials(
  encodedCredentials: string, currentPassword: string, newUsername: string, newPassword: string,
): Promise<AdminAuthResult> {
  return adminFetch<AdminAuthResult>("/auth/change-credentials", encodedCredentials, {
    method: "POST", body: JSON.stringify({
      current_password: currentPassword, new_username: newUsername, new_password: newPassword,
    }),
  });
}

// ── Public TypeScript types (camelCase — used by components) ─────────────────

export interface Destination {
  id: number;
  name: string;
  slug: string;
  category: string;
  district: string;
  description: string;
  location: string;
  bestTimeToVisit: string;
  entryFee: string | null;
  /** Human-readable permits string, e.g. "Required" or the full permit_info. */
  permitsRequired: string;
  howToReach: string;
  highlights: string[];
  tags: string[];
  imageUrl: string | null;
  /** Hex colour used as a CSS background fallback when no image is available. */
  imagePlaceholder: string;
  /** Decimal latitude — used by useWeather hook for live weather fetching. */
  latitude: number | null;
  /** Decimal longitude — used by useWeather hook for live weather fetching. */
  longitude: number | null;
}

export interface DestinationSummary {
  id: number;
  name: string;
  slug: string;
  category: string;
  district: string;
  description: string;
  bestTimeToVisit: string;
  permitsRequired: string;
  tags: string[];
  imageUrl: string | null;
  imagePlaceholder: string;
  latitude: number | null;
  longitude: number | null;
}

export interface AdminDestination extends RawDestination {}

export type DestinationWrite = Omit<RawDestination, "id">;

export interface Circular {
  id: number;
  title: string;
  category: "road_status" | "cancellation_order" | "tender";
  district: string | null;
  issue_date: string;
  source_url: string;
  extracted_text: string;
  ingested_at: string;
  has_file: boolean;
}

/** Small, safe public projection of an official circular. */
export interface Advisory {
  id: number;
  title: string;
  category: "road_status" | "cancellation_order" | "tender";
  district: string | null;
  issue_date: string;
  source_url: string;
  has_file: boolean;
}

export interface AdminDashboard {
  destination_count: number;
  recent_circulars: Circular[];
  travel_agency_count: number;
  db_mode: string;
  qdrant_mode: string;
}

export interface Conversation {
  id: string;
  createdAt: string;
  title?: string;
}

export interface Message {
  id: string;
  conversationId: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
  suggestions?: string[];
  /**
   * Frontend-only: data-URL of an image the user attached to this message.
   * Never sent to or received from the backend — used only to render the
   * image thumbnail inside the user bubble without a round-trip.
   */
  imageDataUrl?: string;
  /** Frontend-only: marks an interrupted streamed response as retryable. */
  retry?: boolean;
  /** Frontend-only id used to make retries idempotent on the backend. */
  clientMessageId?: string;
}

// ── Raw shapes (backend snake_case) ──────────────────────────────────────────
// Explicit interfaces prevent silently accepting wrong field names and remove
// the need for `any` in mapper functions.

interface RawDestination {
  id: number;
  name: string;
  slug: string;
  category: string;
  district: string;
  description: string;
  location: string;
  altitude: string | null;
  best_time: string;
  entry_fee: string | null;
  permit_required: boolean;
  permit_info: string | null;
  how_to_reach: string;
  highlights: string[];
  tags: string[];
  image_url: string | null;
  image_placeholder: string;
  latitude: number | null;
  longitude: number | null;
}

interface RawDestinationSummary {
  id: number;
  name: string;
  slug: string;
  category: string;
  district: string;
  description: string;
  best_time: string;
  permit_required: boolean;
  tags: string[];
  image_url: string | null;
  image_placeholder: string;
  latitude: number | null;
  longitude: number | null;
}

interface RawConversation {
  id: string;
  created_at: string;
  title?: string;
}

interface RawMessage {
  id: string;
  conversation_id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
  client_message_id?: string | null;
}

export function fetchAdvisories(
  category: Advisory["category"],
  signal?: AbortSignal,
): Promise<Advisory[]> {
  return apiFetch<Advisory[]>(`/destinations/advisories?category=${category}&limit=100`, { signal });
}

export const advisoryFileUrl = (id: number) => `/api/destinations/advisories/${id}/file`;

// ── Mappers (backend snake_case → frontend camelCase) ────────────────────────

function mapDestination(d: RawDestination): Destination {
  return {
    id: d.id,
    name: d.name,
    slug: d.slug,
    category: d.category,
    district: d.district,
    description: d.description,
    location: d.location,
    bestTimeToVisit: d.best_time,
    entryFee: d.entry_fee ?? null,
    permitsRequired: d.permit_required
        ? (d.permit_info ?? "Required")
        : "Not required",
    howToReach: d.how_to_reach,
    highlights: d.highlights ?? [],
    tags: d.tags ?? [],
    imageUrl: d.image_url ?? null,
    imagePlaceholder: d.image_placeholder ?? "#6b7280",
    latitude: d.latitude ?? null,
    longitude: d.longitude ?? null,
  };
}

function mapDestinationSummary(d: RawDestinationSummary): DestinationSummary {
  return {
    id: d.id,
    name: d.name,
    slug: d.slug,
    category: d.category,
    district: d.district,
    description: d.description,
    bestTimeToVisit: d.best_time,
    permitsRequired: d.permit_required ? "Required" : "Not required",
    tags: d.tags ?? [],
    imageUrl: d.image_url ?? null,
    imagePlaceholder: d.image_placeholder ?? "#6b7280",
    latitude: d.latitude ?? null,
    longitude: d.longitude ?? null,
  };
}

function mapConversation(c: RawConversation): Conversation {
  return { id: c.id, createdAt: c.created_at, title: c.title };
}

function mapMessage(m: RawMessage): Message {
  return {
    id: m.id,
    conversationId: m.conversation_id,
    role: m.role,
    content: m.content,
    createdAt: m.created_at,
    clientMessageId: m.client_message_id ?? undefined,
  };
}

// ── Destinations ──────────────────────────────────────────────────────────────

/**
 * Fetch destination summary cards with optional filters.
 *
 * @param search   Free-text search query.
 * @param category Category slug (e.g. "nature", "adventure").
 * @param signal   AbortSignal — pass one to cancel a stale in-flight request.
 *                 The caller should catch AbortError and ignore it.
 */
export async function fetchDestinations(
    search?: string,
    category?: string,
    signal?: AbortSignal,
): Promise<DestinationSummary[]> {
  const params = new URLSearchParams();
  if (search) params.set("search", search);
  if (category && category !== "all") params.set("category", category);
  const q = params.toString();
  const res = await apiFetch<{ destinations: RawDestinationSummary[]; total: number }>(
      `/destinations${q ? "?" + q : ""}`,
      { signal },
  );
  // Guard against a missing or malformed destinations array
  return (res.destinations ?? []).map(mapDestinationSummary);
}

export async function fetchDestination(id: number): Promise<Destination> {
  const res = await apiFetch<RawDestination>(`/destinations/${id}`);
  return mapDestination(res);
}

export async function fetchCategories(): Promise<string[]> {
  const res = await apiFetch<{ categories: string[] }>("/destinations/categories");
  return res.categories;
}

// ── Protected administration ────────────────────────────────────────────────

export function fetchAdminDashboard(adminKey: string): Promise<AdminDashboard> {
  return adminFetch("/dashboard", adminKey);
}

export function fetchAdminDestinations(adminKey: string): Promise<AdminDestination[]> {
  return adminFetch("/destinations", adminKey);
}

export function saveAdminDestination(
  adminKey: string,
  destination: DestinationWrite,
  id?: number,
): Promise<AdminDestination> {
  return adminFetch(id ? `/destinations/${id}` : "/destinations", adminKey, {
    method: id ? "PUT" : "POST",
    body: JSON.stringify(destination),
  });
}

export async function deleteAdminDestination(adminKey: string, id: number): Promise<void> {
  await adminFetch<void>(`/destinations/${id}`, adminKey, { method: "DELETE" });
}

export function fetchAdminCirculars(adminKey: string): Promise<Circular[]> {
  return adminFetch("/circulars", adminKey);
}

export async function deleteAdminCircular(adminKey: string, id: number): Promise<void> {
  await adminFetch<void>(`/circulars/${id}`, adminKey, { method: "DELETE" });
}

export function runAdminSync(
  adminKey: string,
  type: "destinations" | "circulars",
): Promise<{ status: string; indexed?: number; new?: number; failed?: number }> {
  return adminFetch(type === "destinations" ? "/sync" : "/sync-circulars", adminKey, {
    method: "POST",
  });
}

// ── Conversations ─────────────────────────────────────────────────────────────

export async function createConversation(): Promise<{
  conversation: Conversation;
  messages: Message[];
  accessToken: string;
}> {
  const res = await apiFetch<{
    conversation: RawConversation;
    messages: RawMessage[];
    access_token: string;
  }>("/conversations", { method: "POST" });
  return {
    conversation: mapConversation(res.conversation),
    messages: (res.messages ?? []).map(mapMessage),
    accessToken: res.access_token,
  };
}

export async function fetchConversation(id: string, accessToken: string): Promise<{
  conversation: Conversation;
  messages: Message[];
}> {
  const res = await apiFetch<{
    conversation: RawConversation;
    messages: RawMessage[];
  }>(`/conversations/${id}`, {
    headers: { "X-Conversation-Token": accessToken },
  });
  return {
    conversation: mapConversation(res.conversation),
    messages: (res.messages ?? []).map(mapMessage),
  };
}

export { apiFetch };
