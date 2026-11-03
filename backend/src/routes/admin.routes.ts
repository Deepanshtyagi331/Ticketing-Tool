import { Router } from 'express';
import { ReportController } from '../controllers/report.controller.js';
import { authenticate, requireAdmin } from '../middleware/auth.middleware.js';
import { validate } from '../middleware/validate.js';
import { revenueReportSchema } from '../validators/report.validator.js';

export const adminRouter = Router();

// Protected: Admin-only Revenue Report
adminRouter.get(
  '/reports/revenue',
  authenticate,
  requireAdmin,
  validate(revenueReportSchema),
  ReportController.revenue
);

