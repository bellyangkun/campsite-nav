// ===== P0 实用功能 (3-4-5) =====
// P0-3 一键呼叫 / P0-4 紧急疏散 / P0-5 AI 客服
// 依赖: window.CampData (data.js), window.BaiduMap (baidu-map.js)
(function () {
  'use strict';

  const HOTEL_PHONE = '021-59978686';  // 鹿营乡悦华亭度假村预约热线
  const EVAC_GATHER = [
    { id: 'eg1', name: '正门集合点', lat: 31.481502, lng: 121.28726, note: '主入口停车场旁' },
    { id: 'eg2', name: '西门集合点', lat: 31.479885, lng: 121.289259, note: '西门停车场' },
    { id: 'eg3', name: '中央草坪集合点', lat: 31.481916, lng: 121.287555, note: '中央草坪' }
  ];

  // ===== P0-3 一键呼叫 =====
  function setupCall() {
    const btn = document.getElementById('toolCallBtn');
    if (!btn) return;
    btn.addEventListener('click', () => {
      // 微信内会拦截 tel: 用模态确认, 其他环境直接拨号
      const ua = navigator.userAgent.toLowerCase();
      const isWechat = /micromessenger/.test(ua);
      if (isWechat) {
        showCallModal();
      } else {
        window.location.href = 'tel:' + HOTEL_PHONE;
      }
    });
  }

  function showCallModal() {
    const m = document.createElement('div');
    m.className = 'modal-backdrop';
    m.innerHTML = `
      <div class="modal-card">
        <h3>📞 呼叫前台</h3>
        <p>鹿营乡悦华亭度假村 预约热线</p>
        <div class="modal-phone">${HOTEL_PHONE}</div>
        <p class="modal-hint">微信内无法直接拨号, 请复制号码后到手机键盘拨打:</p>
        <div class="modal-actions">
          <button class="btn-copy" id="copyPhoneBtn">📋 复制号码</button>
          <button class="btn-close" id="closeCallBtn">关闭</button>
        </div>
      </div>
    `;
    document.body.appendChild(m);
    m.querySelector('#copyPhoneBtn').addEventListener('click', () => {
      navigator.clipboard.writeText(HOTEL_PHONE).then(() => {
        m.querySelector('#copyPhoneBtn').textContent = '✓ 已复制';
        setTimeout(() => m.remove(), 1500);
      }).catch(() => {
        // fallback
        const ta = document.createElement('textarea');
        ta.value = HOTEL_PHONE;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        ta.remove();
        m.querySelector('#copyPhoneBtn').textContent = '✓ 已复制';
        setTimeout(() => m.remove(), 1500);
      });
    });
    m.querySelector('#closeCallBtn').addEventListener('click', () => m.remove());
    m.addEventListener('click', (e) => { if (e.target === m) m.remove(); });
  }

  // ===== P0-4 紧急疏散 =====
  let evacMode = false;
  let evacOverlays = [];

  function setupEvac() {
    const btn = document.getElementById('toolEvacBtn');
    if (!btn) return;
    btn.addEventListener('click', () => {
      if (evacMode) {
        clearEvac();
        return;
      }
      showEvac();
    });
  }

  function showEvac() {
    evacMode = true;
    const map = window.__campsiteMap;
    if (!map) {
      alert('地图尚未加载, 请稍候再试');
      return;
    }
    // 切换按钮文案
    const btn = document.getElementById('toolEvacBtn');
    btn.innerHTML = '<span class="tool-icon">✕</span><span class="tool-label">关闭疏散</span>';

    // 1. 画 3 个红色集合点
    EVAC_GATHER.forEach(g => {
      const html = `<div class="evac-marker">
        <div class="evac-icon">🆘</div>
        <div class="evac-label">${g.name}</div>
      </div>`;
      const overlay = BaiduMap.addDivMarker(map, g.lng, g.lat, html, { x: 16, y: 16 });
      evacOverlays.push(overlay);
    });

    // 2. 显示疏散说明模态
    showEvacModal();

    // 3. fitBounds 让所有点都可见
    const allPts = EVAC_GATHER.map(g => new BMap.Point(g.lng, g.lat));
    try {
      const viewport = map.getViewport(allPts);
      map.setViewport(viewport, { margins: [80, 60, 200, 60] });
    } catch (e) {}
  }

  function showEvacModal() {
    const m = document.createElement('div');
    m.className = 'modal-backdrop';
    m.innerHTML = `
      <div class="modal-card evac-card">
        <h3 style="color:#C62828">🚨 紧急疏散</h3>
        <p>如遇紧急情况 (火灾/医疗), 请:</p>
        <ol class="evac-steps">
          <li>保持冷静, 听从工作人员指挥</li>
          <li>沿主路向 3 个红色集合点撤离</li>
          <li>不要返回取物品, 优先保证人身安全</li>
          <li>到达集合点后清点人数</li>
        </ol>
        <p class="evac-phone">紧急联系: <strong>${HOTEL_PHONE}</strong></p>
        <div class="modal-actions">
          <button class="btn-call-emerg" id="callEmergencyBtn">📞 立即呼叫</button>
          <button class="btn-close" id="closeEvacBtn">我已了解</button>
        </div>
      </div>
    `;
    document.body.appendChild(m);
    m.querySelector('#callEmergencyBtn').addEventListener('click', () => {
      window.location.href = 'tel:' + HOTEL_PHONE;
    });
    m.querySelector('#closeEvacBtn').addEventListener('click', () => m.remove());
  }

  function clearEvac() {
    evacMode = false;
    const btn = document.getElementById('toolEvacBtn');
    btn.innerHTML = '<span class="tool-icon">🚨</span><span class="tool-label">紧急疏散</span>';
    evacOverlays.forEach(o => {
      try { o._div.remove(); } catch (e) {}
    });
    evacOverlays = [];
  }

  // ===== P0-5 AI 客服 (调 minimax API) =====
  // 知识库: 度假村 FAQ, 来自产品一览表 (2026-05-11) + 通用信息
  const FAQ = [
    // ---- 基础信息 ----
    { q: '营业时间', a: '度假村全年开放, 9:00-21:00。酒店 24 小时前台。' },
    { q: '地址', a: '上海市嘉定区华亭镇联康路 277弄 1-20号 (正门, 鹿营乡悦趣乐部)。另设西门: 霜竹公路 518号, 两门同属一个度假村。' },
    { q: '位置', a: '上海市嘉定区华亭镇联康路 277弄 1-20号。百度/高德搜"鹿营乡悦趣乐部"或"乡悦华亭度假村"可达。' },
    { q: '预约', a: '预约电话 021-59978686, 微信小程序"鹿营乡悦"也可下单。' },
    { q: '宠物', a: '宠物可在中央草坪、东侧环路活动, 餐厅/酒店禁止宠物进入。' },
    { q: '停车', a: '正门停车场 100 个车位 (免费), VIP 停车场 30 个, 西门停车场 50 个。' },
    { q: '儿童乐园', a: 'Neverland 儿童乐园 5700㎡, 9:00-18:00, 亲子必推荐。' },

    // ---- 餐饮 (户外项目门市价) ----
    { q: '天幕烧烤', a: '草坪区天幕烧烤 ¥138/人, 含蛋卷桌椅露营装备。营位时间 9:30-15:00 中午场 / 15:30-21:00 晚场。加 ¥10 (结算 ¥10) 升级自助不限量。' },
    { q: '烤肉套餐', a: '草坪区烤肉套餐 ¥138/人, 含露营天幕、蛋卷桌、露营椅、卡斯炉牛排烤肉。营位可选中午场或晚场。' },
    { q: '单租营位', a: '单租营位 ¥398, 不含食材, 送围炉煮茶工具 1 套 + 露营天幕 1 套, 最多 10 人座位。单租烤架 ¥100/个 (炭火 2.5 小时)。' },
    { q: 'VIP 野奢烧烤', a: '湖边 VIP 区野奢烧烤 ¥188/人, 含品质露营装备, 宽敞空间, 精致烧烤食材。营位 9:30-15:00 中午场 / 15:30-21:00 晚场。加 ¥20 升级自助不限量。' },
    { q: 'VIP 战斧牛排', a: '湖边 VIP 区战斧牛排套餐 ¥238/人, 含 VIP 营位、品质露营装备、宽敞空间、草坪小活动项目、甄选鲜切战斧牛排套餐。' },
    { q: '围炉煮茶', a: '露营下午茶 ¥298, 含小碳炉 1 个、茶具 1 套、果盘 1 份。' },
    { q: '碳烤全羊', a: '碳烤全羊 ¥100/只 (进场费), 食材另算。' },
    { q: '土灶', a: '天幕位置 + 灶头 + 常规调料 + 菜品, ¥1000 起。' },
    { q: '桌餐', a: '营地配套餐厅, 环境舒适, ¥700/桌起。' },
    { q: '团队餐', a: '4 档可选: ¥800/桌 (8 热菜)、¥1000/桌 (6 冷菜 8 热菜)、¥1200/桌 (6 冷菜 8 热菜)、¥1500/桌 (6 冷菜 8 热菜), 均含本地香米饭 + 饮料 1.25L*2。' },

    // ---- 游玩套票 ----
    { q: '7选4套票', a: '¥198/人, 7 选 4 项目 (皮划艇 / 荒岛战场 CS / 射箭 / 陶艺彩绘 / 网红小火车 / 树上探险 / 儿童乐园)。10 人起订, 套票总价已优惠, 单项不玩不退。' },
    { q: '小套票', a: '游玩小套票 ¥98/人, 含皮划艇 + 射箭。' },
    { q: '向往生活套票', a: '¥318/人, 含 138 天幕烧烤 + 领队带团 (干农活抓鱼/抓螃蟹、非遗美食做方糕或炸爆米花、小手工做漆扇/马赛克杯垫)。15 人起订, 套票总价已优惠。' },
    { q: '烟花大会', a: '¥1988/场 (10 分钟), 含大烟花*1、喷花小烟花*2、特效加特林*10、仙女棒*10 盒。特殊烟花定制可另议。' },
    { q: '篝火晚会', a: '¥1200/场 (60 分钟), 含场地、篝火、柴火 1 堆、音响话筒、荧光棒。80 人以上团队价另议。' },

    // ---- 游玩单项 ----
    { q: '皮划艇单项', a: '¥78/小时, 新中式园林河景, 湖心岛环岛线路。' },
    { q: 'CS 单项', a: '荒岛战场 CS ¥98/场, 含镭射枪 + 分队服, 每场 2 局。' },
    { q: '射箭', a: '户外专业射箭场 ¥38/票, 含 10 支箭, 体验百步穿杨的快感。' },
    { q: '陶艺彩绘', a: 'DIY 创作 ¥38/人, 含彩绘工具 1 套。' },
    { q: '网红小火车', a: '¥30/圈, 乘坐小火车景区内观光游览。' },
    { q: '树上探险', a: '¥30/次, 挑战树林闯关, 做一次探险的小勇士。' },
    { q: '儿童乐园价格', a: 'Neverland 主题乐园 ¥35/人 或 ¥58/1 大 1 小, 亲子必推荐。' },
    { q: '路亚钓鱼', a: '¥168/天, 自带鱼竿路亚钓, 时间一天不限, 钓到可带鲈鱼 1 条 + 其他 1 条 (带走需称重)。' },
    { q: '钓小龙虾', a: '¥58/人, 含全套工具 (钓竿、抄网、桶、椅子), 赠送现榨橙汁一杯。温馨亲子时光。' },

    // ---- 酒店客房 / 别墅 ----
    { q: '高级大床房', a: '鹿营乡悦大床房 (8 间), 1.8m 大床, 周日-周四 ¥499, 周五-周六 ¥599。' },
    { q: '行政浴缸大床房', a: '鹿营乡悦大床房 (含浴缸), 1.8m 大床, 周日-周四 ¥599, 周五-周六 ¥699。' },
    { q: '高级双床房', a: '鹿营乡悦双床房, 1.5m*2, 周日-周四 ¥699, 周五-周六 ¥799。' },
    { q: '雅尊行政套房', a: '鹿营乡悦套房 (含客厅), 1.8m 大床, 周日-周四 ¥889, 周五-周六 ¥989。' },
    { q: '立冬别墅', a: '5# 一层二房立冬别墅 (含庭院), 1.8m*2, 周日-周四 ¥2589, 周五-周六 ¥3589。' },
    { q: '一层二房别墅', a: '6#霜降 / 12#寒露 / 15#春分 / 17#雨水 (含庭院), 1.8m*2 + 1.5m*1, 周日-周四 ¥3689, 周五-周六 ¥4689。' },
    { q: '一层三房别墅', a: '7#秋分 / 2#处暑 / 3#立秋 / 9#小满 (含庭院+农田), 1.8m*2 + 1.5m*1, 周日-周四 ¥3689, 周五-周六 ¥4689。' },
    { q: '二层三房别墅', a: '8#芒种 / 10#夏至 (含庭院+农田), 1.8m*3 + 单床 1.2m*1; 16#惊蛰 (含庭院、麻将机), 1.8m*3 + 单床 1.35m*1。均周日-周四 ¥4289, 周五-周六 ¥5289。' },
    { q: '二层四房别墅', a: '1#白露 (含庭院+农田), 1.8m*4, 周日-周四 ¥4589, 周五-周六 ¥5589; 18#立春 / 13#立夏 / 11#谷雨 (含庭院+麻将机+儿童房), 1.8m*4 + 单床 1.2m*1, 周日-周四 ¥4889, 周五-周六 ¥5889。' },

    // ---- 活动流程 (Day 1 / Day 2) ----
    { q: '一日游推荐', a: '上午 9:30 射箭 → 10:00 儿童乐园 → 11:00 草坪天幕休息 → 12:00 酒店桌餐 → 13:30 返程或继续体验其他项目。' },
    { q: '两日游推荐', a: 'Day1: 14:00 入住 → 15:00 皮划艇 → 17:00 草坪 → 17:30 烧烤自助 → 20:30 别墅休息。Day2: 8:30 早餐 → 9:30 射箭 → 10:00 儿童乐园 → 11:00 草坪 → 12:00 桌餐 → 13:30 返程。' }
  ];

  function setupAI() {
    const btn = document.getElementById('toolAiBtn');
    if (!btn) return;
    btn.addEventListener('click', () => showAIChat());
  }

  function showAIChat() {
    if (document.getElementById('aiChatModal')) return;
    const faqList = FAQ.map((f, i) => `<button class="ai-faq-btn" data-idx="${i}">${f.q}</button>`).join('');
    const m = document.createElement('div');
    m.id = 'aiChatModal';
    m.className = 'modal-backdrop';
    m.innerHTML = `
      <div class="modal-card ai-card">
        <div class="ai-header">
          <span>🤖 鹿营 AI 客服</span>
          <button class="ai-close" id="aiCloseBtn">✕</button>
        </div>
        <div class="ai-body" id="aiBody">
          <div class="ai-msg bot">你好, 我是鹿营小助手。可以问营业时间/活动/餐饮/酒店, 也可以点下方常见问题。</div>
        </div>
        <div class="ai-faq-row">${faqList}</div>
        <div class="ai-input-row">
          <input type="text" id="aiInput" placeholder="输入你的问题..." maxlength="200" />
          <button id="aiSendBtn">发送</button>
        </div>
      </div>
    `;
    document.body.appendChild(m);

    const body = m.querySelector('#aiBody');
    const input = m.querySelector('#aiInput');
    const send = m.querySelector('#aiSendBtn');

    m.querySelector('#aiCloseBtn').addEventListener('click', () => m.remove());
    m.addEventListener('click', (e) => { if (e.target === m) m.remove(); });

    m.querySelectorAll('.ai-faq-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.idx, 10);
        askFAQ(idx, body, input);
      });
    });

    send.addEventListener('click', () => askLLM(input.value.trim(), body, input));
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') askLLM(input.value.trim(), body, input);
    });

    setTimeout(() => input.focus(), 200);
  }

  function askFAQ(idx, body, input) {
    const f = FAQ[idx];
    appendMsg(body, 'user', f.q);
    setTimeout(() => appendMsg(body, 'bot', f.a), 400);
  }

  function askLLM(text, body, input) {
    if (!text) return;
    appendMsg(body, 'user', text);
    input.value = '';
    const loading = appendMsg(body, 'bot', '思考中...');
    // 直接发用户原文 + FAQ 列表给后端关键词匹配
    const prompt = `用户问题: ${text}`;

    // 调后端 /api/ai (本地 FAQ 关键词匹配, 腾讯云无 mavis CLI)
    fetch(window.CAMPSITE_API_BASE + '/ai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, faqs: FAQ })
    })
    .then(r => r.json())
    .then(j => {
      loading.textContent = j.answer || (j.message || '服务暂时不可用, 请联系前台 021-59978686');
    })
    .catch(e => {
      loading.textContent = '网络错误, 请联系前台 021-59978686';
      console.error('[AI]', e);
    });
  }

  function appendMsg(body, role, text) {
    const div = document.createElement('div');
    div.className = 'ai-msg ' + role;
    div.textContent = text;
    body.appendChild(div);
    body.scrollTop = body.scrollHeight;
    return div;
  }

  // ===== 启动 =====
  function init() {
    setupCall();
    setupEvac();
    setupAI();
    // 暴露 map 给疏散用
    document.addEventListener('campsite-map-ready', (e) => {
      window.__campsiteMap = e.detail.map;
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
