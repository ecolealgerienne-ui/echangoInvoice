export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`[FATAL] Missing environment variable: ${name}`);
  return value;
}
