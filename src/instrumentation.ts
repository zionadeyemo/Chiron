// Runs once when the server starts. A Vercel deployment without Supabase configured refuses to
// start rather than writing to a disk that doesn't persist (DECISIONS D16).
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { assertStorageConfigured } = await import("./lib/db");
    assertStorageConfigured();
  }
}
