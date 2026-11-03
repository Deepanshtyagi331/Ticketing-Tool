import type { Request, Response, NextFunction } from 'express';
import { AuthService } from '../services/auth.service.js';
import { env } from '../config/env.js';
import type { AuthenticatedRequest } from '../types/auth.types.js';

const COOKIE_NAME = 'refreshToken';
const REFRESH_COOKIE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

function setRefreshTokenCookie(res: Response, token: string): void {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: REFRESH_COOKIE_MAX_AGE_MS,
    path: '/'
  });
}

function clearRefreshTokenCookie(res: Response): void {
  res.clearCookie(COOKIE_NAME, {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/'
  });
}

export class AuthController {
  public static async register(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await AuthService.register(req.body);
      setRefreshTokenCookie(res, result.refreshToken);

      res.status(201).json({
        success: true,
        data: result
      });
    } catch (error) {
      next(error);
    }
  }

  public static async login(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await AuthService.login(req.body);
      setRefreshTokenCookie(res, result.refreshToken);

      res.status(200).json({
        success: true,
        data: result
      });
    } catch (error) {
      next(error);
    }
  }

  public static async refresh(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const token = (req.body?.refreshToken as string | undefined) || req.cookies?.[COOKIE_NAME];
      const result = await AuthService.refresh(token as string);
      setRefreshTokenCookie(res, result.refreshToken);

      res.status(200).json({
        success: true,
        data: result
      });
    } catch (error) {
      next(error);
    }
  }

  public static async logout(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const token = (req.body?.refreshToken as string | undefined) || req.cookies?.[COOKIE_NAME];
      await AuthService.logout(token);
      clearRefreshTokenCookie(res);

      res.status(200).json({
        success: true,
        message: 'Successfully logged out'
      });
    } catch (error) {
      next(error);
    }
  }

  public static me(req: AuthenticatedRequest, res: Response): void {
    res.status(200).json({
      success: true,
      data: {
        user: req.user
      }
    });
  }
}

