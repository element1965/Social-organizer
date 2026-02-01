import { createTRPCReact } from '@trpc/react-query';
import { httpBatchLink } from '@trpc/client';
import type { AppRouter } from '../../../api/src/routers/index';
import { handleDemoRequest } from './demoData';

export const trpc = createTRPCReact<AppRouter>();

/** Minimal observable compatible with tRPC link protocol. */
function tinyObservable<T>(fn: (observer: { next: (v: T) => void; complete: () => void }) => void) {
  return {
    subscribe(observer: { next?: (v: T) => void; error?: (e: unknown) => void; complete?: () => void }) {
      fn({
        next: (v) => observer.next?.(v),
        complete: () => observer.complete?.(),
      });
      return { unsubscribe() {} };
    },
  };
}

/** tRPC link that returns mock data for demo mode (no HTTP requests). */
const demoLink = () =>
  ({ op }: { op: { path: string; input: unknown } }) =>
    tinyObservable((observer) => {
      const data = handleDemoRequest(op.path, op.input);
      observer.next({ result: { type: 'data' as const, data } });
      observer.complete();
    });

export function getTrpcClient() {
  const isDemo = localStorage.getItem('accessToken') === 'demo-token';

  return trpc.createClient({
    links: [
      isDemo
        ? (demoLink as never)
        : httpBatchLink({
            url: '/trpc',
            headers() {
              const token = localStorage.getItem('accessToken');
              return token ? { Authorization: `Bearer ${token}` } : {};
            },
          }),
    ],
  });
}
