import { describe, it, expect } from 'vitest';
import request from 'supertest';
import express, { Request, Response } from 'express';
import { z } from 'zod';
import { validate } from '../src/middleware/validate.js';
import { errorHandlerMiddleware } from '../src/middleware/errorHandler.js';

describe('validate Middleware', () => {
  const createValidationApp = () => {
    const app = express();
    app.use(express.json());

    const sampleSchema = {
      body: z.object({
        email: z.string().email(),
        quantity: z.number().int().positive(),
      }),
      query: z.object({
        filter: z.string().min(2).optional(),
      }),
    };

    app.post('/validate-test', validate(sampleSchema), (req: Request, res: Response) => {
      res.json({ success: true, data: req.body });
    });

    app.use(errorHandlerMiddleware);
    return app;
  };

  it('passes on valid request body and query', async () => {
    const app = createValidationApp();
    const res = await request(app)
      .post('/validate-test?filter=abc')
      .send({ email: 'test@example.com', quantity: 5 });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toEqual({ email: 'test@example.com', quantity: 5 });
  });

  it('returns structured 422 VALIDATION_ERROR when body is invalid', async () => {
    const app = createValidationApp();
    const res = await request(app)
      .post('/validate-test')
      .send({ email: 'not-an-email', quantity: -10 });

    expect(res.status).toBe(422);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.message).toBe('Request validation failed');
    expect(Array.isArray(res.body.error.details)).toBe(true);

    const fields = res.body.error.details.map((d: { field: string }) => d.field);
    expect(fields).toContain('email');
    expect(fields).toContain('quantity');
  });
});
