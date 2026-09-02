import type { SupportedStorage } from "@supabase/supabase-js";

const MANIFEST_VERSION = 1;
const CHUNK_SIZE = 500;

export interface SecureKeyValueStore {
  getItemAsync(key: string): Promise<string | null>;
  setItemAsync(key: string, value: string): Promise<void>;
  deleteItemAsync(key: string): Promise<void>;
}

interface ChunkManifest {
  version: 1;
  generation: string;
  chunks: number;
}

let generationCounter = 0;

export function createChunkedSecureStorage(
  store: SecureKeyValueStore,
  nextGeneration: () => string = () => {
    generationCounter += 1;
    return `${Date.now().toString(36)}-${generationCounter.toString(36)}`;
  },
): SupportedStorage {
  return {
    async getItem(key) {
      const raw = await store.getItemAsync(key);
      if (raw === null) return null;
      const manifest = parseManifest(raw);
      if (!manifest) return raw;

      const chunks = await Promise.all(
        Array.from({ length: manifest.chunks }, (_, index) =>
          store.getItemAsync(chunkKey(key, manifest.generation, index)),
        ),
      );
      return chunks.some((chunk) => chunk === null) ? null : chunks.join("");
    },

    async setItem(key, value) {
      const previousRaw = await store.getItemAsync(key);
      const previousManifest = previousRaw ? parseManifest(previousRaw) : undefined;
      const generation = safeGeneration(nextGeneration());
      const chunks = splitForSecureStore(value);
      const manifest: ChunkManifest = {
        version: MANIFEST_VERSION,
        generation,
        chunks: chunks.length,
      };

      await Promise.all(
        chunks.map((chunk, index) =>
          store.setItemAsync(chunkKey(key, generation, index), chunk),
        ),
      );
      await store.setItemAsync(key, JSON.stringify(manifest));
      if (previousManifest) await removeChunks(store, key, previousManifest);
    },

    async removeItem(key) {
      const raw = await store.getItemAsync(key);
      const manifest = raw ? parseManifest(raw) : undefined;
      await store.deleteItemAsync(key);
      if (manifest) await removeChunks(store, key, manifest);
    },
  };
}

function splitForSecureStore(value: string): string[] {
  if (!value) return [""];
  const chunks: string[] = [];
  let offset = 0;
  while (offset < value.length) {
    let end = Math.min(offset + CHUNK_SIZE, value.length);
    const finalCodeUnit = value.charCodeAt(end - 1);
    if (end < value.length && finalCodeUnit >= 0xd800 && finalCodeUnit <= 0xdbff) end -= 1;
    chunks.push(value.slice(offset, end));
    offset = end;
  }
  return chunks;
}

function parseManifest(value: string): ChunkManifest | undefined {
  try {
    const parsed: unknown = JSON.parse(value);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "version" in parsed &&
      parsed.version === MANIFEST_VERSION &&
      "generation" in parsed &&
      typeof parsed.generation === "string" &&
      "chunks" in parsed &&
      typeof parsed.chunks === "number" &&
      Number.isInteger(parsed.chunks) &&
      parsed.chunks > 0
    ) {
      return parsed as ChunkManifest;
    }
  } catch {
    // A plain legacy value is still a valid Supabase storage value.
  }
  return undefined;
}

async function removeChunks(
  store: SecureKeyValueStore,
  key: string,
  manifest: ChunkManifest,
): Promise<void> {
  await Promise.all(
    Array.from({ length: manifest.chunks }, (_, index) =>
      store.deleteItemAsync(chunkKey(key, manifest.generation, index)),
    ),
  );
}

function chunkKey(key: string, generation: string, index: number): string {
  return `${key}.${generation}.${index}`;
}

function safeGeneration(value: string): string {
  const generation = value.replace(/[^A-Za-z0-9._-]/g, "-").slice(0, 80);
  if (!generation) throw new Error("Secure storage generation is invalid.");
  return generation;
}
