import { describe, it, expect } from 'vitest';
import {
  createScheduleSchema,
  updateScheduleSchema,
  assignTechnicianSchema,
  reassignTechnicianSchema,
} from '../src/validators/schedule.validator.js';
import {
  createServiceReportSchema,
  updateServiceReportSchema,
} from '../src/validators/serviceReport.validator.js';

describe('Batch 1: Assistant Name Schema Contract & Validation Suite', () => {
  const dummyUuid = '11111111-1111-4111-8111-111111111111';

  describe('Service Schedule Assistant Name Handling', () => {
    it('accepts and trims assistantName in createScheduleSchema', () => {
      const payload = {
        customerId: dummyUuid,
        siteId: dummyUuid,
        scheduledDate: '2026-10-25',
        assistantName: '  Kishore Kumar  ',
      };

      const parsed = createScheduleSchema.body.parse(payload);
      expect(parsed.assistantName).toBe('Kishore Kumar');
    });

    it('handles null, undefined, or empty assistantName gracefully in createScheduleSchema', () => {
      const parsedWithNull = createScheduleSchema.body.parse({
        customerId: dummyUuid,
        siteId: dummyUuid,
        scheduledDate: '2026-10-25',
        assistantName: null,
      });
      expect(parsedWithNull.assistantName).toBeUndefined();

      const parsedWithEmpty = createScheduleSchema.body.parse({
        customerId: dummyUuid,
        siteId: dummyUuid,
        scheduledDate: '2026-10-25',
        assistantName: '   ',
      });
      expect(parsedWithEmpty.assistantName?.trim() || '').toBe('');
    });

    it('accepts assistantName in assignTechnicianSchema', () => {
      const parsed = assignTechnicianSchema.body.parse({
        technicianId: dummyUuid,
        assistantName: 'Sunil Verma',
      });
      expect(parsed.assistantName).toBe('Sunil Verma');
    });

    it('accepts assistantName in reassignTechnicianSchema', () => {
      const parsed = reassignTechnicianSchema.body.parse({
        technicianId: dummyUuid,
        assistantName: 'Amit Patel',
      });
      expect(parsed.assistantName).toBe('Amit Patel');
    });

    it('accepts assistantName in updateScheduleSchema', () => {
      const parsed = updateScheduleSchema.body.parse({
        assistantName: 'Updated Assistant',
      });
      expect(parsed.assistantName).toBe('Updated Assistant');
    });
  });

  describe('Service Report Assistant Name Handling', () => {
    it('accepts and preserves assistantName in createServiceReportSchema', () => {
      const payload = {
        reportNumber: 'REP-2026-0099',
        scheduleId: dummyUuid,
        visitType: 'SERVICE_REQUEST',
        serviceDate: '2026-10-25',
        primaryOutcome: 'COMPLETED',
        workDescription: 'AC coil cleaning and filter replacement completed on site.',
        assistantName: '  Rajesh Helper  ',
        assets: [
          {
            assetId: dummyUuid,
            assetOutcome: 'COMPLETED',
            workPerformed: 'Deep jet cleaned outdoor condenser',
          },
        ],
      };

      const parsed = createServiceReportSchema.body.parse(payload);
      expect(parsed.assistantName).toBe('Rajesh Helper');
    });

    it('accepts assistantName in updateServiceReportSchema', () => {
      const parsed = updateServiceReportSchema.body.parse({
        assistantName: 'New Assistant Name',
        workDescription: 'Updated work description notes.',
      });
      expect(parsed.assistantName).toBe('New Assistant Name');
    });
  });
});
