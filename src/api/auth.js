// ─── 云端认证客户端 ───
// 与 api/axios.js 完全隔离：baseURL 是 auth.ddddnet.cn（Cloudflare Worker），
// 不走 http://localhost:3001/api（那个是本地后端，且必须登录后才通）。
// 本地后端只负责"设备指纹"一件事（端口未监听 = 拒绝登录）。

const PROD_AUTH_URL = 'https://auth.ddddnet.cn';
// 本地联调：?auth=http://localhost:8787 指向本地 wrangler
export const AUTH_BASE_URL = (() => {
  try {
    const q = new URLSearchParams(window.location.search).get('auth');
    if (q) return q.replace(/\/$/, '');
  } catch (e) {}
  return PROD_AUTH_URL;
})();

const TOKEN_KEY = 'pod_auth_token';

// ── token 存取（localStorage + 内存镜像，避免每次读磁盘）──
let memoryToken = null;
try { memoryToken = localStorage.getItem(TOKEN_KEY); } catch (e) {}

export const getAuthToken = () => memoryToken;
export const setAuthToken = (t) => {
  memoryToken = t;
  try { t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY); } catch (e) {}
};
export const clearAuthToken = () => setAuthToken(null);

// ── 设备指纹（**必须**走本地后端，端口 3001）──
// plan 7.1 规定：device_id = sha256(install_uuid + ':' + machineGuid).hex
// 本机 backend 还没启动 → 2s 超时 reject → LoginPage 显示"请启动 POD 本地程序"
// 实现位置：backend/server.js /api/license/device（阶段 4，现在占位）
const DEVICE_TIMEOUT_MS = 2000;
export async function getDeviceId() {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), DEVICE_TIMEOUT_MS);
  try {
    const resp = await fetch('http://localhost:3001/api/license/device', {
      method: 'GET',
      signal: ctrl.signal,
    });
    if (!resp.ok) throw new Error(`本地程序返回 HTTP ${resp.status}`);
    const data = await resp.json();
    if (!data || !data.device_id) throw new Error('本地程序未返回设备指纹');
    return { device_id: data.device_id, device_name: data.device_name || '' };
  } catch (e) {
    if (e.name === 'AbortError') throw new Error('本地程序无响应');
    throw new Error('无法连接本地程序');
  } finally {
    clearTimeout(timer);
  }
}

// ── 云端 API 共用 fetch 封装 ──
async function authFetch(path, { method = 'GET', body, token } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = 'Bearer ' + token;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 10000); // 云端 10s 超时
  try {
    const resp = await fetch(AUTH_BASE_URL + path, {
      method, headers, signal: ctrl.signal,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    let data = null;
    try { data = await resp.json(); } catch (e) {}
    if (!resp.ok) {
      const err = new Error((data && data.message) || `HTTP ${resp.status}`);
      err.code = (data && data.error) || null;
      err.status = resp.status;
      throw err;
    }
    return data;
  } finally {
    clearTimeout(timer);
  }
}

// ── 公开 API ──
// body: {email, password, device_id, device_name}
// 后端 401 时 error.code === 'invalid_credentials'（不区分账号不存在/密码错，产品设计）
export const authLogin = (body) => authFetch('/api/auth/login', { method: 'POST', body });

// body: {device_id}，必须带 token
// 后端返回 {valid, user_id, plan, expires_at}
// 401 → 会话被吊销 / 令牌过期；409 → device_mismatch；400 → device_required
export const authVerify = (token, body) => authFetch('/api/license/verify', { method: 'POST', token, body });

// 60s 心跳用：取当前用户信息
// 成功不写日志（Worker 端已做节流）
export const authMe = (token) => authFetch('/api/auth/me', { token });

// 登出（吊销当前 session）
export const authLogout = (token) => authFetch('/api/auth/logout', { method: 'POST', token });

// ── 轩宇汇 SSO ──
// 本地后端中继票据（localhost:3001）：轩宇汇回跳把 ticket 存到本地后端，前端轮询取回，
// 再拿票去云端 auth.ddddnet.cn 换本系统会话。与设备指纹同源，均依赖本地后端在线。
const SSO_TICKET_LOCAL = 'http://localhost:3001';
const SSO_POLL_MS = 1500;
const SSO_POLL_TIMEOUT_MS = 60_000; // 真票据 60s 失效，轮询上限略宽

// 拿票去云端换会话。成功返回 { token, ... }；待审批返回 { status:'pending', email, message }（HTTP 200）；
// 其余情况按 error.code 抛（account_exists_password / invalid_ticket / device_mismatch / license_expired / account_disabled）
export const authSsoLogin = (ticket, device_id, device_name) =>
  authFetch('/api/auth/sso-login', { method: 'POST', body: { ticket, device_id, device_name } });

// 轮询本地后端，等待轩宇汇回跳写入票据。resolve { ticket } 或 { ticket: null }（超时/无本地后端）
export async function pollSsoTicket() {
  const deadline = Date.now() + SSO_POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 3000);
    try {
      const resp = await fetch(`${SSO_TICKET_LOCAL}/api/auth/sso-ticket`, { signal: ctrl.signal });
      if (resp.ok) {
        const data = await resp.json().catch(() => null);
        if (data && data.ticket) return { ticket: data.ticket };
      }
    } catch (e) {
      // 本地后端未就绪或短暂不可达：继续轮询，不报错
    } finally {
      clearTimeout(t);
    }
    await new Promise((r) => setTimeout(r, SSO_POLL_MS));
  }
  return { ticket: null };
}

// ── 全局 forceLogout 回调（axios.js 抛 authFailure 时触发）──
// 让 LoginGate 能在**任何**本地后端 401 时感知到并立刻回登录页
let _onForceLogout = null;
export const registerForceLogoutHandler = (fn) => { _onForceLogout = fn; };
export const forceLogout = () => { if (_onForceLogout) _onForceLogout(); };

// ── 注入 axios.js：让 apiRequest/apiUpload 能带上 auth token ──
// 注意：auth.js **不** import axios.js（避免循环依赖），注入方向是"axios.js 预留 setter，auth.js 主动注入"
import { injectAuthTokenGetter } from './axios.js';
injectAuthTokenGetter(getAuthToken);
