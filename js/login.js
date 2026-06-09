// ===== 手机号验证码登录 (顾客端) =====
(function () {
  'use strict';

  const API = window.CAMPSITE_API_BASE || '/api';
  const PHONE_KEY = 'campsite_user_phone';
  const USER_KEY = 'campsite_user_info';

  // 工具栏: 登录按钮 (未登录时显示)
  function setupLoginBtn() {
    const tb = document.getElementById('quickToolbar');
    if (!tb) return;
    if (document.getElementById('toolLoginBtn')) return;
    const btn = document.createElement('button');
    btn.className = 'tool-btn tool-login';
    btn.id = 'toolLoginBtn';
    btn.title = '登录 / 注册';
    btn.innerHTML = '<span class="tool-icon">👤</span><span class="tool-label">登录</span>';
    btn.addEventListener('click', showLoginModal);
    tb.insertBefore(btn, tb.firstChild);
    // 已登录 → 显示昵称
    updateLoginBtn();
  }

  function updateLoginBtn() {
    const btn = document.getElementById('toolLoginBtn');
    if (!btn) return;
    const user = getUser();
    if (user) {
      btn.innerHTML = `<span class="tool-icon">✓</span><span class="tool-label">${user.nickname || '已登录'}</span>`;
      btn.classList.add('logged-in');
    } else {
      btn.innerHTML = '<span class="tool-icon">👤</span><span class="tool-label">登录</span>';
      btn.classList.remove('logged-in');
    }
  }

  function getUser() {
    try {
      const raw = localStorage.getItem(USER_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }
  function setUser(user) {
    localStorage.setItem(USER_KEY, JSON.stringify(user));
    updateLoginBtn();
  }
  function clearUser() {
    localStorage.removeItem(USER_KEY);
    localStorage.removeItem(PHONE_KEY);
    updateLoginBtn();
  }

  // ===== 登录模态 =====
  function showLoginModal() {
    const user = getUser();
    if (user) {
      showProfileModal(user);
      return;
    }
    if (document.getElementById('loginModal')) return;
    const m = document.createElement('div');
    m.id = 'loginModal';
    m.className = 'modal-backdrop';
    m.innerHTML = `
      <div class="modal-card login-card">
        <div class="ai-header">
          <span>👤 手机号登录</span>
          <button class="ai-close" id="loginCloseBtn">✕</button>
        </div>
        <div class="login-body">
          <p class="muted">登录后跨设备保留打卡记录, 解锁全部奖励</p>
          <label class="form-label">📱 手机号</label>
          <input type="tel" id="loginPhone" maxlength="11" placeholder="11 位手机号" />
          <label class="form-label">🔢 验证码</label>
          <div class="login-code-row">
            <input type="text" id="loginCode" maxlength="6" placeholder="6 位验证码" inputmode="numeric" />
            <button class="btn-send-code" id="sendCodeBtn">获取验证码</button>
          </div>
          <p class="muted" style="font-size:11px;margin-top:6px">⚠️ 验证码 (DEV): 直接在控制台查看</p>
          <div class="login-error" id="loginError"></div>
          <div class="modal-actions">
            <button class="btn-close" id="loginCancelBtn">取消</button>
            <button class="btn-copy" id="loginSubmitBtn">登录 / 注册</button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(m);
    m.querySelector('#loginCloseBtn').addEventListener('click', () => m.remove());
    m.querySelector('#loginCancelBtn').addEventListener('click', () => m.remove());
    m.addEventListener('click', (e) => { if (e.target === m) m.remove(); });

    const sendBtn = m.querySelector('#sendCodeBtn');
    const phoneInput = m.querySelector('#loginPhone');
    const codeInput = m.querySelector('#loginCode');
    const errorEl = m.querySelector('#loginError');

    sendBtn.addEventListener('click', async () => {
      const phone = phoneInput.value.trim();
      if (!/^1[3-9]\d{9}$/.test(phone)) {
        showErr('请输入正确手机号');
        return;
      }
      sendBtn.disabled = true;
      sendBtn.textContent = '发送中...';
      try {
        const res = await fetch(API + '/sms/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone })
        });
        const j = await res.json();
        if (j.code !== 0) throw new Error(j.message);
        // 倒计时
        let s = 60;
        const tick = () => {
          if (s <= 0) {
            sendBtn.disabled = false;
            sendBtn.textContent = '获取验证码';
            return;
          }
          sendBtn.textContent = `${s}s 后重发`;
          s--;
          setTimeout(tick, 1000);
        };
        tick();
        errorEl.textContent = '✓ 验证码已发送 (DEV 模式控制台查看: ' + (j.devCode || '已发') + ')';
        errorEl.style.color = '#2E7D32';
        codeInput.focus();
      } catch (e) {
        showErr('发送失败: ' + e.message);
        sendBtn.disabled = false;
        sendBtn.textContent = '获取验证码';
      }
    });

    function showErr(msg) {
      errorEl.textContent = msg;
      errorEl.style.color = '#C62828';
    }

    m.querySelector('#loginSubmitBtn').addEventListener('click', async () => {
      const phone = phoneInput.value.trim();
      const code = codeInput.value.trim();
      if (!/^1[3-9]\d{9}$/.test(phone)) { showErr('手机号错'); return; }
      if (!/^\d{6}$/.test(code)) { showErr('验证码 6 位'); return; }
      // 取 anonymous ID 用于迁移
      const anonymousId = localStorage.getItem('campsite_user_id');
      try {
        const res = await fetch(API + '/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone, code, anonymousId })
        });
        const j = await res.json();
        if (j.code !== 0) throw new Error(j.message);
        setUser(j.user);
        localStorage.setItem(PHONE_KEY, j.user.phone);
        // 覆盖 anonymous ID 为手机号 userId (后续 checkin 用)
        localStorage.setItem('campsite_user_id', j.user.id);
        m.remove();
        showSuccess(j.user);
      } catch (e) {
        showErr('登录失败: ' + e.message);
      }
    });
  }

  function showSuccess(user) {
    const m = document.createElement('div');
    m.className = 'modal-backdrop';
    m.innerHTML = `
      <div class="modal-card success-card">
        <div class="success-icon">✅</div>
        <h3>登录成功</h3>
        <p>欢迎, ${user.nickname || '游客'}</p>
        <div class="success-detail">
          <div>手机号: <strong>${user.phone}</strong></div>
          <div>累计打卡: <strong>${user.checkinCount}</strong> 个印章</div>
        </div>
        <div class="modal-actions">
          <button class="btn-copy" id="loginSuccCloseBtn">好的</button>
        </div>
      </div>
    `;
    document.body.appendChild(m);
    m.querySelector('#loginSuccCloseBtn').addEventListener('click', () => m.remove());
    m.addEventListener('click', (e) => { if (e.target === m) m.remove(); });
  }

  function showProfileModal(user) {
    const m = document.createElement('div');
    m.className = 'modal-backdrop';
    m.innerHTML = `
      <div class="modal-card login-card">
        <div class="ai-header">
          <span>👤 我的账户</span>
          <button class="ai-close" id="profCloseBtn">✕</button>
        </div>
        <div class="login-body">
          <div class="profile-info">
            <div class="profile-avatar">${user.nickname ? user.nickname.slice(-2) : '👤'}</div>
            <div class="profile-name">${user.nickname || '游客'}</div>
            <div class="profile-phone">${user.phone}</div>
          </div>
          <div class="profile-stat">
            <div>累计打卡 <strong>${user.checkinCount || 0}</strong> 个</div>
          </div>
          <div class="modal-actions">
            <button class="btn-close" id="logoutBtn">退出登录</button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(m);
    m.querySelector('#profCloseBtn').addEventListener('click', () => m.remove());
    m.querySelector('#logoutBtn').addEventListener('click', () => {
      if (confirm('退出后下次需重新登录, 打卡记录会保留')) {
        clearUser();
        m.remove();
      }
    });
    m.addEventListener('click', (e) => { if (e.target === m) m.remove(); });
  }

  function init() {
    setupLoginBtn();
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
