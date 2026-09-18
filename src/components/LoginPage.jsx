// ─── 登录页 ───
// plan 6.2：强制登录页（未登录看不到任何业务组件）
// 三个步骤：① 取设备指纹（本地后端必须在线）→ ② 云端登录 → ③ 拿到 token 后 LoginGate 自动接管
// 另提供「轩宇汇账号登录」：跳轩宇汇 SSO 中转页 → 本地后端回跳中继票据 → 轮询取票 → 云端换会话；
// 首次登录的轩宇汇用户落为「待审批」，需 pod-system 管理员在后台审批（选套餐/设到期）后才能登录。

import React, { useState, useRef } from 'react';
import { Download } from 'lucide-react';
import { getDeviceId, authLogin, setAuthToken, pollSsoTicket, authSsoLogin } from '../api/auth.js';

import { DEFAULT_SITE_SETTINGS } from '../api/siteSettings.js';

// 需要联系客服处理的错误码（其余为可自助重试的情况）
const SUPPORT_ERROR_CODES = ['account_disabled', 'license_expired', 'device_mismatch', 'device_required', 'unknown'];

// 轩宇汇 SSO 中转页（轩宇汇登录态换一次性票据，再回跳本地后端）
const SSO_ENTRY = 'https://pod.ddddnet.cn/sso?app=podsystem';

export default function LoginPage({ onLoggedIn, siteSettings, onBack }) {
  const contact = { ...DEFAULT_SITE_SETTINGS, ...(siteSettings || {}) };
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);   // { code, message }
  const [step, setStep] = useState('idle');   // idle | getting_device | logging_in | error
  // 轩宇汇 SSO 子状态：idle=未发起 / polling=已开浏览器等待回跳 / pending=待管理员审批
  const [ssoPhase, setSsoPhase] = useState('idle');
  const [ssoEmail, setSsoEmail] = useState('');
  const ssoAbort = useRef(false);

  const resetSso = () => {
    ssoAbort.current = true;
    setSsoPhase('idle');
    setSsoEmail('');
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!email.trim() || !password) {
      setError({ code: 'bad_request', message: '请输入邮箱和密码' });
      return;
    }
    setError(null);
    setLoading(true);

    // ① 设备指纹（本地后端必须在线）
    setStep('getting_device');
    let deviceInfo;
    try {
      deviceInfo = await getDeviceId();
    } catch (e) {
      setStep('error');
      setError({ code: 'local_not_ready', message: '无法连接本机服务。请先启动叮当桌面程序，再回到此页面登录。' });
      setLoading(false);
      return;
    }

    // ② 云端登录
    setStep('logging_in');
    try {
      const data = await authLogin({
        email: email.trim(),
        password,
        device_id: deviceInfo.device_id,
        device_name: deviceInfo.device_name || 'pod-desktop',
      });
      // ③ 成功 → 存 token + 交给 LoginGate 心跳接管
      setAuthToken(data.token);
      setStep('idle');
      setLoading(false);
      onLoggedIn && onLoggedIn();
    } catch (e) {
      setStep('error');
      // 按 error.code 分支（Worker 后端返回的受控枚举）
      switch (e.code) {
        case 'invalid_credentials':
          setError({ code: e.code, message: '邮箱或密码错误' });
          break;
        case 'account_disabled':
          setError({ code: e.code, message: '该账号已被停用，请联系客服' });
          break;
        case 'license_expired':
          setError({ code: e.code, message: '授权已到期，请联系客服续费' });
          break;
        case 'device_required':
          setError({ code: e.code, message: '本地程序未返回设备指纹，请重启 POD' });
          break;
        case 'device_mismatch':
          setError({ code: e.code, message: '账号已在另一台设备绑定，无法在此机登录。请联系客服申请解绑。' });
          break;
        default:
          setError({ code: e.code || 'unknown', message: e.message || '登录失败，请稍后重试' });
      }
      setLoading(false);
    }
  };

  // ── 轩宇汇账号登录 ──
  const handleSsoLogin = async () => {
    setError(null);
    // ★ 必须在用户手势内同步开窗口（await 之后再开会被浏览器 popup 拦截）
    const ssoWin = window.open(SSO_ENTRY, '_blank', 'noopener');
    setLoading(true);

    // ① 设备指纹（SSO 同样依赖本地后端在线）
    let deviceInfo;
    try {
      deviceInfo = await getDeviceId();
    } catch (e) {
      setLoading(false);
      if (ssoWin) { try { ssoWin.close(); } catch (_) {} }
      setError({ code: 'local_not_ready', message: '无法连接本机服务。请先启动叮当桌面程序，再回到此页面登录。' });
      return;
    }

    // ② 轩宇汇 SSO 中转页已在上面的窗口打开，本地后端等待回跳票据
    ssoAbort.current = false;
    setSsoPhase('polling');
    setLoading(false);

    // ③ 轮询本地后端取票（一次性消费）
    const { ticket } = await pollSsoTicket();
    if (ssoAbort.current) return; // 用户取消
    if (!ticket) {
      setSsoPhase('idle');
      setError({ code: 'sso_timeout', message: '等待轩宇汇授权超时，请在浏览器中完成登录后重试。' });
      return;
    }

    // ④ 拿票去云端换会话
    try {
      const data = await authSsoLogin(ticket, deviceInfo.device_id, deviceInfo.device_name || 'pod-desktop');
      if (data && data.status === 'pending') {
        setSsoEmail(data.email || '');
        setSsoPhase('pending');
        return;
      }
      setAuthToken(data.token);
      setSsoPhase('idle');
      onLoggedIn && onLoggedIn();
    } catch (e) {
      setSsoPhase('idle');
      // 按 error.code 分支（auth-worker 返回的受控枚举）
      switch (e.code) {
        case 'account_exists_password':
          setError({ code: e.code, message: '该邮箱已用密码注册，请改用密码登录。' });
          break;
        case 'invalid_ticket':
          setError({ code: e.code, message: '登录票据无效或已过期，请重试。' });
          break;
        case 'device_mismatch':
          setError({ code: e.code, message: '账号已在另一台设备绑定，无法在此机登录。请联系客服申请解绑。' });
          break;
        case 'license_expired':
          setError({ code: e.code, message: '授权已到期，请联系客服续费。' });
          break;
        case 'account_disabled':
          setError({ code: e.code, message: '该账号已被停用，请联系客服。' });
          break;
        default:
          setError({ code: e.code || 'unknown', message: e.message || '轩宇汇登录失败，请稍后重试。' });
      }
    }
  };

  // ── 待审批视图 ──
  if (ssoPhase === 'pending') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-indigo-50 p-4">
        <div className="w-full max-w-md">
          <div className="relative text-center mb-8">
            {onBack && (
              <button
                type="button"
                onClick={onBack}
                className="absolute left-0 top-1 text-sm text-gray-500 hover:text-gray-700 transition-colors"
              >
                ← 返回首页
              </button>
            )}
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-blue-600 text-white text-2xl font-bold shadow-lg mb-3">
              POD
            </div>
            <h1 className="text-2xl font-bold text-gray-900">叮当跨境 ERP</h1>
            <p className="text-gray-500 mt-1">使用购买时分配的账号登录</p>
          </div>

          <div className="bg-white rounded-2xl shadow-xl border border-gray-100 p-8 text-center space-y-4">
            <div className="w-14 h-14 mx-auto rounded-full bg-amber-100 flex items-center justify-center">
              <svg className="w-7 h-7 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h2 className="text-lg font-semibold text-gray-900">登录申请已提交</h2>
            <p className="text-sm text-gray-500">
              {ssoEmail ? `账号 ${ssoEmail} ` : '您的轩宇汇账号 '}已提交登录申请，正在等待管理员审批。
            </p>
            <p className="text-xs text-gray-400">审批通过后，使用轩宇汇账号即可直接登录本应用。</p>
            <button
              type="button"
              onClick={resetSso}
              className="w-full py-2.5 rounded-lg border border-gray-200 text-gray-600 font-medium hover:bg-gray-50 transition-colors"
            >
              返回登录
            </button>
          </div>
        </div>
      </div>
    );
  }

  const formDisabled = loading || ssoPhase === 'polling';

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-indigo-50 p-4">
      <div className="w-full max-w-md">
        {/* Logo / Title */}
        <div className="relative text-center mb-8">
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="absolute left-0 top-1 text-sm text-gray-500 hover:text-gray-700 transition-colors"
            >
              ← 返回首页
            </button>
          )}
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-blue-600 text-white text-2xl font-bold shadow-lg mb-3">
            POD
          </div>
          <h1 className="text-2xl font-bold text-gray-900">叮当跨境 ERP</h1>
          <p className="text-gray-500 mt-1">使用购买时分配的账号登录</p>
        </div>

        {/* Login Card */}
        <form onSubmit={handleLogin} className="bg-white rounded-2xl shadow-xl border border-gray-100 p-8 space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">邮箱</label>
            <input
              type="email"
              autoComplete="email"
              autoFocus
              className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
              placeholder="customer@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={formDisabled}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">密码</label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                className="w-full px-4 py-2.5 pr-10 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={formDisabled}
              />
              <button
                type="button"
                onClick={() => setShowPassword((s) => !s)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                tabIndex={-1}
              >
                {showPassword ? (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                  </svg>
                ) : (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                )}
              </button>
            </div>
          </div>

          {/* 错误提示 */}
          {error && (
            <div className={`rounded-lg p-3 text-sm ${
              error.code === 'device_mismatch'
                ? 'bg-amber-50 border border-amber-200 text-amber-800'
                : 'bg-red-50 border border-red-200 text-red-700'
            }`}>
              <div className="flex gap-2">
                <svg className="w-4 h-4 shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
                <span>{error.message}</span>
              </div>
            </div>
          )}

          {/* 没装/没启动客户端是客户最高频的卡点：直接给公开下载入口 */}
          {error && (error.code === 'local_not_ready' || error.code === 'device_required') && (
            <a
              href="#/download"
              className="flex items-center justify-between gap-3 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800 hover:bg-blue-100 transition-colors"
            >
              <span className="flex items-center gap-2 min-w-0">
                <Download className="w-4 h-4 flex-shrink-0" />
                <span>还没安装客户端？先下载安装包，装好再回来登录</span>
              </span>
              <span className="text-xs font-medium whitespace-nowrap">去下载 →</span>
            </a>
          )}

          {/* 需要客服介入时，展示后台配置的联系方式 */}
          {error && SUPPORT_ERROR_CODES.includes(error.code) && (
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
              <div className="text-xs font-medium text-gray-700 mb-2">如需协助，请联系客服</div>
              <div className="flex items-center gap-3">
                {contact.wechatGroupQrUrl && (
                  <img
                    src={contact.wechatGroupQrUrl}
                    alt={contact.wechatGroupQrTitle || '客服二维码'}
                    className="w-20 h-20 object-contain rounded-lg border border-gray-200 bg-white shrink-0"
                  />
                )}
                <div className="text-xs text-gray-600 space-y-1">
                  {contact.wechatId && <div>微信号：<span className="font-medium text-gray-900">{contact.wechatId}</span></div>}
                  {contact.contactEmail && (
                    <div>
                      邮箱：
                      <a href={`mailto:${contact.contactEmail}`} className="font-medium text-blue-600 hover:underline">
                        {contact.contactEmail}
                      </a>
                    </div>
                  )}
                  {!contact.wechatId && !contact.contactEmail && !contact.wechatGroupQrUrl && (
                    <div className="text-gray-400">客服联系方式未配置，请到后台「站点设置」补充</div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* 步骤指示器 */}
          {loading && (
            <div className="text-center text-sm text-gray-500 py-2">
              {step === 'getting_device' && <>正在检测本机设备指纹…</>}
              {step === 'logging_in' && <>正在验证账号…</>}
            </div>
          )}

          <button
            type="submit"
            disabled={formDisabled}
            className="w-full py-2.5 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700 disabled:bg-blue-400 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? '登录中…' : '登录'}
          </button>

          {/* 轩宇汇账号登录：SSO 通道（管理员审批制） */}
          <div className="relative">
            <div className="absolute inset-0 flex items-center" aria-hidden="true">
              <div className="w-full border-t border-gray-100" />
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="bg-white px-2 text-gray-400">或</span>
            </div>
          </div>

          {ssoPhase === 'polling' ? (
            <div className="rounded-lg p-3 text-sm bg-blue-50 border border-blue-200 text-blue-800 flex items-center justify-between gap-3">
              <span className="flex items-center gap-2 min-w-0">
                <span className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin shrink-0" />
                正在等待轩宇汇授权…请在新窗口完成登录
              </span>
              <button
                type="button"
                onClick={resetSso}
                className="text-xs font-medium underline whitespace-nowrap"
              >
                取消
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={handleSsoLogin}
              disabled={formDisabled}
              className="w-full py-2.5 rounded-lg bg-white text-blue-600 font-medium border border-blue-300 hover:bg-blue-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              使用轩宇汇账号登录
            </button>
          )}
          {ssoPhase === 'idle' && (
            <p className="text-center text-xs text-gray-400">
              轩宇汇账号需经管理员审批通过后即可登录
            </p>
          )}
        </form>

        {/* Footer hints —— 不展示任何后端/授权服务地址，避免为攻击者提供侦察入口 */}
        <div className="mt-5 text-center space-y-3 text-xs text-gray-500">
          <div>
            <a
              href="#/download"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:underline"
            >
              <Download className="w-4 h-4" />
              还没有客户端？点此下载安装包
            </a>
          </div>
          <div>
            如需找回密码、更换设备或续费，请联系您的专属客服。
          </div>
        </div>
      </div>
    </div>
  );
}
