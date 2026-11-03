import type { Request } from 'express';
import type { UserRole } from '../models/User.model.js';

export interface AccessTokenPayload {
  userId: string;
  email: string;
  role: UserRole;
}

export interface AuthUser {
  id: string;
  email: string;
  role: UserRole;
  name?: string;
}

export interface AuthenticatedRequest extends Request {
  user?: AuthUser;
  rawBody?: Buffer;
  id?: string;
}

declare global {
  namespace Express {
    interface Request {
      rawBody?: Buffer;
      id?: string;
    }
  }
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface UserResponse {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  createdAt: string;
  updatedAt: string;
}

export interface AuthResponseData {
  user: UserResponse;
  accessToken: string;
  refreshToken: string;
}

