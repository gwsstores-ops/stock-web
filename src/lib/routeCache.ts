type CacheEntry<T> = { value: T; expiresAt: number };

const store = new Map<string, CacheEntry<unknown>>();

export async function cached<T>(
  key: string,
  ttlMs: number,
  load: () => Promise<T>
): Promise<T> {
  const hit = store.get(key);

  if (hit && hit.expiresAt > Date.now()) {
    return hit.value as T;
  }

  const value = await load();
  store.set(key, { value, expiresAt: Date.now() + ttlMs });
  return value;
}
