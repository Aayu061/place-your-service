import { Router } from 'express';
import healthRouter from './health.routes.js';
import authRouter from './auth.routes.js';
import staffRouter from './staff.routes.js';
import customerRouter from './customer.routes.js';

const apiV1Router = Router();

// Phase 2 Foundation Route
apiV1Router.use('/health', healthRouter);

// Phase 3 Authentication & Staff Management Routes
apiV1Router.use('/auth', authRouter);
apiV1Router.use('/staff', staffRouter);

// Phase 4 Customer Management Routes
apiV1Router.use('/customers', customerRouter);

export default apiV1Router;

