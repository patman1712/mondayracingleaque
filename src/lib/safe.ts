export async function safeArray<T>(promise: Promise<T[]>) {
  try {
    return await promise;
  } catch {
    return [] as T[];
  }
}
