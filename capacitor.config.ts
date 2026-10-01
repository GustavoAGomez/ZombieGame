import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'es.garajedeideas.zombies',
  appName: 'Zombies',
  webDir: 'dist',
  backgroundColor: '#0f0e0c',
  plugins: {
    // Status bar and home indicator / navigation bar hidden from the start
    // (spec 01 §7). Android's immersive mode and iOS's edge gestures are in
    // MainActivity.java and ViewController.swift.
    SystemBars: { hidden: true },
  },
};

export default config;
