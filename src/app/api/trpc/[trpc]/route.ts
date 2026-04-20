import { fetchRequestHandler } from '@trpc/server/adapters/fetch';
import { appRouter } from '@/server/routers/_app';
import { createContext } from '@/server/context';

const handler = (req: Request) =>
  fetchRequestHandler({
    endpoint: '/api/trpc',
    req,
    router: appRouter,
    createContext,
    onError:
      process.env.NODE_ENV === 'development'
        ? ({ path, error }: { path: string | undefined; error: Error }) => {
            console.error(`tRPC error on ${path ?? '<no-path>'}:`, error);
          }
        : undefined,
  });

export { handler as GET, handler as POST };
