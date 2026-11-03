import { Schema, model, Document, Types } from 'mongoose';

export interface IRefreshToken {
  userId: Types.ObjectId;
  tokenHash: string;
  familyId: string;
  expiresAt: Date;
  isRevoked: boolean;
  isUsed: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface IRefreshTokenDocument extends IRefreshToken, Document<Types.ObjectId> {}

const refreshTokenSchema = new Schema<IRefreshTokenDocument>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User ID is required']
    },
    tokenHash: {
      type: String,
      required: [true, 'Token hash is required']
    },
    familyId: {
      type: String,
      required: [true, 'Session or token-family identifier is required'],
      trim: true
    },
    expiresAt: {
      type: Date,
      required: [true, 'Expiration date is required']
    },
    isRevoked: {
      type: Boolean,
      default: false
    },
    isUsed: {
      type: Boolean,
      default: false
    }
  },
  {
    timestamps: true,
    toJSON: {
      transform(_doc, ret: Record<string, unknown>) {
        delete ret.tokenHash;
        delete ret.__v;
        return ret;
      }
    }
  }
);

// Indexes
// 1. Fast lookup & uniqueness on tokenHash
refreshTokenSchema.index({ tokenHash: 1 }, { unique: true, name: 'refresh_token_hash_unique_idx' });

// 2. Token-family lookup for revocation on reuse detection
refreshTokenSchema.index({ familyId: 1 }, { name: 'refresh_token_family_idx' });

// 3. User session lookup for revoking all sessions
refreshTokenSchema.index({ userId: 1 }, { name: 'refresh_token_user_idx' });

// 4. TTL index to automatically purge stale token documents after expiration date
refreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0, name: 'refresh_token_ttl_idx' });

export const RefreshToken = model<IRefreshTokenDocument>('RefreshToken', refreshTokenSchema);
