import { AuthenticatedUser } from './index.js';

declare global {
  namespace Express {
    interface Request {
      id?: string;
      startTime?: number;
      user?: AuthenticatedUser;
    }
  }
}

export {};
