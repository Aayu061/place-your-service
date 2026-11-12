import { Request, Response, NextFunction } from 'express';
import { createXlsxExport, ExportKind } from '../services/export.service.js';
import { getIstTodayIso } from '../utils/date.js';

export async function exportWorkbook(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const kind = req.params.kind as ExportKind;
    const buffer = await createXlsxExport(kind, req.query as any);
    const filename = `pys-${kind}-${getIstTodayIso()}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', buffer.byteLength);
    res.status(200).send(buffer);
  } catch (err) { next(err); }
}
