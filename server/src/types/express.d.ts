import { AuthenticatedUser } from './index.js';

export interface AuthenticatedTechnician {
  id: string;
  technicianCode: string;
  name: string;
  phone: string;
  status: string;
  isActive: boolean;
}

declare global {
  namespace Express {
    interface Request {
      id?: string;
      startTime?: number;
      user?: AuthenticatedUser;
      technician?: AuthenticatedTechnician;
    }
  }
}

export {};
