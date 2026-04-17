import { router } from '../trpc';
import { contentRouter } from './content';

export const appRouter = router({
  content: contentRouter,
});

export type AppRouter = typeof appRouter;
