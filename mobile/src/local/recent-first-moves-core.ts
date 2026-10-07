import type { LocalWorkspaceOwner } from "./repository-core.ts";

export const RECENT_FIRST_MOVE_TEMPLATE_LIMIT = 8;
export const RECENT_FIRST_MOVE_TEMPLATE_KEY_PREFIX =
  "first-move:mobile:recent-template-ids:v1:";

export interface RecentTemplateStore {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}

export interface RecentFirstMoveRepository {
  load(owner: LocalWorkspaceOwner): Promise<string[]>;
  chooseAndRemember<T extends { id: string }>(
    owner: LocalWorkspaceOwner,
    choose: (recentTemplateIds: readonly string[]) => T,
  ): Promise<T>;
}

interface RecentTemplateEnvelope {
  version: 1;
  ids: string[];
}

export function createRecentFirstMoveRepository(
  store: RecentTemplateStore,
): RecentFirstMoveRepository {
  const queues = new Map<string, Promise<void>>();

  async function load(owner: LocalWorkspaceOwner): Promise<string[]> {
    const key = recentFirstMoveTemplateKey(owner);
    await (queues.get(key) ?? Promise.resolve());
    return loadDirect(key);
  }

  async function loadDirect(key: string): Promise<string[]> {
    try {
      const value = parseJson(await store.getItem(key));
      if (!isRecord(value) || value.version !== 1 || !Array.isArray(value.ids)) {
        return [];
      }
      return normalizeRecentTemplateIds(value.ids);
    } catch {
      return [];
    }
  }

  async function chooseAndRemember<T extends { id: string }>(
    owner: LocalWorkspaceOwner,
    choose: (recentTemplateIds: readonly string[]) => T,
  ): Promise<T> {
    const key = recentFirstMoveTemplateKey(owner);
    const previous = queues.get(key) ?? Promise.resolve();
    let selected: T | undefined;
    const mutation = previous.then(async () => {
      const current = await loadDirect(key);
      selected = choose(current);
      const envelope: RecentTemplateEnvelope = {
        version: 1,
        ids: rememberRecentTemplate(current, selected.id),
      };
      try {
        await store.setItem(key, JSON.stringify(envelope));
      } catch {
        // Cosmetic repeat avoidance must never block an offline suggestion.
      }
    });
    queues.set(
      key,
      mutation.then(
        () => undefined,
        () => undefined,
      ),
    );
    await mutation;
    if (!selected) selected = choose([]);
    return selected;
  }

  return { load, chooseAndRemember };
}

export function recentFirstMoveTemplateKey(
  owner: LocalWorkspaceOwner,
): string {
  return owner.kind === "guest"
    ? `${RECENT_FIRST_MOVE_TEMPLATE_KEY_PREFIX}guest`
    : `${RECENT_FIRST_MOVE_TEMPLATE_KEY_PREFIX}account:${owner.userId}`;
}

export function rememberRecentTemplate(
  recentTemplateIds: readonly string[],
  templateId: string,
): string[] {
  return normalizeRecentTemplateIds([
    templateId,
    ...recentTemplateIds.filter((candidate) => candidate !== templateId),
  ]);
}

function normalizeRecentTemplateIds(value: readonly unknown[]): string[] {
  const normalized: string[] = [];
  for (const candidate of value) {
    if (
      typeof candidate === "string" &&
      candidate.length > 0 &&
      !normalized.includes(candidate)
    ) {
      normalized.push(candidate);
    }
    if (normalized.length === RECENT_FIRST_MOVE_TEMPLATE_LIMIT) break;
  }
  return normalized;
}

function parseJson(value: string | null): unknown {
  if (value === null) return undefined;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return undefined;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
