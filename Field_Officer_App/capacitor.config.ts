import type {CapacitorConfig} from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'za.solplaatje.led.field',
  appName: 'LED Field Visits',
  webDir: 'dist',
  android: {allowMixedContent: false},
  server: {androidScheme: 'https', cleartext: false},
};

export default config;
