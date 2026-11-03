import { Router } from 'express';
import { PaymentController } from '../controllers/payment.controller.js';
import { validate } from '../middleware/validate.js';
import { paymentWebhookSchema } from '../validators/payment.validator.js';

export const paymentRouter = Router();

// Payment Webhook Callback Endpoint
paymentRouter.post('/webhook', validate(paymentWebhookSchema), PaymentController.webhook);

