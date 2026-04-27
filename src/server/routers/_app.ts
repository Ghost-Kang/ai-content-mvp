import { router } from '../trpc';
import { contentRouter } from './content';
import { workflowRouter } from './workflow';
import { topicRouter } from './topic';

export const appRouter = router({
  content:  contentRouter,
  workflow: workflowRouter,
  topic:    topicRouter,
});

export type AppRouter = typeof appRouter;
