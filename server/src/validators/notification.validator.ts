import { z } from 'zod';

export const listNotificationsSchema = {
  query: z.object({
    unreadOnly: z.enum(['true', 'false']).optional().default('false'),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(25),
  }),
};

export const notificationIdParamSchema = { params: z.object({ id: z.string().guid() }) };

export const markNotificationReadSchema = {
  params: z.object({ id: z.string().guid() }),
  body: z.object({ isRead: z.boolean().default(true) }),
};
