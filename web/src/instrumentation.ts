/** Runs once when the server starts: load the Head Manager's lists and settings before the first page. */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { loadLists } = await import("./lib/lists-server");
  await loadLists().catch((e) => console.error("Could not load settings lists yet:", e instanceof Error ? e.message : e));
}
