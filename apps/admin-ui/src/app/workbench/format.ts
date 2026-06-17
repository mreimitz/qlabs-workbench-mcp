const dateTimeFormatter = new Intl.DateTimeFormat("en-US", {
  day: "2-digit",
  hour: "2-digit",
  hour12: false,
  minute: "2-digit",
  month: "short",
  timeZone: "UTC",
});

export const formatLatency = (latencyMs: number | null) => {
  if (latencyMs === null) return "n/a";
  if (latencyMs < 1000) return `${latencyMs} ms`;
  return `${(latencyMs / 1000).toFixed(1)} s`;
};

export const formatDateTime = (value: string) => dateTimeFormatter.format(new Date(value));

export const formatFileTimestamp = (value: number) => dateTimeFormatter.format(new Date(value));

export const prettyJson = (value: unknown) => JSON.stringify(value ?? {}, null, 2);
