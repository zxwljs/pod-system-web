import { useEffect, useRef } from 'react'

// 广告位尺寸约定(由 slotKey 隐式约束,仅用于 image 类型预览高度)
const SLOT_HEIGHT = { bottom: 90, download: 250 }

// 动态注入 AdSense 脚本(全页面只注入一次)
let adsenseScriptInjected = false
function ensureAdsenseScript() {
  if (adsenseScriptInjected) return
  if (typeof window === 'undefined') return
  if (document.getElementById('adsbygoogle-js')) {
    adsenseScriptInjected = true
    return
  }
  const s = document.createElement('script')
  s.id = 'adsbygoogle-js'
  s.async = true
  s.src = 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js'
  s.crossOrigin = 'anonymous'
  document.head.appendChild(s)
  adsenseScriptInjected = true
}

// 单个广告块渲染
function AdBlock({ item, ads, slotKey }) {
  const label = ads.globalLabelEnabled
    ? (item.labelOverride && item.customLabel ? item.customLabel : ads.globalLabel)
    : ''
  const height = SLOT_HEIGHT[slotKey] || 90

  // AdSense 推送触发
  const insRef = useRef(null)
  useEffect(() => {
    if (item.contentType === 'adsense' && insRef.current) {
      ensureAdsenseScript()
      try {
        // eslint-disable-next-line no-undef
        ;(window.adsbygoogle = window.adsbygoogle || []).push({})
      } catch (e) { /* AdSense 未加载完成时静默 */ }
    }
  }, [item.contentType, item.adsenseClient, item.adsenseSlot])

  return (
    <div
      className="relative flex flex-col items-center justify-center text-center rounded-lg overflow-hidden"
      style={{
        width: '100%',
        height: item.contentType === 'image' ? 'auto' : `${height}px`,
        background: item.contentType === 'image' ? 'transparent' : '#fff7ed',
        border: item.contentType === 'image' ? 'none' : '2px dashed #f59e0b',
        color: '#92400e',
      }}
    >
      {label && (
        <span
          className="absolute top-1 left-1 text-[10px] uppercase tracking-wide text-white px-1.5 py-0.5 rounded"
          style={{ background: 'rgba(0,0,0,0.6)' }}
        >
          {label}
        </span>
      )}

      {item.contentType === 'text' && (
        <>
          {item.title && <strong className="text-sm mb-1 block">{item.title}</strong>}
          {item.subtitle && <small className="text-[11px] opacity-80 block">{item.subtitle}</small>}
        </>
      )}

      {item.contentType === 'image' && item.imageUrl && (
        <a
          href={item.linkUrl || '#'}
          target={item.linkUrl ? '_blank' : undefined}
          rel="noopener noreferrer"
          style={{ display: 'block', width: '100%' }}
        >
          <img
            src={item.imageUrl}
            alt={item.title || '广告'}
            style={{ display: 'block', width: '100%', height: 'auto', borderRadius: 8 }}
          />
        </a>
      )}

      {item.contentType === 'adsense' && (
        <ins
          ref={insRef}
          className="adsbygoogle"
          style={{ display: 'block', width: '100%', height: `${height}px` }}
          data-ad-client={item.adsenseClient}
          data-ad-slot={item.adsenseSlot}
          data-ad-format="auto"
          data-full-width-responsive="true"
        />
      )}
    </div>
  )
}

// 通用广告位组件
// props:
//   slotKey: 'bottom' | 'download'  广告位标识
//   ads:     { globalEnabled, globalLabel, globalLabelEnabled, items: [] }
//   onClose: () => void             关闭回调(可选,不传则不显示关闭按钮)
export default function AdSlot({ slotKey, ads, onClose }) {
  if (!ads || !ads.globalEnabled) return null
  const items = (ads.items || []).filter(a => a.slotKey === slotKey && a.enabled !== false)
  if (items.length === 0) return null

  // bottom 单条横幅;download 多条网格并排
  if (slotKey === 'download' && items.length > 1) {
    return (
      <div className="relative">
        {onClose && (
          <button
            onClick={onClose}
            className="absolute -top-2 -right-2 z-10 w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-semibold text-white hover:opacity-80 transition-opacity"
            style={{ background: 'rgba(0,0,0,0.5)' }}
            title="关闭广告"
          >
            ✕
          </button>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {items.map(item => <AdBlock key={item.id} item={item} ads={ads} slotKey={slotKey} />)}
        </div>
      </div>
    )
  }

  // 默认单条
  const item = items[0]
  return (
    <div className="relative">
      {onClose && (
        <button
          onClick={onClose}
          className="absolute top-1 right-1 z-10 w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-semibold text-white hover:opacity-80 transition-opacity"
          style={{ background: 'rgba(0,0,0,0.5)' }}
          title="关闭广告"
        >
          ✕
        </button>
      )}
      <AdBlock item={item} ads={ads} slotKey={slotKey} />
    </div>
  )
}
