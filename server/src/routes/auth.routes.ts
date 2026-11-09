import { Router } from 'express';
import { authController } from '../controllers/auth.controller.js';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { authLimiter } from '../middleware/rateLimiters.js';
import { loginSchema } from '../validators/auth.validator.js';

const authRouter = Router();

// User authentication / login with brute-force protection
authRouter.post('/login', authLimiter, validate(loginSchema), authController.login.bind(authController));

// Retrieve verified profile and role for current authenticated session
authRouter.get('/me', requireAuth, authController.getMe.bind(authController));

// End authenticated session
authRouter.post('/logout', authController.logout.bind(authController));

export default authRouter;
