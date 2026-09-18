import { useState, useEffect, useCallback } from 'react'
import { apiGetTemuTemplates, apiUpdateTemuTemplate, apiDeleteTemuTemplate, apiRequest } from '../api/axios'

const INPUT = 'w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 outline-none text-sm'

/**
 * TEMU 半托管模板管理页
 * - 列出浏览器扩展从 TEMU 编辑页抓取的模板
 * - 后台可改：货号/SKC货号、价格、默认库存、商品详情用主图开关
 * - 每个颜色槽配置「ERP 模板 SKU」映射：套图时该 SKU 的图全部替换进此颜色
 */
export default function TemuListingAdmin() {
  const [templates, setTemplates] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState(null)
  const [form, setForm] = useState(null)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState(null)
  // 参考套图模板（ERP templatesV2），用于「智能匹配」自动填充颜色映射
  const [mockupTemplates, setMockupTemplates] = useState([])
  const [refTemplateId, setRefTemplateId] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await apiGetTemuTemplates()
      setTemplates(data || [])
    } catch (e) {
      setMsg({ type: 'error', text: '加载失败：' + e.message })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  // 加载 ERP 套图模板列表（参考图套模板用）
  useEffect(() => {
    apiRequest('/templates-v2')
      .then((d) => setMockupTemplates(Array.isArray(d) ? d : []))
      .catch(() => setMockupTemplates([]))
  }, [])

  const selectTemplate = (t) => {
    setSelectedId(t.id)
    const slots = t.colorSlots || (t.skeleton && t.skeleton.colorSlots) || []
    const config = (t.colorSlotConfig && t.colorSlotConfig.length)
      ? t.colorSlotConfig
      : slots.map((s) => ({ slot: s, erpSku: '' }))
    setForm({
      name: t.name || '',
      itemNum: t.itemNum || '',
      goodsPrice: t.goodsPrice != null ? t.goodsPrice : '',
      defaultStock: t.defaultStock != null ? t.defaultStock : 100,
      detailUseMainImage: t.detailUseMainImage !== false,
      sizes: t.sizes || '',
      colorSlots: slots,
      colorSlotConfig: config,
      refTemplateId: t.refTemplateId || ''
    })
    setRefTemplateId(t.refTemplateId || '')
    setMsg(null)
  }

  const update = (patch) => setForm((f) => ({ ...f, ...patch }))
  const updateSlot = (idx, erpSku) => {
    const cfg = form.colorSlotConfig.map((c, i) => (i === idx ? { ...c, erpSku } : c))
    update({ colorSlotConfig: cfg })
  }

  // 切换参考套图模板：按顺序把参考模板的 SKU 颜色名填入尚未映射的色槽
  const handleChangeRefTemplate = (refTplId) => {
    setRefTemplateId(refTplId)
    if (!refTplId) return
    const refTpl = mockupTemplates.find((t) => t.id === refTplId)
    if (!refTpl?.colors?.length) return
    const refColorNames = refTpl.colors.map((c) => c.name)
    const cfg = form.colorSlotConfig.map((c, i) =>
      c.erpSku ? c : { ...c, erpSku: refColorNames[i] || '' }
    )
    update({ colorSlotConfig: cfg })
  }

  // 智能匹配：用参考套图的 SKU 颜色按顺序补齐所有未映射色槽（没有参考模板时按色槽顺序）
  const handleAutoMatchColors = () => {
    const refTpl = refTemplateId ? mockupTemplates.find((t) => t.id === refTemplateId) : null
    const refColorNames = refTpl?.colors?.length
      ? refTpl.colors.map((c) => c.name)
      : (form.colorSlots || [])
    const cfg = form.colorSlotConfig.map((c, i) =>
      c.erpSku ? c : { ...c, erpSku: refColorNames[i] || '' }
    )
    update({ colorSlotConfig: cfg })
  }

  // 清空所有颜色映射
  const clearColorMap = () => {
    update({ colorSlotConfig: form.colorSlotConfig.map((c) => ({ ...c, erpSku: '' })) })
  }

  const save = async () => {
    setSaving(true); setMsg(null)
    try {
      const payload = {
        name: form.name,
        itemNum: form.itemNum,
        goodsPrice: form.goodsPrice === '' ? null : Number(form.goodsPrice),
        defaultStock: Number(form.defaultStock) || 0,
        detailUseMainImage: !!form.detailUseMainImage,
        colorSlots: form.colorSlots,
        colorSlotConfig: form.colorSlotConfig,
        refTemplateId: refTemplateId || ''
      }
      await apiUpdateTemuTemplate(selectedId, payload)
      setMsg({ type: 'success', text: '✓ 已保存参数' })
      const data = await apiGetTemuTemplates()
      setTemplates(data || [])
    } catch (e) {
      setMsg({ type: 'error', text: '保存失败：' + e.message })
    } finally { setSaving(false) }
  }

  const del = async () => {
    if (!window.confirm('确认删除该 TEMU 模板？')) return
    try {
      await apiDeleteTemuTemplate(selectedId)
      setSelectedId(null); setForm(null)
      const data = await apiGetTemuTemplates()
      setTemplates(data || [])
      setMsg({ type: 'success', text: '已删除' })
    } catch (e) {
      setMsg({ type: 'error', text: '删除失败：' + e.message })
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* 左：模板列表 */}
      <div className="lg:col-span-1 bg-white rounded-xl shadow-sm p-4">
        <h2 className="text-lg font-bold text-gray-900 mb-4">TEMU 模板</h2>
        {loading ? (
          <p className="text-sm text-gray-400">加载中…</p>
        ) : templates.length === 0 ? (
          <p className="text-sm text-gray-400">暂无模板。请用浏览器扩展在 TEMU 编辑页点击「保存为模板」。</p>
        ) : (
          <ul className="space-y-2">
            {templates.map((t) => (
              <li key={t.id}>
                <button
                  onClick={() => selectTemplate(t)}
                  className={`w-full text-left px-3 py-2 rounded-lg border transition-colors ${
                    selectedId === t.id ? 'border-purple-500 bg-purple-50' : 'border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  <div className="font-medium text-gray-900 truncate">{t.name}</div>
                  <div className="text-xs text-gray-500 mt-0.5">
                    {(t.colorSlots || []).length} 色 · 货号 {t.itemNum || '—'} · 价 {t.goodsPrice != null ? t.goodsPrice : '—'}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* 右：编辑面板 */}
      <div className="lg:col-span-2 bg-white rounded-xl shadow-sm p-6">
        {!form ? (
          <p className="text-sm text-gray-400">从左侧选择一个模板进行编辑。</p>
        ) : (
          <div className="space-y-5">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900">编辑参数</h2>
              <button onClick={del} className="text-sm text-red-500 hover:text-red-600">删除模板</button>
            </div>

            {msg && (
              <div className={`text-sm px-3 py-2 rounded-lg ${msg.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                {msg.text}
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="模板名称">
                <input className={INPUT} value={form.name} onChange={(e) => update({ name: e.target.value })} />
              </Field>
              <Field label="货号 / SKC货号">
                <input className={INPUT} value={form.itemNum} onChange={(e) => update({ itemNum: e.target.value })} placeholder="如 SKC-2024-001" />
              </Field>
              <Field label="价格 (CNY / 申报价)">
                <input className={INPUT} type="number" step="0.01" value={form.goodsPrice} onChange={(e) => update({ goodsPrice: e.target.value })} />
              </Field>
              <Field label="默认库存">
                <input className={INPUT} type="number" value={form.defaultStock} onChange={(e) => update({ defaultStock: e.target.value })} />
              </Field>
            </div>

            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={form.detailUseMainImage}
                onChange={(e) => update({ detailUseMainImage: e.target.checked })}
                className="w-4 h-4 text-purple-600 border-gray-300 rounded"
                id="detailMain"
              />
              <label htmlFor="detailMain" className="text-sm text-gray-700">
                商品详情图使用「每个 SKU 的主图」（关闭则用图套自带细节图）
              </label>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                <h3 className="font-semibold text-gray-900">颜色 ↔ ERP 模板 SKU 映射</h3>
                <div className="flex items-center gap-2">
                  <select
                    value={refTemplateId || ''}
                    onChange={(e) => handleChangeRefTemplate(e.target.value)}
                    className="px-3 py-1.5 border border-gray-300 rounded text-sm bg-white focus:outline-none focus:ring-2 focus:ring-purple-500 min-w-[180px]"
                  >
                    <option value="">-- 参考图套模板 --</option>
                    {mockupTemplates.map((t) => (
                      <option key={t.id} value={t.id}>{t.name}（{(t.colors || []).length} SKU）</option>
                    ))}
                  </select>
                  <button
                    onClick={handleAutoMatchColors}
                    className="px-3 py-1.5 text-xs text-purple-600 border border-purple-200 rounded hover:bg-purple-50"
                  >智能匹配</button>
                  <button
                    onClick={clearColorMap}
                    className="px-3 py-1.5 text-xs text-gray-500 border border-gray-200 rounded hover:bg-gray-50"
                  >清空</button>
                </div>
              </div>
              <p className="text-xs text-gray-500 mb-3">每个 TEMU 颜色对应一个 ERP 套图 SKU，套图时该 SKU 的图将全部替换进此颜色。选择「参考图套模板」后点「智能匹配」可一键按顺序填充。</p>
              <div className="space-y-2">
                {form.colorSlotConfig.map((c, idx) => (
                  <div key={idx} className="flex items-center gap-3">
                    <span className="w-20 text-sm font-medium text-gray-700">{c.slot}</span>
                    <input
                      className={INPUT}
                      value={c.erpSku}
                      onChange={(e) => updateSlot(idx, e.target.value)}
                      placeholder="填写该颜色对应的 ERP 模板 SKU"
                    />
                  </div>
                ))}
                {form.colorSlotConfig.length === 0 && (
                  <p className="text-xs text-gray-400">该模板暂无颜色槽。</p>
                )}
              </div>
              {form.colorSlotConfig.length > 0 && (
                <div className="mt-3 text-xs flex items-center justify-between border-t border-gray-100 pt-2.5">
                  <span className={form.colorSlotConfig.filter((c) => c.erpSku).length === form.colorSlotConfig.length ? 'text-green-600' : 'text-amber-600'}>
                    已映射 {form.colorSlotConfig.filter((c) => c.erpSku).length}/{form.colorSlotConfig.length} 个色槽
                  </span>
                  {form.colorSlotConfig.filter((c) => c.erpSku).length < form.colorSlotConfig.length && (
                    <button onClick={handleAutoMatchColors} className="text-purple-600 hover:underline">一键补齐</button>
                  )}
                </div>
              )}
            </div>

            <div className="flex gap-3 pt-2">
              <button
                onClick={save}
                disabled={saving}
                className="px-5 py-2.5 bg-purple-600 text-white rounded-lg font-medium hover:bg-purple-700 disabled:opacity-50"
              >
                {saving ? '保存中…' : '保存参数'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="text-sm text-gray-600 mb-1 block">{label}</span>
      {children}
    </label>
  )
}
