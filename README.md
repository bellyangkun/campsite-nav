# 🏕️ 露营地活动导航 (campsite-nav)

> **生产地址**：https://lurecamp1.xiabebe.cn
>
> **后端 API**：https://lurecamp1.xiabebe.cn/api/points
>
> **适用场景**：上海市嘉定区华亭镇**乡悦华亭度假村**（霜竹公路 518 号）
>
> **核心特性**：纯前端 + 轻量后端，活动点**服务器共享**（所有设备实时同步），手机优先

---

## 📖 项目简介

一个轻量的露营地图导航网页，帮助**度假村游客**找到各个活动地点（Neverland 乐园、钓鱼池、咖啡馆、泵道等），并给**度假村管理员**提供后台管理界面。

### 用户角色

| 角色 | 页面 | 功能 |
|---|---|---|
| **游客** | `index.html` | 看地图、选目的地、看路线、定位、指南针 |
| **管理员** | `admin.html` | 新增/删除/导入/导出活动点 |

### 数据共享

- 活动点存在**服务器** (`/api/points`)，所有设备拉同一份
- 管理员改了 → 所有游客**实时看到**新标记
- 离线/服务器挂时降级到 localStorage

---

## ✨ 功能详解

### 📍 顾客导航页 (`index.html`)

- **百度地图 BMap**（真实瓦片）+ 7 个活动点标记
- **路线指引**：选择目标 → 画直线参考线 + 显示距离/方位
- **实时定位**：
  - `watchPosition` 高精度 GPS
  - GPS heading + 移动向量 + 设备指南针
  - iOS 13+ 显式请求方向传感器权限
- **定位失败 UI**：
  - 顶部橙色 banner 显示失败原因
  - 错误码分别提示（权限/无 GPS/超时）
  - "重试" / "知道了" 按钮
  - 用户标记变灰 + ❌ 角标
- **首屏自动从服务器拉数据**（`syncFromServer`）

### 🛠️ 后台管理 (`admin.html`)

- **可视化地图**（百度 BMap）显示当前所有活动点
- **📍 「使用我的位置」** 按钮 → 浏览器 GPS → 自动填表单（高亮 1.5 秒 + 地图预览）
- **点击地图** → 自动填经纬度（BD-09 反推 WGS-84）
- **新增/删除** 活动点（4 种类型 emoji：🚪 入口 / ⛺ 活动 / 🛒 服务 / 📍 其他）
- **导入/导出 JSON**：JSON 备份恢复
- **重置为默认**：恢复 7 个真实活动点
- **顶部状态条**：实时显示"数据源: ☁️ 服务器/💾 本地/🆕 默认"
- **同步提示**：写操作后顶部"✓ 已添加并同步到服务器" 2.5 秒后消失

---

## 🗂️ 项目结构

```
campsite-nav/                        # 本仓库 (前端)
├── index.html                       # 顾客导航页
├── admin.html                       # 后台管理页
├── css/
│   └── style.css                    # 公共样式 (8.6KB)
├── js/
│   ├── coords.js                    # 坐标转换 (WGS-84 ↔ GCJ-02 ↔ BD-09)
│   ├── baidu-map.js                 # BMap 封装 (initBaiduMap/addDivMarker/addPolyline)
│   ├── data.js                      # 数据层 (服务器 + localStorage 混合)
│   ├── app.js                       # 顾客端逻辑
│   └── admin.js                     # 后台逻辑
├── deploy.sh                        # 一键部署脚本
├── 使用说明.md                      # 用户使用说明
└── README.md                        # 本文件

campsite-nav-api/                    # 配套后端 (独立小项目)
└── server.js                        # 143 行 Node.js (HTTP 静态服务器)
```

### 后端 (`campsite-nav-api/server.js`)

- **零依赖** (纯 Node.js `http` 模块)
- 端口 **3005** (SCREEN `campsite-api` 跑着)
- 端点：
  - `GET  /api/points` - 读取（无需鉴权）
  - `POST /api/points` - 替换全部（需 `Authorization: Bearer <token>`）
  - `POST /api/diag` - 接收前端错误日志（调试用）
  - `GET  /api/health` - 健康检查
- 数据存 `/var/lib/campsite-nav/points.json`（原子写，`.tmp` + `rename`）
- 初始化自动建默认 7 活动点

---

## 🚀 部署

### 服务器环境

| 组件 | 值 |
|---|---|
| 服务器 | Ubuntu 124.222.29.46 (lurecamp1) |
| 域名 | lurecamp1.xiabebe.cn → 124.222.29.46 |
| Web 服务器 | nginx 1.24 (端口 443) |
| SSL | Let's Encrypt (自动续期) |
| 后端 | Node.js v22.22.2 (端口 3005) |
| 静态目录 | `/var/www/lurecamp1.xiabebe.cn/` |
| 数据目录 | `/var/lib/campsite-nav/` |
| API 反代 | nginx `/api/` → `http://localhost:3005` |
| nginx 配置 | `/etc/nginx/sites-enabled/lurecamp1.xiabebe.cn` |

### 部署步骤

#### 一键部署前端 (本地 → 服务器)

```bash
cd ~/campsite-nav
tar czf /tmp/campsite-nav-deploy.tar.gz \
  --exclude='.DS_Store' --exclude='._*' --exclude='.git' --exclude='node_modules' \
  index.html admin.html js/ css/
sshpass -p 'hErewego~071381' scp /tmp/campsite-nav-deploy.tar.gz \
  ubuntu@124.222.29.46:~/
sshpass -p 'hErewego~071381' ssh ubuntu@124.222.29.46 "
sudo -n bash -c '
  rm -rf /tmp/deploy-stage && mkdir -p /tmp/deploy-stage
  cd /tmp/deploy-stage
  tar xzf /home/ubuntu/campsite-nav-deploy.tar.gz
  cp -r index.html admin.html js/ css/ /var/www/lurecamp1.xiabebe.cn/
  chown -R www-data:www-data /var/www/lurecamp1.xiabebe.cn/
  chmod -R 755 /var/www/lurecamp1.xiabebe.cn/
'"
```

#### 部署后端 (一次性)

```bash
sshpass -p 'hErewego~071381' scp server.js ubuntu@124.222.29.46:~/campsite-nav-api/server.js
sshpass -p 'hErewego~071381' ssh ubuntu@124.222.29.46 "
sudo -n bash -c '
  kill -9 \$(pgrep -f campsite-nav-api/server.js) 2>/dev/null
  sleep 1
  cd /home/ubuntu/campsite-nav-api
  nohup node server.js > /tmp/campsite-api.log 2>&1 &
  disown
'"
```

#### nginx 配置（一次性）

关键片段（`/etc/nginx/sites-enabled/lurecamp1.xiabebe.cn`）：

```nginx
server {
    server_name lurecamp1.xiabebe.cn;
    root /var/www/lurecamp1.xiabebe.cn;
    index index.html;

    # API 反代
    location /api/ {
        proxy_pass http://localhost:3005;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 30s;
        add_header Access-Control-Allow-Origin * always;
    }

    location / {
        try_files $uri $uri/ /index.html;
    }

    # 静态资源缓存
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
        expires 1h;
        add_header Cache-Control "no-store, no-cache";
    }

    # SSL (Certbot 管理)
    listen 443 ssl;
    ssl_certificate /etc/letsencrypt/live/lurecamp1.xiabebe.cn/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/lurecamp1.xiabebe.cn/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;
}
```

### 本地开发

```bash
cd ~/campsite-nav
python3 -m http.server 8080
# 访问 http://localhost:8080/  (HTTPS 模式定位更准)
```

---

## 🗺️ 坐标系

- **存储**：WGS-84（与 GPS 一致）
- **渲染**：BD-09（百度地图瓦片 + 标注位置）
- **转换**：`js/coords.js` 内 `Wgs84ToBd09.wgs84ToBd09(lng, lat)`
- **后台地图点击**：BD-09 → 反推 WGS-84 → 填表单

> 历史版本曾用 WGS-84→GCJ-02 配高德/腾讯瓦片。2026-06-08 改用百度 BMap 后切换到 BD-09。

---

## 🔑 凭据 / 服务

| 服务 | 用途 | 位置 |
|---|---|---|
| 百度地图 BMap JS API | 加载瓦片 + 标注 + 折线 + 信息窗 | `index.html` / `admin.html` 的 `<script src="...api?v=3.0&ak=...">` |
| 百度地图 place/v2 (旧) | **仅供开发**查 POI 真实坐标 | 服务端 AK（已用于本次坐标获取，**AK 写明文不安全**）|

> ⚠️ **AK 注意事项**：
> - 浏览器端 AK（前端运行时用）必须**在百度地图开放平台申请**，且勾选 "JavaScript API" 权限
> - 申请时 **Referer 白名单**设 `*.xiabebe.cn` 或 `*`（不限制）
> - **AK 写在源代码里**（HTML 明文），如需保密可用 nginx 反代 `/baidu-api/` 转发
> - **当前 AK**: `1HV0vtN8SaYv3OOIhtDxdTD1qKIRdPbe`（之前服务端 AK 已被禁用）
> - **API 写 token**: `campsite-nav-2026`（明文在 `data.js`，仅 admin 写时用）

---

## 🛠️ 技术栈

- **百度地图 BMap JS API v3.0**（瓦片 + 标注 + 折线 + 信息窗）
- **原生 JavaScript**（无 React/Vue，零构建）
- **localStorage** 离线缓存（key: `campsite_points_v2`）
- **Geolocation API** + **DeviceOrientation API**（实时定位 + 指南针）
- **后端**: Node.js `http` 模块（零依赖，143 行）
- **Nginx** 反代 + Let's Encrypt SSL
- **sendBeacon** 前端错误上报（诊断用）

---

## 📋 默认 7 活动点（来自百度 POI 真实数据）

| ID | 名称 | 类型 | 来源 |
|---|---|---|---|
| p1 | 度假村主入口 | 🚪 入口 | 百度 POI 真实 |
| p2 | Neverland 儿童乐园 | ⛺ 活动 | 百度 POI 真实 |
| p3 | 湖边露营烧烤 | ⛺ 活动 | 百度 POI 真实（新增）|
| p4 | 路亚钓鱼池 | ⛺ 活动 | 度假村中心估算 |
| p5 | 一尺花园咖啡馆 | 🛒 服务 | 度假村中心估算 |
| p6 | 林下泵道 | ⛺ 活动 | 度假村中心估算 |
| p7 | 中央草坪 | ⛺ 活动 | 度假村中心估算 |

> 度假村中心 WGS-84: `(lng=121.286954, lat=31.481527)`
> 度假村真实地址: **上海市嘉定区华亭镇霜竹公路 518 号**
> 预约热线: **(021) 59978686**

---

## ⚠️ 已知限制

- **直线参考线**而非真实道路路径（适合小范围营地场景）
- **localStorage 离线降级**：服务器挂时仍可读 localStorage 缓存
- 百度瓦片需联网，**离线不可用**
- iOS Safari 需用户主动授权方向传感器（iOS 13+）
- **BMap JS API 需在线**才能加载；如百度 API 挂了，admin 表单功能**仍可用**（BaiduMap.ready 有 10s 超时降级）
- 活动点无后端用户体系，任何人拿到 admin URL + token 都能改

---

## 📜 变更日志

### 2026-06-09 (latest)
- **服务器共享活动点**：localStorage → `/api/points` POST，所有设备同步
- **新增轻量后端** `campsite-nav-api/server.js` (Node, 143 行，端口 3005)
- **nginx 反代** `/api/` → 3005
- **定位失败 UI**：顶部橙色 banner + 3 种错误码分别提示 + 重试按钮
- **admin 加"📍 使用我的位置"按钮**：GPS 自动填表单
- **新增 `/api/diag` 端点**：前端错误自动上报，存 `/tmp/campsite-diag.log`
- **修 3 个致命 bug**：
  - `getTypeMeta` 函数被重写时漏了 → 整页白屏
  - `Array.isArray(json.data && json.data.points)` 永远 false
  - BMap 异步加载导致 `BMap is not defined`

### 2026-06-08
- 改用**百度地图 BMap JS API**（之前用 leaflet + 腾讯瓦片）
- 删除 leaflet 框架，全部重写为 BMap
- 7 活动点坐标全部更新，3 个用百度 POI 真实数据
- 修 bug：CRUD 函数统一返回完整数组

### 历史
- 2026-05：腾讯瓦片（leaflet 模式）
- 2026-04：高德瓦片（leaflet 模式）
- 2026-03：首版（leaflet + OSM）

---

## 🐛 调试

### 前端错误诊断

前端错误自动上报到 `/api/diag`，存在 `/tmp/campsite-diag.log`：

```bash
ssh ubuntu@124.222.29.46 "tail -f /tmp/campsite-diag.log"
```

### API 实时验证

```bash
# 读
curl -sS https://lurecamp1.xiabebe.cn/api/points

# 写（替换全部）
curl -sS -X POST https://lurecamp1.xiabebe.cn/api/points \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer campsite-nav-2026' \
  -d '[{"id":"p1","name":"...","lat":31.48,"lng":121.28,"type":"other"}]'

# 健康检查
curl -sS https://lurecamp1.xiabebe.cn/api/health
```

### 后端日志

```bash
ssh ubuntu@124.222.29.46 "tail -f /tmp/campsite-api.log"
```
