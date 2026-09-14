const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
require('dotenv').config({ path: require('path').join(__dirname, '.env') });

const app = express();
const PORT = process.env.PORT || 5000;

app.use(helmet());
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  credentials: true
}));
app.use(morgan('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const jobRoutes = require('./routes/jobs');
const networkingRoutes = require('./routes/networking');
const counselingRoutes = require('./routes/counseling');
const certificateRoutes = require('./routes/certificates');
const postRoutes = require('./routes/posts');
const majorRoutes = require('./routes/majors');
const statsRoutes = require('./routes/stats');
const announcementRoutes = require('./routes/announcements');
const counselingJournalRoutes = require('./routes/counseling-journals');
const educationProgramRoutes = require('./routes/education-programs');
const messageRoutes = require('./routes/messages');
const schoolRoutes = require('./routes/schools');
const meRoutes = require('./routes/me');
const auditLogRoutes = require('./routes/audit-logs');
const resumeRoutes = require('./routes/resumes');
const fileRoutes = require('./routes/files');

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/jobs', jobRoutes);
app.use('/api/networking', networkingRoutes);
app.use('/api/counseling', counselingRoutes);
app.use('/api/certificates', certificateRoutes);
app.use('/api/posts', postRoutes);
app.use('/api/majors', majorRoutes);
app.use('/api/stats', statsRoutes);
app.use('/api/announcements', announcementRoutes);
app.use('/api/counseling-journals', counselingJournalRoutes);
app.use('/api/education-programs', educationProgramRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/schools', schoolRoutes);
app.use('/api/me', meRoutes);
app.use('/api/audit-logs', auditLogRoutes);
app.use('/api/resumes', resumeRoutes);
app.use('/api/files', fileRoutes);

app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    message: 'Graduate Network API is running',
    version: '2.0.0-sprint1',
    timestamp: new Date().toISOString()
  });
});

app.get('/', (req, res) => {
  res.json({
    message: 'Welcome to Graduate Network API',
    version: '2.0.0-sprint1',
    endpoints: {
      auth: '/api/auth',
      users: '/api/users',
      jobs: '/api/jobs',
      schools: '/api/schools',
      me: '/api/me/permissions',
      auditLogs: '/api/audit-logs',
      resumes: '/api/resumes',
      files: '/api/files',
      networking: '/api/networking',
      counseling: '/api/counseling',
      certificates: '/api/certificates',
      posts: '/api/posts'
    }
  });
});

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({
    error: err.message || 'Internal Server Error',
    code: 'INTERNAL',
    status: err.status || 500
  });
});

app.use((req, res) => {
  res.status(404).json({
    error: 'Route not found',
    code: 'NOT_FOUND',
    status: 404
  });
});

async function start() {
  const { applyPendingMigrations } = require('./scripts/apply-migrations');
  try {
    await applyPendingMigrations();
  } catch (err) {
    console.error('❌ Failed to apply migrations:', err.message);
    if (process.env.NODE_ENV === 'production') {
      process.exit(1);
    }
  }

  const server = app.listen(PORT, () => {
    console.log(`🚀 Server is running on port ${PORT}`);
    console.log(`📡 API available at http://localhost:${PORT}/api`);
    console.log(`🏥 Health check at http://localhost:${PORT}/api/health`);
  });
  return server;
}

if (require.main === module) {
  start();
}

module.exports = app;
module.exports.start = start;
