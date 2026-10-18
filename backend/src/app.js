import cors from 'cors';
import express from 'express';
import { config } from './config.js';
import { countDemoAccounts, DEMO_ACCOUNT_COUNT } from './lib/seed.js';
import { metricsMiddleware, renderMetrics } from './lib/metrics.js';
import { redisStatus } from './lib/redis.js';
import accountRoutes from './routes/account.js';
import adminRoutes from './routes/admin.js';
import aiRoutes from './routes/ai.js';
import assistantRoutes from './routes/assistant.js';
import authRoutes from './routes/auth.js';
import calendarRoutes from './routes/calendar.js';
import crmRoutes from './routes/crm.js';
import dashboardRoutes from './routes/dashboard.js';
import deployRoutes from './routes/deploy.js';
import integrationRoutes from './routes/integrations.js';
import paymentRoutes, { stripeWebhookHandler } from './routes/payments.js';
import profileRoutes from './routes/profile.js';
import subscriptionRoutes from './routes/subscriptions.js';
import whatsappRoutes from './routes/whatsapp.js';
import workspaceRoutes from './routes/workspace.js';

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
  // Stripe signs the exact bytes it sends, so this one route keeps the raw body. It has
  // to be mounted before express.json() replaces the body with a parsed object.
  app.post(
    '/api/payments/stripe/webhook',
    express.raw({ type: 'application/json', limit: '256kb' }),
    stripeWebhookHandler,
  );

  app.use(express.json({ limit: '100kb' }));

  // Counts and times every request. Prometheus scrapes /metrics below.
  app.use(metricsMiddleware);

  app.get('/metrics', (req, res) => {
    res.type('text/plain; version=0.0.4');
    res.send(renderMetrics());
  });

  app.get('/api/health', async (req, res) => {
    res.json({
      status: 'ok',
      env: config.env,
      demoAccounts: await countDemoAccounts(),
      demoAccountsExpected: DEMO_ACCOUNT_COUNT,
      redis: await redisStatus(),
    });
  });

  app.use('/api/auth', authRoutes);
  app.use('/api/account', accountRoutes);
  app.use('/api/admin', adminRoutes);
  app.use('/api/assistant', assistantRoutes);
  app.use('/api/payments', paymentRoutes);
  app.use('/api/profile', profileRoutes);
  app.use('/api/ai', aiRoutes);
  app.use('/api/whatsapp', whatsappRoutes);

  // Every connector a workspace can attach, in one read.
  app.use('/api/integrations', integrationRoutes);

  // Plan, status, limits and invoices for the workspace.
  app.use('/api/subscription', subscriptionRoutes);

  // Every figure on the operational dashboard, read at one moment.
  app.use('/api/dashboard', dashboardRoutes);

  // The CRM: leads, pipeline and activity. /demo-request is public so the marketing
  // site's form feeds the pipeline directly.
  app.use('/api/crm', crmRoutes);

  // Workspace administration: settings, members, configurable roles.
  app.use('/api/workspace', workspaceRoutes);

  // Google Calendar: OAuth callback (public) plus booking for a lead.
  app.use('/api/calendar', calendarRoutes);

  // Whether a deployment is currently replacing the stack. Public and read-only
  // unless DEPLOY_STATUS_TOKEN is set, which only the deploy pipeline does.
  app.use('/api/deploy', deployRoutes);

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
