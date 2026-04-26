import { router } from '../trpc';
import { contentRouter } from './content';
import { workflowRouter } from './workflow';

export const appRouter = router({
  content:  contentRouter,
  workflow: workflowRouter,
});

export type AppRouter = typeof appRouter;
