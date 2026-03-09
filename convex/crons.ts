import { cronJobs } from 'convex/server';
import { internal } from './_generated/api';

const crons = cronJobs();

crons.cron(
  'sync disposable signup domains',
  '0 3 * * *',
  internal.platformAdmin.actions.syncDisposableEmailDomains,
  {},
);

export default crons;
