const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

// 鈹€鈹€鈹€ 閰嶇疆 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
const CONFIG = {
  port: parseInt(process.env.PORT || process.env.KUN_NETDISK_PORT || '3000', 10),
  jwtSecret: process.env.KUN_NETDISK_SECRET || crypto.randomBytes(32).toString('hex'),
  uploadDir: path.join(__dirname, 'uploads'),
  dataDir: path.join(__dirname, 'data'),
  maxFileSize: 1024 * 1024 * 1024, // 1GB
};

// 鈹€鈹€鈹€ 璺緞鍒濆鍖?鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
for (const dir of [CONFIG.uploadDir, CONFIG.dataDir]) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

// 鈹€鈹€鈹€ 鐢ㄦ埛绠＄悊 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
const USERS_FILE = path.join(CONFIG.dataDir, 'users.json');

function loadUsers() {
  try { return JSON.parse(fs.readFileSync(USERS_FILE, 'utf-8')); }
  catch { return {}; }
}

function saveUsers(users) {
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), 'utf-8');
}

// 鍒濆鍖栭粯璁ょ敤鎴?(async () => {
  const users = loadUsers();
  if (!users.admin) {
    users.admin = {
      password: await bcrypt.hash('admin123', 10),
      role: 'admin',
      createdAt: new Date().toISOString(),
    };
    saveUsers(users);
    console.log('[鍒濆鍖朷 榛樿璐﹀彿: admin / admin123');
  }
})();

// 鈹€鈹€鈹€ 鏂囦欢鍏冩暟鎹鐞?鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
const META_FILE = path.join(CONFIG.dataDir, 'files.json');

function loadMeta() {
  try { return JSON.parse(fs.readFileSync(META_FILE, 'utf-8')); }
  catch { return {}; }
}

function saveMeta(meta) {
  fs.writeFileSync(META_FILE, JSON.stringify(meta, null, 2), 'utf-8');
}

// 鈹€鈹€鈹€ Express 搴旂敤 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
const app = express();
app.use(express.json());

// ─── 健康检查（不需要登录） ────────────────────────
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', time: new Date().toISOString() });
});

// ─── Multer 配置 ────────────────────────────────────
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, CONFIG.uploadDir),
  filename: (req, file, cb) => {
    const safeName = file.originalname.replace(/[<>:"/\\\\|?*]/g, '_');
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

// 鈹€鈹€鈹€ 闈欐€佹枃浠?鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
app.use(express.static(path.join(__dirname, 'public')));

// 鈹€鈹€鈹€ JWT 涓棿浠?鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
function authMiddleware(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: '鏈櫥褰曪紝璇峰厛鐧诲綍' });
  }
  try {
    req.user = jwt.verify(header.slice(7), CONFIG.jwtSecret);
    next();
  } catch {
    return res.status(401).json({ error: '鐧诲綍宸茶繃鏈燂紝璇烽噸鏂扮櫥褰? });
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

// 鈹€鈹€鈹€ 璁よ瘉璺敱 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: '璇疯緭鍏ョ敤鎴峰悕鍜屽瘑鐮? });
  }
  const users = loadUsers();
  const user = users[username];
  if (!user || !(await bcrypt.compare(password, user.password))) {
    return res.status(401).json({ error: '鐢ㄦ埛鍚嶆垨瀵嗙爜閿欒' });
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
    return res.status(400).json({ error: '璇锋彁渚涙棫瀵嗙爜鍜屾柊瀵嗙爜' });
  }
  if (newPassword.length < 4) {
    return res.status(400).json({ error: '鏂板瘑鐮佽嚦灏?4 浣? });
  }
  const users = loadUsers();
  const user = users[req.user.username];
  if (!user || !(await bcrypt.compare(oldPassword, user.password))) {
    return res.status(401).json({ error: '鏃у瘑鐮侀敊璇? });
  }
  user.password = await bcrypt.hash(newPassword, 10);
  saveUsers(users);
  res.json({ ok: true });
});

// 鈹€鈹€鈹€ 鏂囦欢璺敱 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€

// 鑾峰彇鏂囦欢鍒楄〃
app.get('/api/files', authMiddleware, (req, res) => {
  const meta = loadMeta();
  const files = Object.values(meta).filter(f => {
    if (req.user.role === 'admin') return true;
    return f.owner === req.user.username;
  });
  files.sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt));
  res.json({ files });
});

// 涓婁紶鏂囦欢
app.post('/api/files/upload', authMiddleware, upload.array('files', 50), (req, res) => {
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ error: '璇烽€夋嫨鏂囦欢' });
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

// 鍒囨崲鏂囦欢鍒嗕韩鐘舵€?app.post('/api/files/:id/toggle-share', authMiddleware, (req, res) => {
  const meta = loadMeta();
  const file = meta[req.params.id];
  if (!file) return res.status(404).json({ error: '鏂囦欢涓嶅瓨鍦? });
  if (file.owner !== req.user.username && req.user.role !== 'admin') {
    return res.status(403).json({ error: '鏃犳潈闄? });
  }
  file.shared = !file.shared;
  saveMeta(meta);
  res.json({ file });
});

// 鍒犻櫎鏂囦欢
app.delete('/api/files/:id', authMiddleware, (req, res) => {
  const meta = loadMeta();
  const file = meta[req.params.id];
  if (!file) return res.status(404).json({ error: '鏂囦欢涓嶅瓨鍦? });
  if (file.owner !== req.user.username && req.user.role !== 'admin') {
    return res.status(403).json({ error: '鏃犳潈闄? });
  }
  const filePath = path.join(CONFIG.uploadDir, file.storedName);
  try { fs.unlinkSync(filePath); } catch { /* 鍙兘宸茶鎵嬪姩鍒犻櫎 */ }
  delete meta[req.params.id];
  saveMeta(meta);
  res.json({ ok: true });
});

// 涓嬭浇鏂囦欢
app.get('/api/files/:id/download', optionalAuth, (req, res) => {
  const meta = loadMeta();
  const file = meta[req.params.id];
  if (!file) return res.status(404).json({ error: '鏂囦欢涓嶅瓨鍦? });
  if (!file.shared) {
    if (!req.user) return res.status(401).json({ error: '璇ユ枃浠舵湭鍏紑鍒嗕韩锛岃鍏堢櫥褰? });
    if (file.owner !== req.user.username && req.user.role !== 'admin') {
      return res.status(403).json({ error: '鏃犳潈闄? });
    }
  }
  const filePath = path.join(CONFIG.uploadDir, file.storedName);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: '鏂囦欢宸茶鍒犻櫎' });
  }
  const safeName = encodeURIComponent(file.originalName);
  res.setHeader('Content-Disposition', 'attachment; filename*=UTF-8' + safeName);
  res.setHeader('Content-Type', file.mimeType || 'application/octet-stream');
  res.sendFile(filePath);
});

// 鑾峰彇鍒嗕韩淇℃伅锛堟棤鐧诲綍锛?app.get('/api/files/:id/info', (req, res) => {
  const meta = loadMeta();
  const file = meta[req.params.id];
  if (!file) return res.status(404).json({ error: '鏂囦欢涓嶅瓨鍦? });
  res.json({
    id: file.id,
    originalName: file.originalName,
    size: file.size,
    mimeType: file.mimeType,
    uploadedAt: file.uploadedAt,
    shared: file.shared,
  });
});

// 绯荤粺淇℃伅
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

// 鈹€鈹€鈹€ 閿欒澶勭悊 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
app.use((err, req, res, next) => {
  console.error('[閿欒]', err.message);
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: '鏂囦欢瓒呰繃澶у皬闄愬埗 (鏈€澶?1GB)' });
  }
  res.status(500).json({ error: err.message || '鏈嶅姟鍣ㄩ敊璇? });
});

// 鈹€鈹€鈹€ 鍚姩 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
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
  console.log('  鈽侊笍  Kun 缃戠洏宸插惎鍔?);
  console.log('  鏈湴鍦板潃: http://localhost:' + CONFIG.port);
  console.log('  灞€鍩熺綉:   http://' + getLocalIP() + ':' + CONFIG.port);
  console.log('  榛樿璐﹀彿: admin / admin123');
  console.log('');
});
