/**
 * WGS-84 (国际 GPS) → GCJ-02 (中国火星坐标) 转换
 * 高德/腾讯/百度地图都用 GCJ-02;GPS、OSM 用 WGS-84
 * 算法来自互联网通用实现
 */

const PI = 3.1415926535897932384626;
const A = 6378245.0;          // 长半轴
const EE = 0.00669342162296594323;  // 偏心率平方

function outOfChina(lng, lat) {
  // 简单判断中国境内
  return lng < 72.004 || lng > 137.8347 || lat < 0.8293 || lat > 55.8271;
}

function transformLat(x, y) {
  let ret = -100.0 + 2.0 * x + 3.0 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x));
  ret += (20.0 * Math.sin(6.0 * x * PI) + 20.0 * Math.sin(2.0 * x * PI)) * 2.0 / 3.0;
  ret += (20.0 * Math.sin(y * PI) + 40.0 * Math.sin(y / 3.0 * PI)) * 2.0 / 3.0;
  ret += (160.0 * Math.sin(y / 12.0 * PI) + 320 * Math.sin(y * PI / 30.0)) * 2.0 / 3.0;
  return ret;
}

function transformLng(x, y) {
  let ret = 300.0 + x + 2.0 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x));
  ret += (20.0 * Math.sin(6.0 * x * PI) + 20.0 * Math.sin(2.0 * x * PI)) * 2.0 / 3.0;
  ret += (20.0 * Math.sin(x * PI) + 40.0 * Math.sin(x / 3.0 * PI)) * 2.0 / 3.0;
  ret += (150.0 * Math.sin(x / 12.0 * PI) + 300.0 * Math.sin(x / 30.0 * PI)) * 2.0 / 3.0;
  return ret;
}

/**
 * WGS-84 → GCJ-02
 * @param {number} lng WGS 经度
 * @param {number} lat WGS 纬度
 * @returns {[lng, lat]} GCJ-02 经纬度
 */
function wgs84ToGcj02(lng, lat) {
  if (outOfChina(lng, lat)) return [lng, lat];

  let dLat = transformLat(lng - 105.0, lat - 35.0);
  let dLng = transformLng(lng - 105.0, lat - 35.0);
  const radLat = lat / 180.0 * PI;
  let magic = Math.sin(radLat);
  magic = 1 - EE * magic * magic;
  const sqrtMagic = Math.sqrt(magic);
  dLat = (dLat * 180.0) / ((A * (1 - EE)) / (magic * sqrtMagic) * PI);
  dLng = (dLng * 180.0) / (A / sqrtMagic * Math.cos(radLat) * PI);
  return [lng + dLng, lat + dLat];
}

/**
 * 批量转换 (用于数据迁移)
 * @param {Array<{lat, lng, ...}>} points
 * @returns {Array} 转换后的点
 */
function wgs84ToGcj02Batch(points) {
  return points.map(p => {
    if (typeof p.lat === 'number' && typeof p.lng === 'number') {
      const [glng, glat] = wgs84ToGcj02(p.lng, p.lat);
      return { ...p, lat: glat, lng: glng };
    }
    return p;
  });
}

// 全局
window.Wgs84ToGcj02 = { wgs84ToGcj02, wgs84ToGcj02Batch };

/**
 * WGS-84 → BD-09 (百度坐标系)
 * 算法: 先 WGS-84 → GCJ-02, 再 GCJ-02 → BD-09
 * @param {number} lng WGS 经度
 * @param {number} lat WGS 纬度
 * @returns {[lng, lat]} BD-09 经纬度
 */
function wgs84ToBd09(lng, lat) {
  if (outOfChina(lng, lat)) return [lng, lat];
  const [gcjLng, gcjLat] = wgs84ToGcj02(lng, lat);
  // GCJ-02 → BD-09
  const xPi = (gcjLng * PI) * 3000.0 / 180.0;
  const z = Math.sqrt(gcjLng * gcjLng + gcjLat * gcjLat) + 0.00002 * Math.sin(xPi);
  const theta = Math.atan2(gcjLat, gcjLng) + 0.000003 * Math.cos(xPi);
  const bdLng = z * Math.cos(theta) + 0.0065;
  const bdLat = z * Math.sin(theta) + 0.006;
  return [bdLng, bdLat];
}

/**
 * 批量 WGS-84 → BD-09
 * @param {Array<{lat, lng, ...}>} points
 * @returns {Array}
 */
function wgs84ToBd09Batch(points) {
  return points.map(p => {
    if (typeof p.lat === 'number' && typeof p.lng === 'number') {
      const [bdLng, bdLat] = wgs84ToBd09(p.lng, p.lat);
      return { ...p, lat: bdLat, lng: bdLng };
    }
    return p;
  });
}

/**
 * 返回 BD-09 坐标的点(百度地图瓦片用)
 */
function getBd09Points(points) {
  if (typeof wgs84ToBd09 === 'undefined') return points;
  return wgs84ToBd09Batch(points);
}

window.Wgs84ToBd09 = { wgs84ToBd09, wgs84ToBd09Batch };
window.CampCoords = { wgs84ToGcj02, wgs84ToGcj02Batch, wgs84ToBd09, wgs84ToBd09Batch, getBd09Points };
