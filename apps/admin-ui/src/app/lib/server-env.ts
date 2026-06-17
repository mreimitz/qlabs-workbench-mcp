const requiredEnv = (name: string) => {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
};

const envFlag = (value: string | undefined, fallback = false) => {
  if (!value) return fallback;
  return /^(1|true|yes|on)$/i.test(value);
};

export const getServerEnv = () => ({
  controlApiUrl: requiredEnv("CONTROL_API_URL"),
  storageApiUrl: requiredEnv("STORAGE_API_URL"),
  assetsApiUrl: requiredEnv("ASSETS_API_URL"),
  enableQpsToolkit: envFlag(process.env.ENABLE_QPS_TOOLKIT, false),
});
