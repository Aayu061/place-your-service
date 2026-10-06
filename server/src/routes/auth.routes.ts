import { Router } from 'express';
import { authController } from '../controllers/auth.controller.js';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { bootstrapAdminSchema } from '../validators/auth.validator.js';

const authRouter = Router();

// Retrieve verified profile and role for current authenticated session
authRouter.get('/me', requireAuth, authController.getMe.bind(authController));

// Bootstrap singleton admin (only allowed if zero admin accounts exist)
authRouter.post(
  '/bootstrap-admin',
  validate(bootstrapAdminSchema),
  authController.bootstrapAdmin.bind(authController)
);

// End authenticated session
authRouter.post('/logout', authController.logout.bind(authController));

export default authRouter;
