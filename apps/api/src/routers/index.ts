import { router } from '../trpc.js';
import { authRouter } from './auth.router.js';
import { userRouter } from './user.router.js';
import { connectionRouter } from './connection.router.js';
import { collectionRouter } from './collection.router.js';
import { obligationRouter } from './obligation.router.js';
import { notificationRouter } from './notification.router.js';
import { settingsRouter } from './settings.router.js';
import { inviteRouter } from './invite.router.js';
import { statsRouter } from './stats.router.js';
import { currencyRouter } from './currency.router.js';
import { chatRouter } from './chat.router.js';
import { faqRouter } from './faq.router.js';
import { pushRouter } from './push.router.js';

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
  currency: currencyRouter,
  chat: chatRouter,
  faq: faqRouter,
  push: pushRouter,
});

export type AppRouter = typeof appRouter;
