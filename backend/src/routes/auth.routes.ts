import { Router } from 'express';
import { AuthController } from '../controllers/auth.controller.js';
import { validate } from '../middleware/validate.js';
import { registerSchema, loginSchema, refreshSchema } from '../validators/auth.validator.js';
import { authenticate, requireAdmin } from '../middleware/auth.middleware.js';

export const authRouter = Router();

authRouter.post('/register', validate(registerSchema), AuthController.register);
authRouter.post('/login', validate(loginSchema), AuthController.login);
authRouter.post('/refresh', validate(refreshSchema), AuthController.refresh);
authRouter.post('/logout', AuthController.logout);
authRouter.get('/me', authenticate, AuthController.me);

// Protected route to verify role-based authorization
authRouter.get('/admin-only', authenticate, requireAdmin, (_req, res) => {
  res.status(200).json({
    success: true,
    message: 'Welcome Admin'
  });
});
