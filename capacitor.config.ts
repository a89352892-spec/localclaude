import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'ai.lc.com',
  appName: 'LC Mobile',
  webDir: 'dist',
  server: {
    androidScheme: 'https'
  }
};

export default config;
