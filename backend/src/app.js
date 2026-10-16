import cors from 'cors';
import express from 'express';
import { config } from './config.js';
import { countDemoAccounts, DEMO_ACCOUNT_COUNT } from './lib/seed.js';
import accountRoutes from './routes/account.js';
import authRoutes from './routes/auth.js';
import campusRoutes from './routes/campus.js';

export function createApp() {
  const app = express();

  app.disable('x-powered-by');
  app.use(
    cors({
      origin(origin, callback) {
        if (!origin || config.corsOrigins.includes(origin)) {
          return callback(null, true);
        }
        return callback(new Error(`Origin not allowed by CORS: ${origin}`));
      },
    }),
  );
  app.use(express.json({ limit: '100kb' }));

  app.get('/api/health', async (req, res) => {
    res.json({
      status: 'ok',
      env: config.env,
      demoAccounts: await countDemoAccounts(),
      demoAccountsExpected: DEMO_ACCOUNT_COUNT,
    });
  });

  app.use('/api/auth', authRoutes);
  app.use('/api/campus', campusRoutes);
  app.use('/api/account', accountRoutes);

  app.use((req, res) => {
    res.status(404).json({ error: `Not found: ${req.method} ${req.originalUrl}` });
  });

  app.use((err, req, res, next) => {
    if (res.headersSent) return next(err);
    const status = err.status ?? 500;
    if (status >= 500) console.error(err);
    return res.status(status).json({ error: err.message ?? 'Something went wrong' });
  });

  return app;
}
