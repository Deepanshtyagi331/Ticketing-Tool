import type { Request, Response, NextFunction } from 'express';
import { ReportService } from '../services/report.service.js';
import type { RevenueReportQuery } from '../validators/report.validator.js';

export class ReportController {
  public static async revenue(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { from, to } = req.query as unknown as RevenueReportQuery;
      const result = await ReportService.getRevenueReport(from, to);

      res.status(200).json({
        success: true,
        data: result
      });
    } catch (error) {
      next(error);
    }
  }
}

