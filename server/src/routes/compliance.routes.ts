import { Router } from 'express';
import { lookupGstin } from '../controllers/compliance.controller.js';

const router = Router();

router.post('/gstin/lookup', lookupGstin);

export default router;

