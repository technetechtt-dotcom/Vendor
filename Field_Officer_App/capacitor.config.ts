import type {CapacitorConfig} from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'za.solplaatje.led.field',
  appName: 'LED Field Visits',
  webDir: 'dist',
  android: {allowMixedContent: true},
  server: {androidScheme: 'https', cleartext: true},
};

export default config;
