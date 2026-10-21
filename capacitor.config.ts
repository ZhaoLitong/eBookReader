import type { CapacitorConfig } from '@capacitor/cli';
const config: CapacitorConfig = {
  appId: 'com.epubreader.app', appName: 'EPUB Reader', webDir: 'dist',
  android: { allowMixedContent: false },
};
export default config;
