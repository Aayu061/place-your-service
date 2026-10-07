import { Router } from 'express';
import healthRouter from './health.routes.js';
import authRouter from './auth.routes.js';
import staffRouter from './staff.routes.js';
import customerRouter from './customer.routes.js';
import siteRouter from './site.routes.js';
import assetRouter from './asset.routes.js';
import serviceRequestRouter from './serviceRequest.routes.js';
import technicianRouter from './technician.routes.js';
import { amcRouter } from './amc.routes.js';

const apiV1Router = Router();

// Phase 2 Foundation Route
apiV1Router.use('/health', healthRouter);

// Phase 3 Authentication & Staff Management Routes
apiV1Router.use('/auth', authRouter);
apiV1Router.use('/staff', staffRouter);

// Phase 4 Customer Management Routes
apiV1Router.use('/customers', customerRouter);

// Phase 5 Customer Sites & AC Asset Register Routes
apiV1Router.use('/sites', siteRouter);
apiV1Router.use('/assets', assetRouter);

// Phase 6 Service Request Management Routes
apiV1Router.use('/service-requests', serviceRequestRouter);

// Phase 7 Technician Management Routes
apiV1Router.use('/technicians', technicianRouter);

// Phase 8 AMC & Preventive Maintenance Routes
apiV1Router.use('/amc-contracts', amcRouter);

export default apiV1Router;


