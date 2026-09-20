import { z } from 'zod';
import { wasteRecordQuerySchema } from '@/lib/validation/waste-record';

// Same filters as the Records page list (GET /api/waste-records), minus
// pagination/sort — export always returns the full filtered set — plus the
// output format.
export const exportQuerySchema = wasteRecordQuerySchema
  .omit({ page: true, pageSize: true, sortBy: true, sortDir: true })
  .extend({
    format: z.enum(['csv', 'xlsx']).default('csv'),
  });

export type ExportQuery = z.infer<typeof exportQuerySchema>;
