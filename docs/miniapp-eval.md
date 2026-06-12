# 小程序改造评估 (campsite-nav)

> **目的**: 评估把现有 H5 (lurecamp1.xiabebe.cn) 改造成微信/支付宝/抖音小程序的可行性、改造成本、商业价值与风险
>
> **评估日期**: 2026-06-12
>
> **现状版本**: v0.8.1 (前端 H5 + Node.js 后端 1410 行, 双云部署腾讯云+阿里云)

---

## 目录

1. [现状盘点](#现状盘点)
2. [三种小程序方案对比](#三种小程序方案对比)
3. [关键改造点分析](#关键改造点分析)
4. [商业价值评估](#商业价值评估)
5. [技术方案推荐](#技术方案推荐)
6. [工时估算](#工时估算)
7. [风险点](#风险点)
8. [建议路径](#建议路径)
9. [待用户决策的 3 个问题](#待用户决策的-3-个问题)

---

## 现状盘点

### 现有功能矩阵

| 模块 | H5 实现 | 复用难度 | 说明 |
|---|---|---|---|
| 百度地图 BMap | 浏览器 JS SDK (200 行封装) | 🔴 高 | 小程序无 BMap, 必须换 |
| POI 标记/路线/fitBounds | BMap addDivMarker + Polyline | 🔴 高 | 整套地图层要重写 |
| GPS 实时定位 | `navigator.geolocation.watchPosition` | 🟡 中 | 流程不同, API 有 |
| 设备指南针 | DeviceOrientation API | 🟡 中 | 流程不同, API 有 |
| 拍照 + 贴图合成 | `<input capture>` + Jimp 后端 | 🟢 低 | 后端零改动, 前端换 chooseMedia |
| 活动预约/优惠券/打卡 | 纯 fetch + UI | 🟢 低 | 后端零改动 |
| AI 客服 | fetch + UI | 🟢 低 | 后端零改动 |
| 手机号 + 验证码登录 | fetch + sessionStorage | 🟡 中 | 小程序可用 `wx.login` 一键登录 |
| 步行/驾车唤起 | URL Scheme | 🟢 低 | 小程序 `wx.openLocation` |
| localStorage 缓存 | `localStorage` | 🟡 中 | 小程序无 localStorage, 改 `wx.setStorageSync` |
| 后台 admin.html | H5 单独页面 | 🟢 不动 | 后台继续走 H5 |

### 关键结论

**业务后端 (Node.js server.js 1410 行) 完全不用改**, 小程序前端用 `wx.request` / `tt.request` 调现有 `/api/*` 即可。 改造主要在前端, 而且**核心难点在地图层**。

---

## 三种小程序方案对比

| 维度 | 微信小程序 | 支付宝小程序 | 抖音小程序 |
|---|---|---|---|
| **内置地图组件** | `<map>` (腾讯地图) | `<map>` (高德地图) | `<map>` (腾讯地图) |
| **与 H5 BMap 替换成本** | 🔴 整地图层重写 | 🔴 整地图层重写 | 🔴 整地图层重写 |
| **定位 API** | `wx.getLocation` + `wx.startLocationUpdate` | `my.getLocation` | `tt.getLocation` |
| **相机/拍照** | `wx.chooseMedia` + `wx.uploadFile` | `my.chooseImage` | `tt.chooseImage` |
| **微信支付/分享** | ✅ 天然支持 | ❌ | ❌ |
| **百度地图 BMap 兼容** | ❌ 必须换 | ❌ | ❌ |
| **二开工时 (前端)** | 4-6 周 | 4-6 周 | 4-6 周 |
| **包大小限制** | 主包 2MB / 总 16MB | 4MB | 4MB |
| **HTTPS / 备案** | 强制 | 强制 | 强制 |
| **与 lurecamp1.xiabebe.cn 后端互通** | ✅ 需配 `request合法域名` | ✅ | ✅ |
| **用户打开便利性** | ⭐⭐⭐⭐⭐ (微信扫码即用) | ⭐⭐⭐ | ⭐⭐⭐ |
| **度假村游客场景适配** | ⭐⭐⭐⭐⭐ | ⭐⭐ | ⭐⭐ |
| **审核难度** | 中 (类目旅游/工具) | 中 | 中 |

### 跨端框架选项

| 框架 | 跨端范围 | 学习成本 | 备注 |
|---|---|---|---|
| **Taro 3 (React)** | 微信/支付宝/抖音/H5/RN | 中 | 一次写多端, 推荐 |
| **uni-app (Vue)** | 微信/支付宝/抖音/H5/iOS/Android | 中 | 生态比 Taro 大 |
| **原生 (wxml/axml/ttml)** | 单端 | 低 | 调试方便, 但不能跨端 |

**推荐 Taro 3** (一次写, 未来若做支付宝/抖音/H5 不重写)。

---

## 关键改造点分析

### 0. 地图 Key 注册 (需补登)

> ⚠️ **修正**: 上一版说"小程序内置地图不需要注册"是简化, 严格说 `<map>` 组件能零配置用, 但要做路线规划/POI 搜索/逆地址解析等高级功能, **必须申请腾讯位置服务 Key**。

| 平台 | Key 用途 | 注册地址 | 是否必须 |
|---|---|---|---|
| **腾讯位置服务 (lbs.qq.com)** | 小程序 SDK + WebService API | https://lbs.qq.com/console/key/show | 🟡 推荐 (路线/POI 搜索) |
| 微信小程序 AppID | 小程序身份 | mp.weixin.qq.com | 🔴 必办 |
| 微信 AppSecret | 后端 `code2session` | mp.weixin.qq.com → 开发管理 | 🔴 必办 |

**腾讯地图在小程序里的 3 种用法**:

1. **`<map>` 内置组件** — 零配置可用, 瓦片底图基础, 度假村展示型够用, PoC 阶段用
2. **腾讯地图小程序 SDK** (`qqmap-wx-jssdk.js`) — 需 Key, 支持路线规划/POI 搜索/逆地址解析, 全量阶段用
3. **腾讯地图 WebService API** (后端用) — 需 Key, 打卡位置校验/逆地址解析

**与现有百度 BMap 的关系**:
- 改造后百度 AK 弃用, 之前明文暴露的 `1HV0vtN8SaYv3OOIhtDxdTD1qKIRdPbe` 应在百度控制台删除
- 坐标系从 BD-09 改 GCJ-02, `js/coords.js` 重写

---

### 1. 百度地图 BMap → 小程序 `<map>` (核心难点)

**问题**:
- 微信/抖音小程序内置 `<map>` 是**腾讯地图**; 支付宝是**高德地图**
- BMap 整套坐标转换 (`js/coords.js` 200 行) + `js/baidu-map.js` 155 行封装 + app.js 里所有 `BMap.Point/Viewport/Polyline` 都要重写
- 度假村坐标存 WGS-84, 腾讯/高德都吃 GCJ-02, 转换逻辑可以保留

**改造方式**:
- 删除 `js/baidu-map.js`, 改写为 `js/taro-map.js` (Taro.Map 封装)
- `<map>` 组件属性: `latitude/longitude/markers/polyline/scale/show-location`
- 标记点: `markers={[{ id, latitude, longitude, iconPath, width, height, callout }]}`
- 路线: `polyline={[{ points: [{ latitude, longitude }], color, width, dottedLine }]}`
- fitBounds: 用 `includePoints` API

**工作量**: 1-2 周 (地图层整重写)

### 2. AR 拍照贴图合成

**问题**:
- H5 用 `<input type="file" capture>` + base64 上传
- 小程序用 `wx.chooseMedia` → 临时路径 → `wx.uploadFile` 上传

**改造**:
- 前端从 base64 改成 multipart 上传
- 后端 Jimp 逻辑零改动 (`POST /api/ar/shoot` 已支持 multipart)
- 模态 UI 改用 Taro 组件 (`<View>`, `<Image>`, `<Button>`)

**工作量**: 1-2 天

### 3. 微信一键登录 (新增能力)

**现状**: H5 用手机号 + 验证码, 后端自己发 SMS。

**小程序**:
- `wx.login()` 一键登录 → 拿 `code` → 后端用 `code + appid + secret` 调微信 `code2session` → 换 `openid/unionid/session_key`
- 用户不再输手机号, 转化率 +30%
- 度假村可绑定手机号做会员体系

**改造**:
- 后端新增 `POST /api/auth/wx-login` 转发
- 前端 `wx.login` → 拿 code → POST → 拿到 `sessionToken` 存 `wx.setStorageSync`

**工作量**: 后端 0.5 周 + 前端 0.5 周

### 4. 定位 / 指南针

| H5 | 微信小程序 |
|---|---|
| `navigator.geolocation.watchPosition` | `wx.startLocationUpdate` + `wx.onLocationChange` |
| `DeviceOrientationEvent` (iOS 需 `requestPermission`) | `wx.startDeviceMotionListening` (罗盘) + `wx.onDeviceMotionChange` |

**改造**: 替换 API 调用, 业务逻辑 (距离计算/方位角) 保留

**工作量**: 2 天

### 5. 缓存

| H5 | 小程序 |
|---|---|
| `localStorage.setItem` | `wx.setStorageSync` |
| `localStorage.getItem` | `wx.getStorageSync` |

**改造**: 在 `js/data.js` 加一层 `storage.js` 抽象, 同时支持 H5 和 Taro

**工作量**: 1 天

### 6. URL Scheme 唤起 (步行/驾车)

| H5 | 小程序 |
|---|---|
| `window.location.href = 'baidumap://...'` | `wx.openLocation` 唤起腾讯地图 |
| 或 `https://uri.amap.com/...` | 或 `Taro.openScheme` 唤起百度/高德 |

**改造**: 替换 API

**工作量**: 1 天

---

## 商业价值评估

### 用户场景

**度假村游客**: 上海本地 + 外地家庭, 现场扫码使用。
- ✅ **微信小程序**价值最大
  - 微信打开率最高 (97% 中国用户)
  - 不用下载 App
  - 微信内一键登录 (免验证码)
  - 微信支付闭环 (后期可加)
  - 微信生态 (公众号/视频号联动)
- ⚠️ **支付宝小程序**: 价值次之
  - 度假村中老年/学生用户少
  - 适合做支付营销 (集分宝/花呗)
- ⚠️ **抖音小程序**: 营销价值强
  - 适合做"种草"内容引流
  - 但游客到店场景下不是首选

### 推荐优先级

**主线**: 微信小程序 (主战场)
**扩展**: 后期考虑支付宝/抖音 (1 个月加一个端, 用 Taro 跨端几乎零成本)

---

## 技术方案推荐

### 方案 A: Taro 3 + React 语法 (强烈推荐)

**优势**:
- 一次写, 输出微信/支付宝/抖音/H5
- 保住 H5 业务代码 (data.js / checkin.js / coupons.js 业务逻辑可复用)
- React 生态 (组件/状态管理/路由)
- TypeScript 可选

**项目结构**:
```
campsite-nav-miniapp/
├── src/
│   ├── app.tsx                    # 小程序入口
│   ├── app.config.ts              # 小程序配置 (pages/tabBar/window)
│   ├── pages/
│   │   ├── index/                 # 顾客导航 (主)
│   │   └── ...
│   ├── components/
│   │   ├── quick-toolbar/
│   │   ├── dest-select/
│   │   ├── checkin-modal/
│   │   └── ar-camera/
│   ├── services/                  # 业务 API 封装 (从原 js/ 抽)
│   │   ├── api.ts                 # wx.request 封装
│   │   ├── storage.ts             # wx.storage 抽象
│   │   └── map.ts                 # 腾讯/高德地图封装
│   └── utils/
│       └── coords.ts              # WGS-84 ↔ GCJ-02 ↔ BD-09 (从 H5 复制)
├── config/
│   ├── dev.ts                     # 开发环境后端
│   └── prod.ts                    # 生产环境后端
├── package.json
└── project.config.json            # 微信开发者工具导入
```

### 方案 B: 微信原生 (wxml/wxss)

**适用**: 只需要微信, 不考虑跨端

**优势**:
- 无需 npm/taro 构建
- 微信开发者工具调试最方便
- 启动快

**劣势**:
- 不能跨端, 未来想做支付宝/抖音要全重写
- wxml 跟 React/Vue 都不一样, 学习成本

### 方案 C: uni-app (Vue)

**适用**: 团队有 Vue 经验, 想用更大生态

**优势**:
- 生态比 Taro 大 (插件多)
- Vue 语法熟悉度高
- uniCloud 一体化后端 (可选)

**劣势**:
- Vue 跟现有 H5 原生 JS 业务代码复用度低
- HBuilderX 工具链不如 VSCode

---

## 工时估算

### 微信小程序 (1 人, Taro 3)

| 阶段 | 内容 | 工时 |
|---|---|---|
| **0. 准备** | 微信开放平台注册 + AppID + 小程序备案 + 后台配 `request合法域名 lurecamp1.xiabebe.cn` + 业务域名 | 1 周 (含审核等待) |
| **1. 项目骨架** | Taro 初始化 + 目录结构 + 工具栏/底部面板组件 + 路由 | 3 天 |
| **2. 地图层** | `<map>` 替换 BMap + 标记/路线/fitBounds + 21-30 POI 渲染 | 1.5 周 |
| **3. 定位 + 指南针** | `wx.startLocationUpdate` + 设备方向 + 距离/方位角 | 2 天 |
| **4. 拍照打卡** | `wx.chooseMedia` + `uploadFile` + ar 模态改写 + Jimp 合成对接 | 3 天 |
| **5. 业务页** | 优惠券 / 打卡面板 / 预约 / AI 客服 / 用户登录 (基本是 fetch + UI) | 1 周 |
| **6. 一键登录** | `wx.login` + 后端 `code2session` 转发 | 1 周 |
| **7. 测试/上线** | 真机调试 + 微信审核 (类目旅游/工具) + 灰度发布 + bug 修 | 1 周 |
| **合计** | | **6-8 周 (1 人)** |

### 跨端 (微信 + 支付宝 + 抖音, Taro 一次写)

| 阶段 | 工时 |
|---|---|
| 同上 + 适配支付宝 (3-4 个 API 差异) | +1 周 |
| 同上 + 适配抖音 (3-4 个 API 差异) | +1 周 |
| **合计** | **8-10 周 (1 人)** |

### 短期不建议

- 跨三端 (微信+支付宝+抖音) 一次做: 度假村用户用不到, 多 30% 工作量
- 做原生 + 跨端双轨: 维护成本翻倍

---

## 风险点

### 1. 微信审核 (🟡 中)

- **类目选 "旅游" 或 "工具"** + 度假村营业执照 + ICP 备案
- 拍照打卡/AI 客服 可能被认定为"社交"类目, 需提供"非社交"证明
- 审核周期: 1-7 天

### 2. 定位精度 (🟡 中)

- 小程序定位精度通常 30-100m
- H5 `watchPosition` 高精度 GPS 可达 5-10m
- 应对: 拍照打卡判断改用"进入范围 + 停留 30s" (已实现), 不依赖单点精度

### 3. 百度 AK 弃用 (🟢 低)

- 改小程序后, 之前暴露的浏览器端 AK 可在百度地图控制台"删除"清理
- 不再用 BMap, AK 失效也不影响

### 4. 包大小 (🟡 中)

- 21-30 POI 数据 + 6 个工具栏 + ar 模态, 主包可能爆 2MB
- 应对: 用 Taro 分包加载 (subPackages 配置), 每个 tab 拆包

### 5. HTTPS + ICP (🟡 中)

- lurecamp1.xiabebe.cn 已 HTTPS ✅
- 但**小程序后台配置的业务域名要再 ICP 备案一次** (小程序要求独立备案号或主体相同)
- 应对: 确认 `lurecamp1.xiabebe.cn` 主体与小程序主体是否一致

### 6. 后端 CORS (🟢 低)

- 后端已加 `Access-Control-Allow-Origin: *`, 小程序请求不受同源策略限制
- 但小程序仍需在后台"request 合法域名"加白 (硬性要求)

### 7. 微信支付 (后续, 🟡 中)

- H5 没支付, 小程序加支付需要:
  - 微信支付商户号
  - 后端新增 `POST /api/wx-pay/jsapi` 统一下单
  - 前端 `wx.requestPayment` 调起

---

## 建议路径

### 阶段 1: PoC (1-2 周)

**目标**: 验证地图 + 定位 + 后端 fetch 能跑通

**范围**:
- Taro 3 初始化
- 单页面: 目标下拉 + 地图 + 路线 + 步行按钮
- 调通 `wx.getLocation` + `<map>` 标记
- 调通 `wx.request` → `/api/points` → 渲染 POI

**成功标准**:
- 真机能看到度假村地图
- 选中目标显示路线
- 步行按钮唤起腾讯地图

**失败兜底**: PoC 暴露问题再决定是否全量改造

### 阶段 2: 全量改造 (5-6 周)

**前提**: PoC 成功

**范围**:
- 业务页全量 (优惠券/打卡/预约/AI/用户)
- 拍照打卡
- 一键登录
- 后台管理 (H5 不动, 小程序用 WebView 嵌 `admin.html` 即可)

### 阶段 3: 跨端扩展 (1-2 周, 可选)

**前提**: 微信小程序稳定运行 1-2 个月

**范围**:
- Taro 配置加支付宝/抖音端
- 适配差异 (3-4 处 API)
- 提交各平台审核

---

## 待用户决策的 3 个问题

1. **小程序优先级**?
   - (A) 只做微信
   - (B) 微信 + 支付宝
   - (C) 微信 + 支付宝 + 抖音
2. **技术栈**?
   - (A) Taro 3 (React 跨端)
   - (B) 微信原生 (wxml)
   - (C) uni-app (Vue 跨端)
3. **时间窗口**?
   - (A) 急 (1-2 周要 MVP) → 直接跳过 PoC
   - (B) 适中 (1-2 月) → 走标准 PoC + 全量
   - (C) 慢慢做 (3 月+) → 一次全量, 顺手加跨端

**回答完再出具体方案 + 排期 + 报价。**

---

## 附录 A: H5 vs 小程序 API 速查

| 功能 | H5 | 微信小程序 |
|---|---|---|
| 地图 | BMap.Point/Polyline/Viewport | `<map>` + markers/polyline/includePoints |
| 定位 | `navigator.geolocation.watchPosition` | `wx.getLocation` / `wx.startLocationUpdate` |
| 指南针 | `DeviceOrientationEvent` | `wx.startDeviceMotionListening` (罗盘 alpha) |
| 相机 | `<input type="file" capture>` | `wx.chooseMedia` / `<Camera>` |
| 文件上传 | `fetch` + base64 | `wx.uploadFile` (multipart) |
| 存储 | `localStorage` | `wx.setStorageSync` |
| 网络 | `fetch` | `wx.request` |
| 支付 | 暂未支持 | `wx.requestPayment` |
| 分享 | 浏览器原生 | `button open-type="share"` |
| 一键登录 | 验证码 | `wx.login` + `code2session` |
| 位置跳转 | URL Scheme | `wx.openLocation` / `wx.navigateTo` |
| WebSocket | `new WebSocket` | `wx.connectSocket` |

## 附录 B: Taro 跨端 API 抽象

```typescript
// services/storage.ts
export const storage = {
  get(key: string): any {
    if (process.env.TARO_ENV === 'h5') return localStorage.getItem(key);
    return Taro.getStorageSync(key);
  },
  set(key: string, val: any) {
    if (process.env.TARO_ENV === 'h5') localStorage.setItem(key, val);
    else Taro.setStorageSync(key, val);
  }
};

// services/location.ts
export const location = {
  async getCurrentPos(): Promise<{lat: number, lng: number}> {
    if (process.env.TARO_ENV === 'h5') {
      return new Promise((res, rej) => navigator.geolocation.getCurrentPosition(p => res({ lat: p.coords.latitude, lng: p.coords.longitude }), rej));
    }
    const r = await Taro.getLocation({ type: 'gcj02' });
    return { lat: r.latitude, lng: r.longitude };
  }
};
```

## 附录 C: 后端零改动清单

以下后端 API 在 H5 已实现, 小程序可直接调:

- `GET /api/points` - 读 POI
- `GET /api/activities` - 读活动
- `POST /api/bookings` - 提交预约
- `POST /api/checkins` - 提交打卡
- `GET /api/checkins/stats?userId=X` - 打卡统计
- `GET /api/coupons/templates` - 券模板
- `GET /api/coupons/my?userId=X` - 我的券
- `POST /api/coupons/redeem` - 核销
- `GET /api/ar/frames` - AR 贴图
- `POST /api/ar/shoot` - 拍照合成
- `POST /api/ai` - AI 客服

需要**新增**的接口 (可选):
- `POST /api/auth/wx-login` - 微信一键登录
- `POST /api/wx-pay/jsapi` - 微信支付 (后续)
