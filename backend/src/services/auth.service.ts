import { User, IUserDocument } from '../models/User.model.js';
import { RefreshToken } from '../models/RefreshToken.model.js';
import { hashPassword, comparePassword } from '../utils/password.js';
import { hashToken, generateRandomToken, generateFamilyId } from '../utils/crypto.js';
import { signAccessToken } from '../utils/jwt.js';
import { AppError } from '../errors/AppError.js';
import type { RegisterInput, LoginInput } from '../validators/auth.validator.js';
import type { AuthResponseData, UserResponse } from '../types/auth.types.js';

const REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function formatUserResponse(user: IUserDocument): UserResponse {
  return {
    id: user._id.toString(),
    name: user.name,
    email: user.email,
    role: user.role,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString()
  };
}

export class AuthService {
  /**
   * Register a new user.
   */
  public static async register(input: RegisterInput): Promise<AuthResponseData> {
    const existing = await User.findOne({ email: input.email.toLowerCase() });
    if (existing) {
      throw AppError.conflict('An account with this email address already exists');
    }

    const passwordHash = await hashPassword(input.password);

    const user = await User.create({
      name: input.name,
      email: input.email.toLowerCase(),
      passwordHash,
      role: input.role || 'user'
    });

    const accessToken = signAccessToken({
      userId: user._id.toString(),
      email: user.email,
      role: user.role
    });

    const rawRefreshToken = generateRandomToken();
    const tokenHash = hashToken(rawRefreshToken);
    const familyId = generateFamilyId();
    const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_MS);

    await RefreshToken.create({
      userId: user._id,
      tokenHash,
      familyId,
      expiresAt,
      isRevoked: false,
      isUsed: false
    });

    return {
      user: formatUserResponse(user),
      accessToken,
      refreshToken: rawRefreshToken
    };
  }

  /**
   * Authenticate an existing user.
   */
  public static async login(input: LoginInput): Promise<AuthResponseData> {
    const user = await User.findOne({ email: input.email.toLowerCase() }).select('+passwordHash');
    if (!user) {
      throw AppError.unauthorized('Invalid email or password');
    }

    const isMatch = await comparePassword(input.password, user.passwordHash);
    if (!isMatch) {
      throw AppError.unauthorized('Invalid email or password');
    }

    const accessToken = signAccessToken({
      userId: user._id.toString(),
      email: user.email,
      role: user.role
    });

    const rawRefreshToken = generateRandomToken();
    const tokenHash = hashToken(rawRefreshToken);
    const familyId = generateFamilyId();
    const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_MS);

    await RefreshToken.create({
      userId: user._id,
      tokenHash,
      familyId,
      expiresAt,
      isRevoked: false,
      isUsed: false
    });

    return {
      user: formatUserResponse(user),
      accessToken,
      refreshToken: rawRefreshToken
    };
  }

  /**
   * Rotate refresh token and issue new access token.
   * Atomically detects token reuse and revokes entire session family if breached.
   */
  public static async refresh(rawRefreshToken: string): Promise<AuthResponseData> {
    if (!rawRefreshToken) {
      throw AppError.unauthorized('Refresh token is required');
    }

    const tokenHash = hashToken(rawRefreshToken);

    // Atomically find unconsumed, unrevoked, non-expired token and mark it as used
    const consumedToken = await RefreshToken.findOneAndUpdate(
      {
        tokenHash,
        isUsed: false,
        isRevoked: false,
        expiresAt: { $gt: new Date() }
      },
      {
        $set: { isUsed: true }
      },
      { new: true }
    );

    // If atomic consumption failed, determine cause
    if (!consumedToken) {
      const existingToken = await RefreshToken.findOne({ tokenHash });

      if (existingToken) {
        // Token was previously used or revoked -> Token theft / replay attack detected!
        if (existingToken.isUsed || existingToken.isRevoked) {
          console.warn(`🚨 Refresh token reuse detected for user ${existingToken.userId}. Revoking all sessions.`);
          await RefreshToken.updateMany(
            { userId: existingToken.userId },
            { $set: { isRevoked: true } }
          );
          throw AppError.unauthorized('Security violation: Refresh token reuse detected. All sessions revoked.');
        }

        // Token expired
        if (existingToken.expiresAt <= new Date()) {
          throw AppError.unauthorized('Refresh token has expired. Please log in again.');
        }
      }

      throw AppError.unauthorized('Invalid refresh token');
    }

    // Retrieve user for fresh claims
    const user = await User.findById(consumedToken.userId);
    if (!user) {
      throw AppError.unauthorized('User associated with session not found');
    }

    // Issue fresh access token (15m)
    const newAccessToken = signAccessToken({
      userId: user._id.toString(),
      email: user.email,
      role: user.role
    });

    // Rotate refresh token (issue new raw token, retain family ID)
    const newRawRefreshToken = generateRandomToken();
    const newTokenHash = hashToken(newRawRefreshToken);
    const newExpiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_MS);

    await RefreshToken.create({
      userId: user._id,
      tokenHash: newTokenHash,
      familyId: consumedToken.familyId,
      expiresAt: newExpiresAt,
      isRevoked: false,
      isUsed: false
    });

    return {
      user: formatUserResponse(user),
      accessToken: newAccessToken,
      refreshToken: newRawRefreshToken
    };
  }

  /**
   * Log out user: revoke provided refresh token.
   */
  public static async logout(rawRefreshToken?: string): Promise<void> {
    if (!rawRefreshToken) return;

    const tokenHash = hashToken(rawRefreshToken);
    await RefreshToken.findOneAndUpdate(
      { tokenHash },
      { $set: { isRevoked: true, isUsed: true } }
    );
  }
}

