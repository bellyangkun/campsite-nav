# 🏕️ 露营地活动导航 (campsite-nav)

> 部署地址：**https://lurecamp1.xiabebe.cn**（导航页）/ `/admin.html`（后台）
>
> 适用：上海市嘉定区华亭镇**乡悦华亭度假村**（霜竹公路 518 号）

一个纯前端、轻量、适配手机的露营地地图导航网页。**无后端**，所有数据存在浏览器 `localStorage`，可直接静态部署。

---

## ✨ 功能

### 📍 顾客导航页（`index.html`）

- **百度地图**（BMap JS API 浏览器端 AK）真实瓦片 + 标注
- **活动地点展示**：度假村主入口、Neverland 主题乐园、湖边露营烧烤、路亚钓鱼池、一尺花园咖啡馆、林下泵道、中央草坪（**7 个点**）
- **路线指引**：选择目标 → 画从当前位置到目的地的直线参考 → 显示距离 / 方位
- **实时方向**：
  - `watchPosition` 高精度定位
  - GPS heading + 移动向量 + 设备指南针（即时显示当前朝向）
  - iOS 13+ 显式请求方向传感器权限
- **定位失败 UI**：失败时顶部滑出橙色 banner，说明原因（权限/超时/无 GPS）+ **重试** / 知道了 按钮
- **📍 定位失败时 marker 变灰 + ❌ 角标**

### 🛠️ 后台管理页（`admin.html`）

- **可视化地图**点击 → 自动填经纬度
- **📍 「使用我的位置」** 按钮 → GPS 当前坐标自动填表单（高亮 1.5 秒 + 地图预览 + 状态条）
- **新增 / 删除** 活动点（类型 emoji 区分：入口/活动/服务/其他）
- **导入 / 导出 JSON** 一键备份恢复
- **重置为默认数据**

---

## 🗂️ 文件结构

```
campsite-nav/
├── index.html          # 顾客导航页
├── admin.html          # 后台管理页
├── css/
│   └── style.css       # 公共样式（移动优先 + locate 失败 UI）
├── js/
│   ├── coords.js       # 坐标转换 (WGS-84 ↔ GCJ-02 ↔ BD-09)
│   ├── baidu-map.js    # 百度 BMap 封装 (init/addDivMarker/addPolyline/...)
│   ├── data.js         # 数据管理 (localStorage, CRUD)
│   ├── app.js          # 导航页逻辑
│   └── admin.js        # 后台逻辑
├── deploy.sh           # 一键部署到 124.222.29.46
├── 使用说明.md          # 用户使用说明（中文）
└── README.md           # 本文件
```

---

## 🚀 部署

### 线上（lurecamp1.xiabebe.cn）
- **服务器**：Ubuntu 124.222.29.46（nginx 反代，SSL 证书）
- **部署路径**：`/var/www/lurecamp1.xiabebe.cn/`
- **所有者**：`www-data:www-data`，权限 `755`
- **域名解析**：`lurecamp1.xiabebe.cn` → 124.222.29.46

### 部署步骤

```bash
cd ~/campsite-nav
tar czf /tmp/campsite-nav-deploy.tar.gz \
  --exclude='.DS_Store' --exclude='._*' --exclude='.git' \
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

### 本地开发

```bash
cd ~/campsite-nav
python3 -m http.server 8080
# 访问 http://localhost:8080/  (HTTPS 模式定位更准, http://127.0.0.1 也行)
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
| 百度地图 BMap JS API | 加载瓦片 + 标注 | `index.html` / `admin.html` 的 `<script src="...api?v=3.0&ak=...">` |
| 百度地图 place/v2 | **仅供开发**查 POI 真实坐标 | 服务端 AK（`data.js` 数据来源，非运行时调用）|

> ⚠️ **AK 注意事项**：
> - 浏览器端 AK（前端运行时用）必须**在百度地图开放平台申请**，且勾选 "JavaScript API" 权限
> - 申请时 **Referer 白名单**设 `*.xiabebe.cn` 或 `*`（不限制）
> - **AK 写在源代码里**（HTML 明文），如需保密可用 nginx 反代 `/baidu-api/` 转发到真实 endpoint

---

## 🛠️ 技术栈

- **百度地图 BMap JS API v3.0**（瓦片 + 标注 + 折线 + 信息窗）
- **原生 JavaScript**（无 React/Vue，零构建）
- **localStorage** 持久化（key: `campsite_points_v2`）
- **Geolocation API** + **DeviceOrientation API**（实时定位 + 指南针）
- **Nginx** 反代 + Let's Encrypt SSL

---

## 📋 默认 7 活动点（来自百度 POI 真实数据）

| ID | 名称 | 类型 | 来源 |
|---|---|---|---|
| p1 | 度假村主入口 | 入口 | 百度 POI 真实 |
| p2 | Neverland 儿童乐园 | 活动 | 百度 POI 真实 |
| p3 | 湖边露营烧烤 | 活动 | 百度 POI 真实（新增）|
| p4 | 路亚钓鱼池 | 活动 | 度假村中心估算 |
| p5 | 一尺花园咖啡馆 | 服务 | 度假村中心估算 |
| p6 | 林下泵道 | 活动 | 度假村中心估算 |
| p7 | 中央草坪 | 活动 | 度假村中心估算 |

> 度假村中心 WGS-84: `(lng=121.286954, lat=31.481527)`
> 度假村真实地址: **上海市嘉定区华亭镇霜竹公路 518 号**
> 预约热线: **(021) 59978686**

---

## ⚠️ 已知限制

- **直线参考线**而非真实道路路径（适合小范围营地场景）
- **localStorage** 跨设备不同步（换手机数据不共享）—— 如需同步需后端
- 百度瓦片需联网，**离线不可用**
- iOS Safari 需用户主动授权方向传感器（iOS 13+）

---

## 📜 变更日志

### 2026-06-08 (latest)
- **改用百度地图 BMap JS API**（之前用 leaflet + 腾讯瓦片）
- **删除 leaflet 框架**，全部重写为 BMap
- **7 活动点坐标**全部更新，3 个用百度 POI 真实数据
- **定位失败 UI** 提示 + 重试（之前只是 `console.warn`）
- **admin 后台** 加「使用我的位置」按钮
- **修 bug**：CRUD 函数统一返回完整数组（之前 addPoint 返回单点导致 `points.forEach is not a function`）
- **删除 leaflet** 的 `js/baidu-tiles.js`（已废弃）

### 历史
- 2026-05：腾讯瓦片（leaflet 模式）
- 2026-04：高德瓦片（leaflet 模式）
- 2026-03：首版（leaflet + OSM）
