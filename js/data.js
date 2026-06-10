/**
 * 共享数据管理
 *
 * 存储策略 (混合):
 *   - 服务器 (主): GET/POST /api/points  (lurecamp1.xiabebe.cn nginx 反代到 localhost:3005)
 *   - localStorage (缓存): 离线/降级用, 启动时尝试同步服务器
 *
 * 写操作流程:
 *   1. 调服务器 POST
 *   2. 成功后更新 localStorage 缓存
 *   3. 失败则保持 localStorage, 提示用户
 *
 * 读操作流程:
 *   1. 启动时优先从服务器拉, 拉到就覆盖 localStorage
 *   2. 服务器失败用 localStorage 缓存
 *   3. 都没数据用默认 7 活动点
 */
(function (global) {
  const STORAGE_KEY = 'campsite_points_v2';
  const API_BASE = '/api';
  const ADMIN_TOKEN = 'campsite-nav-2026';  // 仅 admin.html 写入时使用
  // 暴露给 extras.js 等其他模块用
  global.CAMPSITE_API_BASE = API_BASE;

  // 错误上报到服务器 (解决 Safari/Chrome 调试困难)
  function reportDiag(level, msg, extra) {
    try {
      const payload = JSON.stringify({
        level, msg,
        url: location.href,
        ua: navigator.userAgent.slice(0, 80),
        ts: Date.now(),
        ...(extra || {})
      });
      // navigator.sendBeacon 优先, fallback fetch
      if (navigator.sendBeacon) {
        navigator.sendBeacon(API_BASE + '/diag', new Blob([payload], { type: 'application/json' }));
      } else {
        fetch(API_BASE + '/diag', { method: 'POST', body: payload, headers: { 'Content-Type': 'application/json' }, keepalive: true }).catch(() => {});
      }
    } catch (e) {}
  }

  // 全局错误自动上报
  window.addEventListener('error', (e) => {
    reportDiag('error', e.message, { file: e.filename, line: e.lineno, col: e.colno, stack: e.error && e.error.stack });
  });
  window.addEventListener('unhandledrejection', (e) => {
    reportDiag('unhandledrejection', String(e.reason), { stack: e.reason && e.reason.stack });
  });

  // 是否在 admin 上下文 (通过 document.body dataset 判断)
  // 延迟到 DOM ready 后再读, 避免 body 还未就绪
  let IS_ADMIN = false;
  if (document.body && document.body.dataset) {
    IS_ADMIN = document.body.dataset.role === 'admin';
  }

  const DEFAULT_POINTS = [
    { id: 'p1', name: '度假村主入口', lat: 31.481527, lng: 121.286954, description: '霜竹公路518号主入口，停车与签到处', type: 'entrance', order: 100 },
    { id: 'p2', name: 'Neverland 儿童乐园', lat: 31.481558, lng: 121.286868, description: '5700㎡无动力亲子乐园，金属滑梯、绳网、挖沙', type: 'activity', order: 200 },
    { id: 'p3', name: '湖边露营烧烤', lat: 31.481486, lng: 121.287068, description: '湖边烧烤野奢露营、皮划艇、CS团建 (联康路277弄18号)', type: 'activity', order: 300 },
    { id: 'p4', name: '路亚钓鱼池', lat: 31.483293, lng: 121.283545, description: '改造鱼塘，鲈鱼/鳜鱼/虹鳟/梭鲈鱼，¥168/天', type: 'activity', order: 400 },
    { id: 'p5', name: '一尺花园咖啡馆', lat: 31.479885, lng: 121.289259, description: '温室花园咖啡，扶荔宫，餐饮+打卡', type: 'service', order: 500 },
    { id: 'p6', name: '林下泵道', lat: 31.482161, lng: 121.290561, description: '上海最大林下泵道，初级/标准/腾跃赛道', type: 'activity', order: 600 },
    { id: 'p7', name: '中央草坪', lat: 31.481916, lng: 121.287555, description: '露营、飞盘、野餐、亲子活动', type: 'activity', order: 700 }
  ];

  const TYPE_META = {
    entrance:  { label: '入口',   color: '#795548', icon: '🚪' },
    activity:  { label: '活动',   color: '#4CAF50', icon: '⛺' },
    service:   { label: '服务',   color: '#2196F3', icon: '🛒' },
    flash:     { label: '快闪',   color: '#FF5722', icon: '⚡' },
    restaurant:{ label: '饭店',   color: '#FF9800', icon: '🍽️' },
    toilet:    { label: '卫生间', color: '#607D8B', icon: '🚻' },
    hotel:     { label: '酒店',   color: '#9C27B0', icon: '🏨' },
    teahouse:  { label: '茶馆',   color: '#795548', icon: '🍵' },
    other:     { label: '其他',   color: '#9E9E9E', icon: '📍' }
  };

  // (旧: 设施分组 GROUP_META + getGroupTypes 已废弃, v0.6 删)


  // ===== 内部缓存 (内存) =====
  let memoryCache = null;        // { points: [...], source: 'server'|'local'|'default', updatedAt: ts }
  let syncPromise = null;        // 防并发同步

  // ===== 服务器 API =====
  async function fetchServer() {
    try {
      const res = await fetch(API_BASE + '/points', {
        method: 'GET',
        cache: 'no-store',
        headers: { 'Accept': 'application/json' }
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const json = await res.json();
      if (json.code !== 0 || !json.data || !Array.isArray(json.data.points)) {
        throw new Error('Invalid response: ' + JSON.stringify(json).slice(0, 200));
      }
      return { points: json.data.points, updatedAt: Date.now() };
    } catch (e) {
      console.warn('[CampData] 拉服务器数据失败:', e.message);
      return null;
    }
  }

  async function postServer(points) {
    try {
      const res = await fetch(API_BASE + '/points', {
        method: 'POST',
        cache: 'no-store',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + ADMIN_TOKEN
        },
        body: JSON.stringify({ points })
      });
      if (!res.ok) {
        const err = await res.text();
        throw new Error('HTTP ' + res.status + ': ' + err);
      }
      return await res.json();
    } catch (e) {
      console.warn('[CampData] 推送服务器失败:', e.message);
      throw e;
    }
  }

  // ===== localStorage 缓存 =====
  function loadLocal() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return JSON.parse(raw);
    } catch (e) {
      console.warn('[CampData] 读 localStorage 失败', e);
    }
    return null;
  }

  function saveLocal(points) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(points));
      return true;
    } catch (e) {
      console.warn('[CampData] 写 localStorage 失败', e);
      return false;
    }
  }

  // ===== 同步 (启动时自动跑) =====
  async function syncFromServer() {
    if (syncPromise) return syncPromise;
    syncPromise = (async () => {
      const srv = await fetchServer();
      if (srv && Array.isArray(srv.points)) {
        memoryCache = { points: srv.points, source: 'server', updatedAt: srv.updatedAt };
        saveLocal(srv.points);
        return memoryCache;
      }
      // 降级到 localStorage
      const local = loadLocal();
      if (Array.isArray(local)) {
        memoryCache = { points: local, source: 'local', updatedAt: Date.now() };
        return memoryCache;
      }
      // 都没就用默认
      memoryCache = { points: JSON.parse(JSON.stringify(DEFAULT_POINTS)), source: 'default', updatedAt: Date.now() };
      saveLocal(memoryCache.points);
      return memoryCache;
    })();
    return syncPromise;
  }

  // ===== 公开 API =====
  async function getPoints() {
    if (!memoryCache) {
      const r = await syncFromServer();
      return sortByOrder(r.points);
    }
    return sortByOrder(memoryCache.points);
  }

  // 暴露调试用
  global.__campDebug = () => ({
    memoryCache: memoryCache ? { source: memoryCache.source, count: memoryCache.points.length, ids: memoryCache.points.map(p => p.id) } : null,
    localStorage: (function() {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        return raw ? JSON.parse(raw).length : 'null';
      } catch (e) { return 'err: ' + e.message; }
    })(),
    isAdmin: IS_ADMIN
  });

  /**
   * 同步版 (仅在已经 sync 过后用), 否则返回默认 7 点
   * 用于: 页面初始化时快速渲染 (不 await)
   * 后续 syncFromServer 完成后, 应调用 refreshAll() 重新渲染
   */
  function getPointsSync() {
    if (memoryCache) return sortByOrder(memoryCache.points);
    // 尝试 localStorage 兜底 (但空数组视为"无有效数据", 用默认)
    const local = loadLocal();
    if (Array.isArray(local) && local.length > 0) {
      memoryCache = { points: local, source: 'local', updatedAt: Date.now() };
      return sortByOrder(memoryCache.points);
    }
    memoryCache = { points: JSON.parse(JSON.stringify(DEFAULT_POINTS)), source: 'default', updatedAt: Date.now() };
    return sortByOrder(memoryCache.points);
  }

  function getDataSource() {
    return memoryCache ? memoryCache.source : 'unknown';
  }

  function getDisplayPoints() {
    const points = getPointsSync();
    if (typeof Wgs84ToGcj02 === 'undefined') return points;
    return Wgs84ToGcj02.wgs84ToGcj02Batch(points);
  }

  // ===== 排序: admin 用 =====
  // 取出 sortByOrder (admin.js 用)
  function getSortedPoints() {
    return sortByOrder(getPointsSync());
  }

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, (m) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[m]));
  }

  function validatePoint(p, partial) {
    partial = partial || false;
    if (!p) throw new Error('数据无效');
    if (!partial || 'name' in p) {
      if (typeof p.name !== 'string' || p.name.trim() === '') throw new Error('活动点名称不能为空');
      if (p.name.length > 200) throw new Error('名称长度不能超过 200');
    }
    if (!partial || 'lat' in p) {
      if (typeof p.lat !== 'number' || p.lat < -90 || p.lat > 90) throw new Error('纬度必须是 -90~90 的数字');
    }
    if (!partial || 'lng' in p) {
      if (typeof p.lng !== 'number' || p.lng < -180 || p.lng > 180) throw new Error('经度必须是 -180~180 的数字');
    }
    if (!partial && ('type' in p)) {
      if (!TYPE_META.hasOwnProperty(p.type)) throw new Error('类型无效');
    }
    if ('description' in p && p.description !== null && typeof p.description !== 'string') {
      throw new Error('描述必须是字符串');
    }
    if ('petFriendly' in p && typeof p.petFriendly !== 'boolean') {
      throw new Error('petFriendly 必须是布尔');
    }
    if ('order' in p && (typeof p.order !== 'number' || !Number.isFinite(p.order))) {
      throw new Error('order 必须是数字');
    }
  }

  // ===== 排序: 按 order 升序 (无 order 字段的兜底用 id 字符串排)
  function sortByOrder(points) {
    return points.slice().sort((a, b) => {
      const ao = (typeof a.order === 'number') ? a.order : 999999;
      const bo = (typeof b.order === 'number') ? b.order : 999999;
      if (ao !== bo) return ao - bo;
      // 同 order 时用 id 兜底, 保证顺序稳定
      return String(a.id).localeCompare(String(b.id));
    });
  }

  function genId() {
    return 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
  }

  // ===== 写操作 (admin) =====
  async function addPoint(point) {
    try {
      validatePoint(point);
      const points = getPointsSync().slice();
      point.id = point.id || genId();
      // 自动算 order: max(order) + 100, 没 order 时按当前顺序累加
      if (typeof point.order !== 'number') {
        const maxOrder = points.reduce((m, p) => (typeof p.order === 'number' && p.order > m ? p.order : m), 0);
        point.order = maxOrder + 100;
      }
      points.push(point);
      await saveAndSync(points);
      return points;
    } catch (e) {
      reportDiag('addPoint-error', e.message, { point, stack: e.stack });
      throw e;
    }
  }

  async function updatePoint(id, updates) {
    const points = getPointsSync().slice();
    const idx = points.findIndex(p => p.id === id);
    if (idx === -1) return null;
    points[idx] = Object.assign({}, points[idx], updates, { id });
    await saveAndSync(points);
    return points;
  }

  // ===== 上移 / 下移 =====
  // 把 id 这条往上挪一位, 实际是交换 order
  async function movePoint(id, direction) {
    const sorted = sortByOrder(getPointsSync());
    const idx = sorted.findIndex(p => p.id === id);
    if (idx === -1) throw new Error('活动点不存在');
    let swapIdx;
    if (direction === 'up') swapIdx = idx - 1;
    else if (direction === 'down') swapIdx = idx + 1;
    else throw new Error('direction 必须是 up 或 down');
    if (swapIdx < 0 || swapIdx >= sorted.length) {
      // 已在最顶/最底, 不动
      return sorted;
    }
    const a = sorted[idx];
    const b = sorted[swapIdx];
    const aOrder = (typeof a.order === 'number') ? a.order : 999999;
    const bOrder = (typeof b.order === 'number') ? b.order : 999999;
    // 如果当前 order 是 100 间隔, 用平均; 否则直接交换
    let newAOrder, newBOrder;
    if (aOrder !== bOrder && Math.abs(aOrder - bOrder) >= 2) {
      // 直接交换
      newAOrder = bOrder;
      newBOrder = aOrder;
    } else {
      // order 重叠/相邻, 重新规整化: 100 步长
      // 简化: 把 a 设为 b 的下一个, 把 b 设为 a 的下一个
      newAOrder = bOrder + 1;
      newBOrder = aOrder + 1;
    }
    const points = getPointsSync().slice();
    const ai = points.findIndex(p => p.id === a.id);
    const bi = points.findIndex(p => p.id === b.id);
    points[ai].order = newAOrder;
    points[bi].order = newBOrder;
    await saveAndSync(points);
    return points;
  }

  // ===== 重排 order 字段 (规整化为 100 步长)
  async function normalizeOrder() {
    const points = getPointsSync().slice();
    const sorted = sortByOrder(points);
    sorted.forEach((p, i) => { p.order = (i + 1) * 100; });
    await saveAndSync(sorted);
    return sorted;
  }

  async function deletePoint(id) {
    const points = getPointsSync().filter(p => p.id !== id);
    await saveAndSync(points);
    return points;
  }

  async function resetToDefault() {
    const defaults = JSON.parse(JSON.stringify(DEFAULT_POINTS));
    await saveAndSync(defaults);
    return defaults;
  }

  async function importJSON(jsonString) {
    const arr = JSON.parse(jsonString);
    if (!Array.isArray(arr)) throw new Error('数据必须是数组');
    for (const p of arr) {
      validatePoint(p);
      if (!p.id) p.id = genId();
    }
    await saveAndSync(arr);
    return arr;
  }

  function exportJSON() {
    return JSON.stringify(getPointsSync(), null, 2);
  }

  function getTypeMeta(type) {
    return TYPE_META[type] || TYPE_META.other;
  }

  // ===== 内部: 写服务器 + 缓存 =====
  async function saveAndSync(points) {
    // admin 才需要推服务器
    if (IS_ADMIN) {
      try {
        await postServer(points);
        memoryCache = { points: points, source: 'server', updatedAt: Date.now() };
        saveLocal(points);
        return { ok: true, source: 'server' };
      } catch (e) {
        // 失败仍写 localStorage (离线模式)
        memoryCache = { points: points, source: 'local', updatedAt: Date.now() };
        saveLocal(points);
        throw new Error('已存到本地, 服务器同步失败: ' + e.message);
      }
    } else {
      // 非 admin: 只写 localStorage (游客只读, 不写)
      memoryCache = { points: points, source: 'local', updatedAt: Date.now() };
      saveLocal(points);
      return { ok: true, source: 'local' };
    }
  }

  // ===== 启动自动同步 =====
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      syncFromServer().then(() => {
        document.dispatchEvent(new CustomEvent('campsite-sync-done', {
          detail: { source: getDataSource() }
        }));
      });
    });
  } else {
    // 立即同步 (不阻塞)
    syncFromServer().then(() => {
      document.dispatchEvent(new CustomEvent('campsite-sync-done', {
        detail: { source: getDataSource() }
      }));
    });
  }

  global.CampData = {
    getPoints,
    getPointsSync,
    getDisplayPoints,
    getSortedPoints,
    getDataSource,
    syncFromServer,
    addPoint,
    updatePoint,
    movePoint,
    normalizeOrder,
    deletePoint,
    resetToDefault,
    importJSON,
    exportJSON,
    getTypeMeta,
    escapeHtml,
    validatePoint
  };
})(window);
