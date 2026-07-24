import { useState, useEffect, useRef } from 'react'
import { apiRequest, apiUpload, getImageUrl, apiStartCopyrightCheckTask, apiCopyrightCheckSingle } from '../api/axios'
import { Plus, Trash2, Search, Upload, FolderOpen, ChevronRight, ChevronLeft, Wand2, CheckCircle2, X, ImageIcon, Shield, AlertTriangle, CheckCircle, HelpCircle, Loader2, Info, RefreshCw, FileText } from 'lucide-react'
import FileRenameTool from './FileRenameTool'

function PatternManager() {
  const [folders, setFolders] = useState([])
  const [templates, setTemplates] = useState([])
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedFolder, setSelectedFolder] = useState(null)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [newFolder, setNewFolder] = useState({ name: '', areaCount: 2 })
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [uploadCount, setUploadCount] = useState({ current: 0, total: 0 })
  const [isGenerating, setIsGenerating] = useState(false)
  const [selectedTemplateId, setSelectedTemplateId] = useState('')
  const [isCheckingCopyright, setIsCheckingCopyright] = useState(false)
  const [showCopyrightModal, setShowCopyrightModal] = useState(false)
  const [selectedImageDetail, setSelectedImageDetail] = useState(null)
  const [recheckingImage, setRecheckingImage] = useState(null)
  const fileInputRef = useRef(null)
  const copyrightSubmittingRef = useRef(false)

  // 二级 tab：'images' 显示原图案库，'rename' 显示文件名整理工具
  const [activeSubTab, setActiveSubTab] = useState('images')

  useEffect(() => {
    loadFolders()
    loadTemplates()
  }, [])

  const loadFolders = async () => {
    try {
      const data = await apiRequest('/folders')
      setFolders(data)
    } catch (error) {
      console.error('加载文件夹失败:', error)
    }
  }

  const loadTemplates = async () => {
    try {
      const data = await apiRequest('/templates-v2')
      setTemplates(data.map(t => ({ ...t, version: 2 })))
    } catch (error) {
      console.error('加载模板失败:', error)
    }
  }

  const handleCreateFolder = async () => {
    if (!newFolder.name) {
      alert('请填写文件夹名称')
      return
    }

    try {
      await apiRequest('/folders', {
        method: 'POST',
        data: {
          name: newFolder.name,
          areaCount: parseInt(newFolder.areaCount)
        }
      })
      loadFolders()
      setShowCreateModal(false)
      setNewFolder({ name: '', areaCount: 2 })
    } catch (error) {
      console.error('创建文件夹失败:', error)
      alert('创建失败，请重试')
    }
  }

  const handleDeleteFolder = async (id) => {
    if (!confirm('确定要删除这个文件夹吗？所有图片和套图结果都将被删除。')) return
    try {
      await apiRequest(`/folders/${id}`, { method: 'DELETE' })
      loadFolders()
      if (selectedFolder?.id === id) {
        setSelectedFolder(null)
      }
    } catch (error) {
      console.error('删除文件夹失败:', error)
    }
  }

  const handleSelectFolder = async (folder) => {
    try {
      const data = await apiRequest(`/folders/${folder.id}`)
      setSelectedFolder(data)
      setSelectedTemplateId(data.templateId || '')
    } catch (error) {
      console.error('加载文件夹详情失败:', error)
    }
  }

  const handleBack = () => {
    setSelectedFolder(null)
    loadFolders()
  }

  const handleUpload = async (e) => {
    if (!selectedFolder) return

    const files = Array.from(e.target.files)
    if (files.length === 0) return

    // Filter out non-image files (e.g., Thumbs.db, .DS_Store)
    const imageFiles = files.filter(file => {
      const ext = file.name.toLowerCase().split('.').pop()
      return ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'tiff', 'tif'].includes(ext)
    })

    if (imageFiles.length === 0) {
      alert('没有有效的图片文件')
      return
    }

    if (imageFiles.length < files.length) {
      console.log(`过滤掉 ${files.length - imageFiles.length} 个非图片文件`)
    }

    setUploading(true)
    setUploadProgress(0)
    setUploadCount({ current: 0, total: imageFiles.length })

    const formData = new FormData()
    formData.append('folderId', selectedFolder.id)
    imageFiles.forEach(file => {
      formData.append('images', file)
    })

    try {
      await apiUpload(`/folders/${selectedFolder.id}/upload`, formData)
      setUploadProgress(100)
      setTimeout(async () => {
        const data = await apiRequest(`/folders/${selectedFolder.id}`)
        setSelectedFolder(data)
        setUploading(false)
        if (fileInputRef.current) fileInputRef.current.value = ''
      }, 500)
    } catch (error) {
      console.error('上传失败:', error)
      alert('上传失败，请重试')
      setUploading(false)
    }
  }

  const handleDeleteImage = async (fileName) => {
    if (!confirm(`确定要删除 ${fileName} 吗？`)) return
    try {
      await apiRequest(`/folders/${selectedFolder.id}/images/${fileName}`, { method: 'DELETE' })
      const data = await apiRequest(`/folders/${selectedFolder.id}`)
      setSelectedFolder(data)
    } catch (error) {
      console.error('删除图片失败:', error)
    }
  }

  const handleGenerateMockups = async () => {
    if (!selectedFolder || !selectedFolder.id) {
      alert('请先选择一个文件夹')
      return
    }

    if (!selectedTemplateId) {
      alert('请先选择模板')
      return
    }

    const validGroups = getValidImageGroups()
    if (validGroups.length === 0) {
      alert('没有找到符合命名规则的图片组。\n请确保图片命名格式为：名称-区域编号.png\n例如：0001-1.png（区域1）、0001-2.png（区域2）')
      return
    }

    // Warn about unmatched files
    if (selectedFolder.images) {
      const unmatchedCount = selectedFolder.images.filter(img => {
        if (!img?.name) return false
        const match = img.name.match(/^(.+)-(\d{1,2})\.\w+$/)
        return !match || parseInt(match[2]) > selectedFolder.areaCount
      }).length
      if (unmatchedCount > 0) {
        if (!confirm(`有 ${unmatchedCount} 张图片未匹配命名规则，将被跳过。\n是否继续生成？`)) return
      }
    }

    // Validate areaCount matches template
    const selectedTemplate = templates.find(t => t.id === selectedTemplateId)
    if (selectedTemplate) {
      const templateAreaCount = (selectedTemplate.printAreas || []).length
      if (templateAreaCount > 0 && selectedFolder.areaCount !== templateAreaCount) {
        alert(`文件夹的区域数量(${selectedFolder.areaCount})与模板的印花区域数量(${templateAreaCount})不匹配。\n请先调整文件夹或模板设置。`)
        return
      }
    }

    // Warn if mockups already exist
    if (selectedFolder.mockups && selectedFolder.mockups.length > 0) {
      if (!confirm(`当前文件夹已有 ${selectedFolder.mockups.length} 组套图结果。\n重新生成将替换所有已有结果，确定继续吗？`)) {
        return
      }
    }

    setIsGenerating(true)

    try {
      const data = await apiRequest(`/folders/${selectedFolder.id}/generate-mockups`, {
        method: 'POST',
        data: {
          templateId: selectedTemplateId
        }
      })
      console.log('套图任务创建成功:', data)
      alert('套图任务已创建！\n\n请切换到"任务进度"标签页查看实时状态。')
      window.location.href = '/#tasks'
    } catch (error) {
      console.error('创建套图任务失败:', error)
      const errMsg = error.message || '创建任务失败'
      alert('创建任务失败：' + errMsg)
    } finally {
      setIsGenerating(false)
    }
  }

  const handleCopyrightCheck = async () => {
    if (copyrightSubmittingRef.current) return
    if (!selectedFolder || !selectedFolder.id) {
      alert('请先选择一个文件夹')
      return
    }

    if (!selectedFolder.images || selectedFolder.images.length === 0) {
      alert('文件夹中没有图片')
      return
    }

    copyrightSubmittingRef.current = true
    setIsCheckingCopyright(true)

    try {
      const { taskId } = await apiStartCopyrightCheckTask(selectedFolder.id)
      window.location.href = '/#tasks'
    } catch (error) {
      console.error('创建侵权检测任务失败:', error)
      alert('创建检测任务失败：' + (error.message || '未知错误'))
    } finally {
      copyrightSubmittingRef.current = false
      setIsCheckingCopyright(false)
    }
  }

  const handleRecheckCopyright = async (fileName) => {
    if (!selectedFolder || !selectedFolder.id) return

    setRecheckingImage(fileName)

    try {
      const data = await apiCopyrightCheckSingle(selectedFolder.id, fileName)
      
      setSelectedFolder(prev => ({
        ...prev,
        images: prev.images.map(img => {
          if (img.name === fileName) {
            return {
              ...img,
              copyrightCheck: {
                riskLevel: data.riskLevel,
                reason: data.reason,
                suggestion: data.suggestion,
                checkedAt: new Date().toISOString()
              }
            }
          }
          return img
        })
      }))
    } catch (error) {
      console.error('重新检测失败:', error)
      alert('重新检测失败：' + (error.message || '未知错误'))
    } finally {
      setRecheckingImage(null)
    }
  }

  const getValidImageGroups = () => {
    if (!selectedFolder?.images || !Array.isArray(selectedFolder.images)) return []

    const groups = {}
    selectedFolder.images.forEach(img => {
      if (!img?.name) return
      const match = img.name.match(/^(.+)-(\d{1,2})\.\w+$/)
      if (match) {
        const baseName = match[1]
        const areaNum = parseInt(match[2])
        if (!groups[baseName]) {
          groups[baseName] = {}
        }
        groups[baseName][areaNum] = img.name
      }
    })

    const areaCount = parseInt(selectedFolder.areaCount) || 1
    
    return Object.keys(groups).filter(baseName => {
      const group = groups[baseName]
      for (let i = 1; i <= areaCount; i++) {
        if (!group[i]) return false
      }
      return true
    })
  }

  const filteredFolders = folders.filter(folder => 
    folder.name.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const getTemplateName = (templateId) => {
    const template = templates.find(t => t.id === templateId)
    return template?.name || '未知模板'
  }

  const getRiskLevelInfo = (riskLevel) => {
    switch (riskLevel) {
      case 'high':
        return { icon: AlertTriangle, color: 'bg-red-500', text: '高风险', textColor: 'text-red-600', bgColor: 'bg-red-50' }
      case 'medium':
        return { icon: AlertTriangle, color: 'bg-orange-500', text: '中风险', textColor: 'text-orange-600', bgColor: 'bg-orange-50' }
      case 'low':
        return { icon: CheckCircle, color: 'bg-green-500', text: '安全', textColor: 'text-green-600', bgColor: 'bg-green-50' }
      case 'unknown':
        return { icon: HelpCircle, color: 'bg-blue-500', text: '未知', textColor: 'text-blue-600', bgColor: 'bg-blue-50' }
      default:
        return { icon: Shield, color: 'bg-gray-400', text: '未检测', textColor: 'text-gray-600', bgColor: 'bg-gray-50' }
    }
  }

  if (selectedFolder) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <button 
            onClick={handleBack} 
            className="flex items-center space-x-2 text-blue-600 hover:text-blue-700"
          >
            <ChevronLeft className="w-5 h-5" />
            <span>返回文件夹列表</span>
          </button>
          <div className="flex items-center space-x-4">
            <button
              onClick={handleCopyrightCheck}
              disabled={isCheckingCopyright}
              className="flex items-center space-x-2 px-5 py-2.5 bg-gradient-to-r from-orange-500 to-red-500 text-white rounded-lg hover:from-orange-600 hover:to-red-600 transition-all shadow-md disabled:opacity-50"
            >
              <Shield className="w-5 h-5" />
              <span>{isCheckingCopyright ? '检测中...' : '批量侵权检测'}</span>
            </button>
            <button
              onClick={handleGenerateMockups}
              disabled={isGenerating}
              className="flex items-center space-x-2 px-5 py-2.5 bg-gradient-to-r from-blue-500 to-purple-600 text-white rounded-lg hover:from-blue-600 hover:to-purple-700 transition-all shadow-md disabled:opacity-50"
            >
              <Wand2 className="w-5 h-5" />
              <span>{isGenerating ? '生成中...' : '批量套图'}</span>
            </button>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-xl font-bold text-gray-900">{selectedFolder.name}</h2>
                  <p className="text-gray-500 mt-1">
                    贴图区域数: {selectedFolder.areaCount} | 
                    图片数: {selectedFolder.images?.length || 0}
                  </p>
                </div>
              </div>

              <div className="mb-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
                <label className="block text-sm font-medium text-blue-800 mb-2">选择模板</label>
                <select
                  value={selectedTemplateId}
                  onChange={(e) => setSelectedTemplateId(e.target.value)}
                  className="w-full px-4 py-2.5 border border-blue-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
                >
                  <option value="">请选择模板</option>
                  {templates.map(template => {
                    const detailCount = (template.colors || []).reduce((sum, c) => sum + (c.detailImages ? c.detailImages.length : 0), 0);
                    return (
                      <option key={template.id} value={template.id}>
                        {template.name} ({template.printAreas?.length || 0}个区域) {detailCount > 0 && `+${detailCount}张细节图`}
                      </option>
                    );
                  })}
                </select>
                <p className="text-xs text-blue-600 mt-1">
                  选择一个模板，套图时将使用该模板的印花区域设置和细节图配置
                </p>
              </div>

          <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-blue-500 transition-colors cursor-pointer"
            onClick={() => { if (!uploading) fileInputRef.current?.click(); }}
            style={{ opacity: uploading ? 0.6 : 1 }}>
            {uploading ? (
              <div>
                <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  {uploadProgress === 100 ? (
                    <CheckCircle2 className="w-8 h-8 text-green-500" />
                  ) : (
                    <Upload className="w-8 h-8 text-blue-500" />
                  )}
                </div>
                <p className="text-gray-900 font-medium mb-1">
                  {uploadProgress === 100 ? '上传完成!' : '正在上传...'}
                </p>
                <p className="text-gray-500 text-sm mb-4">
                  {uploadProgress}%
                </p>
                <div className="w-full max-w-md mx-auto bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
              </div>
            ) : (
              <div>
                <FolderOpen className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                <p className="text-gray-700 font-medium">点击上传图案文件</p>
                <p className="text-gray-500 text-sm mt-1">支持上传整个文件夹或按住 Ctrl 多选</p>
                <p className="text-gray-400 text-xs mt-2">
                  命名规则：名称-区域编号.png<br/>
                  例如：0001-1.png（区域1）、0001-2.png（区域2）
                </p>
              </div>
            )}
          </div>

          <input
            ref={fileInputRef}
            type="file"
            multiple
            directory="true"
            webkitdirectory="true"
            accept="image/*"
            className="hidden"
            onChange={handleUpload}
          />

          {selectedFolder.images && selectedFolder.images.length > 0 && (
            <div className="mt-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-gray-900">已上传图片</h3>
                <div className="text-sm text-gray-500">
                  找到 <span className="font-bold text-green-600">{getValidImageGroups().length}</span> 个有效图片组
                </div>
              </div>

              {(() => {
                const groups = {}
                selectedFolder.images.forEach(img => {
                  if (!img?.name || !img?.path) return
                  const match = img.name.match(/^(.+)-(\d{1,2})\.\w+$/)
                  if (match) {
                    const baseName = match[1]
                    const areaNum = parseInt(match[2])
                    if (!groups[baseName]) {
                      groups[baseName] = []
                    }
                    groups[baseName].push({ ...img, areaNum, isValid: areaNum <= selectedFolder.areaCount })
                  }
                })

                const unmatchedImages = selectedFolder.images.filter(img => {
                  if (!img?.name) return false
                  const match = img.name.match(/^(.+)-(\d{1,2})\.\w+$/)
                  return !match || parseInt(match[2]) > selectedFolder.areaCount
                })

                const sortedGroups = Object.keys(groups).sort()

                return (
                  <div className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                      {sortedGroups.map(groupName => (
                        <div 
                          key={groupName} 
                          className="bg-white rounded-xl border border-gray-200 p-4 hover:border-blue-300 transition-colors"
                        >
                          <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center space-x-2">
                              <span className="px-2 py-1 bg-blue-100 text-blue-700 text-xs font-medium rounded-full">
                                {groupName}
                              </span>
                              <span className="text-xs text-gray-500">
                                {groups[groupName].length} 区域
                              </span>
                            </div>
                            {groups[groupName].every(g => g.isValid) ? (
                              <CheckCircle2 className="w-4 h-4 text-green-500" />
                            ) : (
                              <span className="text-yellow-500 text-xs">缺</span>
                            )}
                          </div>
                          <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${selectedFolder.areaCount}, 1fr)` }}>
                            {Array.from({ length: selectedFolder.areaCount }, (_, i) => {
                              const areaNum = i + 1
                              const img = groups[groupName].find(g => g.areaNum === areaNum)
                              if (img) {
                                const riskInfo = getRiskLevelInfo(img.copyrightCheck?.riskLevel)
                                const RiskIcon = riskInfo.icon
                                return (
                                  <div key={areaNum} className="relative bg-gray-50 rounded-lg overflow-hidden group">
                                    <img
                                      src={getImageUrl(img.path)}
                                      alt={img.name}
                                      className="w-full aspect-square object-contain p-1 max-h-48"
                                    />
                                    <div className={`absolute top-1 left-1 px-1 py-0.5 text-white text-xs rounded ${
                                      img.isValid ? 'bg-green-500' : 'bg-yellow-500'
                                    }`}>
                                      {areaNum}
                                    </div>
                                    <button
                                      onClick={() => handleDeleteImage(img.name)}
                                      className="absolute top-1 right-1 p-1 bg-white rounded shadow-sm opacity-0 group-hover:opacity-100 hover:bg-red-50 transition-all"
                                    >
                                      <X className="w-3 h-3 text-red-500" />
                                    </button>
                                    <div className="absolute bottom-1 right-1 flex items-center space-x-1">
                                      <div 
                                        className={`flex items-center space-x-1 px-1.5 py-0.5 rounded text-xs ${riskInfo.bgColor} ${riskInfo.textColor} cursor-pointer`}
                                        onClick={() => {
                                          setSelectedImageDetail({
                                            name: img.name,
                                            path: img.path,
                                            copyrightCheck: img.copyrightCheck
                                          })
                                          setShowCopyrightModal(true)
                                        }}
                                      >
                                        <RiskIcon className="w-3 h-3" />
                                        <span>{riskInfo.text}</span>
                                      </div>
                                      {img.copyrightCheck && (
                                        <button
                                          onClick={() => handleRecheckCopyright(img.name)}
                                          disabled={recheckingImage === img.name || isCheckingCopyright}
                                          className="p-1 bg-blue-500 rounded shadow-sm hover:bg-blue-600 transition-all disabled:opacity-50"
                                          title="重新检测"
                                        >
                                          {recheckingImage === img.name ? (
                                            <Loader2 className="w-3 h-3 text-white animate-spin" />
                                          ) : (
                                            <RefreshCw className="w-3 h-3 text-white" />
                                          )}
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                )
                              }
                              return (
                                <div key={areaNum} className="bg-gray-100 rounded-lg border-2 border-dashed border-gray-300 flex items-center justify-center text-gray-400 text-xs aspect-square">
                                  {areaNum}缺失
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                    
                    {unmatchedImages.length > 0 && (
                      <div className="bg-yellow-50 rounded-xl border border-yellow-200 p-4">
                        <div className="flex items-center space-x-2 mb-3">
                          <span className="px-2 py-1 bg-yellow-100 text-yellow-700 text-xs font-medium rounded-full">
                            未匹配图片
                          </span>
                          <span className="text-xs text-gray-500">共 {unmatchedImages.length} 张</span>
                        </div>
                        <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-6 gap-3">
                          {unmatchedImages.map(img => {
                            const riskInfo = getRiskLevelInfo(img.copyrightCheck?.riskLevel)
                            const RiskIcon = riskInfo.icon
                            return (
                              <div key={img.name} className="relative bg-gray-50 rounded-lg overflow-hidden group">
                                <img
                                  src={getImageUrl(img.path)}
                                  alt={img.name}
                                  className="w-full aspect-square object-contain p-1 max-h-28"
                                />
                                <button
                                  onClick={() => handleDeleteImage(img.name)}
                                  className="absolute top-1 right-1 p-1 bg-white rounded shadow-sm opacity-0 group-hover:opacity-100 hover:bg-red-50 transition-all"
                                >
                                  <X className="w-3 h-3 text-red-500" />
                                </button>
                                <div className="absolute bottom-0 left-0 right-0 bg-black bg-opacity-60 p-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                  <p className="text-white text-xs truncate">{img.name}</p>
                                </div>
                                <div 
                                  className={`absolute bottom-1 right-1 flex items-center space-x-1 px-1.5 py-0.5 rounded text-xs ${riskInfo.bgColor} ${riskInfo.textColor} cursor-pointer`}
                                  onClick={() => {
                                    setSelectedImageDetail({
                                      name: img.name,
                                      path: img.path,
                                      copyrightCheck: img.copyrightCheck
                                    })
                                    setShowCopyrightModal(true)
                                  }}
                                >
                                  <RiskIcon className="w-3 h-3" />
                                  <span>{riskInfo.text}</span>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })()}
            </div>
          )}

          {selectedFolder.images && selectedFolder.images.length === 0 && (
            <div className="mt-6 text-center py-8 text-gray-500">
              <ImageIcon className="w-12 h-12 mx-auto mb-3 text-gray-300" />
              <p>暂无图片，请上传图案文件</p>
            </div>
          )}
        </div>

        {showCopyrightModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={() => setShowCopyrightModal(false)}>
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4 p-6" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-semibold text-gray-900">侵权检测结果</h3>
                <button onClick={() => setShowCopyrightModal(false)} className="text-gray-400 hover:text-gray-600">
                  <X className="w-5 h-5" />
                </button>
              </div>

              {selectedImageDetail ? (
                <div className="space-y-4">
                  <div className="flex items-center space-x-4">
                    <img
                      src={getImageUrl(selectedImageDetail.path)}
                      alt={selectedImageDetail.name}
                      className="w-24 h-24 object-contain rounded-lg bg-gray-100"
                    />
                    <div>
                      <p className="font-medium text-gray-900">{selectedImageDetail.name}</p>
                      {selectedImageDetail.copyrightCheck?.riskLevel && (
                        <div className="flex items-center space-x-2 mt-2">
                          {(() => {
                            const riskInfo = getRiskLevelInfo(selectedImageDetail.copyrightCheck.riskLevel)
                            const RiskIcon = riskInfo.icon
                            return (
                              <span className={`flex items-center space-x-1 px-2 py-1 rounded text-sm ${riskInfo.bgColor} ${riskInfo.textColor}`}>
                                <RiskIcon className="w-4 h-4" />
                                <span>{riskInfo.text}</span>
                              </span>
                            )
                          })()}
                        </div>
                      )}
                    </div>
                  </div>

                  {selectedImageDetail.copyrightCheck && (
                    <div className="space-y-3">
                      {selectedImageDetail.copyrightCheck.reason && (
                        <div className="bg-gray-50 rounded-lg p-4">
                          <p className="text-sm font-medium text-gray-700 mb-1">风险理由</p>
                          <p className="text-sm text-gray-600">{selectedImageDetail.copyrightCheck.reason}</p>
                        </div>
                      )}
                      {selectedImageDetail.copyrightCheck.suggestion && (
                        <div className="bg-blue-50 rounded-lg p-4">
                          <p className="text-sm font-medium text-blue-700 mb-1">使用建议</p>
                          <p className="text-sm text-blue-600">{selectedImageDetail.copyrightCheck.suggestion}</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="bg-blue-50 rounded-lg p-4">
                    <div className="flex items-center space-x-2 mb-3">
                      <Shield className="w-5 h-5 text-blue-600" />
                      <span className="font-medium text-blue-800">检测结果汇总</span>
                    </div>
                    <p className="text-sm text-blue-700">批量侵权检测已完成！</p>
                    <p className="text-sm text-blue-600 mt-2">点击图片右下角的风险标识查看详细结果。</p>
                  </div>

                  <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                    <div className="flex items-start space-x-2">
                      <AlertTriangle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
                      <p className="text-sm text-yellow-800">
                        <strong>免责声明：</strong>侵权检测结果仅供参考，不能作为法律依据。
                        请结合专业法律意见进行最终判断。
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">图案库</h2>
          <p className="text-gray-500 mt-1">管理图案文件夹，支持批量上传和套图生成</p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center space-x-2 px-5 py-2.5 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors shadow-md"
        >
          <Plus className="w-5 h-5" />
          <span>新建文件夹</span>
        </button>
      </div>

      {/* 二级 Tab 切换 */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200">
        <div className="border-b border-gray-200">
          <div className="flex space-x-6 px-4">
            <button
              onClick={() => setActiveSubTab('images')}
              className={`flex items-center space-x-2 px-3 py-3 border-b-2 font-medium transition-colors ${
                activeSubTab === 'images'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <FolderOpen className="w-4 h-4" />
              <span>文件夹</span>
            </button>
            <button
              onClick={() => setActiveSubTab('rename')}
              className={`flex items-center space-x-2 px-3 py-3 border-b-2 font-medium transition-colors ${
                activeSubTab === 'rename'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <FileText className="w-4 h-4" />
              <span>文件名整理</span>
            </button>
          </div>
        </div>

        {activeSubTab === 'images' && (
          <div className="p-4 space-y-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder="搜索文件夹..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-gray-50"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {filteredFolders.map(folder => (
          <div
            key={folder.id}
            className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden hover:shadow-md transition-shadow group cursor-pointer"
            onClick={() => handleSelectFolder(folder)}
          >
            <div className="p-5">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center space-x-3">
                  <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center">
                    <FolderOpen className="w-6 h-6 text-blue-600" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900">{folder.name}</h3>
                    <p className="text-sm text-gray-500">{getTemplateName(folder.templateId)}</p>
                  </div>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    handleDeleteFolder(folder.id)
                  }}
                  className="p-2 hover:bg-red-50 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <Trash2 className="w-4 h-4 text-red-500" />
                </button>
              </div>
              
              <div className="flex items-center justify-between text-sm text-gray-500">
                <div className="flex items-center space-x-4">
                  <span>区域: {folder.areaCount}</span>
                  <span>图片: {folder.images?.length || 0}</span>
                  <span>套图: {folder.mockups?.length || 0}</span>
                </div>
                <ChevronRight className="w-5 h-5 text-gray-400" />
              </div>

              {folder.mockups && folder.mockups.length > 0 && folder.mockups[0]?.preview && (
                <div className="mt-3 pt-3 border-t border-gray-100">
                  <div className="flex -space-x-2">
                    {folder.mockups.slice(0, 3).map((mockup, index) => (
                      <img
                        key={index}
                        src={getImageUrl(mockup.preview)}
                        alt={mockup.groupName}
                        className="w-12 h-12 rounded-lg border-2 border-white object-contain"
                      />
                    ))}
                    {folder.mockups.length > 3 && (
                      <div className="w-12 h-12 rounded-lg border-2 border-white bg-gray-100 flex items-center justify-center text-gray-500 text-sm font-medium">
                        +{folder.mockups.length - 3}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {filteredFolders.length === 0 && (
        <div className="text-center py-16 bg-white rounded-xl border border-gray-200">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <FolderOpen className="w-8 h-8 text-gray-400" />
          </div>
          <h3 className="text-lg font-medium text-gray-900">暂无文件夹</h3>
          <p className="text-gray-500 mt-2">点击上方按钮新建图案文件夹</p>
        </div>
      )}
          </div>
        )}

        {activeSubTab === 'rename' && (
          <div className="p-4">
            <FileRenameTool />
          </div>
        )}
      </div>

      {showCreateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-lg w-full">
            <div className="p-4 border-b border-gray-200 flex items-center justify-between">
              <h3 className="text-lg font-semibold">新建文件夹</h3>
              <button onClick={() => setShowCreateModal(false)} className="p-2 hover:bg-gray-100 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <form onSubmit={(e) => { e.preventDefault(); handleCreateFolder(); }} className="p-6">
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">文件夹名称</label>
                  <input
                    type="text"
                    value={newFolder.name}
                    onChange={(e) => setNewFolder({ ...newFolder, name: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    placeholder="输入文件夹名称"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">贴图区域数量</label>
                  <input
                    type="number"
                    min="1"
                    max="10"
                    value={newFolder.areaCount}
                    onChange={(e) => setNewFolder({ ...newFolder, areaCount: parseInt(e.target.value) || 1 })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    图片命名规则：名称-区域编号.png<br/>
                    例如：0001-1.png（区域1）、0001-2.png（区域2）
                  </p>
                </div>

                <div className="pt-4 border-t border-gray-200">
                  <button
                    type="submit"
                    className="w-full px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
                  >
                    创建文件夹
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default PatternManager