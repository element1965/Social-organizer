import { router } from '../trpc';
import { authRouter } from './auth.router';
import { userRouter } from './user.router';
import { connectionRouter } from './connection.router';
import { collectionRouter } from './collection.router';
import { obligationRouter } from './obligation.router';
import { notificationRouter } from './notification.router';
import { settingsRouter } from './settings.router';
import { inviteRouter } from './invite.router';
import { statsRouter } from './stats.router';

export const appRouter = router({
  auth: authRouter,
  user: userRouter,
  connection: connectionRouter,
  collection: collectionRouter,
  obligation: obligationRouter,
  notification: notificationRouter,
  settings: settingsRouter,
  invite: inviteRouter,
  stats: statsRouter,
});

export type AppRouter = typeof appRouter;
