import type { CapacitorConfig } from '@capacitor/cli';

// SLASH_NATIVE_LOCAL=1 is for trying the Android app against the Firebase
// emulators on this computer, which only speak plain http.
const local = process.env.SLASH_NATIVE_LOCAL === '1';

const config: CapacitorConfig = {
  appId: 'com.slashconnect.app',
  appName: 'SlashConnect',
  webDir: 'dist-native',
  backgroundColor: '#fff1ea',
  server: local ? { androidScheme: 'http', cleartext: true } : undefined,
  plugins: {
    SystemBars: { style: 'LIGHT' },
    LocalNotifications: { smallIcon: 'ic_stat_slash', iconColor: '#FF5A7A' },
  },
};

export default config;
