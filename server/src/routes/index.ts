import { Router } from 'express';
import healthRouter from './health.routes.js';

const apiV1Router = Router();

// Phase 2 Foundation Route
apiV1Router.use('/health', healthRouter);

export default apiV1Router;
