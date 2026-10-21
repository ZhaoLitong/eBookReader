import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';

export function registerOffline() {
  if (!import.meta.env.PROD || Capacitor.isNativePlatform() || !('serviceWorker' in navigator)) return;
  void navigator.serviceWorker.register('/sw.js').catch(() => { /* Library still works; offline shell needs a later successful install. */ });
}
export async function registerPlatform() {
  if (!Capacitor.isNativePlatform()) return () => {};
  const back = await App.addListener('backButton', () => {
    const handled = !window.dispatchEvent(new Event('reader:back', { cancelable: true }));
    if (!handled) void App.exitApp();
  });
  const state = await App.addListener('appStateChange', ({ isActive }) => {
    if (!isActive) window.dispatchEvent(new Event('reader:inactive'));
  });
  return () => { void back.remove(); void state.remove(); };
}
