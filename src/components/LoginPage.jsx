// ─── 登录页 ───
// plan 6.2：强制登录页（未登录看不到任何业务组件）
// 三个步骤：① 取设备指纹（本地后端必须在线）→ ② 云端登录 → ③ 拿到 token 后 LoginGate 自动接管

import React, { useState } from 'react';
import { getDeviceId, authLogin, setAuthToken } from '../api/auth.js';

import { DEFAULT_SITE_SETTINGS } from '../api/siteSettings.js';

// 需要联系客服处理的错误码（其余为可自助重试的情况）
const SUPPORT_ERROR_CODES = ['account_disabled', 'license_expired', 'device_mismatch', 'device_required', 'unknown'];

export default function LoginPage({ onLoggedIn, siteSettings, onBack }) {
  const contact = { ...DEFAULT_SITE_SETTINGS, ...(siteSettings || {}) };
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);   // { code, message }
  const [step, setStep] = useState('idle');   // idle | getting_device | logging_in | error

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

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-indigo-50 p-4">
      <div className="w-full max-w-md">
        {/* Logo / Title */}
        <div className="text-center mb-8">
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="mb-4 text-sm text-gray-500 hover:text-gray-700 transition-colors"
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
              disabled={loading}
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
                disabled={loading}
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

          {/* 需要客服介入时，展示后台配置的联系方式（不再只说"请联系客服"） */}
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
            disabled={loading}
            className="w-full py-2.5 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700 disabled:bg-blue-400 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? '登录中…' : '登录'}
          </button>
        </form>

        {/* Footer hints —— 不展示任何后端/授权服务地址，避免为攻击者提供侦察入口 */}
        <div className="mt-5 text-center space-y-2 text-xs text-gray-500">
          <div>
            如需找回密码、更换设备或续费，请联系您的专属客服。
          </div>
        </div>
      </div>
    </div>
  );
}
