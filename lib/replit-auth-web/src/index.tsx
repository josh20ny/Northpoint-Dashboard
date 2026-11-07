import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { AuthState, AuthUser } from "@workspace/api-client-react";
export type { AuthUser };

type BrowserAuth = AuthState & {
  isLoading: boolean;
  isAuthenticated: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  login: () => void;
  logout: () => Promise<void>;
};
const AuthContext = createContext<BrowserAuth | null>(null);
const EMPTY: AuthState = { user: null, enabled: false, csrfToken: null, expiresAt: null };
export function AuthProvider({
  children,
  onIdentityChange,
}: {
  children: ReactNode;
  onIdentityChange?: () => void | Promise<void>;
}) {
  const [state, setState] = useState<AuthState>(EMPTY);
  const [isLoading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const identityKey = useRef("");
  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/auth/user", { credentials: "include", cache: "no-store" });
      if (!response.ok) throw new Error("Session unavailable");
      const data: AuthState = await response.json();
      if (typeof data.enabled !== "boolean" || !("user" in data))
        throw new Error("Invalid session");
      const nextIdentity = data.user ? `${data.user.id}:${data.user.role}` : "";
      if (nextIdentity !== identityKey.current) {
        await onIdentityChange?.();
        identityKey.current = nextIdentity;
      }
      setState(data);
      setError(null);
    } catch {
      if (identityKey.current) {
        await onIdentityChange?.();
        identityKey.current = "";
      }
      setState(EMPTY);
      setError("Unable to check your session. Try again.");
    } finally {
      setLoading(false);
    }
  }, [onIdentityChange]);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  // Finite refresh and focus refresh catch revocation and cross-session changes.
  useEffect(() => {
    const timer = window.setInterval(() => void refresh(), 60000);
    const focus = () => void refresh();
    window.addEventListener("focus", focus);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", focus);
    };
  }, [refresh]);
  const login = () => {
    window.location.assign("/api/login");
  };
  const logout = async () => {
    setError(null);
    try {
      const response = await fetch("/api/logout", {
        method: "POST",
        credentials: "include",
        headers: { "X-CSRF-Token": state.csrfToken ?? "" },
      });
      if (!response.ok) throw new Error("Logout failed");
      setState({ ...state, user: null, csrfToken: null, expiresAt: null });
      await onIdentityChange?.();
      identityKey.current = "";
      window.location.assign("/");
    } catch {
      setError("Unable to log out. Try again.");
    }
  };
  return (
    <AuthContext.Provider
      value={{ ...state, isLoading, isAuthenticated: !!state.user, error, refresh, login, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}
export function useAuth(): BrowserAuth {
  const context = useContext(AuthContext);
  if (!context) throw new Error("AuthProvider is required");
  return context;
}
