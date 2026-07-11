const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

// ─── 配置 ───────────────────────────────────────────
const CONFIG = {
  port: parseInt(process.env.PORT || process.env.KUN_NETDISK_PORT || '3000', 10),
  jwtSecret: process.env.KUN_NETDISK_SECRET || crypto.randomBytes(32).toString('hex'),
  uploadDir: path.join(__dirname, 'uploads'),
  dataDir: path.join(__dirname, 'data'),
  maxFileSize: 1024 * 1024 * 1024, // 1GB
};

// ─── 路径初始化 ─────────────────────────────────────
for (const dir of [CONFIG.uploadDir, CONFIG.dataDir]) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

// ─── 用户管理 ───────────────────────────────────────
const USERS_FILE = path.join(CONFIG.dataDir, 'users.json');

function loadUsers() {
  try { return JSON.parse(fs.readFileSync(USERS_FILE, 'utf-8')); }
  catch { return {}; }
}

function saveUsers(users) {
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), 'utf-8');
}

// 初始化默认用户
(async () => {
  const users = loadUsers();
  if (!users.admin) {
    users.admin = {
      password: await bcrypt.hash('admin123', 10),
      role: 'admin',
      createdAt: new Date().toISOString(),
    };
    saveUsers(users);
    console.log('[初始化] 默认账号: admin / admin123');
  }
})();

// ─── 文件元数据管理 ─────────────────────────────────
const META_FILE = path.join(CONFIG.dataDir, 'files.json');

function loadMeta() {
  try { return JSON.parse(fs.readFileSync(META_FILE, 'utf-8')); }
  catch { return {}; }
}

function saveMeta(meta) {
  fs.writeFileSync(META_FILE, JSON.stringify(meta, null, 2), 'utf-8');
}

// ─── Express 应用 ──────────────────────────────────
const app = express();
app.use(express.json());

// ─── Multer 配置 ────────────────────────────────────
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

const upload = multer({
  storage,
  limits: { fileSize: CONFIG.maxFileSize },
});

// ─── 静态文件 ──────────────────────────────────────
app.use(express.static(path.join(__dirname, 'public')));

// ─── JWT 中间件 ─────────────────────────────────────
function authMiddleware(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: '未登录，请先登录' });
  }
  try {
    req.user = jwt.verify(header.slice(7), CONFIG.jwtSecret);
    next();
  } catch {
    return res.status(401).json({ error: '登录已过期，请重新登录' });
  }
}

function optionalAuth(req, res, next) {
  const header = req.headers.authorization;
  if (header && header.startsWith('Bearer ')) {
    try { req.user = jwt.verify(header.slice(7), CONFIG.jwtSecret); }
    catch { /* ignore */ }
  }
  next();
}

// ─── 认证路由 ───────────────────────────────────────
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: '请输入用户名和密码' });
  }
  const users = loadUsers();
  const user = users[username];
  if (!user || !(await bcrypt.compare(password, user.password))) {
    return res.status(401).json({ error: '用户名或密码错误' });
  }
  const token = jwt.sign(
    { username, role: user.role },
    CONFIG.jwtSecret,
    { expiresIn: '7d' }
  );
  res.json({ token, username, role: user.role });
});

app.post('/api/change-password', authMiddleware, async (req, res) => {
  const { oldPassword, newPassword } = req.body;
  if (!oldPassword || !newPassword) {
    return res.status(400).json({ error: '请提供旧密码和新密码' });
  }
  if (newPassword.length < 4) {
    return res.status(400).json({ error: '新密码至少 4 位' });
  }
  const users = loadUsers();
  const user = users[req.user.username];
  if (!user || !(await bcrypt.compare(oldPassword, user.password))) {
    return res.status(401).json({ error: '旧密码错误' });
  }
  user.password = await bcrypt.hash(newPassword, 10);
  saveUsers(users);
  res.json({ ok: true });
});

// ─── 文件路由 ───────────────────────────────────────

// 获取文件列表
app.get('/api/files', authMiddleware, (req, res) => {
  const meta = loadMeta();
  const files = Object.values(meta).filter(f => {
    if (req.user.role === 'admin') return true;
    return f.owner === req.user.username;
  });
  // 按上传时间倒序
  files.sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt));
  res.json({ files });
});

// 上传文件
app.post('/api/files/upload', authMiddleware, upload.array('files', 50), (req, res) => {
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ error: '请选择文件' });
  }
  const meta = loadMeta();
  const uploaded = [];
  for (const f of req.files) {
    const id = crypto.randomBytes(8).toString('hex');
    const fileData = {
      id,
      originalName: f.originalname,
      storedName: f.filename,
      size: f.size,
      mimeType: f.mimetype,
      owner: req.user.username,
      uploadedAt: new Date().toISOString(),
      shared: false,
    };
    meta[id] = fileData;
    uploaded.push(fileData);
  }
  saveMeta(meta);
  res.json({ files: uploaded });
});

// 切换文件分享状态
app.post('/api/files/:id/toggle-share', authMiddleware, (req, res) => {
  const meta = loadMeta();
  const file = meta[req.params.id];
  if (!file) return res.status(404).json({ error: '文件不存在' });
  if (file.owner !== req.user.username && req.user.role !== 'admin') {
    return res.status(403).json({ error: '无权限' });
  }
  file.shared = !file.shared;
  saveMeta(meta);
  res.json({ file });
});

// 删除文件
app.delete('/api/files/:id', authMiddleware, (req, res) => {
  const meta = loadMeta();
  const file = meta[req.params.id];
  if (!file) return res.status(404).json({ error: '文件不存在' });
  if (file.owner !== req.user.username && req.user.role !== 'admin') {
    return res.status(403).json({ error: '无权限' });
  }
  const filePath = path.join(CONFIG.uploadDir, file.storedName);
  try { fs.unlinkSync(filePath); } catch { /* 可能已被手动删除 */ }
  delete meta[req.params.id];
  saveMeta(meta);
  res.json({ ok: true });
});

// 下载文件
app.get('/api/files/:id/download', optionalAuth, (req, res) => {
  const meta = loadMeta();
  const file = meta[req.params.id];
  if (!file) return res.status(404).json({ error: '文件不存在' });
  if (!file.shared) {
    if (!req.user) return res.status(401).json({ error: '该文件未公开分享，请先登录' });
    if (file.owner !== req.user.username && req.user.role !== 'admin') {
      return res.status(403).json({ error: '无权限' });
    }
  }
  const filePath = path.join(CONFIG.uploadDir, file.storedName);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: '文件已被删除' });
  }
  const safeName = encodeURIComponent(file.originalName);
  res.setHeader('Content-Disposition', 'attachment; filename*=UTF-8' + safeName);
  res.setHeader('Content-Type', file.mimeType || 'application/octet-stream');
  res.sendFile(filePath);
});

// 获取分享信息（无登录）
app.get('/api/files/:id/info', (req, res) => {
  const meta = loadMeta();
  const file = meta[req.params.id];
  if (!file) return res.status(404).json({ error: '文件不存在' });
  res.json({
    id: file.id,
    originalName: file.originalName,
    size: file.size,
    mimeType: file.mimeType,
    uploadedAt: file.uploadedAt,
    shared: file.shared,
  });
});

// 系统信息
app.get('/api/status', authMiddleware, (req, res) => {
  const meta = loadMeta();
  const totalFiles = Object.keys(meta).length;
  const totalSize = Object.values(meta).reduce((sum, f) => sum + (f.size || 0), 0);
  res.json({
    totalFiles,
    totalSize,
    username: req.user.username,
    role: req.user.role,
  });
});

// ─── 错误处理 ───────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('[错误]', err.message);
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: '文件超过大小限制 (最大 1GB)' });
  }
  res.status(500).json({ error: err.message || '服务器错误' });
});

// ─── 启动 ───────────────────────────────────────────
function getLocalIP() {
  try {
    const os = require('os');
    const ifaces = os.networkInterfaces();
    for (const name of Object.keys(ifaces)) {
      for (const iface of ifaces[name]) {
        if (iface.family === 'IPv4' && !iface.internal) return iface.address;
      }
    }
  } catch {}
  return '127.0.0.1';
}

app.listen(CONFIG.port, '0.0.0.0', () => {
  console.log('');
  console.log('  ☁️  Kun 网盘已启动');
  console.log('  本地地址: http://localhost:' + CONFIG.port);
  console.log('  局域网:   http://' + getLocalIP() + ':' + CONFIG.port);
  console.log('  默认账号: admin / admin123');
  console.log('');
});
