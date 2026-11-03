import { TEST_CONFIG } from '../config/test-config.js';

export interface RequestOptions {
  headers?: Record<string, string>;
  token?: string;
  cookie?: string;
  timeoutMs?: number;
}

export interface ApiResponse<T = unknown> {
  status: number;
  headers: Headers;
  data: T;
  rawText: string;
}

export class ApiClient {
  private baseUrl: string;

  constructor(baseUrl: string = TEST_CONFIG.API_BASE_URL) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
  }

  private buildHeaders(options?: RequestOptions): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(options?.headers || {})
    };

    if (options?.token) {
      headers['Authorization'] = `Bearer ${options.token}`;
    }

    if (options?.cookie) {
      headers['Cookie'] = options.cookie;
    }

    return headers;
  }

  public async request<T = unknown>(
    method: string,
    endpoint: string,
    body?: unknown,
    options?: RequestOptions
  ): Promise<ApiResponse<T>> {
    const url = endpoint.startsWith('http') ? endpoint : `${this.baseUrl}${endpoint.startsWith('/') ? '' : '/'}${endpoint}`;
    const headers = this.buildHeaders(options);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options?.timeoutMs || TEST_CONFIG.REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        method,
        headers,
        body: body !== undefined ? (typeof body === 'string' ? body : JSON.stringify(body)) : undefined,
        signal: controller.signal
      });

      const rawText = await response.text();
      let data: T;
      try {
        data = JSON.parse(rawText) as T;
      } catch {
        data = rawText as unknown as T;
      }

      return {
        status: response.status,
        headers: response.headers,
        data,
        rawText
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  public async get<T = unknown>(endpoint: string, options?: RequestOptions): Promise<ApiResponse<T>> {
    return this.request<T>('GET', endpoint, undefined, options);
  }

  public async post<T = unknown>(endpoint: string, body?: unknown, options?: RequestOptions): Promise<ApiResponse<T>> {
    return this.request<T>('POST', endpoint, body, options);
  }

  public async patch<T = unknown>(endpoint: string, body?: unknown, options?: RequestOptions): Promise<ApiResponse<T>> {
    return this.request<T>('PATCH', endpoint, body, options);
  }

  public async delete<T = unknown>(endpoint: string, options?: RequestOptions): Promise<ApiResponse<T>> {
    return this.request<T>('DELETE', endpoint, undefined, options);
  }
}

export const api = new ApiClient();

