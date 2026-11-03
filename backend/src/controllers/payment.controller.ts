import type { Request, Response, NextFunction } from 'express';
import { PaymentService } from '../services/payment.service.js';

export class PaymentController {
  public static async webhook(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const signature =
        (req.headers['x-signature'] as string | undefined) ||
        (req.headers['x-webhook-signature'] as string | undefined) ||
        (req.headers['stripe-signature'] as string | undefined);

      const rawBody = req.rawBody ?? Buffer.from(JSON.stringify(req.body), 'utf-8');

      const result = await PaymentService.processWebhook(rawBody, signature, req.body);

      res.status(200).json({
        success: true,
        data: result
      });
    } catch (error) {
      next(error);
    }
  }
}

