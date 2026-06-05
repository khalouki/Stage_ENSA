"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import { apiRequest } from "@/lib/api";

export type UserRole = "student" | "admin";

export type AuthUser = {
  id: number;
  full_name: string;
  email: string;
  role: UserRole;
  is_active: boolean;
};

type LoginPayload = {
  email: string;
  password: string;
};

type RegisterPayload = {
  full_name: string;
  email: string;
  password: string;
};

type AuthContextValue = {
  user: AuthUser | null;
  token: string | null;
  loading: boolean;
  login: (payload: LoginPayload) => Promise<void>;
  register: (payload: RegisterPayload) => Promise<void>;
  logout: () => void;
  refreshUser: () => Promise<AuthUser | null>;
  setCurrentUser: (user: AuthUser) => void;
};

const ACCESS_TOKEN_KEY = "vf_access_token";

const AuthContext = createContext<AuthContextValue | null>(null);

async function fetchCurrentUser(token: string): Promise<AuthUser> {
  return apiRequest<AuthUser>("/auth/me", { token });
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const setCurrentUser = useCallback((nextUser: AuthUser) => {
    setUser(nextUser);
  }, []);

  const refreshUser = useCallback(async (): Promise<AuthUser | null> => {
    const activeToken = token ?? localStorage.getItem(ACCESS_TOKEN_KEY);
    if (!activeToken) {
      setUser(null);
      return null;
    }

    try {
      const me = await fetchCurrentUser(activeToken);
      setToken(activeToken);
      setUser(me);
      return me;
    } catch {
      localStorage.removeItem(ACCESS_TOKEN_KEY);
      setToken(null);
      setUser(null);
      return null;
    }
  }, [token]);

  useEffect(() => {
    const bootstrapAuth = async () => {
      const storedToken = localStorage.getItem(ACCESS_TOKEN_KEY);
      if (!storedToken) {
        setLoading(false);
        return;
      }

      try {
        const me = await fetchCurrentUser(storedToken);
        setToken(storedToken);
        setUser(me);
      } catch {
        localStorage.removeItem(ACCESS_TOKEN_KEY);
        setToken(null);
        setUser(null);
      } finally {
        setLoading(false);
      }
    };

    void bootstrapAuth();
  }, []);

  const login = useCallback(async (payload: LoginPayload) => {
    const tokenResponse = await apiRequest<{ access_token: string; token_type: string }>("/auth/login", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    const nextToken = tokenResponse.access_token;
    const me = await fetchCurrentUser(nextToken);
    localStorage.setItem(ACCESS_TOKEN_KEY, nextToken);
    setToken(nextToken);
    setUser(me);
  }, []);

  const register = useCallback(async (payload: RegisterPayload) => {
    await apiRequest<AuthUser>("/auth/register", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    await login({ email: payload.email, password: payload.password });
  }, [login]);

  const logout = useCallback(() => {
    localStorage.removeItem(ACCESS_TOKEN_KEY);
    setToken(null);
    setUser(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ user, token, loading, login, register, logout, refreshUser, setCurrentUser }),
    [loading, login, logout, refreshUser, register, setCurrentUser, token, user]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}
