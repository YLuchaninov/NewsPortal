import { readdirSync } from "node:fs";
import { join } from "node:path";

export function listFilesRecursive(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = join(dir, entry.name);
    return entry.isDirectory() ? listFilesRecursive(fullPath) : [fullPath];
  });
}

export function withAppSecret<T>(secret: string, callback: () => T): T {
  const previous = process.env.APP_SECRET;
  process.env.APP_SECRET = secret;
  const restore = () => {
    if (previous == null) {
      delete process.env.APP_SECRET;
    } else {
      process.env.APP_SECRET = previous;
    }
  };
  try {
    const result = callback();
    if (result instanceof Promise) {
      return result.finally(restore) as T;
    }
    restore();
    return result;
  } catch (error) {
    restore();
    throw error;
  }
}
