const UUID_V4_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

interface CryptoLike {
  randomUUID?(): string;
  getRandomValues?(values: Uint8Array): Uint8Array;
}

export function createUuidV4(): string {
  const cryptoValue = (globalThis as typeof globalThis & { crypto?: CryptoLike })
    .crypto;
  const nativeUuid = cryptoValue?.randomUUID?.();
  if (nativeUuid && UUID_V4_PATTERN.test(nativeUuid)) return nativeUuid;

  const bytes = new Uint8Array(16);
  if (cryptoValue?.getRandomValues) {
    cryptoValue.getRandomValues(bytes);
  } else {
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256);
    }
  }
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;

  const hex = [...bytes].map((value) => value.toString(16).padStart(2, "0"));
  return [
    hex.slice(0, 4).join(""),
    hex.slice(4, 6).join(""),
    hex.slice(6, 8).join(""),
    hex.slice(8, 10).join(""),
    hex.slice(10, 16).join(""),
  ].join("-");
}

export function isUuidV4(value: string): boolean {
  return UUID_V4_PATTERN.test(value);
}
