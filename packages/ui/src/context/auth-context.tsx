import { createContext, type ReactNode, useCallback, useContext, useState } from "react";

interface AuthContextValue {
  /** True when a recent operation hit a Claude auth error. */
  needsAuth: boolean;
  /** Called when an auth-required error is detected. */
  flagAuthRequired: () => void;
  /** Called after successful sign-in. Clears the flag for every consumer. */
  clearAuthRequired: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [needsAuth, setNeedsAuth] = useState(false);
  const flagAuthRequired = useCallback(() => setNeedsAuth(true), []);
  const clearAuthRequired = useCallback(() => setNeedsAuth(false), []);
  return (
    <AuthContext.Provider value={{ needsAuth, flagAuthRequired, clearAuthRequired }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuthStatus(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuthStatus must be used inside <AuthProvider>");
  return ctx;
}
