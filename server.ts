import { guardCreateMember, guardRegisterResource, guardSendNotification } from './src/server/guards';

app.post('/api/members/create', guardCreateMember, (req, res) => void handleCreateMember(req, res));
app.post('/api/notifications/send', guardSendNotification, (req, res) => void handleSendNotification(req, res));
app.post('/api/resources/register', guardRegisterResource, (req, res) => void handleRegisterResource(req, res));
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import {
  handleArchiveGroup,
  handleArchiveStudent,
  handleCreateConversation,
  handleCreateInvoice,
  handleCreateMember,
  handleCreateOrUpdateGroup,
  handleCreatePayroll,
  handleDisableMember,
  handleLinkParentToStudent,
  handleRecordPayment,
  handleRecordSession,
  handleRegisterResource,
  handleSendNotification,
  handleUpdatePermissions,
  handleUpsertLead,
  handleUpsertStudent,
} from './src/server/handlers';

const PORT = Number(process.env.PORT || 3000);

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  // Healthcheck
  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, service: 'منصة الأكاديميات' });
  });

  // Protected RBAC API Routes
  app.post('/api/members/create', (req, res) => void handleCreateMember(req, res));
  app.post('/api/members/disable', (req, res) => void handleDisableMember(req, res));
  app.post('/api/members/permissions', (req, res) => void handleUpdatePermissions(req, res));

  app.post('/api/students/upsert', (req, res) => void handleUpsertStudent(req, res));
  app.post('/api/students/archive', (req, res) => void handleArchiveStudent(req, res));

  app.post('/api/groups/upsert', (req, res) => void handleCreateOrUpdateGroup(req, res));
  app.post('/api/groups/archive', (req, res) => void handleArchiveGroup(req, res));

  app.post('/api/parent-links/link', (req, res) => void handleLinkParentToStudent(req, res));

  app.post('/api/sessions/record', (req, res) => void handleRecordSession(req, res));

  app.post('/api/finance/invoice', (req, res) => void handleCreateInvoice(req, res));
  app.post('/api/finance/payment', (req, res) => void handleRecordPayment(req, res));
  app.post('/api/finance/payroll', (req, res) => void handleCreatePayroll(req, res));

  app.post('/api/crm/lead', (req, res) => void handleUpsertLead(req, res));

  app.post('/api/conversations/create', (req, res) => void handleCreateConversation(req, res));
  app.post('/api/notifications/send', (req, res) => void handleSendNotification(req, res));
  app.post('/api/resources/register', (req, res) => void handleRegisterResource(req, res));

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      const indexHtml = path.join(distDir, 'index.html');
      if (fs.existsSync(indexHtml)) {
        res.sendFile(indexHtml);
      } else {
        res.status(404).send('Build artifacts not found.');
      }
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Academy server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
