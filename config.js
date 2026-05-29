// /new — Standalone Production Runtime
// config.js — V2 configuration. No external dependencies.

const V2_CONFIG = {
  baseUrl: 'https://teffdegicyfdowveqqvw.supabase.co/rest/v1',
  apiKey: 'sb_publishable_LjwmfFbqsPz35tnUB0IddA_jLXPFZR6',
  appName: 'متجر الأهرام للتجارة والتوزيع',
  supportWhatsapp: '201040880002',
  pwa: {
    swPath: './sw.js',
    manifestPath: './manifest.webmanifest',
    installPromptDelay: 30000,
    promptCooldownDays: 7,
    maxDismissals: 3,
  },
};

export function readConfig() {
  return { ...V2_CONFIG };
}
