const envOrDefault = (name: string, fallback: string) => {
  const value = process.env[name];
  return value && value.length > 0 ? value : fallback;
};

const envFlag = (value: string | undefined, fallback = false) => {
  if (!value) return fallback;
  return /^(1|true|yes|on)$/i.test(value);
};

export const getServerEnv = () => ({
  controlApiUrl: envOrDefault("CONTROL_API_URL", "http://localhost:4000"),
  storageApiUrl: envOrDefault("STORAGE_API_URL", "http://localhost:4100"),
  assetsApiUrl: envOrDefault("ASSETS_API_URL", "http://localhost:7040"),
  enableQpsToolkit: envFlag(process.env.ENABLE_QPS_TOOLKIT, false),
  qpsToolkitApiUrl: process.env.QPS_TOOLKIT_API_URL ?? "http://localhost:7050",
});
