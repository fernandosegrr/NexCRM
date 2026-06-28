export async function register() {
  // Solo en el runtime de Node.js (no en Edge, no en build workers).
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startScheduler } = await import("./lib/scheduler");
    startScheduler();
  }
}
