import React, { createContext, useContext, useEffect, useState } from 'react';
import { authApi } from '../api/auth.api';
import { getAuthToken, setAuthToken } from '../api/client';
import type { User } from '../types';

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, pass: string) => Promise<void>;
  register: (name: string, email: string, pass: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  useEffect(() => {
    const initAuth = async () => {
      const existingToken = getAuthToken();
      if (existingToken) {
        try {
          const profile = await authApi.getMe();
          setUser(profile);
        } catch {
          setAuthToken(null);
          setUser(null);
        }
      }
      setIsLoading(false);
    };

    const handleExpired = () => {
      setUser(null);
    };

    window.addEventListener('auth:expired', handleExpired);
    void initAuth();

    return () => {
      window.removeEventListener('auth:expired', handleExpired);
    };
  }, []);

  const login = async (email: string, pass: string): Promise<void> => {
    const data = await authApi.login(email, pass);
    setUser(data.user);
  };

  const register = async (name: string, email: string, pass: string): Promise<void> => {
    const data = await authApi.register(name, email, pass);
    setUser(data.user);
  };

  const logout = async (): Promise<void> => {
    await authApi.logout();
    setUser(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        isLoading,
        login,
        register,
        logout
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

