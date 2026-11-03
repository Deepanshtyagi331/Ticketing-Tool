import type { Request, Response, NextFunction } from 'express';
import { EventService } from '../services/event.service.js';
import type { ListEventsQuery } from '../validators/event.validator.js';

export class EventController {
  public static async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const event = await EventService.createEvent(req.body);
      res.status(201).json({
        success: true,
        data: { event }
      });
    } catch (error) {
      next(error);
    }
  }

  public static async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const event = await EventService.updateEvent(req.params.id as string, req.body);
      res.status(200).json({
        success: true,
        data: { event }
      });
    } catch (error) {
      next(error);
    }
  }

  public static async getById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const event = await EventService.getEventById(req.params.id as string);
      res.status(200).json({
        success: true,
        data: { event }
      });
    } catch (error) {
      next(error);
    }
  }

  public static async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await EventService.listEvents(req.query as unknown as ListEventsQuery);
      res.status(200).json({
        success: true,
        data: result
      });
    } catch (error) {
      next(error);
    }
  }
}

