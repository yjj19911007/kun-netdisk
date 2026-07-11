const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const CONFIG = {
  port: parseInt(process.env.PORT || process.env.KUN_NETDISK_PORT || '3000', 10),
  jwtSecret: process.env.KUN_NETDISK_SECRET || crypto.randomBytes(32).toString('hex'),
  uploadDir: path.join(__dirname, 'uploads'),
  dataDir: path.join(__dirname, 'data'),
  maxFileSize: 1024 * 1024 * 1024,
};

for (const dir of [CONFIG.uploadDir, CONFIG.dataDir]) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

const USERS_FILE = path.join(CONFIG.dataDir, 'users.json');

function loadUsers() {
  try { return JSON.parse(fs.readFileSync(USERS_FILE, 'utf-8')); }
  catch { return {}; }
}

function saveUsers(users) {
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), 'utf-8');
}

(async () => {
  const users = loadUsers();
  if (!users.admin) {
    users.admin = {
      password: await bcrypt.hash('admin123', 10),
      role: 'admin',
      createdAt: new Date().toISOString(),
    };
    saveUsers(users);
    console.log('[init] default account: admin / admin123');
  }
})();

const META_FILE = path.join(CONFIG.dataDir, 'files.json');

function loadMeta() {
  try { return JSON.parse(fs.readFileSync(META_FILE, 'utf-8')); }
  catch { return {}; }
}

function saveMeta(meta) {
  fs.writeFileSync(META_FILE, JSON.stringify(meta, null, 2), 'utf-8');
}

const app = express();
app.use(express.json());

// Healthcheck (no auth required)
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', time: new Date().toISOString() });
});

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, CONFIG.uploadDir),
  filename: (req, file, cb) => {
    const safeName = file.originalname.replace(/[<>:"/\\|?*]/g, '_');
    const fullPath = path.join(CONFIG.uploadDir, safeName);
    if (!fs.existsSync(fullPath)) return cb(null, safeName);
    const ext = path.extname(safeName);
    const base = path.basename(safeName, ext);
    cb(null, base + '_' + Date.now() + ext);
  },
});

const upload = multer({ storage, limits: { fileSize: CONFIG.maxFileSize } });

app.use(express.static(path.join(__dirname, 'public')));

function authMiddleware(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  try {
    req.user = jwt.verify(header.slice(7), CONFIG.jwtSecret);
    next();
  } catch {
    return res.status(401).json({ error: 'Token expired' });
  }
}

function optionalAuth(req, res, next) {
  const header = req.headers.authorization;
  if (header && header.startsWith('Bearer ')) {
    try { req.user = jwt.verify(header.slice(7), CONFIG.jwtSecret); }
    catch { }
  }
  next();
}

app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Missing credentials' });
  const users = loadUsers();
  const user = users[username];
  if (!user || !(await bcrypt.compare(password, user.password))) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  const token = jwt.sign({ username, role: user.role }, CONFIG.jwtSecret, { expiresIn: '7d' });
  res.json({ token, username, role: user.role });
});

app.post('/api/change-password', authMiddleware, async (req, res) => {
  const { oldPassword, newPassword } = req.body;
  if (!oldPassword || !newPassword) return res.status(400).json({ error: 'Missing passwords' });
  if (newPassword.length < 4) return res.status(400).json({ error: 'Password too short' });
  const users = loadUsers();
  const user = users[req.user.username];
  if (!user || !(await bcrypt.compare(oldPassword, user.password))) {
    return res.status(401).json({ error: 'Wrong password' });
  }
  user.password = await bcrypt.hash(newPassword, 10);
  saveUsers(users);
  res.json({ ok: true });
});

app.get('/api/files', authMiddleware, (req, res) => {
  const meta = loadMeta();
  const files = Object.values(meta).filter(f => {
    if (req.user.role === 'admin') return true;
    return f.owner === req.user.username;
  });
  files.sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt));
  res.json({ files });
});

app.post('/api/files/upload', authMiddleware, upload.array('files', 50), (req, res) => {
  if (!req.files || req.files.length === 0) return res.status(400).json({ error: 'No files' });
  const meta = loadMeta();
  const uploaded = [];
  for (const f of req.files) {
    const id = crypto.randomBytes(8).toString('hex');
    const fileData = {
      id, originalName: f.originalname, storedName: f.filename,
      size: f.size, mimeType: f.mimetype,
      owner: req.user.username, uploadedAt: new Date().toISOString(), shared: false,
    };
    meta[id] = fileData;
    uploaded.push(fileData);
  }
  saveMeta(meta);
  res.json({ files: uploaded });
});

app.post('/api/files/:id/toggle-share', authMiddleware, (req, res) => {
  const meta = loadMeta();
  const file = meta[req.params.id];
  if (!file) return res.status(404).json({ error: 'Not found' });
  if (file.owner !== req.user.username && req.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
  file.shared = !file.shared;
  saveMeta(meta);
  res.json({ file });
});

app.delete('/api/files/:id', authMiddleware, (req, res) => {
  const meta = loadMeta();
  const file = meta[req.params.id];
  if (!file) return res.status(404).json({ error: 'Not found' });
  if (file.owner !== req.user.username && req.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
  const filePath = path.join(CONFIG.uploadDir, file.storedName);
  try { fs.unlinkSync(filePath); } catch { }
  delete meta[req.params.id];
  saveMeta(meta);
  res.json({ ok: true });
});

app.get('/api/files/:id/download', optionalAuth, (req, res) => {
  const meta = loadMeta();
  const file = meta[req.params.id];
  if (!file) return res.status(404).json({ error: 'Not found' });
  if (!file.shared) {
    if (!req.user) return res.status(401).json({ error: 'Login required' });
    if (file.owner !== req.user.username && req.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
  }
  const filePath = path.join(CONFIG.uploadDir, file.storedName);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File deleted' });
  const safeName = encodeURIComponent(file.originalName);
  res.setHeader('Content-Disposition', 'attachment; filename*=UTF-8' + safeName);
  res.setHeader('Content-Type', file.mimeType || 'application/octet-stream');
  res.sendFile(filePath);
});

app.get('/api/files/:id/info', (req, res) => {
  const meta = loadMeta();
  const file = meta[req.params.id];
  if (!file) return res.status(404).json({ error: 'Not found' });
  res.json({
    id: file.id, originalName: file.originalName, size: file.size,
    mimeType: file.mimeType, uploadedAt: file.uploadedAt, shared: file.shared,
  });
});

app.get('/api/status', authMiddleware, (req, res) => {
  const meta = loadMeta();
  const totalFiles = Object.keys(meta).length;
  const totalSize = Object.values(meta).reduce((sum, f) => sum + (f.size || 0), 0);
  res.json({ totalFiles, totalSize, username: req.user.username, role: req.user.role });
});

app.use((err, req, res, next) => {
  console.error('[Error]', err.message);
  if (err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'File too large (max 1GB)' });
  res.status(500).json({ error: err.message || 'Server error' });
});

const port = CONFIG.port;
app.listen(port, '0.0.0.0', () => {
  console.log('Kun Netdisk running on port ' + port);
});
