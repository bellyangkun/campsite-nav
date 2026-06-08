/**
 * 共享数据管理
 * 使用 localStorage 存储活动点，并提供导入/导出支持。
 * 如需后端，可替换此文件的读写实现。
 */
(function (global) {
  const STORAGE_KEY = 'campsite_points_v2';

  const DEFAULT_POINTS = [
    // 乡悦华亭度假村 - 上海市嘉定区华亭镇霜竹公路 518 号
    // 真实坐标来自百度地图 place/v2 API (服务端 AK):
    //   - 主入口/Neverland/湖边露营烧烤 用 POI 真实坐标
    //   - 路亚钓鱼池/一尺花园/林下泵道/中央草坪 度假村中心 ±200-400m 估算
    // BD-09 → WGS-84 转换 (本地 coords.js)
    { id: 'p1', name: '度假村主入口', lat: 31.481527, lng: 121.286954, description: '霜竹公路518号主入口，停车与签到处', type: 'entrance' },
    { id: 'p2', name: 'Neverland 儿童乐园', lat: 31.481558, lng: 121.286868, description: '5700㎡无动力亲子乐园，金属滑梯、绳网、挖沙', type: 'activity' },
    { id: 'p3', name: '湖边露营烧烤', lat: 31.481486, lng: 121.287068, description: '湖边烧烤野奢露营、皮划艇、CS团建 (联康路277弄18号)', type: 'activity' },
    { id: 'p4', name: '路亚钓鱼池', lat: 31.483293, lng: 121.283545, description: '改造鱼塘，鲈鱼/鳜鱼/虹鳟/梭鲈鱼，¥168/天', type: 'activity' },
    { id: 'p5', name: '一尺花园咖啡馆', lat: 31.479885, lng: 121.289259, description: '温室花园咖啡，扶荔宫，餐饮+打卡', type: 'service' },
    { id: 'p6', name: '林下泵道', lat: 31.482161, lng: 121.290561, description: '上海最大林下泵道，初级/标准/腾跃赛道', type: 'activity' },
    { id: 'p7', name: '中央草坪', lat: 31.481916, lng: 121.287555, description: '露营、飞盘、野餐、亲子活动', type: 'activity' }
  ];

  const TYPE_META = {
    entrance: { label: '入口', color: '#795548', icon: '🚪' },
    activity: { label: '活动', color: '#4CAF50', icon: '⛺' },
    service:  { label: '服务', color: '#2196F3', icon: '🛒' },
    other:    { label: '其他', color: '#9E9E9E', icon: '📍' }
  };

  function loadRaw() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return JSON.parse(raw);
    } catch (e) {
      console.warn('读取本地数据失败', e);
    }
    return null;
  }

  function getPoints() {
    const data = loadRaw();
    // data === null 表示从未访问过，返回默认数据；
    // 空数组表示用户主动清空，应保留空数组；
    // 其他异常情况兜底返回默认数据。
    if (data === null) return JSON.parse(JSON.stringify(DEFAULT_POINTS));
    if (Array.isArray(data)) return data;
    return JSON.parse(JSON.stringify(DEFAULT_POINTS));
  }

  /**
   * 返回 GCJ-02 坐标的点(高德地图用)
   * 内部存储是 WGS-84,只在渲染时转
   */
  function getDisplayPoints() {
    const points = getPoints();
    if (typeof Wgs84ToGcj02 === 'undefined') return points;
    return Wgs84ToGcj02.wgs84ToGcj02Batch(points);
  }

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, (m) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[m]));
  }

  function validatePoint(p, partial = false) {
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
  }

  function savePoints(points) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(points));
    } catch (e) {
      console.warn('保存本地数据失败', e);
      throw e;
    }
  }

  function genId() {
    return 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
  }

  function addPoint(point) {
    validatePoint(point);
    const points = getPoints();
    point.id = point.id || genId();
    points.push(point);
    savePoints(points);
    return point;
  }

  function updatePoint(id, updates) {
    const points = getPoints();
    const idx = points.findIndex(p => p.id === id);
    if (idx === -1) return null;
    points[idx] = { ...points[idx], ...updates, id };
    savePoints(points);
    return points[idx];
  }

  function deletePoint(id) {
    let points = getPoints();
    const originalLen = points.length;
    points = points.filter(p => p.id !== id);
    if (points.length === originalLen) return false;
    savePoints(points);
    return true;
  }

  function resetToDefault() {
    savePoints(JSON.parse(JSON.stringify(DEFAULT_POINTS)));
  }

  function getTypeMeta(type) {
    return TYPE_META[type] || TYPE_META.other;
  }

  function exportJSON() {
    return JSON.stringify(getPoints(), null, 2);
  }

  function importJSON(jsonString) {
    const arr = JSON.parse(jsonString);
    if (!Array.isArray(arr)) throw new Error('数据必须是数组');
    for (const p of arr) {
      validatePoint(p);
      if (!p.id) p.id = genId();
    }
    savePoints(arr);
    return arr;
  }

  global.CampData = {
    getPoints,
    getDisplayPoints,
    savePoints,
    addPoint,
    updatePoint,
    deletePoint,
    resetToDefault,
    getTypeMeta,
    escapeHtml,
    exportJSON,
    importJSON
  };
})(window);
