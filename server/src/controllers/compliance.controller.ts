import { Request, Response } from 'express';
import { gstLookupService } from '../services/gstLookup.service.js';

export const lookupGstin = async (req: Request, res: Response) => {
  try {
    const { gstin } = req.body;
    if (!gstin) return res.status(400).json({ error: 'GSTIN is required' });

    const result = await gstLookupService.lookupGstin(gstin);
    if (!result.isValid) return res.status(400).json({ error: result.error || 'Invalid GSTIN' });

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'Failed to look up GSTIN' });
  }
};

