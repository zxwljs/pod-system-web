import { useState, useEffect } from 'react'
import { apiGetCopyrightSettings, apiSaveCopyrightSettings, apiGetTitlePrompts, apiSaveTitlePrompts, apiGetSaveConfig, apiSaveSaveConfig, apiValidateSaveConfig,
  apiGetMiaoshouConfig, apiSaveMiaoshouConfig, apiGetPublishTemplates, apiCreatePublishTemplate, apiUpdatePublishTemplate, apiDeletePublishTemplate,
  apiMiaoshouProxy, apiGetAIConfig, apiSaveAIConfig, apiTestAIConnection, apiTestAllAIConnections,
  apiGetDxmTemplates, apiCreateDxmTemplate, apiUpdateDxmTemplate, apiDeleteDxmTemplate, apiParseDxmTemplate, apiRequest } from '../api/axios'
import { Save, Key, BookOpen, AlertCircle, CheckCircle2, Info, FolderOutput, Folder, Sparkles, Settings2, Plus, Trash2, Edit3, Zap } from 'lucide-react'

function Settings() {
  const [activeSecondTab, setActiveSecondTab] = useState('general')
  const [activeThirdTab, setActiveThirdTab] = useState('outputPath')
  const [activeModelSetTab, setActiveModelSetTab] = useState('config')
  const [apiKey, setApiKey] = useState('')
  const [prompt, setPrompt] = useState('')
  const [hasCustomKey, setHasCustomKey] = useState(false)
  const [hasCustomPrompt, setHasCustomPrompt] = useState(false)

  // AI 模型配置（多供应商 + 激活切换）
  const [aiConfig, setAIConfig] = useState({
    providers: [],
    activeProviderId: ''
  })
  const [editingProvider, setEditingProvider] = useState(null) // null = 无表单；{...} = 添加/编辑
  const [testingAI, setTestingAI] = useState(false)
  const [aiTestMsg, setAITestMsg] = useState('')
  const [testingEditingProvider, setTestingEditingProvider] = useState(false)
  const [editingTestMsg, setEditingTestMsg] = useState('')
  const [testingAll, setTestingAll] = useState(false)
  const [providerTestStatus, setProviderTestStatus] = useState({})
  const [saving, setSaving] = useState(false)
  const [saveMessage, setSaveMessage] = useState('')

  const [outputPath, setOutputPath] = useState('')
  const [savingOutput, setSavingOutput] = useState(false)
  const [outputMessage, setOutputMessage] = useState('')
  const [outputMessageType, setOutputMessageType] = useState('info')
  const [hasDefaultOutputPath, setHasDefaultOutputPath] = useState(false)

  // 妙手ERP 配置
  const [miaoshouAppKey, setMiaoshouAppKey] = useState('')
  const [miaoshouAppSecret, setMiaoshouAppSecret] = useState('')
  const [hasMiaoshouConfig, setHasMiaoshouConfig] = useState(false)
  const [savingMiaoshou, setSavingMiaoshou] = useState(false)
  const [miaoshouMessage, setMiaoshouMessage] = useState('')

  // 标题生成提示词（多份，复用侵权 Key）
  const [titlePrompts, setTitlePrompts] = useState([])
  const [titleDefaultId, setTitleDefaultId] = useState('')
  const [editingTitlePrompt, setEditingTitlePrompt] = useState(null)
  const [titlePromptMsg, setTitlePromptMsg] = useState('')

  // 发布模板
  const [publishTemplates, setPublishTemplates] = useState([])
  const [editingTemplate, setEditingTemplate] = useState(null)

  // 店小秘上架模板
  const [dxmTemplates, setDxmTemplates] = useState([])
  const [editingDxmTemplate, setEditingDxmTemplate] = useState(null)
  const [dxmParsed, setDxmParsed] = useState(null)
  const [dxmImporting, setDxmImporting] = useState(false)
  const [dxmImportError, setDxmImportError] = useState(null)
  // 参考图案模板（templatesV2）列表：用于颜色映射自动填充 + 下拉选择
  const [refTemplates, setRefTemplates] = useState([])

  // 下拉选项数据（从妙手API获取）
  const [shopOptions, setShopOptions] = useState([])
  const [siteOptions, setSiteOptions] = useState([])
  const [euSiteOptions, setEuSiteOptions] = useState([])
  const [warehouseOptions, setWarehouseOptions] = useState([])
  const [freightOptions, setFreightOptions] = useState([])
  const [countryOptions, setCountryOptions] = useState([])
  const [collectBoxOptions, setCollectBoxOptions] = useState([])
  const [categoryOptions, setCategoryOptions] = useState([])
  const [categoryQuery, setCategoryQuery] = useState('')
  const [sizeTemplateOptions, setSizeTemplateOptions] = useState([])
  const [modelOptions, setModelOptions] = useState([])
  const [modelCatInfo, setModelCatInfo] = useState(null)
  const [isLoadingOptions, setIsLoadingOptions] = useState(false)
  const [optionsError, setOptionsError] = useState(null)
  const [isLoadingWhFr, setIsLoadingWhFr] = useState(false)
  const [isLoadingCategory, setIsLoadingCategory] = useState(false)
  const [isLoadingSizeTemplate, setIsLoadingSizeTemplate] = useState(false)
  const [isLoadingModel, setIsLoadingModel] = useState(false)

  useEffect(() => {
    const init = async () => {
      loadSettings()
      loadSaveConfig()
      loadMiaoshouConfig()
      loadTitlePrompts()
      await loadDropdownOptions() // 先加载选项，再加载模板
      loadPublishTemplates()
    }
    init()
  }, [])

  // 切换到妙手ERP页时，确保发布模板选项已加载
  useEffect(() => {
    if (activeSecondTab === 'miaoshou') {
      if (shopOptions.length === 0) {
        loadDropdownOptions().then(() => loadPublishTemplates())
      } else {
        loadPublishTemplates()
      }
    }
  }, [activeSecondTab])

  // 切换到店小秘上架模板页时加载模板列表与图案模板
  useEffect(() => {
    if (activeSecondTab === 'dxm') {
      loadDxmTemplates()
      loadRefTemplates()
    }
  }, [activeSecondTab])

  const loadSettings = async () => {
    try {
      const cfg = await apiGetAIConfig()
      // 兼容：确保 activeProviderId 一定落在某个 provider 上
      let activeId = cfg.activeProviderId || ''
      const providers = Array.isArray(cfg.providers) ? cfg.providers : []
      if (providers.length && !providers.find(p => p.id === activeId)) {
        activeId = providers[0].id
      }
      setAIConfig({ providers, activeProviderId: activeId })
    } catch (error) {
      console.error('加载AI配置失败:', error)
    }
    try {
      const data = await apiGetCopyrightSettings()
      setPrompt(data.prompt)
      setHasCustomPrompt(!!data.prompt)
    } catch (error) {
      console.error('加载配置失败:', error)
    }
  }

  const loadTitlePrompts = async () => {
    try {
      const data = await apiGetTitlePrompts()
      setTitlePrompts(data.prompts || [])
      setTitleDefaultId(data.defaultId || '')
    } catch (error) {
      console.error('加载标题提示词失败:', error)
    }
  }

  const loadSaveConfig = async () => {
    try {
      const data = await apiGetSaveConfig()
      setOutputPath(data.defaultOutputPath || '')
      setHasDefaultOutputPath(!!data.hasDefaultOutputPath)
    } catch (error) {
      console.error('加载保存配置失败:', error)
    }
  }

  // ─── AI 供应商管理 ───
  const startNewProvider = () => setEditingProvider({
    id: 'p_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
    name: '',
    apiBaseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    apiKey: '',
    model: 'glm-4v-flash',
    authHeader: 'Authorization',
    apiKeyPrefix: 'Bearer ',
    endpointPath: '/chat/completions',
    supportsVision: true,
    temperature: 0.7
  })
  const startEditProvider = (p) => setEditingProvider({ ...p })
  const cancelEditProvider = () => setEditingProvider(null)
  const updateEditingField = (field, value) => setEditingProvider(prev => prev ? ({ ...prev, [field]: value }) : prev)

  const handleSaveProvider = async () => {
    if (!editingProvider) return
    if (!editingProvider.name.trim()) {
      setSaveMessage('供应商名称不能为空')
      setTimeout(() => setSaveMessage(''), 3000)
      return
    }
    setSaving(true)
    try {
      const p = { ...editingProvider, name: editingProvider.name.trim() }
      const nextProviders = aiConfig.providers.find(x => x.id === p.id)
        ? aiConfig.providers.map(x => x.id === p.id ? p : x)
        : [...aiConfig.providers, p]
      const nextActive = aiConfig.activeProviderId || (nextProviders[0] && nextProviders[0].id) || ''
      const toSave = { providers: nextProviders, activeProviderId: nextActive }
      const res = await apiSaveAIConfig(toSave)
      setAIConfig(res.config || toSave)
      setEditingProvider(null)
      setSaveMessage('已保存')
      setTimeout(() => setSaveMessage(''), 3000)
    } catch (error) {
      console.error('保存供应商失败:', error)
      setSaveMessage('保存失败：' + (error.message || '请重试'))
      setTimeout(() => setSaveMessage(''), 3000)
    } finally {
      setSaving(false)
    }
  }

  const handleActivateProvider = async (id) => {
    setSaving(true)
    try {
      const toSave = { ...aiConfig, activeProviderId: id }
      const res = await apiSaveAIConfig(toSave)
      setAIConfig(res.config || toSave)
      setSaveMessage('已切换并保存')
      setTimeout(() => setSaveMessage(''), 3000)
    } catch (error) {
      console.error('切换供应商失败:', error)
      setSaveMessage('切换失败：' + (error.message || '请重试'))
      setTimeout(() => setSaveMessage(''), 3000)
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteProvider = async (id) => {
    if (!confirm('确定删除此供应商配置？')) return
    setSaving(true)
    try {
      const next = aiConfig.providers.filter(p => p.id !== id)
      let nextActive = aiConfig.activeProviderId
      if (nextActive === id && next.length) nextActive = next[0].id
      if (!next.length) nextActive = ''
      const toSave = { providers: next, activeProviderId: nextActive }
      const res = await apiSaveAIConfig(toSave)
      setAIConfig(res.config || toSave)
      setSaveMessage('已删除')
      setTimeout(() => setSaveMessage(''), 3000)
    } catch (error) {
      console.error('删除供应商失败:', error)
      setSaveMessage('删除失败：' + (error.message || '请重试'))
      setTimeout(() => setSaveMessage(''), 3000)
    } finally {
      setSaving(false)
    }
  }

  const handleTestAI = async () => {
    setTestingAI(true)
    setAITestMsg('')
    try {
      const res = await apiTestAIConnection('default')
      setAITestMsg(res.success ? (res.message || '') : '连接失败：' + (res.message || ''))
    } catch (e) {
      setAITestMsg('连接失败：' + (e.message || ''))
    } finally {
      setTestingAI(false)
    }
  }

  const handleTestAll = async () => {
    setTestingAll(true)
    setProviderTestStatus({})
    setSaveMessage('')
    try {
      const res = await apiTestAllAIConnections()
      const status = {}
      res.results.forEach(r => {
        status[r.id] = { success: r.success, message: r.message }
      })
      setProviderTestStatus(status)
      const passed = res.results.filter(r => r.success).length
      const total = res.results.length
      setSaveMessage(total === 0 ? '暂无供应商' : `测试完成：${passed}/${total} 个通过`)
      setTimeout(() => setSaveMessage(''), 5000)
    } catch (e) {
      console.error('批量测试失败:', e)
      setSaveMessage('批量测试失败：' + (e.message || '请重试'))
      setTimeout(() => setSaveMessage(''), 3000)
    } finally {
      setTestingAll(false)
    }
  }

  const handleTestEditingProvider = async () => {
    if (!editingProvider) return
    setTestingEditingProvider(true)
    setEditingTestMsg('')
    try {
      const res = await apiTestAIConnection('default', editingProvider)
      setEditingTestMsg(res.success ? (res.message || '') : '连接失败：' + (res.message || ''))
    } catch (e) {
      setEditingTestMsg('连接失败：' + (e.message || ''))
    } finally {
      setTestingEditingProvider(false)
    }
  }

  const handleSaveCopyrightPrompt = async () => {
    setSaving(true)
    try {
      await apiSaveCopyrightSettings({ prompt: prompt || '' })
      setHasCustomPrompt(!!prompt)
      setSaveMessage('配置保存成功')
      setTimeout(() => setSaveMessage(''), 3000)
    } catch (error) {
      console.error('保存提示词失败:', error)
      setSaveMessage('保存失败：' + (error.message || '请重试'))
    } finally {
      setSaving(false)
    }
  }

  const handleResetPrompt = () => {
    loadSettings()
  }

  const handleSaveOutputPath = async () => {
    setSavingOutput(true)
    setOutputMessage('')
    try {
      const trimmed = (outputPath || '').trim()
      if (trimmed) {
        const validation = await apiValidateSaveConfig(trimmed)
        if (!validation.valid) {
          setOutputMessageType('error')
          setOutputMessage('路径无效: ' + (validation.reason || '未知原因'))
          return
        }
      }
      const result = await apiSaveSaveConfig({ defaultOutputPath: trimmed })
      setOutputMessageType('success')
      setOutputMessage(result.message || '保存成功')
      setHasDefaultOutputPath(!!trimmed)
      if (result && result.defaultOutputPath !== undefined) {
        setOutputPath(result.defaultOutputPath)
      }
      setTimeout(() => setOutputMessage(''), 3000)
    } catch (error) {
      console.error('保存输出路径失败:', error)
      setOutputMessageType('error')
      setOutputMessage('保存失败: ' + (error.message || '请重试'))
    } finally {
      setSavingOutput(false)
    }
  }

  const handleClearOutputPath = () => {
    setOutputPath('')
    setHasDefaultOutputPath(false)
  }

  // ─── 妙手ERP 配置 ───
  const loadMiaoshouConfig = async () => {
    try {
      const data = await apiGetMiaoshouConfig()
      setMiaoshouAppKey(data.appKey || '')
      setHasMiaoshouConfig(!!data.appKey && data.hasAppSecret)
    } catch (e) { console.error('加载妙手配置失败:', e) }
  }

  const handleTestMiaoshou = async () => {
    setMiaoshouMessage('')
    try {
      const result = await apiMiaoshouProxy('/open/v1/product/shop/shop/get_shop_list', { platform: 'pddkjChoice', site: 'PDDKJCHOICE', pageNo: 1, pageSize: 1 })
      if (result.result === 'success' && result.data?.shopList) {
        setMiaoshouMessage(`连接成功！共 ${result.data.shopList.length} 个店铺`)
      } else {
        setMiaoshouMessage('连接失败: ' + (result.message || '密钥无效或无权访问'))
      }
    } catch (e) {
      setMiaoshouMessage('连接失败: ' + e.message)
    }
  }

  const handleSaveMiaoshou = async () => {
    setSavingMiaoshou(true)
    setMiaoshouMessage('')
    try {
      await apiSaveMiaoshouConfig({ appKey: miaoshouAppKey, appSecret: miaoshouAppSecret })
      setMiaoshouMessage('配置保存成功')
      setHasMiaoshouConfig(!!miaoshouAppKey)
      setTimeout(() => setMiaoshouMessage(''), 3000)
    } catch (e) {
      setMiaoshouMessage('保存失败: ' + e.message)
    } finally { setSavingMiaoshou(false) }
  }

  // ─── 发布模板 ───
  const loadPublishTemplates = async () => {
    try {
      const data = await apiGetPublishTemplates()
      setPublishTemplates(data || [])
    } catch (e) { console.error('加载模板失败:', e) }
  }

  const loadDropdownOptions = async () => {
    setIsLoadingOptions(true)
    setOptionsError(null)
    try {
      const [shopsRes, sitesRes, countriesRes, catRes, boxRes] = await Promise.all([
        apiMiaoshouProxy('/open/v1/product/shop/shop/get_shop_list', { platform: 'pddkjChoice', site: 'PDDKJCHOICE', pageNo: 1, pageSize: 100 }),
        apiMiaoshouProxy('/open/v1/product/collect_box/pddkj_choice/collect_box/get_publish_site_options', {}),
        apiMiaoshouProxy('/open/v1/product/collect_box/pddkj_choice/collect_box/get_country_short_name_and_name_map', {}),
        apiMiaoshouProxy('/open/v1/product/collect_box/pddkj_choice/collect_box/get_category_tree_by_site', {}),
        apiMiaoshouProxy('/open/v1/product/collect_box/pddkj_choice/collect_box/search_collect_box_detail_list', { pageNo: 1, pageSize: 500 }),
      ])

      if (shopsRes.data?.shopList) {
        setShopOptions(shopsRes.data.shopList.map(s => ({ value: String(s.shopId), label: `${s.shopNick || '店铺'+s.shopId} (${s.siteName||s.site})` })))
      }
      if (sitesRes.data?.publishSiteOptions) {
        setSiteOptions(sitesRes.data.publishSiteOptions.map(s => ({ value: s.key, label: s.value })))
        setEuSiteOptions((sitesRes.data.getEuropeanRegionSiteList || []).map(s => ({ value: s.site, label: s.name, isOpen: s.isOpen })))
      }
      if (countriesRes.data?.productOriginCountries) {
        setCountryOptions(countriesRes.data.productOriginCountries.map(c => ({
          value: c.shortName, label: c.chineseName || c.name,
          provinces: (c.province || []).map(p => ({ value: p.code, label: p.chineseName || p.name }))
        })))
      }
      // 解析类目树（只取末级节点，异步后台加载避免卡顿）
      if (catRes.data?.cateTree) {
        const flatten = (obj) => {
          let list = []
          Object.values(obj).forEach(node => {
            if (node.children && Object.keys(node.children).length > 0) {
              list = list.concat(flatten(node.children))
            } else {
              list.push({ value: String(node.cid), label: `${node.nameChinese || node.name} (CID:${node.cid})`, path: [] })
            }
          })
          return list
        }
        // 使用 setTimeout 避免阻塞主线程
        setTimeout(() => {
          const cats = flatten(catRes.data.cateTree)
          setCategoryOptions(cats)
        }, 0)
      }
      // 采集箱列表（兼容多种返回格式）
      console.log('=== 采集箱原始返回 ===', JSON.stringify(boxRes, null, 2))
      const boxData = boxRes.data
      let boxList = []
      if (boxData) {
        if (Array.isArray(boxData)) {
          boxList = boxData
        } else if (Array.isArray(boxData.records)) {
          boxList = boxData.records
        } else if (Array.isArray(boxData.list)) {
          boxList = boxData.list
        } else if (Array.isArray(boxData.data)) {
          boxList = boxData.data
        } else if (Array.isArray(boxData.detailList)) {
          boxList = boxData.detailList
        } else if (Array.isArray(boxData.items)) {
          boxList = boxData.items
        } else if (boxData.collectBoxDetailId) {
          boxList = [boxData]
        } else {
          // 遍历 data 对象的所有属性，找数组
          for (const key of Object.keys(boxData)) {
            const val = boxData[key]
            if (Array.isArray(val) && val.length > 0) {
              console.log('发现数组字段:', key, '数量:', val.length)
              boxList = val
              break
            }
          }
        }
      }
      console.log('解析后采集箱数量:', boxList.length, '第一条:', boxList[0])
      setCollectBoxOptions(boxList.map(r => ({
        value: String(r.collectBoxDetailId || r.detailId || r.id || r.commonCollectBoxDetailId || r.itemNum || ''),
        label: `${r.title || r.name || '无标题'} (ID:${r.collectBoxDetailId || r.detailId || r.id || r.commonCollectBoxDetailId || '-'})`
      })))
    } catch (e) {
      setOptionsError('加载选项失败: ' + e.message)
      console.error('加载下拉选项失败:', e)
    } finally { setIsLoadingOptions(false) }
  }

  const loadCategoryOptions = async () => {
    setIsLoadingCategory(true)
    try {
      const res = await apiMiaoshouProxy('/open/v1/product/collect_box/pddkj_choice/collect_box/get_category_tree_by_site', {})
      if (res.data?.cateTree) {
        const flatten = (obj) => {
          let list = []
          Object.values(obj).forEach(node => {
            if (node.children && Object.keys(node.children).length > 0) {
              list = list.concat(flatten(node.children))
            } else {
              list.push({ value: String(node.cid), label: `${node.nameChinese || node.name} (CID:${node.cid})` })
            }
          })
          return list
        }
        setCategoryOptions(flatten(res.data.cateTree))
      }
    } catch (e) { console.error('加载类目失败:', e) }
    finally { setIsLoadingCategory(false) }
  }

  const loadSizeTemplates = async (cid) => {
    if (!cid) return
    setIsLoadingSizeTemplate(true)
    try {
      const res = await apiMiaoshouProxy('/open/v1/product/collect_box/pddkj_choice/collect_box/get_size_template_list', { cid: parseInt(cid) })
      console.log('尺码模板原始返回:', res)
      if (res.data?.sizeTemplateList) {
        setSizeTemplateOptions(res.data.sizeTemplateList.map(t => ({
          value: String(t.sizeTemplateId),
          label: `${t.name || (t.sizeTemplateSource === 'erp' ? 'ERP模板' : '平台模板')} (ID:${t.sizeTemplateId})`,
          source: t.sizeTemplateSource
        })))
      } else {
        setSizeTemplateOptions([])
      }
    } catch (e) { console.error('加载尺码模板失败:', e) }
    finally { setIsLoadingSizeTemplate(false) }
  }

  const loadModelOptions = async (cid, shopId) => {
    if (!cid || !shopId) return
    setIsLoadingModel(true)
    try {
      // 先获取模特分类配置
      const catRes = await apiMiaoshouProxy('/open/v1/product/collect_box/pddkj_choice/collect_box/get_model_cat_info', { cid: parseInt(cid) })
      const modelCat = catRes.data?.modelCat
      setModelCatInfo(modelCat)
      if (!modelCat || modelCat.enabled !== 1) {
        setModelOptions([])
        return
      }
      // 获取店铺模特列表
      const res = await apiMiaoshouProxy('/open/v1/product/collect_box/pddkj_choice/collect_box/search_model_list', {
        shopId: parseInt(shopId),
        modelType: modelCat.modelType,
        pageNo: 1, pageSize: 1000
      })
      if (res.data?.modelList) {
        setModelOptions(res.data.modelList.map(m => ({
          value: String(m.platformModelId),
          label: `${m.modelName} (ID:${m.platformModelId})`,
          headPortrait: m.headPortrait,
          modelType: m.modelType
        })))
      } else {
        setModelOptions([])
      }
    } catch (e) { console.error('加载模特失败:', e) }
    finally { setIsLoadingModel(false) }
  }

  const handleCidChange = (cid) => {
    setEditingTemplate(prev => ({ ...prev, cid, sizeTemplateId: '', sizeCharts: null, modelId: '' }))
    loadSizeTemplates(cid)
    loadModelOptions(cid, editingTemplate?.shopId)
  }

  const handleSizeTemplateChange = (sizeTemplateId) => {
    const tpl = sizeTemplateOptions.find(t => t.value === sizeTemplateId)
    setEditingTemplate(prev => ({ ...prev, sizeTemplateId, sizeTemplateSource: tpl?.source }))
    // 可选：加载尺码表详情，让用户填写
    if (tpl?.source && editingTemplate?.cid) {
      loadSizeCharts(sizeTemplateId, tpl.source, editingTemplate.cid)
    }
  }

  const loadSizeCharts = async (sizeTemplateId, sizeTemplateSource, cid) => {
    try {
      const res = await apiMiaoshouProxy('/open/v1/product/collect_box/pddkj_choice/collect_box/get_size_charts_by_size_template_id', {
        cid: parseInt(cid), sizeTemplateId: parseInt(sizeTemplateId), sizeTemplateSource, refresh: 0
      })
      if (res.data?.sizeCharts) {
        setEditingTemplate(prev => ({ ...prev, sizeCharts: res.data }))
      }
    } catch (e) { console.error('加载尺码表详情失败:', e) }
  }

  const loadWarehouseFreightOptions = async (shopId) => {
    if (!shopId) return
    setIsLoadingWhFr(true)
    try {
      const [whRes, frRes] = await Promise.all([
        apiMiaoshouProxy('/open/v1/product/collect_box/pddkj_choice/collect_box/get_shop_warehouse', { shopId: parseInt(shopId) }),
        apiMiaoshouProxy('/open/v1/product/collect_box/pddkj_choice/collect_box/get_shop_freight_template', { shopId: parseInt(shopId) }),
      ])
      const whList = whRes.data?.shopIdAndWarehouseListMap?.[String(shopId)] || []
      setWarehouseOptions(whList.map(w => ({ value: String(w.warehouseId), label: `${w.warehouseName} (${w.siteName||w.site})`, site: w.site })))
      const frList = frRes.data?.shopIdAndFreightTemplateListMap?.[String(shopId)] || []
      setFreightOptions(frList.map(f => ({ value: String(f.templateId), label: `${f.templateName} (${f.siteName||f.site})`, site: f.site })))
    } catch (e) { console.error('加载仓库/运费选项失败:', e) }
    finally { setIsLoadingWhFr(false) }
  }

  const handleShopChange = (shopId) => {
    setEditingTemplate(prev => ({ ...prev, shopId, warehouseMap: {}, freightMap: {} }))
    loadWarehouseFreightOptions(shopId)
    if (editingTemplate?.cid) loadModelOptions(editingTemplate.cid, shopId)
  }

  const handleCreateTemplate = () => {
    setEditingTemplate({ id: null, name: '', shopId: '', publishSites: [], publishEuSites: [], cid: '', defaultPrice: '', defaultStock: 100, warehouseMap: {}, freightMap: {}, siteShipmentLimitDayMap: {}, packageLength: '30', packageWidth: '20', packageHeight: '5', weight: 200, shipmentLimitDay: 2, productOriginCountry: 'CN', productOriginProvince: '', attributes: [], saleAttributes: [], skuMap: {}, goodsLayerDecorationReqs: [], currency: 'CNY', referenceCollectBoxId: '', sizeTemplateId: '', sizeTemplateSource: '', sizeCharts: null, modelId: '', itemNum: '' })
    setActiveThirdTab('editor')
    setWarehouseOptions([])
    setFreightOptions([])
    setSizeTemplateOptions([])
    setModelOptions([])
    setModelCatInfo(null)
    loadDropdownOptions()
  }

  const handleEditTemplate = (template) => {
    setEditingTemplate({ ...template, publishSites: template.publishSites || [], publishEuSites: template.publishEuSites || [], warehouseMap: template.warehouseMap || {}, freightMap: template.freightMap || {} })
    setActiveThirdTab('editor')
    loadDropdownOptions()
    if (template.shopId) loadWarehouseFreightOptions(template.shopId)
    if (template.cid) {
      loadSizeTemplates(template.cid)
      loadModelOptions(template.cid, template.shopId)
    }
  }

  const handleSaveTemplate = async () => {
    try {
      console.log('保存模板数据:', editingTemplate)
      let result
      if (editingTemplate.id) {
        result = await apiUpdatePublishTemplate(editingTemplate.id, editingTemplate)
      } else {
        result = await apiCreatePublishTemplate(editingTemplate)
      }
      console.log('保存模板返回:', result)
      setEditingTemplate(null)
      await loadPublishTemplates()
      setActiveThirdTab('list')
    } catch (e) {
      console.error('保存模板失败:', e)
      alert('保存模板失败: ' + e.message)
    }
  }

  const handleDeleteTemplate = async (id) => {
    if (!confirm('确定删除此模板？')) return
    try {
      await apiDeletePublishTemplate(id)
      loadPublishTemplates()
    } catch (e) { alert('删除失败: ' + e.message) }
  }

  const handleFetchReferenceProduct = async () => {
    const refId = editingTemplate?.referenceCollectBoxId
    if (!refId) {
      alert('请先选择参考采集箱商品')
      return
    }
    if (!editingTemplate?.shopId) {
      alert('请先选择店铺')
      return
    }
    try {
      const result = await apiMiaoshouProxy(
        '/open/v1/product/collect_box/pddkj_choice/collect_box/get_shop_collect_item_info',
        { detailId: parseInt(refId), shopId: parseInt(editingTemplate.shopId) }
      )
      if (result.result !== 'success' || !result.data?.shopCollectItemInfo) {
        alert('获取参考商品失败: ' + (result.message || '未知错误'))
        return
      }
      const info = result.data.shopCollectItemInfo
      // 自动加载尺码模板和模特（基于cid）
      if (info.cid) {
        loadSizeTemplates(info.cid)
        loadModelOptions(info.cid, editingTemplate.shopId)
      }
      setEditingTemplate(prev => ({
        ...prev,
        title: info.title || '',
        cid: info.cid || prev.cid,
        productOriginCountry: info.productOriginCountry || 'CN',
        productOriginProvince: info.productOriginProvince || '',
        attributes: info.attributes || [],
        saleAttributes: info.saleAttributes || [],
        skuMap: info.skuMap || {},
        goodsLayerDecorationReqs: info.goodsLayerDecorationReqs || [],
        shipmentLimitDay: info.shipmentLimitDay || 2,
        itemNum: info.itemNum || '',
        publishSites: info.publishSiteList || prev.publishSites || [],
        publishEuSites: info.publishEuSiteList || prev.publishEuSites || [],
        sizeTemplateId: info.sizeTemplateId || prev.sizeTemplateId || '',
        sizeTemplateSource: info.sizeTemplateSource || prev.sizeTemplateSource || '',
        sizeCharts: info.sizeCharts || prev.sizeCharts || null,
        weight: info.weight || prev.weight || 200,
        packageLength: info.length || prev.packageLength || '30',
        packageWidth: info.width || prev.packageWidth || '20',
        packageHeight: info.height || prev.packageHeight || '5',
      }))
      alert('已成功填充参考商品属性')
    } catch (e) { alert('获取失败: ' + e.message) }
  }

  // ─── 店小秘上架模板 handlers ───
  const loadDxmTemplates = async () => {
    try {
      const list = await apiGetDxmTemplates()
      setDxmTemplates(Array.isArray(list) ? list : [])
    } catch (e) { console.error('加载店小秘模板失败', e) }
  }

  // 加载 ERP 图案模板（templatesV2），仅取 id/name/colors，供颜色映射使用
  const loadRefTemplates = async () => {
    try {
      const list = await apiRequest('/templates-v2')
      setRefTemplates(Array.isArray(list) ? list.map(t => ({ id: t.id, name: t.name, colors: (t.colors || []).map(c => c.name) })) : [])
    } catch (e) { console.error('加载图案模板失败', e); setRefTemplates([]) }
  }

  // 选择参考图案模板：按模板顺序默认填充颜色映射（模板色[i] → 图案色[i]）
  const handlePickRefTemplate = (refId) => {
    const ref = refTemplates.find(t => t.id === refId)
    const refColors = ref ? ref.colors : []
    setEditingDxmTemplate(prev => {
      const colors = prev.colors || []
      const colorMap = { ...prev.colorMap }
      colors.forEach((c, i) => { colorMap[c.name] = refColors[i] || '' })
      return { ...prev, refTemplateId: refId || null, colorMap }
    })
  }

  const handleCreateDxmTemplate = () => {
    setEditingDxmTemplate({ id: null, name: '', sheetName: 'popTemu_product', header: [], rows: [], colors: [], sizes: [], colorMap: {}, refTemplateId: null, overrides: { title: '', defaultPrice: '', itemNum: '' } })
    setDxmParsed(null)
    setActiveThirdTab('editor')
  }

  const handleEditDxmTemplate = (tpl) => {
    setEditingDxmTemplate({ ...tpl, overrides: tpl.overrides || { title: '', defaultPrice: '', itemNum: '' }, colorMap: tpl.colorMap || {} })
    setDxmParsed({ colors: tpl.colors, sizes: tpl.sizes, rowCount: (tpl.rows || []).length })
    setActiveThirdTab('editor')
  }

  const handleImportDxmTemplate = async (file) => {
    if (!file) return
    setDxmImporting(true)
    setDxmImportError(null)
    try {
      const buf = await file.arrayBuffer()
      const base64 = btoa(String.fromCharCode(...new Uint8Array(buf)))
      const parsed = await apiParseDxmTemplate(base64)
      // 默认 colorMap：模板色名 = 套图色名（用户随后改为真实底板色名）
      const colorMap = {}
      parsed.colors.forEach(c => { colorMap[c.name] = c.name })
      setEditingDxmTemplate(prev => ({
        ...(prev || {}),
        name: prev?.name || file.name.replace(/\.xlsx?$/i, ''),
        sheetName: parsed.sheetName,
        header: parsed.header,
        rows: parsed.rows,
        colors: parsed.colors,
        sizes: parsed.sizes,
        colorMap
      }))
      setDxmParsed({ colors: parsed.colors, sizes: parsed.sizes, rowCount: parsed.rowCount })
    } catch (e) {
      setDxmImportError(e.message || '解析失败')
    } finally {
      setDxmImporting(false)
    }
  }

  const handleSaveDxmTemplate = async () => {
    try {
      let result
      if (editingDxmTemplate.id) {
        result = await apiUpdateDxmTemplate(editingDxmTemplate.id, editingDxmTemplate)
      } else {
        result = await apiCreateDxmTemplate(editingDxmTemplate)
      }
      setEditingDxmTemplate(null)
      setDxmParsed(null)
      await loadDxmTemplates()
      setActiveThirdTab('list')
    } catch (e) {
      alert('保存店小秘模板失败: ' + e.message)
    }
  }

  const handleDeleteDxmTemplate = async (id) => {
    if (!confirm('确定删除此店小秘模板？')) return
    try {
      await apiDeleteDxmTemplate(id)
      loadDxmTemplates()
    } catch (e) { alert('删除失败: ' + e.message) }
  }

  const secondTabs = [
    { id: 'general', label: '通用' },
    { id: 'ai', label: 'AI功能' },
    { id: 'miaoshou', label: '妙手ERP' },
    { id: 'dxm', label: '店小秘上架' }
  ]

  const thirdTabs = {
    general: [
      { id: 'outputPath', label: '默认输出路径' }
    ],
    ai: [
      { id: 'modelset', label: '模型设置' },
      { id: 'copyright', label: '侵权查询' },
      { id: 'titlegen', label: '标题生成' }
    ],
    miaoshou: [
      { id: 'config', label: '密钥配置' },
      { id: 'list', label: '模板列表' },
      { id: 'editor', label: '编辑模板' }
    ],
    dxm: [
      { id: 'list', label: '模板列表' },
      { id: 'editor', label: '编辑模板' }
    ]
  }

  const renderOutputPathTab = () => (
    <div className="space-y-6">
      <div className="bg-blue-50 rounded-xl border border-blue-200 p-4">
        <div className="flex items-start space-x-3">
          <Info className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-blue-700">
            <p className="font-medium">默认输出路径说明</p>
            <p className="mt-1">套图结果页面的「保存到本地」按钮会把每一页套图按分页大小拆成独立文件夹直接展开到这个路径下，绕过浏览器下载环节，专为低端机设计。</p>
            <p className="mt-1">最终目录结构为：<code className="bg-white px-1 rounded">{`{文件夹}/page_X_of_Y/{图案组}/详情图/{颜色}主图.jpg`}</code>，与 ZIP 下载的 R01 目录树相比，仅在文件夹下多一层 <code className="bg-white px-1 rounded">page_X_of_Y</code> 分页目录。</p>
            <p className="mt-1">Windows 示例：<code className="bg-white px-1 rounded">D:\output\pod</code>  Mac/Linux 示例：<code className="bg-white px-1 rounded">/Users/you/output/pod</code></p>
            <p className="mt-1">路径不存在时会自动创建，保存前会在后端做一次合法性和写权限校验。</p>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex items-center space-x-2 mb-4">
          <FolderOutput className="w-5 h-5 text-purple-600" />
          <h3 className="font-semibold text-gray-900">默认输出路径</h3>
        </div>

        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">输出路径（绝对路径）</label>
            <input
              type="text"
              value={outputPath}
              onChange={(e) => setOutputPath(e.target.value)}
              placeholder="例如 D:\output\pod  或  /Users/you/output/pod"
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
            />
            {hasDefaultOutputPath && (
              <button
                onClick={handleClearOutputPath}
                className="mt-2 text-sm text-gray-500 hover:text-red-500"
              >
                清空
              </button>
            )}
          </div>

          <div className="flex items-center space-x-2 text-sm">
            {hasDefaultOutputPath ? (
              <>
                <CheckCircle2 className="w-4 h-4 text-green-500" />
                <span className="text-green-600">已配置默认输出路径</span>
              </>
            ) : (
              <>
                <Info className="w-4 h-4 text-blue-500" />
                <span className="text-gray-500">未配置,「保存到本地」时会要求先填写</span>
              </>
            )}
          </div>

          <div className="bg-gray-50 rounded-lg p-3 text-sm text-gray-600">
            <p className="font-medium text-gray-700 mb-1">说明：</p>
            <p>· 该路径仅作为"保存到本地"功能的默认目标，每次点击保存时仍可临时覆盖。</p>
            <p>· 写入采用 <code className="bg-white px-1 rounded">fs.copyFileSync</code> 直接落盘，不打 ZIP，零压缩内存开销。</p>
            <p>· 保存时会按"每页 X 个图案组"的设置在 <code className="bg-white px-1 rounded">{`{文件夹}/page_X_of_Y`}</code> 下分文件夹输出。</p>
            <p>· 与 ZIP 下载互不影响，原有"下载 ZIP"按钮保留。</p>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-end space-x-4">
        {outputMessage && (
          <span className={`text-sm ${outputMessageType === 'success' ? 'text-green-600' : outputMessageType === 'error' ? 'text-red-600' : 'text-gray-600'}`}>
            {outputMessage}
          </span>
        )}
        <button
          onClick={handleSaveOutputPath}
          disabled={savingOutput}
          className="flex items-center space-x-2 px-6 py-2.5 bg-gradient-to-r from-purple-500 to-blue-600 text-white rounded-lg hover:from-purple-600 hover:to-blue-700 transition-all disabled:opacity-50"
        >
          <Save className="w-4 h-4" />
          <span>{savingOutput ? '保存中...' : '保存路径'}</span>
        </button>
      </div>
    </div>
  )

  const renderModelConfigTab = () => {
    const activeProvider = aiConfig.providers.find(p => p.id === aiConfig.activeProviderId) || aiConfig.providers[0] || null

    const renderFormFields = (cfg, setField) => (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="md:col-span-2">
          <label className="block text-sm font-medium text-gray-700 mb-1">供应商名称</label>
          <input type="text" value={cfg.name || ''} onChange={e => setField('name', e.target.value)} placeholder="例如：智谱、DeepSeek、自建接口" className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500" />
        </div>
        <div className="md:col-span-2">
          <label className="block text-sm font-medium text-gray-700 mb-1">接口地址（API Base URL）</label>
          <input type="text" value={cfg.apiBaseUrl || ''} onChange={e => setField('apiBaseUrl', e.target.value)} placeholder="https://open.bigmodel.cn/api/paas/v4" className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">模型名称（Model）</label>
          <input type="text" value={cfg.model || ''} onChange={e => setField('model', e.target.value)} placeholder="glm-4v-flash" className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">API Key</label>
          <input type="text" value={cfg.apiKey || ''} onChange={e => setField('apiKey', e.target.value)} placeholder="留空则用系统默认 Key" className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">鉴权请求头名</label>
          <input type="text" value={cfg.authHeader || 'Authorization'} onChange={e => setField('authHeader', e.target.value)} placeholder="Authorization" className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Key 前缀</label>
          <input type="text" value={cfg.apiKeyPrefix || ''} onChange={e => setField('apiKeyPrefix', e.target.value)} placeholder="Bearer " className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Endpoint 路径</label>
          <input type="text" value={cfg.endpointPath || '/chat/completions'} onChange={e => setField('endpointPath', e.target.value)} placeholder="/chat/completions" className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">温度（Temperature）</label>
          <input type="number" step="0.1" min="0" max="2" value={cfg.temperature ?? 0.7} onChange={e => setField('temperature', parseFloat(e.target.value))} className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500" />
        </div>
        <div className="md:col-span-2">
          <label className="flex items-center space-x-2 text-sm text-gray-700 cursor-pointer">
            <input type="checkbox" checked={!!cfg.supportsVision} onChange={e => setField('supportsVision', e.target.checked)} className="rounded" />
            <span>支持视觉（向模型发送图片）。若关闭，标题/版权检测只发文字，不会上传图片。</span>
          </label>
        </div>
      </div>
    )

    return (
      <div className="space-y-6">
        <div className="bg-blue-50 rounded-xl border border-blue-200 p-4">
          <div className="flex items-start space-x-3">
            <Info className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-blue-700">
              <p className="font-medium">AI 模型配置说明</p>
              <p className="mt-1">可配置多个模型供应商，点击「激活」自由切换。标题生成与侵权检测都使用当前激活供应商。</p>
              <p className="mt-1">未填写 API Key 时，若接口地址为智谱默认地址，将使用系统内置 Key 开箱即用。</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center space-x-2">
              <Key className="w-5 h-5 text-purple-600" />
              <h3 className="font-semibold text-gray-900">供应商列表</h3>
            </div>
            <button
              onClick={startNewProvider}
              className="flex items-center space-x-1 px-3 py-1.5 bg-purple-500 text-white text-sm rounded-lg hover:bg-purple-600 transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span>添加供应商</span>
            </button>
          </div>

          {aiConfig.providers.length === 0 ? (
            <p className="text-sm text-gray-400">暂无供应商，点击右上角添加。</p>
          ) : (
            <div className="space-y-3">
              {aiConfig.providers.map(p => {
                const isActive = p.id === aiConfig.activeProviderId
                return (
                  <div key={p.id} className={`border rounded-lg p-4 transition-all ${isActive ? 'border-green-500 bg-green-50/50' : 'border-gray-200'}`}>
                    <div className="flex items-start justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center space-x-2">
                          <span className="font-medium text-gray-900">{p.name || '未命名供应商'}</span>
                          {isActive && (
                            <span className="text-xs px-1.5 py-0.5 bg-green-100 text-green-700 rounded">当前激活</span>
                          )}
                          {providerTestStatus[p.id] && (
                            <span
                              title={providerTestStatus[p.id].message}
                              className={`text-xs px-1.5 py-0.5 rounded cursor-help ${providerTestStatus[p.id].success ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}
                            >
                              {providerTestStatus[p.id].success ? '连接正常' : '连接失败'}
                            </span>
                          )}
                          {testingAll && !providerTestStatus[p.id] && (
                            <span className="text-xs px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded">测试中...</span>
                          )}
                        </div>
                        <p className="mt-1 text-xs text-gray-500">模型：{p.model || '-'}</p>
                        <p className="text-xs text-gray-400 truncate">{p.apiBaseUrl || '-'}</p>
                      </div>
                      <div className="flex items-center space-x-2 flex-shrink-0 ml-3">
                        {!isActive && (
                          <button onClick={() => handleActivateProvider(p.id)} disabled={saving} className="text-sm text-blue-600 hover:text-blue-800 disabled:opacity-50">激活</button>
                        )}
                        <button onClick={() => startEditProvider(p)} disabled={saving} className="text-sm text-gray-500 hover:text-purple-600 disabled:opacity-50"><Edit3 className="w-4 h-4" /></button>
                        <button onClick={() => handleDeleteProvider(p.id)} disabled={saving} className="text-sm text-gray-400 hover:text-red-500 disabled:opacity-50"><Trash2 className="w-4 h-4" /></button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {editingProvider && (
          <div className="bg-white rounded-xl shadow-sm border border-purple-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center space-x-2">
                <Settings2 className="w-5 h-5 text-purple-600" />
                <h3 className="font-semibold text-gray-900">{editingProvider.id && aiConfig.providers.find(p => p.id === editingProvider.id) ? '编辑供应商' : '添加供应商'}</h3>
              </div>
              <button
                onClick={handleTestEditingProvider}
                disabled={testingEditingProvider}
                className="flex items-center space-x-1.5 px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 transition-all disabled:opacity-50"
              >
                <Zap className="w-4 h-4" />
                <span>{testingEditingProvider ? '测试中...' : '测试此供应商'}</span>
              </button>
            </div>
            {renderFormFields(editingProvider, updateEditingField)}
            <div className="flex items-center justify-end space-x-3 mt-6">
              {editingTestMsg && (
                <span className={`text-sm ${editingTestMsg.includes('成功') ? 'text-green-600' : 'text-red-600'}`}>{editingTestMsg}</span>
              )}
              {saveMessage && (
                <span className={`text-sm ${saveMessage.includes('成功') || saveMessage.includes('已加入') ? 'text-green-600' : 'text-red-600'}`}>{saveMessage}</span>
              )}
              <button onClick={cancelEditProvider} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700">取消</button>
              <button onClick={handleSaveProvider} disabled={saving} className="flex items-center space-x-2 px-6 py-2.5 bg-gradient-to-r from-purple-500 to-blue-600 text-white rounded-lg hover:from-purple-600 hover:to-blue-700 transition-all disabled:opacity-50">
                <Save className="w-4 h-4" />
                <span>{saving ? '保存中...' : '保存到列表'}</span>
              </button>
            </div>
          </div>
        )}

        <div className="flex items-center justify-end space-x-4">
          {saveMessage && (
            <span className={`text-sm ${saveMessage.includes('成功') || saveMessage.includes('已加入') || saveMessage.includes('已切换') || saveMessage.includes('已删除') || saveMessage.includes('已保存') || saveMessage.includes('通过') ? 'text-green-600' : 'text-red-600'}`}>{saveMessage}</span>
          )}
          <button
            onClick={handleTestAll}
            disabled={testingAll || aiConfig.providers.length === 0}
            className="flex items-center space-x-2 px-4 py-2.5 border border-gray-300 rounded-lg hover:bg-gray-50 transition-all disabled:opacity-50"
          >
            <span>{testingAll ? '测试中...' : '测试全部'}</span>
          </button>
          <button
            onClick={handleTestAI}
            disabled={testingAI || !activeProvider}
            className="flex items-center space-x-2 px-4 py-2.5 border border-gray-300 rounded-lg hover:bg-gray-50 transition-all disabled:opacity-50"
          >
            <span>{testingAI ? '测试中...' : '测试当前激活连接'}</span>
          </button>
          {aiTestMsg && (
            <span className={`text-sm ${aiTestMsg.includes('成功') ? 'text-green-600' : 'text-red-600'}`}>{aiTestMsg}</span>
          )}
        </div>
      </div>
    )
  }

  const renderCopyrightQueryTab = () => (
    <div className="space-y-6">
      <div className="bg-blue-50 rounded-xl border border-blue-200 p-4">
        <div className="flex items-start space-x-3">
          <Info className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-blue-700">
            <p className="font-medium">侵权查询功能说明</p>
            <p className="mt-1">该功能使用当前激活的 AI 模型供应商对上传的图案图片进行版权侵权检测，帮助您识别潜在的侵权风险。</p>
            <p className="mt-1">检测结果仅供参考，不能作为法律依据，请谨慎使用。</p>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex items-center space-x-2 mb-4">
          <BookOpen className="w-5 h-5 text-purple-600" />
          <h3 className="font-semibold text-gray-900">检测提示词配置</h3>
        </div>

        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">自定义提示词</label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="请输入自定义检测提示词..."
              rows={6}
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 resize-none"
            />
            <button
              onClick={handleResetPrompt}
              className="mt-2 text-sm text-gray-500 hover:text-blue-500"
            >
              恢复默认提示词
            </button>
          </div>

          <div className="flex items-center space-x-2 text-sm">
            {hasCustomPrompt ? (
              <>
                <CheckCircle2 className="w-4 h-4 text-green-500" />
                <span className="text-green-600">使用自定义提示词</span>
              </>
            ) : (
              <>
                <Info className="w-4 h-4 text-blue-500" />
                <span className="text-gray-500">未设置，将使用系统默认提示词</span>
              </>
            )}
          </div>

          <div className="bg-gray-50 rounded-lg p-3 text-sm text-gray-600">
            <p className="font-medium text-gray-700 mb-1">提示：</p>
            <p>提示词用于指导大模型进行侵权检测分析。您可以根据需要自定义检测规则。</p>
            <p className="mt-1">JSON返回格式要求是硬编码的，无法修改。</p>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-end space-x-4">
        {saveMessage && (
          <span className={`text-sm ${saveMessage.includes('成功') ? 'text-green-600' : 'text-red-600'}`}>
            {saveMessage}
          </span>
        )}
        <button
          onClick={handleSaveCopyrightPrompt}
          disabled={saving}
          className="flex items-center space-x-2 px-6 py-2.5 bg-gradient-to-r from-purple-500 to-blue-600 text-white rounded-lg hover:from-purple-600 hover:to-blue-700 transition-all disabled:opacity-50"
        >
          <Save className="w-4 h-4" />
          <span>{saving ? '保存中...' : '保存配置'}</span>
        </button>
      </div>
    </div>
  )

  const renderModelSetTab = () => (
    <div className="space-y-6">
      <div className="border-b border-gray-200">
        <nav className="flex space-x-4">
          {[
            { id: 'config', label: '配置' },
            { id: 'tutorial', label: '配置教程' }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveModelSetTab(tab.id)}
              className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
                activeModelSetTab === tab.id
                  ? 'bg-purple-50 text-purple-600 border border-b-0 border-purple-200'
                  : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>
      {activeModelSetTab === 'config' && renderModelConfigTab()}
      {activeModelSetTab === 'tutorial' && renderModelTutorialTab()}
    </div>
  )

  const renderTitleGenTab = () => {
    const startNew = () => setEditingTitlePrompt({ id: '', name: '', prompt: '' })
    const startEdit = (p) => setEditingTitlePrompt({ ...p })
    const cancelEdit = () => { setEditingTitlePrompt(null); setTitlePromptMsg('') }
    const handleDelete = async (id) => {
      if (!window.confirm('确定删除该提示词？')) return
      const next = titlePrompts.filter(p => p.id !== id)
      const nextDefault = (titleDefaultId === id) ? (next[0]?.id || '') : titleDefaultId
      try {
        const data = await apiSaveTitlePrompts({ prompts: next, defaultId: nextDefault })
        setTitlePrompts(data.prompts || next)
        setTitleDefaultId(data.defaultId || nextDefault)
        setTitlePromptMsg('已删除')
        setTimeout(() => setTitlePromptMsg(''), 2000)
      } catch (e) { setTitlePromptMsg('删除失败：' + e.message) }
    }
    const handleSetDefault = async (id) => {
      try {
        const data = await apiSaveTitlePrompts({ prompts: titlePrompts, defaultId: id })
        setTitleDefaultId(data.defaultId || id)
        setTitlePromptMsg('已设为默认')
        setTimeout(() => setTitlePromptMsg(''), 2000)
      } catch (e) { setTitlePromptMsg('操作失败：' + e.message) }
    }
    const handleSavePrompt = async () => {
      const draft = editingTitlePrompt
      if (!draft.name.trim()) { setTitlePromptMsg('请填写名称'); return }
      if (!draft.prompt.trim()) { setTitlePromptMsg('请填写提示词'); return }
      const isNew = !draft.id
      const id = isNew ? ('tg_' + Date.now()) : draft.id
      const entry = { id, name: draft.name.trim(), prompt: draft.prompt, isDefault: false }
      let next
      if (isNew) next = [...titlePrompts, entry]
      else next = titlePrompts.map(p => p.id === id ? entry : p)
      const nextDefault = titleDefaultId || (next.length === 1 ? id : titleDefaultId)
      try {
        const data = await apiSaveTitlePrompts({ prompts: next, defaultId: nextDefault })
        setTitlePrompts(data.prompts || next)
        setTitleDefaultId(data.defaultId || nextDefault)
        setEditingTitlePrompt(null)
        setTitlePromptMsg(isNew ? '已新增提示词' : '已保存')
        setTimeout(() => setTitlePromptMsg(''), 2000)
      } catch (e) { setTitlePromptMsg('保存失败：' + e.message) }
    }

    return (
      <div className="space-y-6">
        <div className="bg-blue-50 rounded-xl border border-blue-200 p-4">
          <div className="flex items-start space-x-3">
            <Info className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-blue-700">
              <p className="font-medium">标题生成提示词说明</p>
              <p className="mt-1">默认使用「模型设置」中的默认模型；如需为标题生成单独指定模型，可在下方开启覆盖。</p>
              <p className="mt-1">您可管理多份提示词模板，生成标题时选择使用哪一份；未配置时使用系统内置默认提示词。</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center space-x-2">
              <BookOpen className="w-5 h-5 text-purple-600" />
              <h3 className="font-semibold text-gray-900">提示词模板（{titlePrompts.length}）</h3>
            </div>
            <button
              onClick={startNew}
              className="flex items-center space-x-1 px-3 py-1.5 bg-purple-500 text-white text-sm rounded-lg hover:bg-purple-600 transition-colors"
            >
              <Sparkles className="w-4 h-4" />
              <span>新增提示词</span>
            </button>
          </div>

          {titlePrompts.length === 0 ? (
            <p className="text-sm text-gray-400">暂无提示词，点击右上角「新增提示词」创建第一份。</p>
          ) : (
            <div className="space-y-3">
              {titlePrompts.map(p => (
                <div key={p.id} className="border border-gray-200 rounded-lg p-4">
                  <div className="flex items-start justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center space-x-2">
                        <span className="font-medium text-gray-900">{p.name}</span>
                        {titleDefaultId === p.id && (
                          <span className="text-xs px-1.5 py-0.5 bg-green-100 text-green-700 rounded">默认</span>
                        )}
                      </div>
                      <p className="mt-1 text-xs text-gray-500 whitespace-pre-wrap line-clamp-2">{p.prompt}</p>
                    </div>
                    <div className="flex items-center space-x-2 flex-shrink-0 ml-3">
                      {titleDefaultId !== p.id && (
                        <button onClick={() => handleSetDefault(p.id)} className="text-sm text-blue-600 hover:text-blue-800">设为默认</button>
                      )}
                      <button onClick={() => startEdit(p)} className="text-sm text-gray-500 hover:text-purple-600">编辑</button>
                      <button onClick={() => handleDelete(p.id)} className="text-sm text-gray-400 hover:text-red-500">删除</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {editingTitlePrompt && (
          <div className="bg-white rounded-xl shadow-sm border border-purple-200 p-6">
            <div className="flex items-center space-x-2 mb-4">
              <Sparkles className="w-5 h-5 text-purple-600" />
              <h3 className="font-semibold text-gray-900">{editingTitlePrompt.id ? '编辑提示词' : '新增提示词'}</h3>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">名称</label>
                <input
                  type="text"
                  value={editingTitlePrompt.name}
                  onChange={(e) => setEditingTitlePrompt(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="例如：Temu 风格 / Amazon 风格 / 通用"
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">提示词</label>
                <textarea
                  value={editingTitlePrompt.prompt}
                  onChange={(e) => setEditingTitlePrompt(prev => ({ ...prev, prompt: e.target.value }))}
                  placeholder="给大模型的指令，例如：看图写一段英文商品标题……"
                  rows={8}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 resize-none"
                />
              </div>
              <div className="flex items-center justify-end space-x-3">
                {titlePromptMsg && <span className="text-sm text-gray-500">{titlePromptMsg}</span>}
                <button onClick={cancelEdit} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700">取消</button>
                <button onClick={handleSavePrompt} className="flex items-center space-x-2 px-6 py-2.5 bg-gradient-to-r from-purple-500 to-blue-600 text-white rounded-lg hover:from-purple-600 hover:to-blue-700 transition-all">
                  <Save className="w-4 h-4" />
                  <span>保存</span>
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    )
  }

  const renderModelTutorialTab = () => (
    <div className="space-y-6">
      <div className="bg-gradient-to-r from-blue-500 to-purple-600 rounded-xl p-6 text-white">
        <h2 className="text-xl font-bold mb-2">GLM-4V-Flash API Key 获取教程</h2>
        <p className="text-blue-100">按照以下步骤获取您的API Key，享受更稳定的服务</p>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="divide-y divide-gray-200">
          <div className="p-6">
            <div className="flex items-start space-x-4">
              <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 font-bold flex-shrink-0">1</div>
              <div>
                <h3 className="font-semibold text-gray-900 mb-2">注册智谱AI账号</h3>
                <p className="text-gray-600 text-sm">访问 <a href="https://platform.zhipuai.cn/" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">智谱AI开放平台</a>，注册并登录您的账号。</p>
              </div>
            </div>
          </div>

          <div className="p-6">
            <div className="flex items-start space-x-4">
              <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 font-bold flex-shrink-0">2</div>
              <div>
                <h3 className="font-semibold text-gray-900 mb-2">进入控制台</h3>
                <p className="text-gray-600 text-sm">登录后，点击页面右上角的"控制台"按钮，进入管理后台。</p>
              </div>
            </div>
          </div>

          <div className="p-6">
            <div className="flex items-start space-x-4">
              <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 font-bold flex-shrink-0">3</div>
              <div>
                <h3 className="font-semibold text-gray-900 mb-2">创建API Key</h3>
                <p className="text-gray-600 text-sm">在控制台左侧菜单中找到"API Key"选项，点击"创建API Key"按钮。</p>
                <p className="text-gray-600 text-sm mt-1">为您的API Key设置一个名称，然后点击确认创建。</p>
              </div>
            </div>
          </div>

          <div className="p-6">
            <div className="flex items-start space-x-4">
              <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 font-bold flex-shrink-0">4</div>
              <div>
                <h3 className="font-semibold text-gray-900 mb-2">复制API Key</h3>
                <p className="text-gray-600 text-sm">创建成功后，系统会显示您的API Key。请立即复制保存，该Key只会显示一次。</p>
                <p className="text-gray-600 text-sm mt-1">将复制的Key粘贴到上方的配置页面中即可使用。</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-purple-50 rounded-xl border border-purple-200 p-6">
        <h3 className="font-semibold text-purple-900 mb-3">使用注意事项</h3>
        <ul className="space-y-2 text-sm text-purple-700">
          <li className="flex items-start space-x-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span>GLM-4V-Flash提供免费额度，但有调用次数限制。</span>
          </li>
          <li className="flex items-start space-x-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span>建议定期检查API Key的余额和调用情况。</span>
          </li>
          <li className="flex items-start space-x-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span>请勿将API Key分享给他人，避免被盗用。</span>
          </li>
          <li className="flex items-start space-x-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span>侵权检测结果仅供参考，不能作为法律依据。</span>
          </li>
        </ul>
      </div>

      <div className="bg-gray-50 rounded-xl border border-gray-200 p-6">
        <h3 className="font-semibold text-gray-900 mb-3">技术文档</h3>
        <p className="text-gray-600 text-sm mb-2">详细的API使用文档请参考：</p>
        <a href="https://docs.bigmodel.cn/cn/guide/models/free/glm-4v-flash" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline text-sm">
          GLM-4V-Flash 技术文档
        </a>
      </div>
    </div>
  )

  // ─── 妙手ERP 配置渲染 ───
  const renderMiaoshouTab = () => (
    <div className="space-y-6">
      <div className="bg-orange-50 rounded-xl border border-orange-200 p-4">
        <div className="flex items-start space-x-3">
          <Info className="w-5 h-5 text-orange-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-orange-700">
            <p className="font-medium">妙手ERP 密钥说明</p>
            <p className="mt-1">每个用户使用自己的妙手密钥发布到自己的TEMU店铺。密钥保存在本地，不会上传到任何服务器。</p>
            <p className="mt-1">获取方式：登录妙手ERP → 开放平台 → 创建应用 → 获取APP ID和APP Secret。</p>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">APP ID（AppKey）</label>
            <input type="text" value={miaoshouAppKey} onChange={(e) => setMiaoshouAppKey(e.target.value)}
              placeholder="ak_xxxxxxxxxxxxxxxx" className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500" />
            <p className="text-xs text-gray-400 mt-1">妙手开放平台显示的 APP ID，格式如 ak_xxxxxxxx</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">APP Secret</label>
            <input type="password" value={miaoshouAppSecret} onChange={(e) => setMiaoshouAppSecret(e.target.value)}
              placeholder="输入AppSecret" className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500" />
            <p className="text-xs text-gray-400 mt-1">妙手开放平台显示的 APP Secret，创建应用后查看</p>
          </div>
          <div className="flex items-center justify-between">
            {hasMiaoshouConfig && <span className="text-sm text-green-600 flex items-center"><CheckCircle2 className="w-4 h-4 mr-1" />已配置妙手密钥</span>}
            <div className="flex items-center space-x-3 ml-auto">
              {miaoshouMessage && <span className={`text-sm ${miaoshouMessage.includes('成功') ? 'text-green-600' : 'text-red-600'}`}>{miaoshouMessage}</span>}
              <button onClick={handleTestMiaoshou} disabled={!miaoshouAppKey}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm">
                测试连接
              </button>
              <button onClick={handleSaveMiaoshou} disabled={savingMiaoshou}
                className="flex items-center space-x-2 px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 disabled:opacity-50">
                <Save className="w-4 h-4" /><span>{savingMiaoshou ? '保存中...' : '保存密钥'}</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )

  // ─── 发布模板列表渲染 ───
  const renderPublishTemplateList = () => (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-sm text-gray-500">共 {publishTemplates.length} 个模板，发布时可从下拉列表选择</p>
        <button onClick={handleCreateTemplate}
          className="flex items-center space-x-1 px-3 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 text-sm">
          <span>+ 新建模板</span>
        </button>
      </div>
      {publishTemplates.length === 0 && (
        <div className="bg-gray-50 rounded-xl p-8 text-center text-gray-400">
          <p className="text-lg mb-2">还没有发布模板</p>
          <p className="text-sm">点击「新建模板」创建一个，支持从参考商品自动填充</p>
        </div>
      )}
      <div className="space-y-3">
        {publishTemplates.map(tpl => (
          <div key={tpl.id} className="bg-white rounded-xl border border-gray-200 p-4 hover:border-purple-300 transition-colors">
            <div className="flex justify-between items-start">
              <div>
                <h4 className="font-medium text-gray-900">{tpl.name}</h4>
                <p className="text-sm text-gray-500 mt-1">
                  店铺: {shopOptions.find(s => s.value === String(tpl.shopId))?.label || ('店铺' + tpl.shopId)} | 站点: {(tpl.publishSites || []).join(', ') || '-'} |
                  申报价: ¥{tpl.defaultPrice || '-'} | 类目: {categoryOptions.find(c => c.value === String(tpl.cid))?.label || ('CID:' + tpl.cid)}
                </p>
              </div>
              <div className="flex space-x-2">
                <button onClick={() => handleEditTemplate(tpl)} className="text-sm text-purple-600 hover:text-purple-800">编辑</button>
                <button onClick={() => handleDeleteTemplate(tpl.id)} className="text-sm text-red-500 hover:text-red-700">删除</button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )

  // ─── 发布模板编辑器渲染 ───
  const renderPublishTemplateEditor = () => {
    const selectedCountry = countryOptions.find(c => c.value === editingTemplate?.productOriginCountry)
    const provinces = selectedCountry?.provinces || []
    const selectedSites = editingTemplate?.publishSites || []

    return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <button onClick={() => { setEditingTemplate(null); setActiveThirdTab('list') }}
          className="text-sm text-purple-600 hover:text-purple-800">&larr; 返回模板列表</button>
        {isLoadingOptions && <span className="text-xs text-blue-500 animate-pulse">正在加载选项...</span>}
        <button onClick={loadDropdownOptions} disabled={isLoadingOptions}
          className="text-xs text-gray-500 hover:text-purple-600 flex items-center space-x-1">
          <span>{shopOptions.length > 0 ? '🔄 刷新选项' : '📥 加载选项'}</span>
        </button>
      </div>

      {optionsError && <div className="bg-red-50 text-red-600 px-3 py-2 rounded-lg text-sm">{optionsError}</div>}

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 space-y-6">
        <h3 className="font-semibold text-gray-900">{editingTemplate?.id ? '编辑模板' : '新建模板'}</h3>

        {/* ── 基本信息 ── */}
        <div className="space-y-3">
          <h4 className="text-sm font-medium text-gray-500 border-b pb-1">基本信息</h4>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">模板名称 <span className="text-red-400">*</span></label>
              <input type="text" value={editingTemplate?.name || ''} onChange={(e) => setEditingTemplate(prev => ({ ...prev, name: e.target.value }))}
                placeholder="如：T恤-US站-标准" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 focus:border-purple-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">店铺 <span className="text-red-400">*</span></label>
              {shopOptions.length > 0 ? (
                <select value={editingTemplate?.shopId || ''} onChange={(e) => handleShopChange(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-purple-500 focus:border-purple-500">
                  <option value="">-- 请选择店铺 --</option>
                  {shopOptions.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              ) : (
                <input type="text" value={editingTemplate?.shopId || ''} onChange={(e) => handleShopChange(e.target.value)}
                  placeholder="点击右上角「加载选项」获取" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-gray-50" />
              )}
              {isLoadingWhFr && <span className="text-xs text-blue-500">正在加载仓库和运费模板...</span>}
            </div>
          </div>
        </div>

        {/* ── 发布站点 ── */}
        <div className="space-y-3">
          <h4 className="text-sm font-medium text-gray-500 border-b pb-1">发布站点</h4>
          {siteOptions.length > 0 ? (
            <>
              <div className="flex flex-wrap gap-1">
                {siteOptions.map(site => {
                  const selected = (editingTemplate?.publishSites || []).includes(site.value)
                  return (
                    <label key={site.value} className={`flex items-center space-x-1 px-2 py-1 border rounded text-xs cursor-pointer transition-colors ${selected ? 'bg-purple-50 border-purple-300 text-purple-700' : 'border-gray-200 text-gray-600 hover:border-gray-300'}`}>
                      <input type="checkbox" checked={selected} onChange={() => {
                        setEditingTemplate(prev => {
                          const cur = prev.publishSites || []
                          const next = cur.includes(site.value) ? cur.filter(s => s !== site.value) : [...cur, site.value]
                          const newEu = site.value === 'EU' && !next.includes('EU') ? [] : (prev.publishEuSites || [])
                          return { ...prev, publishSites: next, publishEuSites: newEu, warehouseMap: {}, freightMap: {} }
                        })
                      }} className="w-3 h-3 text-purple-600 rounded" />
                      <span>{site.label}</span>
                    </label>
                  )
                })}
              </div>
              {(editingTemplate?.publishSites || []).includes('EU') && euSiteOptions.length > 0 && (
                <div className="ml-2 pl-3 border-l-2 border-purple-200">
                  <p className="text-xs text-gray-500 mb-2">EU 子站点（至少选2个）:</p>
                  <div className="flex flex-wrap gap-1">
                    {euSiteOptions.map(site => {
                      const selected = (editingTemplate?.publishEuSites || []).includes(site.value)
                      return (
                        <label key={site.value} className={`flex items-center space-x-1 px-2 py-1 border rounded text-xs cursor-pointer transition-colors ${!site.isOpen ? 'opacity-50 cursor-not-allowed' : ''} ${selected ? 'bg-purple-50 border-purple-300 text-purple-700' : 'border-gray-200 text-gray-600'}`}>
                          <input type="checkbox" checked={selected} disabled={!site.isOpen} onChange={() => {
                            if (!site.isOpen) return
                            setEditingTemplate(prev => {
                              const cur = prev.publishEuSites || []
                              const next = cur.includes(site.value) ? cur.filter(s => s !== site.value) : [...cur, site.value]
                              return { ...prev, publishEuSites: next }
                            })
                          }} className="w-3 h-3 text-purple-600 rounded" />
                          <span>{site.label}</span>
                        </label>
                      )
                    })}
                  </div>
                  {(editingTemplate?.publishEuSites || []).length < 2 && (
                    <p className="text-xs text-orange-500 mt-1">选择EU后需至少选择2个欧盟子站点</p>
                  )}
                </div>
              )}
            </>
          ) : (
            <p className="text-sm text-gray-400">点击右上角「加载选项」获取站点列表</p>
          )}
        </div>

        {/* ── 站点仓库/运费配置 ── */}
        {(editingTemplate?.publishSites || []).length > 0 && editingTemplate?.shopId && (
          (() => {
            // EU站点展开为子站点
            const expandedSites = (editingTemplate?.publishSites || []).flatMap(site => {
              if (site === 'EU') return editingTemplate?.publishEuSites || []
              return [site]
            })
            return (
          <div className="space-y-3">
            <h4 className="text-sm font-medium text-gray-500 border-b pb-1">站点仓库 & 运费模板</h4>
            <p className="text-xs text-gray-400">为每个站点选择发货仓库和运费模板{editingTemplate?.publishSites?.includes('EU') ? '（EU已展开为子站点）' : ''}</p>
            <div className="space-y-2">
              {expandedSites.map(site => {
                const siteWh = warehouseOptions.filter(w => w.site === site)
                const siteFr = freightOptions.filter(f => f.site === site)
                const warehouseMap = editingTemplate?.warehouseMap || {}
                const selectedWh = warehouseMap[site] || []
                const freightMap = editingTemplate?.freightMap || {}
                return (
                  <div key={site} className="bg-gray-50 rounded-lg px-3 py-2">
                    <div className="flex items-center space-x-3 mb-1">
                      <span className="text-sm font-medium text-gray-700 w-12">{site}</span>
                      <div className="flex-1">
                        <select value={freightMap[site] || ''} onChange={(e) => setEditingTemplate(prev => ({ ...prev, freightMap: { ...prev.freightMap, [site]: e.target.value } }))}
                          className="w-full px-2 py-1 border border-gray-300 rounded text-xs bg-white">
                          <option value="">-- 运费模板 --</option>
                          {siteFr.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                          {siteFr.length === 0 && <option disabled>无可用运费模板</option>}
                        </select>
                      </div>
                      {/* 发货时效 */}
                      <div className="w-32">
                        <select value={(editingTemplate?.siteShipmentLimitDayMap || {})[site] || ''} onChange={(e) => {
                          const val = e.target.value ? parseInt(e.target.value) : ''
                          setEditingTemplate(prev => ({ ...prev, siteShipmentLimitDayMap: { ...(prev.siteShipmentLimitDayMap || {}), [site]: val } }))
                        }}
                          className="w-full px-2 py-1 border border-gray-300 rounded text-xs bg-white">
                          <option value="">-- 发货时效 --</option>
                          <option value="1">1个工作日</option>
                          <option value="2">2个工作日</option>
                          <option value="7">7个工作日</option>
                          <option value="9">9个工作日</option>
                        </select>
                      </div>
                    </div>
                    {/* 仓库多选 */}
                    <div className="ml-14 flex flex-wrap gap-1">
                      {siteWh.length > 0 ? siteWh.map(w => {
                        const checked = selectedWh.includes(w.value)
                        return (
                          <label key={w.value} className={`flex items-center space-x-1 px-2 py-0.5 border rounded text-xs cursor-pointer ${checked ? 'bg-blue-50 border-blue-300 text-blue-700' : 'border-gray-200 text-gray-600 hover:border-gray-300'}`}>
                            <input type="checkbox" checked={checked} onChange={() => {
                              setEditingTemplate(prev => {
                                const cur = prev.warehouseMap?.[site] || []
                                const next = cur.includes(w.value) ? cur.filter(id => id !== w.value) : [...cur, w.value]
                                return { ...prev, warehouseMap: { ...prev.warehouseMap, [site]: next } }
                              })
                            }} className="w-3 h-3 text-blue-600 rounded" />
                            <span className="truncate max-w-[150px]" title={w.label}>{w.label}</span>
                          </label>
                        )
                      }) : (
                        <span className="text-xs text-gray-400">无可用仓库</span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
            )
          })()
        )}

        {/* ── 商品信息 ── */}
        <div className="space-y-3">
          <h4 className="text-sm font-medium text-gray-500 border-b pb-1">商品信息</h4>
          <div className="grid grid-cols-3 gap-4">
            <div className="relative">
              <label className="block text-sm font-medium text-gray-700 mb-1">类目</label>
              {categoryOptions.length > 0 ? (
                <div className="relative">
                  <input type="text" value={categoryQuery} onChange={(e) => setCategoryQuery(e.target.value)}
                    onFocus={() => setCategoryQuery(categoryQuery === '' ? '' : categoryQuery)}
                    placeholder={editingTemplate?.cid ? categoryOptions.find(c => c.value === String(editingTemplate.cid))?.label || '搜索类目...' : '搜索类目...'}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 focus:border-purple-500" />
                  {categoryQuery && (
                    <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                      {categoryOptions.filter(c => c.label.toLowerCase().includes(categoryQuery.toLowerCase())).slice(0, 50).map(c => (
                        <div key={c.value} onClick={() => { handleCidChange(c.value); setCategoryQuery(''); }}
                          className="px-3 py-2 text-sm hover:bg-purple-50 cursor-pointer">
                          {c.label}
                        </div>
                      ))}
                      {categoryOptions.filter(c => c.label.toLowerCase().includes(categoryQuery.toLowerCase())).length === 0 && (
                        <div className="px-3 py-2 text-sm text-gray-400">无匹配类目</div>
                      )}
                    </div>
                  )}
                  {editingTemplate?.cid && !categoryQuery && (
                    <div className="mt-1 text-xs text-purple-600">
                      已选: {categoryOptions.find(c => c.value === String(editingTemplate.cid))?.label || editingTemplate.cid}
                    </div>
                  )}
                </div>
              ) : (
                <input type="text" value={editingTemplate?.cid || ''} onChange={(e) => setEditingTemplate(prev => ({ ...prev, cid: e.target.value }))}
                  placeholder={isLoadingOptions ? '加载中...' : '类目CID'} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-gray-50" />
              )}
              {isLoadingCategory && <span className="text-xs text-blue-500">加载中...</span>}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">申报价 (¥)</label>
              <input type="text" value={editingTemplate?.defaultPrice || ''} onChange={(e) => setEditingTemplate(prev => ({ ...prev, defaultPrice: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">默认库存</label>
              <input type="number" value={editingTemplate?.defaultStock || 100} onChange={(e) => setEditingTemplate(prev => ({ ...prev, defaultStock: parseInt(e.target.value) || 100 }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">货号 (ItemNum)</label>
              <input type="text" value={editingTemplate?.itemNum || ''} onChange={(e) => setEditingTemplate(prev => ({ ...prev, itemNum: e.target.value }))}
                placeholder="非服饰类主货号" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">包装长(cm)</label>
              <input type="text" value={editingTemplate?.packageLength || '30'} onChange={(e) => setEditingTemplate(prev => ({ ...prev, packageLength: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">包装宽(cm)</label>
              <input type="text" value={editingTemplate?.packageWidth || '20'} onChange={(e) => setEditingTemplate(prev => ({ ...prev, packageWidth: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">包装高(cm)</label>
              <input type="text" value={editingTemplate?.packageHeight || '5'} onChange={(e) => setEditingTemplate(prev => ({ ...prev, packageHeight: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">重量(g)</label>
              <input type="number" value={editingTemplate?.weight || 200} onChange={(e) => setEditingTemplate(prev => ({ ...prev, weight: parseInt(e.target.value) || 200 }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">原产国</label>
              {countryOptions.length > 0 ? (
                <select value={editingTemplate?.productOriginCountry || 'CN'} onChange={(e) => setEditingTemplate(prev => ({ ...prev, productOriginCountry: e.target.value, productOriginProvince: '' }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white">
                  {countryOptions.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
              ) : (
                <input type="text" value={editingTemplate?.productOriginCountry || 'CN'} onChange={(e) => setEditingTemplate(prev => ({ ...prev, productOriginCountry: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
              )}
            </div>
            {editingTemplate?.productOriginCountry === 'CN' && provinces.length > 0 && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">省份</label>
                <select value={editingTemplate?.productOriginProvince || ''} onChange={(e) => setEditingTemplate(prev => ({ ...prev, productOriginProvince: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white">
                  <option value="">-- 请选择省份 --</option>
                  {provinces.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                </select>
              </div>
            )}
            {/* 尺码模板 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">尺码模板</label>
              {sizeTemplateOptions.length > 0 ? (
                <select value={editingTemplate?.sizeTemplateId || ''} onChange={(e) => handleSizeTemplateChange(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white">
                  <option value="">-- 选择尺码模板 --</option>
                  {sizeTemplateOptions.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              ) : (
                <input type="text" value={editingTemplate?.sizeTemplateId || ''} onChange={(e) => setEditingTemplate(prev => ({ ...prev, sizeTemplateId: e.target.value }))}
                  placeholder="先选择类目" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-gray-50" disabled={!editingTemplate?.cid} />
              )}
              {isLoadingSizeTemplate && <span className="text-xs text-blue-500">加载中...</span>}
            </div>
            {/* 模特 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">模特</label>
              {modelCatInfo?.enabled === 1 ? (
                modelOptions.length > 0 ? (
                  <select value={editingTemplate?.modelId || ''} onChange={(e) => setEditingTemplate(prev => ({ ...prev, modelId: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white">
                    <option value="">-- 选择模特 --</option>
                    {modelOptions.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                  </select>
                ) : (
                  <input type="text" value={editingTemplate?.modelId || ''} onChange={(e) => setEditingTemplate(prev => ({ ...prev, modelId: e.target.value }))}
                    placeholder={isLoadingModel ? '加载中...' : '该类目无可用模特'} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-gray-50" disabled />
                )
              ) : (
                <input type="text" value={editingTemplate?.modelId || ''} onChange={(e) => setEditingTemplate(prev => ({ ...prev, modelId: e.target.value }))}
                  placeholder={modelCatInfo ? '该类目不支持模特' : '先选择类目和店铺'} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-gray-50" disabled />
              )}
              {isLoadingModel && <span className="text-xs text-blue-500">加载中...</span>}
            </div>
          </div>
        </div>

        {/* ── 参考商品 ── */}
        <div className="space-y-2 border-t pt-3">
          <h4 className="text-sm font-medium text-gray-500 border-b pb-1">从参考商品自动填充</h4>
          {collectBoxOptions.length === 0 && !isLoadingOptions && (
            <div className="bg-yellow-50 text-yellow-700 px-2 py-1.5 rounded text-xs">
              采集箱暂无商品，请先在妙手ERP中采集商品到TEMU半托管采集箱，或手动输入采集箱ID。
            </div>
          )}
          <div className="flex items-center space-x-2">
            {collectBoxOptions.length > 0 ? (
              <select value={editingTemplate?.referenceCollectBoxId || ''} onChange={(e) => setEditingTemplate(prev => ({ ...prev, referenceCollectBoxId: e.target.value }))}
                className="flex-1 min-w-0 px-2 py-1.5 border border-gray-300 rounded-lg text-sm bg-white truncate">
                <option value="">-- 选择采集箱商品 --</option>
                {collectBoxOptions.map(cb => (
                  <option key={cb.value} value={cb.value} title={cb.label}>
                    {cb.label.length > 60 ? cb.label.slice(0, 60) + '...' : cb.label}
                  </option>
                ))}
              </select>
            ) : (
              <input type="text" value={editingTemplate?.referenceCollectBoxId || ''} onChange={(e) => setEditingTemplate(prev => ({ ...prev, referenceCollectBoxId: e.target.value }))}
                placeholder={isLoadingOptions ? '加载中...' : '输入采集箱ID'} className="flex-1 px-2 py-1.5 border border-gray-300 rounded-lg text-sm bg-gray-50" />
            )}
            <button onClick={handleFetchReferenceProduct}
              className="px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm whitespace-nowrap">获取属性</button>
          </div>
          <p className="text-xs text-gray-400">选择采集箱商品，自动拉取类目、属性、销售属性、SKU等信息。</p>
        </div>

        <div className="flex justify-end space-x-3 pt-4 border-t">
          <button onClick={() => { setEditingTemplate(null); setActiveThirdTab('list') }}
            className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50">取消</button>
          <button onClick={handleSaveTemplate}
            className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 flex items-center space-x-2">
            <Save className="w-4 h-4" /><span>保存模板</span>
          </button>
        </div>
      </div>
    </div>
    )
  }

  // ─── 店小秘上架模板：列表 ───
  const renderDxmTemplateList = () => (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-sm text-gray-500">共 {dxmTemplates.length} 个店小秘上架模板，导出时可从下拉选择</p>
        <button onClick={handleCreateDxmTemplate}
          className="flex items-center space-x-1 px-3 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm">
          <span>+ 新建模板</span>
        </button>
      </div>
      {dxmTemplates.length === 0 && (
        <div className="bg-gray-50 rounded-xl p-8 text-center text-gray-400">
          <p className="text-lg mb-2">还没有店小秘上架模板</p>
          <p className="text-sm">新建后导入一个从店小秘导出的商品 xlsx，微调并保存即可复用</p>
        </div>
      )}
      <div className="space-y-3">
        {dxmTemplates.map(tpl => (
          <div key={tpl.id} className="bg-white rounded-xl border border-gray-200 p-4 hover:border-indigo-300 transition-colors">
            <div className="flex justify-between items-start">
              <div>
                <h4 className="font-medium text-gray-900">{tpl.name}</h4>
                <p className="text-sm text-gray-500 mt-1">
                  颜色: {(tpl.colors || []).map(c => c.name).join('/') || '-'} |
                  尺码: {(tpl.sizes || []).map(s => s.name).join('/') || '-'} |
                  申报价: ¥{tpl.overrides?.defaultPrice || '-'} | 货号: {tpl.overrides?.itemNum || '-'}
                </p>
              </div>
              <div className="flex space-x-2">
                <button onClick={() => handleEditDxmTemplate(tpl)} className="text-sm text-indigo-600 hover:text-indigo-800">编辑</button>
                <button onClick={() => handleDeleteDxmTemplate(tpl.id)} className="text-sm text-red-500 hover:text-red-700">删除</button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )

  // ─── 店小秘上架模板：编辑器 ───
  const renderDxmTemplateEditor = () => {
    const ed = editingDxmTemplate || {}
    const colors = ed.colors || []
    const sizes = ed.sizes || []
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <button onClick={() => { setEditingDxmTemplate(null); setDxmParsed(null); setActiveThirdTab('list') }}
            className="text-sm text-indigo-600 hover:text-indigo-800">&larr; 返回模板列表</button>
          <button onClick={handleSaveDxmTemplate}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 flex items-center space-x-2 text-sm">
            <Save className="w-4 h-4" /><span>保存模板</span>
          </button>
        </div>

        {dxmImportError && <div className="bg-red-50 text-red-600 px-3 py-2 rounded-lg text-sm">{dxmImportError}</div>}

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 space-y-6">
          <h3 className="font-semibold text-gray-900">{ed.id ? '编辑店小秘模板' : '新建店小秘模板'}</h3>

          {/* 基本信息 */}
          <div className="space-y-3">
            <h4 className="text-sm font-medium text-gray-500 border-b pb-1">基本信息</h4>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">模板名称 <span className="text-red-400">*</span></label>
                <input type="text" value={ed.name || ''} onChange={(e) => setEditingDxmTemplate(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="如：T恤-US站-模板" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500" />
              </div>
            </div>
            {/* 导入模板 xlsx */}
            <div className="mt-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">导入店小秘商品表（xlsx）</label>
              <input type="file" accept=".xlsx,.xls" disabled={dxmImporting}
                onChange={(e) => handleImportDxmTemplate(e.target.files[0])}
                className="block w-full text-sm text-gray-500 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100" />
              {dxmImporting && <span className="text-xs text-indigo-500">解析中...</span>}
              {dxmParsed && (
                <p className="text-xs text-gray-500 mt-1">
                  已解析：{dxmParsed.colors.length} 个颜色（{(dxmParsed.colors || []).map(c => c.name).join('/')}）、
                  {dxmParsed.sizes.length} 个尺码（{(dxmParsed.sizes || []).map(s => s.name).join('/')}）、
                  {dxmParsed.rowCount} 行 SKU
                </p>
              )}
              <p className="text-xs text-gray-400 mt-1">导入后会自动填充颜色/尺码与所有平台属性，复杂 JSON 字段（产品属性/SPU/SKC/SKU）原样保留。</p>
            </div>
          </div>

          {/* 商品信息 */}
          <div className="space-y-3">
            <h4 className="text-sm font-medium text-gray-500 border-b pb-1">商品信息（覆盖值）</h4>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">申报价 (¥)</label>
                <input type="text" value={ed.overrides?.defaultPrice || ''} onChange={(e) => setEditingDxmTemplate(prev => ({ ...prev, overrides: { ...prev.overrides, defaultPrice: e.target.value } }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">货号 (ItemNum)</label>
                <input type="text" value={ed.overrides?.itemNum || ''} onChange={(e) => setEditingDxmTemplate(prev => ({ ...prev, overrides: { ...prev.overrides, itemNum: e.target.value } }))}
                  placeholder="所有商品统一货号" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">标题（留空=AI 生成）</label>
                <input type="text" value={ed.overrides?.title || ''} onChange={(e) => setEditingDxmTemplate(prev => ({ ...prev, overrides: { ...prev.overrides, title: e.target.value } }))}
                  placeholder="留空则用 AI 生成标题" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
              </div>
            </div>
          </div>

          {/* 颜色映射 */}
          <div className="space-y-3">
            <h4 className="text-sm font-medium text-gray-500 border-b pb-1">颜色映射（模板色 → 套图底板色）</h4>
            <p className="text-xs text-gray-400">导出时按此映射把对应套图色的图片填入。选择参考图案模板后，会<b>按模板顺序自动填充</b>（模板色[i] → 图案色[i]），右侧可下拉更改。</p>

            {/* 参考图案模板选择器 */}
            <div className="flex items-center space-x-3">
              <label className="text-sm font-medium text-gray-700">参考图案模板</label>
              <select value={ed.refTemplateId || ''} onChange={(e) => handlePickRefTemplate(e.target.value)}
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500">
                <option value="">（不关联 / 手动填写）</option>
                {refTemplates.map(t => (
                  <option key={t.id} value={t.id}>{t.name}（{(t.colors || []).length} 色）</option>
                ))}
              </select>
              {refTemplates.length === 0 && <span className="text-xs text-gray-400">无可用图案模板</span>}
            </div>

            <div className="space-y-2">
              {colors.map(c => {
                const ref = refTemplates.find(t => t.id === ed.refTemplateId)
                const refColors = ref ? ref.colors : []
                const current = (ed.colorMap && ed.colorMap[c.name]) || ''
                // 下拉选项：参考图案色名 + 已存储值（若不在列表里，保留以免丢失）+ 空
                const opts = Array.from(new Set([...refColors, current].filter(Boolean)))
                return (
                  <div key={c.name} className="flex items-center space-x-3">
                    <span className="text-sm text-gray-700 w-24 shrink-0">{c.name}</span>
                    <span className="text-gray-400">→</span>
                    {ref ? (
                      <select value={current} onChange={(e) => setEditingDxmTemplate(prev => ({ ...prev, colorMap: { ...prev.colorMap, [c.name]: e.target.value } }))}
                        className="flex-1 px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500">
                        <option value="">（未映射）</option>
                        {opts.map(n => <option key={n} value={n}>{n}</option>)}
                      </select>
                    ) : (
                      <input type="text" value={current} onChange={(e) => setEditingDxmTemplate(prev => ({ ...prev, colorMap: { ...prev.colorMap, [c.name]: e.target.value } }))}
                        placeholder="对应套图底板色名，如 SKU1图" className="flex-1 px-3 py-1.5 border border-gray-300 rounded-lg text-sm" />
                    )}
                  </div>
                )
              })}
              {colors.length === 0 && <p className="text-xs text-gray-400">请先导入店小秘商品表以读取颜色</p>}
            </div>
          </div>

          {/* 尺码（只读） */}
          <div className="space-y-2">
            <h4 className="text-sm font-medium text-gray-500 border-b pb-1">尺码（来自模板，只读）</h4>
            <div className="flex flex-wrap gap-2">
              {sizes.length > 0 ? sizes.map(s => (
                <span key={s.name} className="px-2 py-1 bg-gray-100 rounded text-xs text-gray-600">{s.name}</span>
              )) : <span className="text-xs text-gray-400">请先导入商品表</span>}
            </div>
          </div>
        </div>
      </div>
    )
  }

  const renderContent = () => {
    if (activeSecondTab === 'general') {
      if (activeThirdTab === 'outputPath') {
        return renderOutputPathTab()
      }
    } else if (activeSecondTab === 'ai') {
      if (activeThirdTab === 'modelset') {
        return renderModelSetTab()
      } else if (activeThirdTab === 'copyright') {
        return renderCopyrightQueryTab()
      } else if (activeThirdTab === 'titlegen') {
        return renderTitleGenTab()
      }
    } else if (activeSecondTab === 'miaoshou') {
      if (activeThirdTab === 'config') {
        return renderMiaoshouTab()
      } else if (activeThirdTab === 'list' || !editingTemplate) {
        return renderPublishTemplateList()
      } else {
        return renderPublishTemplateEditor()
      }
    } else if (activeSecondTab === 'dxm') {
      if (activeThirdTab === 'list' || !editingDxmTemplate) {
        return renderDxmTemplateList()
      } else {
        return renderDxmTemplateEditor()
      }
    }
    return null
  }

  return (
    <div className="space-y-6">
      <div className="border-b border-gray-200">
        <nav className="flex space-x-8">
          {secondTabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => {
                setActiveSecondTab(tab.id)
                setActiveThirdTab(thirdTabs[tab.id]?.[0]?.id || 'config')
              }}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeSecondTab === tab.id
                  ? 'border-purple-600 text-purple-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {thirdTabs[activeSecondTab] && thirdTabs[activeSecondTab].length > 0 && (
        <div className="border-b border-gray-200">
          <nav className="flex space-x-4">
            {thirdTabs[activeSecondTab].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveThirdTab(tab.id)}
                className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
                  activeThirdTab === tab.id
                    ? 'bg-purple-50 text-purple-600 border border-b-0 border-purple-200'
                    : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>
      )}

      {renderContent()}
    </div>
  )
}

export default Settings