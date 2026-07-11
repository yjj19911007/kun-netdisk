<div align="center">
  <h1>☁️ Kun 网盘</h1>
  <p>轻量级私有文件共享服务 · 支持上传/下载/分享链接</p>

  <a href="https://railway.app/template/LqDB3S?referralCode=kun">
    <img src="https://railway.app/button.svg" alt="Deploy on Railway" height="40">
  </a>
</div>

---

## ✨ 功能

- 📤 **文件上传** — 拖拽或点击上传，支持批量，最大 1GB/文件
- 📥 **文件下载** — 一键下载，保留原始文件名
- 🔗 **分享链接** — 开启分享后生成公开链接，无需登录即可下载
- 🗑️ **文件管理** — 查看列表、删除文件
- 🔒 **密码保护** — 登录才能管理，支持修改密码
- 📱 **响应式** — 手机电脑都能用

## 🚀 一键部署（推荐）

[![Deploy on Railway](https://railway.app/button.svg)](https://railway.app/template/LqDB3S?referralCode=kun)

点击上方按钮 → 登录 GitHub → 点 **Deploy** → 等 2 分钟即上线。

### 手动部署

```bash
git clone https://github.com/yjj19911007/kun-netdisk.git
cd kun-netdisk
npm install
PORT=3000 node server.js
```

## 🔧 环境变量

| 变量名 | 说明 | 默认值 |
|--------|------|--------|
| `PORT` | 监听端口 | `3000` |
| `KUN_NETDISK_SECRET` | JWT 密钥（自动生成） | 随机 |

## 👤 默认账号

| 用户名 | 密码 |
|--------|------|
| `admin` | `admin123` |

> ⚠️ 首次部署成功后请**立即修改密码**（右上角→修改密码）

## 📁 项目结构

```
kun-netdisk/
├── server.js          # 服务端主程序
├── package.json
├── railway.json       # Railway 部署配置
├── public/
│   └── index.html     # 前端页面
├── uploads/           # 上传文件存储
└── data/
    ├── files.json     # 文件元数据
    └── users.json     # 用户数据
```

## 🧩 技术栈

- **后端**: Node.js + Express + Multer
- **鉴权**: JWT + bcrypt
- **前端**: 原生 HTML/CSS/JS（无框架依赖）
- **部署**: Railway / 任意 Node.js 主机
