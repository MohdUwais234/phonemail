import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import type { User } from "./types";
import { api, configureAuth, ApiError } from "./api";
import { tokenStorage } from "./storage";
interface Auth {
  user: User | null;
  loading: boolean;
  error: string;
  login: (token: string, user: User) => Promise<void>;
  logout: () => Promise<void>;
  setUser: (user: User) => void;
  retry: () => void;
}
const Context = createContext<Auth>(null!);
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [attempt, setAttempt] = useState(0);
  const logout = useCallback(async () => {
    configureAuth(null);
    setUser(null);
    try {
      await tokenStorage.clear();
    } catch {
      setError(
        "Could not clear secure storage. Please close and reopen the app.",
      );
    }
  }, []);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    configureAuth(null, () => {
      void logout();
    });
    (async () => {
      try {
        const token = await tokenStorage.get();
        if (!active) return;
        if (token) {
          configureAuth(token);
          const me = await api.me();
          if (active) setUser(me);
        }
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) await logout();
        else if (active)
          setError(
            e instanceof Error ? e.message : "Unable to restore session.",
          );
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [attempt, logout]);
  async function login(token: string, user: User) {
    await tokenStorage.set(token);
    configureAuth(token);
    setUser(user);
    setError("");
  }
  return (
    <Context.Provider
      value={{
        user,
        loading,
        error,
        login,
        logout,
        setUser,
        retry: () => setAttempt((v) => v + 1),
      }}
    >
      {children}
    </Context.Provider>
  );
}
export const useAuth = () => useContext(Context);
