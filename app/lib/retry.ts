export async function withRetry<T>(
  operation: () => Promise<T>,
  attempts = 3,
  delayMs = 500,
  timeoutMs = 30_000
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      return await Promise.race([
        operation(),
        new Promise<never>((_, reject) => {
          window.setTimeout(
            () => reject(new Error("Firebase の応答がタイムアウトしました")),
            timeoutMs
          );
        }),
      ]);
    } catch (error) {
      lastError = error;
      if (attempt < attempts - 1) {
        await new Promise((resolve) => window.setTimeout(resolve, delayMs * (attempt + 1)));
      }
    }
  }

  throw lastError;
}