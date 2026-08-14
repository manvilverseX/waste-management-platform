import { z } from 'zod';

export const metricRangeEnum = z.enum(['today', '7d', '30d', 'all', 'custom']);
export type MetricRange = z.infer<typeof metricRangeEnum>;

export const metricsQuerySchema = z.object({
  range: metricRangeEnum.optional().default('7d'),
  from: z.string().datetime({ message: 'Invalid ISO date string for "from"' }).optional().nullable(),
  to: z.string().datetime({ message: 'Invalid ISO date string for "to"' }).optional().nullable(),
  collectorId: z.string().uuid({ message: 'Invalid UUID for collectorId' }).optional().nullable(),
}).refine((data) => {
  if (data.from && data.to) {
    const fromTime = Date.parse(data.from);
    const toTime = Date.parse(data.to);
    if (isNaN(fromTime) || isNaN(toTime)) {
      return false;
    }
    return fromTime <= toTime;
  }
  return true;
}, {
  message: '"from" date must be earlier than or equal to "to" date',
  path: ['from'],
});

export type MetricsQueryInput = z.infer<typeof metricsQuerySchema>;
