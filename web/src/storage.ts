import { Capacitor } from "@capacitor/core";
import { SecureStorage } from "@aparajita/capacitor-secure-storage";
const key = "phonemail.session";
// Android uses encrypted storage backed by Android Keystore. Web deliberately
// uses tab-scoped sessionStorage, never localStorage or an offline API cache.
export const tokenStorage = {
  async get(): Promise<string | null> {
    if (Capacitor.isNativePlatform()) {
      const value = await SecureStorage.get(key);
      return typeof value === "string" ? value : null;
    }
    return sessionStorage.getItem(key);
  },
  async set(token: string) {
    if (Capacitor.isNativePlatform()) await SecureStorage.set(key, token);
    else sessionStorage.setItem(key, token);
  },
  async clear() {
    if (Capacitor.isNativePlatform()) await SecureStorage.remove(key);
    else sessionStorage.removeItem(key);
  },
};
