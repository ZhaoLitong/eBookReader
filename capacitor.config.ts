import type { CapacitorConfig } from '@capacitor/cli';
const config: CapacitorConfig = {
  appId: 'com.epubreader.app', appName: 'eBook Reader', webDir: 'dist',
  android: { allowMixedContent: false },
};
export default config;
