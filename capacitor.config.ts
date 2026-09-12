import type { CapacitorConfig } from '@capacitor/cli';
const config: CapacitorConfig = {
  appId: 'app.runandlocal.mobile',
  appName: '런앤로컬',
  webDir: 'mobile-dist',
  backgroundColor: '#f8faf7',
  ios: { contentInset: 'never' },
  android: { backgroundColor: '#f8faf7' },
};
export default config;
