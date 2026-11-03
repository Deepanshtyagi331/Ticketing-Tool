import { Router } from 'express';
import { EventController } from '../controllers/event.controller.js';
import { validate } from '../middleware/validate.js';
import {
  createEventSchema,
  updateEventSchema,
  eventIdParamSchema,
  listEventsQuerySchema
} from '../validators/event.validator.js';
import { authenticate, requireAdmin } from '../middleware/auth.middleware.js';

export const eventRouter = Router();

// Public Routes
eventRouter.get('/', validate(listEventsQuerySchema), EventController.list);
eventRouter.get('/:id', validate(eventIdParamSchema), EventController.getById);

// Admin-Only Routes
eventRouter.post(
  '/',
  authenticate,
  requireAdmin,
  validate(createEventSchema),
  EventController.create
);

eventRouter.patch(
  '/:id',
  authenticate,
  requireAdmin,
  validate(updateEventSchema),
  EventController.update
);

