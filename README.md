# 🏕️ 露营地活动导航 (campsite-nav)

> **测试环境**：https://lurecamp1.xiabebe.cn (腾讯云, 主开发)
>
> **生产环境**：https://lurecamp.xiabebe.cn (阿里云, 用户访问)
>
> **适用场景**：上海市嘉定区华亭镇 **乡悦华亭度假村**（霜竹公路 518 号）
>
> **核心特性**：纯前端 + 轻量 Node.js 后端，所有数据服务器共享，手机优先

---

## 目录

1. [架构总览](#架构总览)
2. [功能详解](#功能详解)
3. [配置 & 凭据](#配置--凭据)
4. [部署](#部署)
5. [API 端点](#api-端点)
6. [项目结构](#项目结构)
7. [技术栈](#技术栈)
8. [调试 & 排错](#调试--排错)
9. [变更日志](#变更日志)

---

## 架构总览

```
┌──────────────────────────────────────────────────────────┐
│  游客手机 / 后台浏览器                                    │
│  ┌──────────────┐  ┌──────────────┐                     │
│  │ index.html   │  │ admin.html   │  (登录密码 8888)    │
│  │ 顾客导航页    │  │ 后台管理     │                     │
│  └──────┬───────┘  └──────┬───────┘                     │
└─────────┼─────────────────┼──────────────────────────────┘
          │ HTTPS (443)    │
          ▼                 ▼
┌──────────────────────────────────────────────────────────┐
│  nginx (1.24) + Let's Encrypt SSL                        │
│  ┌─────────────┬──────────────┬────────────────────┐    │
│  │ /  → 静态    │ /api/ → 3005 │ /ar_shots/ → 3005  │    │
│  │             │ /uploads/  →  │                    │    │
│  └─────────────┴──────────────┴────────────────────┘    │
└─────────┬────────────────────────────────────────────────┘
          │ proxy_pass
          ▼
┌──────────────────────────────────────────────────────────┐
│  Node.js v22 后端  (port 3005, 零依赖)                   │
│  ~/campsite-nav-api/server.js  (1410 行)                 │
│  ┌──────────────────────────────────────────────────┐    │
│  │  HTTP router (raw http module)                    │    │
│  │  ├── /api/points          (POI 活动点)            │    │
│  │  ├── /api/activities      (活动配置)              │    │
│  │  ├── /api/bookings        (预约审批)              │    │
│  │  ├── /api/checkins        (打卡集章)              │    │
│  │  ├── /api/checkins/stats  (打卡统计)              │    │
│  │  ├── /api/sms/send        (短信验证码)            │    │
│  │  ├── /api/auth/login      (手机号登录)            │    │
│  │  ├── /api/users           (用户列表 admin)        │    │
│  │  ├── /api/coupons/*       (优惠券 CRUD+核销)      │    │
│  │  ├── /api/ar/frames       (AR 贴图 CRUD)          │    │
│  │  ├── /api/ar/shoot        (拍照合成)              │    │
│  │  ├── /api/ar/settings     (AR 全局默认)           │    │
│  │  ├── /api/ai              (AI 客服转发)           │    │
│  │  └── /ar_shots/<file>     (静态图访问)            │    │
│  │                                                    │    │
│  │  文件存储: /var/lib/campsite-nav/                  │    │
│  │  ├── points.json activities.json bookings.json     │    │
│  │  ├── checkins.json users.json sms_codes.json       │    │
│  │  ├── coupon_templates.json user_coupons.json      │    │
│  │  ├── coupon_redemptions.json                       │    │
│  │  ├── ar_frames.json ar_settings.json               │    │
│  │  └── ar_shots/ (贴图 PNG + 合成 JPG)               │    │
│  │                                                    │    │
│  │  临时: /tmp/campsite-diag.log (前端错误诊断)       │    │
│  └──────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────┘
```

**关键设计**:
- 前端零构建，纯 HTML/CSS/JS（无 React/Vue，无 npm）
- 后端零依赖（无 Express/Koa，纯 `http` 模块）
- 浏览器端 localStorage 做离线降级（POI 活动点缓存）
- 鉴权简单：后端管理接口靠 `Authorization: Bearer <ADMIN_TOKEN>`，后台登录靠 sessionStorage 密码门
- 坐标存储 WGS-84，渲染 BD-09（百度 BMap 瓦片）

---

## 功能详解

### 📍 顾客导航页 (`index.html`)

| 功能 | 描述 |
|---|---|
| 百度地图 BMap | 真实瓦片，POI 标记，距离 200m 提示 |
| 目标下拉 | 顶部 select 选目标 → 地图画线 + fitBounds |
| 结束导航 | 目标下拉右边 ✕ 按钮（无目标时隐藏） |
| 路线指引 | 蓝虚线连接用户 → 目标，底部 route-info 显示距离/步行时长 |
| 步行/驾车 | 一键唤起百度地图 App 唤起（步行/驾车 URL Scheme） |
| AR 拍照 | 拍照 + 贴图合成（POI 关联 logoFrameId / 全局默认 / 隐形） |
| 主动拍照打卡 | 工具栏"📷 拍照" → 拍照 → 提交 (kind=other 不计奖励) |
| 拍照打卡 | 到 POI 30s 停留自动弹拍照模态 → 提交得印章 |
| 打卡面板 | 工具栏"🏆 打卡" → 集章进度 + 9 POI 印章格 + 最近打卡缩略图灯箱 |
| 活动配置 | 弹活动列表 → 选时间/人数 → 预约提交 |
| 优惠券 | 3 tab (可领/我的/记录) + 券码核销 |
| 用户 | 手机号 + 验证码登录 (DEV: code 直接返回) |
| 工具栏 | 7 按钮: 游客/呼叫/AI/打卡/预约/拍照/优惠券 |
| 实时定位 | `watchPosition` 高精度 + GPS heading + DeviceOrientation |
| 定位失败 | 橙色 banner 3 种错误码 + 重试按钮 + 用户标记变灰 |
| 指南针 | iOS 13+ 显式请求方向传感器权限 |

### 🛠️ 后台管理 (`admin.html`)

| Tab | 功能 |
|---|---|
| 📍 活动点 | 可视化地图 (BMap) + 表格 CRUD + 点击地图/我的位置自动填经纬度 + JSON 导入导出 + 重置默认 |
| 📅 活动配置 | 4 种活动类型 (活动/餐饮/酒店/主题) + 时间段 + 价格 + 容量 |
| 👥 用户 | 手机号/昵称/累计打卡/最后活跃时间 (链接拨打) |
| 📋 预约审批 | 待确认/已确认/已取消 状态 + 备注 + 确认/取消按钮 |
| 🏆 打卡 | 用户/类型/搜索 过滤 + 总打卡/有照片/用户数 统计 + 缩略图列 (点开看大图) |
| 💾 导入/导出 | JSON 备份恢复 |
| 🎫 优惠券 | 模板管理 (满减/折扣/赠品) + 发行给用户 + 记录查询 |
| 🎟️ 券码核销 | 扫用户券码 → 验证 → 标记已用 |
| 📸 AR 贴图 | 9 个 180×180 combo 主题 (9 POI 已配) + 一键清空 |
| 🎯 AR 默认 | 全局默认 logo (拍照时无 point logoFrameId 时 fallback) |

后台登录：密码 `8888`，sessionStorage 验证 1 小时有效。

---

## 配置 & 凭据

### 凭据清单

| 凭据 | 用途 | 位置 | 备注 |
|---|---|---|---|
| 百度地图 BMap JS API AK | 浏览器端加载瓦片 | `index.html` / `admin.html` 的 `<script src="...api?v=3.0&ak=...">` | ⚠️ 明文暴露 |
| 后端 ADMIN_TOKEN | 写管理接口鉴权 | `campsite-nav-api/server.js` line 6 | ⚠️ 明文 `campsite-nav-2026` |
| 后台登录密码 | admin.html 登录门 | `js/admin-shell.js` `ADMIN_PASSWORD = '8888'` | 改值需编辑 |
| 阿里云 root 密码 | ssh 部署 | 环境 | ⚠️ 明文暴露 |
| 腾讯云 ubuntu 密码 | ssh 部署 | 环境 | ⚠️ 明文暴露 |
| GitHub PAT | 推送代码 | `git push` HTTPS 认证 | ⚠️ 已明文暴露 |

> **建议**（已记 AGENTS.md）：
> - 百度地图控制台重置 AK
> - 改 ADMIN_TOKEN 值（server.js + data.js 双处）
> - 改阿里云 root 密码 (`passwd`)
> - GitHub Settings → Developer settings → Personal access tokens → Revoke + 新建

### 前端环境变量

- `window.CAMPSITE_API_BASE`（默认 `/api`）：开发时改 `js/data.js` 可指向本地后端
- 无构建步骤，无 webpack/vite，无需 `.env`

### 后端环境变量

后端 `server.js` **无环境变量**，所有路径写死：
- 静态目录: `/var/www/<domain>/`
- 数据目录: `/var/lib/campsite-nav/`
- 日志: `/tmp/api-<host>.log`
- 监听端口: `3005`
- ADMIN_TOKEN: `campsite-nav-2026`（硬编码 line 6）

---

## 部署

### 双云环境

| 环境 | 域名 | 服务器 | SSH 用户/密码 | 用途 |
|---|---|---|---|---|
| **测试/开发** | `lurecamp1.xiabebe.cn` | 腾讯云 `124.222.29.46` | `ubuntu` / `hErewego~071381` | 主改后部署这里验证 |
| **生产** | `lurecamp.xiabebe.cn` | 阿里云 `47.96.168.224` | `root` / `Babamama408317` | 验证通过后再部署这里 |

**工作流**：本地改 → 部署腾讯云 → 验证 → 部署阿里云（生产）。

### 部署前端

**单文件快速部署**（本地 → 服务器）：

```bash
# 腾讯云
sshpass -p 'hErewego~071381' scp <file> ubuntu@124.222.29.46:/tmp/<file>.new
sshpass -p 'hErewego~071381' ssh ubuntu@124.222.29.46 \
  "sudo -n mv -f /tmp/<file>.new /var/www/lurecamp1.xiabebe.cn/<path>/<file> && \
   sudo -n chown www-data:www-data /var/www/lurecamp1.xiabebe.cn/<path>/<file>"

# 阿里云
sshpass -p 'Babamama408317' scp <file> root@47.96.168.224:/tmp/<file>.new
sshpass -p 'Babamama408317' ssh root@47.96.168.224 \
  "mv -f /tmp/<file>.new /var/www/lurecamp.xiabebe.cn/<path>/<file>"
```

**部署后必须验证**：

```bash
md5sum <local-file>
ssh ... "md5sum /var/www/<domain>/<file>"
# 两个 md5 必须完全一致
```

> ⚠️ `scp` 在多行 ssh 链里**偶发静默失败**（md5 不一致但 exit 0），务必单独重跑 scp + 立即 md5 验证。

**全量 tar 部署**：

```bash
cd ~/campsite-nav
tar czf /tmp/campsite-nav-deploy.tar.gz \
  --exclude='.DS_Store' --exclude='._*' --exclude='.git' \
  index.html admin.html js/ css/
sshpass -p 'hErewego~071381' scp /tmp/campsite-nav-deploy.tar.gz ubuntu@124.222.29.46:~/
sshpass -p 'hErewego~071381' ssh ubuntu@124.222.29.46 \
  "sudo -n bash -c '
    rm -rf /tmp/deploy-stage && mkdir -p /tmp/deploy-stage
    cd /tmp/deploy-stage
    tar xzf /home/ubuntu/campsite-nav-deploy.tar.gz
    cp -r index.html admin.html js/ css/ /var/www/lurecamp1.xiabebe.cn/
    chown -R www-data:www-data /var/www/lurecamp1.xiabebe.cn/
  '"
```

### 部署后端

```bash
# 1. 推 server.js
sshpass -p 'hErewego~071381' scp ~/campsite-nav-api/server.js ubuntu@124.222.29.46:/tmp/server.js.new
sshpass -p 'hErewego~071381' ssh ubuntu@124.222.29.46 \
  "sudo -n mv -f /tmp/server.js.new /home/ubuntu/campsite-nav-api/server.js && \
   sudo -n md5sum /home/ubuntu/campsite-nav-api/server.js"

# 2. 重启 (用脚本, 不要 ssh 命令里 nohup&disown, 会挂住 ssh)
cat > /tmp/restart-tx.sh <<'EOF'
#!/bin/bash
ps -ef | grep 'node server' | grep -v grep | awk '{print $2}' | xargs -r kill -9
sleep 2
cd /home/ubuntu/campsite-nav-api
setsid nohup node server.js > /tmp/tx-api.log 2>&1 < /dev/null &
disown
sleep 3
ps -ef | grep 'node server' | grep -v grep
curl -sI http://localhost:3005/api/health
EOF
scp /tmp/restart-tx.sh ubuntu@124.222.29.46:/tmp/restart.sh
ssh ubuntu@124.222.29.46 "sudo -n bash /tmp/restart.sh"
```

### nginx 配置

`/etc/nginx/sites-enabled/lurecamp1.xiabebe.cn` 关键片段：

```nginx
server {
    server_name lurecamp1.xiabebe.cn;
    root /var/www/lurecamp1.xiabebe.cn;

    # API 反代
    location /api/ {
        proxy_pass http://localhost:3005;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        add_header Access-Control-Allow-Origin * always;
    }

    # AR 合影静态文件
    location /ar_shots/ {
        proxy_pass http://localhost:3005;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        add_header Access-Control-Allow-Origin * always;
        expires 1d;
    }

    # 静态资源 (regex 必须缩窄, 不抢反代)
    location ~* ^/(js|css|assets)/.+\.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
        expires 1h;
        add_header Cache-Control "no-store, no-cache";
    }

    location / {
        try_files $uri $uri/ /index.html;
    }

    listen 443 ssl;
    ssl_certificate /etc/letsencrypt/live/lurecamp1.xiabebe.cn/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/lurecamp1.xiabebe.cn/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
}
```

> ⚠️ 之前 `location ~* \.(png|...)$` 宽 regex 会抢走 `location /ar_shots/` 反代前缀, 改成 `^/(js|css|assets)/` 缩窄。

### 本地开发

```bash
cd ~/campsite-nav
python3 -m http.server 8080
# 访问 http://localhost:8080/

# 启动本地后端 (需 sudo 因为要写 /var/lib)
cd ~/campsite-nav-api
DATA_DIR_OVERRIDE=/tmp/dev-data node server.js
# (server.js 当前无 env override, 改路径用 sed -i)
```

---

## API 端点

后端 `server.js` 所有路由（写接口需 `Authorization: Bearer campsite-nav-2026`）：

| 方法 | 路径 | 鉴权 | 说明 |
|---|---|---|---|
| GET | `/api/health` | 否 | 健康检查 |
| GET | `/api/points` | 否 | 读 POI 活动点 |
| POST | `/api/points` | 是 | 替换全部 POI |
| POST | `/api/diag` | 否 | 前端错误诊断上报 |
| POST | `/api/ai` | 是 | AI 客服请求转发 |
| GET | `/api/activities` | 否 | 读活动配置 |
| POST | `/api/activities` | 是 | 增删改活动 (`action: upsert/delete`) |
| GET | `/api/bookings` | 是 | 读预约列表 |
| POST | `/api/bookings` | 否 | 提交预约 |
| POST | `/api/bookings/<id>/status` | 是 | 改预约状态 (confirmed/cancelled) |
| GET | `/api/checkins` | 是 | 读所有打卡 (admin) |
| POST | `/api/checkins` | 否 | 提交打卡 (需 shotUrl) |
| GET | `/api/checkins/stats?userId=X` | 否 | 用户打卡统计 |
| POST | `/api/sms/send` | 否 | 发送短信 (DEV: 直接返 code) |
| POST | `/api/auth/login` | 否 | 手机号 + 验证码登录 |
| GET | `/api/users` | 是 | 读用户列表 |
| GET | `/api/coupons/templates` | 否 | 读券模板 |
| POST | `/api/coupons/templates` | 是 | 增删改券模板 |
| POST | `/api/coupons/issue` | 是 | 给用户发券 |
| GET | `/api/coupons/my?userId=X` | 否 | 我的优惠券 |
| POST | `/api/coupons/redeem` | 否 | 核销券码 |
| GET | `/api/coupons/redemptions` | 是 | 核销记录 |
| GET | `/api/ar/frames` | 否 | 读 AR 贴图列表 |
| POST | `/api/ar/frames` | 是 | 上传/编辑贴图 (multipart) |
| DELETE | `/api/ar/frames` | 是 | 一键清空 |
| POST | `/api/ar/shoot` | 否 | 拍照合成 (multipart photo + frameId 可选) |
| GET | `/api/ar/settings` | 否 | 读 AR 全局默认 |
| PUT | `/api/ar/settings` | 是 | 改 AR 全局默认 |
| GET | `/ar_shots/<file>` | 否 | 静态图访问 |

**CORS**：`Access-Control-Allow-Origin: *`（已加 always）

---

## 项目结构

```
campsite-nav/                          # 本仓库 (前端 + 后端 文档)
├── index.html                         # 顾客导航页 (156 行)
├── admin.html                         # 后台管理页 (360 行)
├── css/
│   └── style.css                      # 全局样式 (2489 行)
├── js/
│   ├── coords.js                      # WGS-84 ↔ GCJ-02 ↔ BD-09 转换
│   ├── baidu-map.js                   # BMap 封装 (init/addDivMarker/addPolyline)
│   ├── data.js                        # 数据层 (服务器 + localStorage 混合, 暴露 CampData)
│   ├── app.js                         # 顾客端主逻辑 (POI 渲染/路线/目标/筛选)
│   ├── login.js                       # 手机号 + 验证码登录
│   ├── checkin.js                     # 拍照打卡 + 工具栏按钮 + 集章面板 + 灯箱
│   ├── booking.js                     # 活动预约 + 工具栏按钮
│   ├── coupons.js                     # 优惠券 3 tab
│   ├── ar.js                          # AR 拍照模态 (共用拍照打卡 + 主动拍照)
│   ├── extras.js                      # 杂项辅助
│   ├── admin-shell.js                 # 后台公共 (登录门 + 顶部 nav + hash 路由)
│   ├── admin.js                       # 后台 boot (POI 活动点)
│   ├── admin-booking.js               # 后台活动 + 预约审批
│   ├── admin-checkin.js               # 后台打卡记录 (v0.8 新增)
│   ├── admin-coupons.js               # 后台优惠券 + 券码核销
│   ├── admin-ar.js                    # 后台 AR 贴图 + AR 默认
│   └── admin-users.js                 # 后台用户列表
├── AGENTS.md                          # 项目记忆 (部署规则/字段/调试)
├── README.md                          # 本文件
└── 使用说明.md                         # 给前台用户的使用手册

campsite-nav-api/                      # 配套后端 (独立小项目)
├── server.js                          # Node.js http router (1410 行, 零依赖)
├── deploy-watermarks-v2.js            # 批量上传 9 张 180×180 combo 主题
└── ...

/var/lib/campsite-nav/                 # 服务器数据目录
├── points.json
├── activities.json
├── bookings.json
├── checkins.json
├── users.json
├── sms_codes.json
├── coupon_templates.json
├── user_coupons.json
├── coupon_redemptions.json
├── ar_frames.json
├── ar_settings.json
└── ar_shots/                          # PNG 贴图 + JPG 合成
```

---

## 技术栈

- **百度地图 BMap JS API v3.0**（瓦片 + 标注 + 折线 + 信息窗）
- **原生 JavaScript**（无 React/Vue，零构建）
- **localStorage** 离线缓存（key: `campsite_points_v2`）
- **Geolocation API** + **DeviceOrientation API**（实时定位 + 指南针）
- **Jimp**（后端图片处理：autocrop + resize 200px）
- **后端**: Node.js `http` 模块（零依赖，1410 行）
- **Nginx** 反代 + Let's Encrypt SSL
- **sendBeacon** 前端错误上报（`/api/diag`）
- **坐标系**: 存储 WGS-84，渲染 BD-09

---

## 调试 & 排错

### 前端错误自动诊断

前端 `window.addEventListener('error/unhandledrejection')` → `sendBeacon` → `POST /api/diag` → `/tmp/campsite-diag.log`

```bash
ssh ubuntu@124.222.29.46 "tail -f /tmp/campsite-diag.log"
```

### 后端日志

```bash
ssh ubuntu@124.222.29.46 "tail -f /tmp/tx-api.log"
```

### 常用 API 验证

```bash
# POI
curl -sS https://lurecamp1.xiabebe.cn/api/points | head -c 500
echo

# 健康
curl -sS https://lurecamp1.xiabebe.cn/api/health

# 打卡 (admin, 需 token)
curl -sS -H 'Authorization: Bearer campsite-nav-2026' https://lurecamp1.xiabebe.cn/api/checkins | head -c 500
echo

# 提交打卡 (公开, 但要 shotUrl)
curl -sS -X POST https://lurecamp1.xiabebe.cn/api/checkins \
  -H 'Content-Type: application/json' \
  -d '{"userId":"u_test","pointId":"p1","lat":31.48,"lng":121.28,"shotUrl":"/ar_shots/shot_abc.jpg"}'
```

### ⚠️ curl -I HEAD 不可信

Node.js `http` 模块默认不响应 HEAD，前端 `curl -I` 会看到 404。**用 `curl -sI -X GET` 或 `curl -s -o /tmp/x ...`** 才能拿到 200。

### 已知踩坑

1. **nginx regex 抢反代**：`location ~* \.(png)$` 会吃掉 `location /ar_shots/ { proxy_pass }`，regex 缩窄到 `^/(js|css|assets)/`
2. **scp 静默失败**：多行 `&&` 链中 scp 偶发 `Permission denied` 但 exit 0，部署后必须独立 `md5sum` 验证
3. **后端 nogroup 进程**：ubuntu 起的 node 进程不能由 root 直接 `mv` 替换（文件 owner 变），需要 `sudo -n chown ubuntu:ubuntu`
4. **后端 EADDRINUSE**：重启前要 `kill -9 <pid>`，TIME_WAIT 等几秒
5. **打卡缩略图 URL**：后端 `shotUrl` 字段已含完整路径 (`/ar_shots/xxx.jpg`)，前台 `API + c.shotUrl` 会拼出 `/api/ar_shots/...` → 404
6. **`.hidden` 失效**：项目 CSS 按组件单独定义 `.hidden { display: none }`（`.route-info.hidden`、`.nav-weixin-hint.hidden` 等），新组件加 `.hidden` 必须自己写一条
7. **bash tool ssh 嵌套多空格被 trim**：远程命令 `kill -9; sleep 1;` 中的 sleep 1 多空格常被吃成 `sleep1`，写脚本 + scp + 远程 bash 执行
8. **bash tool `nohup ... &` 会挂住 ssh**：用 `setsid nohup` + 写脚本方式

---

## 变更日志

### v0.8 (2026-06-12) — 主动拍照 + 结束导航 + 后台打卡 tab + 缩略图灯箱

- 前台: 工具栏加主动拍照按钮（kind=other 路径不计奖励）
- 前台: 拍照 + AR 合影共用 ar 模态，删 AR 合影工具栏按钮 + 选 logo 按钮
- 导航时只显示当前目标（applyFilters 加 selectedDestId 过滤，marker 点击 no-op）
- 结束导航按钮（目标下拉右边 ✕，无目标时 CSS hidden）
- 后台新增 🏆 打卡 tab：缩略图列 + 用户/类型/搜索 过滤 + 统计
- 前台打卡面板缩略图可点 → 弹全屏灯箱看大图
- 修打卡缩略图 URL 拼接 bug（shotUrl 已是完整路径，不能拼 API base）
- checkin.js 缓存 lastUserLat，fetch ar 资源失败 console.warn 不阻断
- 新增 AGENTS.md 记录项目部署/字段/调试规则

### v0.7 (2026-06-11) — 前台 UI 紧凑化

- 删紧急疏散 + my-status-card
- 工具栏移入 search-bar
- chip 重排（场景顺序）+ route-info 全紧凑化
- dir-card 3 列并排 + fab 右下安全区
- bottom-sheet safe-area

### v0.6.3 (2026-06-11) — 拍照打卡

- 到点 30s 弹拍照模态 + shotUrl 必填
- 打卡面板显示缩略图
- 后端 shotUrl 路径校验（`/ar_shots/xxx.jpg` 格式 + 文件存在）

### v0.5 (2026-06-10) — 优惠券 + 用户体系

- 手机号 + 验证码登录（DEV: code 直接返回）
- 优惠券 3 tab（可领/我的/记录）+ 券码核销
- 9 张 180×180 combo 主题（archery/bbq/crayfish/cs/kayak/kids/restaurant/tea/train）

### v0.4 (2026-06-10) — AR 合影

- 9 combo 主题 + 拍照合成（Jimp autocrop + resize 200px）
- 后端 body 10MB guard
- nginx regex 缩窄修复（不再抢反代）

### v0.1 - v0.3 (2026-06-08~09) — 基础搭建

- 百度 BMap JS API v3.0 + 7 POI
- 服务器共享 points（替换 localStorage）
- 定位失败 UI（3 种错误码）
- 一键部署脚本
- 前端错误自动上报 `/api/diag`
- 后端 ADMIN_TOKEN 鉴权

### 历史

- 2026-05：腾讯瓦片（leaflet 模式）
- 2026-04：高德瓦片（leaflet 模式）
- 2026-03：首版（leaflet + OSM）

---

## 联系 & 维护

- 项目：https://github.com/bellyangkun/campsite-nav
- 当前版本：v0.8
- 默认活动点：21（腾讯云） / 30（阿里云） 个
- 默认 AR 主题：9 个 180×180 combo
- 默认用户：手机号 `+86 131XXXXXXXX` 注册即可
