type Level = "debug" | "info" | "warn" | "error";
const order: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };
const min = order[(process.env.LOG_LEVEL as Level) ?? "info"] ?? order.info;

function write(level: Level, msg: string, extra?: Record<string, unknown>) {
  if (order[level] < min) return;
  const line = `${new Date().toISOString()} ${level.toUpperCase().padEnd(5)} ${msg}${
    extra && Object.keys(extra).length ? " " + JSON.stringify(extra) : ""
  }`;
  (level === "error" || level === "warn" ? console.error : console.log)(line);
}

export const log = {
  debug: (m: string, e?: Record<string, unknown>) => write("debug", m, e),
  info: (m: string, e?: Record<string, unknown>) => write("info", m, e),
  warn: (m: string, e?: Record<string, unknown>) => write("warn", m, e),
  error: (m: string, e?: Record<string, unknown>) => write("error", m, e),
};
