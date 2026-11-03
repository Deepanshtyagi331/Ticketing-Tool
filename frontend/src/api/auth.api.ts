import { apiClient, setAuthToken } from './client';
import type { ApiResponse, AuthResponseData, User } from '../types';

export const authApi = {
  async register(name: string, email: string, password: string): Promise<AuthResponseData> {
    const res = await apiClient.post<ApiResponse<AuthResponseData>>('/auth/register', {
      name,
      email,
      password
    });
    if (res.data.data?.accessToken) {
      setAuthToken(res.data.data.accessToken);
    }
    return res.data.data!;
  },

  async login(email: string, password: string): Promise<AuthResponseData> {
    const res = await apiClient.post<ApiResponse<AuthResponseData>>('/auth/login', {
      email,
      password
    });
    if (res.data.data?.accessToken) {
      setAuthToken(res.data.data.accessToken);
    }
    return res.data.data!;
  },

  async logout(): Promise<void> {
    try {
      await apiClient.post('/auth/logout', {});
    } finally {
      setAuthToken(null);
    }
  },

  async getMe(): Promise<User> {
    const res = await apiClient.get<ApiResponse<{ user: User }>>('/auth/me');
    return res.data.data!.user;
  }
};

