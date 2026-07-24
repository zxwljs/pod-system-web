import { useState, useEffect } from 'react'
import { LayoutGrid, FolderOpen, ImagePlus, Clock, FlaskConical, Edit3, Download, Info, BookOpen, ArrowUpCircle, Settings, Copy, Check, Wrench } from 'lucide-react'
import TemplateManager from './components/TemplateManagerV2'
import TemplateDesigner from './components/TemplateEditorV2'
import PatternManager from './components/PatternManager'
import MockupResult from './components/MockupResult'
import TaskProgress from './components/TaskProgress'
import ConnectionStatus from './components/ConnectionStatus'
import SettingsPage from './components/Settings'
import ToolsPage from './components/ToolsPage'
import { useLatestVersion } from './hooks/useLatestVersion'

function App() {
  const { latestVersion, latestRelease, loading } = useLatestVersion()

  const [activeTab, setActiveTab] = useState('intro')
  const [introSubTab, setIntroSubTab] = useState('about')
  const [toolsSub, setToolsSub] = useState(null)
  const [copiedItem, setCopiedItem] = useState(null)
  const [showQr, setShowQr] = useState(false)

  useEffect(() => {
    const TABS = ['intro', 'templates', 'templates-v2', 'patterns', 'tools', 'results', 'tasks', 'designer', 'settings']
    const updateTab = () => {
      const raw = window.location.hash.slice(1).split('?')[0]
      const parts = raw.split('/')
      const root = parts[0]
      if (root && TABS.includes(root)) {
        setActiveTab(root)
        setToolsSub(parts[1] || null)
      }
    }

    updateTab()
    window.addEventListener('hashchange', updateTab)

    return () => window.removeEventListener('hashchange', updateTab)
  }, [])

  const tabs = [
    { id: 'intro', label: '介绍', icon: FlaskConical },
    { id: 'templates', label: '模板管理', icon: LayoutGrid },
    { id: 'patterns', label: '图案库', icon: FolderOpen },
    { id: 'tools', label: '工具箱', icon: Wrench },
    { id: 'tasks', label: '任务进度', icon: Clock },
    { id: 'results', label: '套图结果', icon: ImagePlus },
    { id: 'settings', label: '设置', icon: Settings },
  ]

  if (activeTab === 'designer') {
    return <TemplateDesigner />
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-xl flex items-center justify-center">
                <ImagePlus className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-gray-900">叮当跨境ERP</h1>
                <p className="text-sm text-gray-500">@ddddnet.cn</p>
              </div>
            </div>
            <ConnectionStatus onNavigateToDownload={() => { setActiveTab('intro'); setIntroSubTab('download'); }} />
          </div>
        </div>
      </header>

      <nav className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex space-x-8">
            {tabs.map(tab => {
              const Icon = tab.icon
              const isActive = activeTab === tab.id
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center space-x-2 px-4 py-4 border-b-2 font-medium transition-colors ${
                    isActive
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  <Icon className="w-5 h-5" />
                  <span>{tab.label}</span>
                </button>
              )
            })}
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {activeTab === 'intro' && (
          <div className="bg-white rounded-xl shadow-sm">
            <div className="border-b border-gray-200">
              <div className="flex space-x-8">
                {[
                  { id: 'about', label: '关于我们', icon: Info },
                  { id: 'download', label: '下载客户端', icon: Download },
                  { id: 'tutorial', label: '使用教程', icon: BookOpen },
                ].map(subTab => {
                  const Icon = subTab.icon
                  const isActive = introSubTab === subTab.id
                  return (
                    <button
                      key={subTab.id}
                      onClick={() => setIntroSubTab(subTab.id)}
                      className={`flex items-center space-x-2 px-4 py-4 border-b-2 font-medium transition-colors ${
                        isActive
                          ? 'border-blue-500 text-blue-600'
                          : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                      }`}
                    >
                      <Icon className="w-5 h-5" />
                      <span>{subTab.label}</span>
                    </button>
                  )
                })}
              </div>
            </div>
            <div className="p-8">
              {introSubTab === 'about' && (
                <div className="space-y-6">
                  <h2 className="text-2xl font-bold text-gray-900">叮当跨境ERP</h2>
                  <p className="text-gray-600 leading-relaxed">
                    叮当跨境ERP是一款专为跨境电商卖家打造的智能套图系统，帮助您快速生成高质量的产品图片，提升商品转化率。
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="bg-blue-50 rounded-xl p-6">
                      <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center mb-4">
                        <ImagePlus className="w-6 h-6 text-blue-600" />
                      </div>
                      <h3 className="font-semibold text-gray-900 mb-2">智能套图</h3>
                      <p className="text-sm text-gray-600">支持多SKU、多颜色、多细节图批量套图</p>
                    </div>
                    <div className="bg-green-50 rounded-xl p-6">
                      <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center mb-4">
                        <LayoutGrid className="w-6 h-6 text-green-600" />
                      </div>
                      <h3 className="font-semibold text-gray-900 mb-2">模板管理</h3>
                      <p className="text-sm text-gray-600">灵活的模板设计器，自定义印花区域</p>
                    </div>
                    <div className="bg-purple-50 rounded-xl p-6">
                      <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center mb-4">
                        <Clock className="w-6 h-6 text-purple-600" />
                      </div>
                      <h3 className="font-semibold text-gray-900 mb-2">实时进度</h3>
                      <p className="text-sm text-gray-600">实时查看套图任务进度，支持批量下载</p>
                    </div>
                  </div>
                  <div className="bg-gradient-to-r from-blue-50 to-purple-100 rounded-xl p-8">
                    <h3 className="text-xl font-bold mb-2 text-gray-900">联系我们</h3>
                    <p className="text-gray-500 text-sm mb-4">有任何问题或建议，欢迎随时联系我们</p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="flex items-center justify-between bg-white rounded-lg px-6 py-4 shadow-sm border border-gray-100">
                        <div className="flex items-center space-x-4">
                          <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                            <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                            </svg>
                          </div>
                          <div>
                            <p className="text-xs text-gray-500">联系邮箱</p>
                            <p className="text-lg font-semibold text-gray-900">xuan@ddddnet.cn</p>
                          </div>
                        </div>
                        <button
                          onClick={() => { navigator.clipboard.writeText('xuan@ddddnet.cn'); setCopiedItem('email'); setTimeout(() => setCopiedItem(null), 2000); }}
                          className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                          title="复制邮箱"
                        >
                          {copiedItem === 'email' ? (
                            <Check className="w-5 h-5 text-green-600" />
                          ) : (
                            <Copy className="w-5 h-5 text-gray-400" />
                          )}
                        </button>
                      </div>
                      <div className="flex items-center justify-between bg-white rounded-lg px-6 py-4 shadow-sm border border-gray-100">
                        <div className="flex items-center space-x-4">
                          <div className="w-12 h-12 bg-green-500 rounded-lg flex items-center justify-center">
                            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                            </svg>
                          </div>
                          <div>
                            <p className="text-xs text-gray-500">微信号</p>
                            <p className="text-lg font-semibold text-gray-900">Zenooon</p>
                          </div>
                        </div>
                        <button
                          onClick={() => { navigator.clipboard.writeText('Zenooon'); setCopiedItem('wechat'); setTimeout(() => setCopiedItem(null), 2000); }}
                          className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                          title="复制微信号"
                        >
                          {copiedItem === 'wechat' ? (
                            <Check className="w-5 h-5 text-green-600" />
                          ) : (
                            <Copy className="w-5 h-5 text-gray-400" />
                          )}
                        </button>
                      </div>

                      {/* 二维码模组：真实微信群二维码图片，链接暂为 # */}
                      <div className="flex flex-col items-center justify-center bg-white rounded-lg px-6 py-8 shadow-sm border border-gray-100 md:col-span-2">
                        <div
                          className="w-40 h-40 rounded-lg overflow-hidden mb-4 cursor-pointer hover:opacity-90 transition-opacity"
                          onClick={() => setShowQr(true)}
                          title="点击放大二维码"
                        >
                          <img src="/qrcode.jpg" alt="微信群二维码" className="w-full h-full object-contain" />
                        </div>
                        <p className="text-sm text-gray-500 mb-1">扫码进群</p>
                        <a
                          href="#"
                          onClick={(e) => { e.preventDefault(); setShowQr(true); }}
                          className="text-sm text-purple-600 hover:text-purple-700 font-medium transition-colors cursor-pointer"
                          title="点击放大二维码，扫码加入微信交流群"
                        >
                          加入微信交流群
                        </a>
                      </div>
                    </div>
                  </div>
                </div>
              )}
              {introSubTab === 'download' && (
                <div className="space-y-6">
                  <h2 className="text-2xl font-bold text-gray-900">下载客户端</h2>
                  <p className="text-gray-600">
                    请先下载并运行本地客户端，然后前端会自动连接进行套图操作。
                  </p>
                  <div className="bg-gradient-to-r from-blue-500 to-purple-600 rounded-xl p-8 text-white">
                    <div className="flex items-center space-x-6">
                      <div className="w-16 h-16 bg-white/20 rounded-xl flex items-center justify-center">
                        <Download className="w-8 h-8" />
                      </div>
                      <div className="flex-1">
                        <h3 className="text-xl font-bold mb-2">叮当跨境ERP客户端 v{loading ? '...' : latestVersion || '1.0.0'}</h3>
                        <p className="text-white/80 text-sm mb-2">适用于 Windows 10/11 64位系统</p>
                        {latestRelease && latestRelease.published_at && (
                          <p className="text-white/60 text-xs mb-4">发布时间: {new Date(latestRelease.published_at).toLocaleDateString('zh-CN')}</p>
                        )}
                        <div className="flex flex-wrap gap-3">
                          <a
                            href="https://gcn2ovxcjfar.feishu.cn/docx/F17dd1eLeoDyKpxHZxHcARf3n2b?from=from_copylink"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center space-x-2 bg-blue-50 text-blue-600 px-4 py-3 rounded-lg font-medium hover:bg-blue-100 transition-colors text-sm"
                          >
                            <Download className="w-4 h-4" />
                            <span>飞书文档下载</span>
                          </a>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="bg-gray-50 rounded-xl p-6">
                    <h3 className="font-semibold text-gray-900 mb-4">使用说明</h3>
                    <ol className="space-y-3 text-gray-600">
                      <li className="flex items-start">
                        <span className="w-6 h-6 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center text-sm font-medium mr-3 flex-shrink-0">1</span>
                        <span>下载客户端程序</span>
                      </li>
                      <li className="flex items-start">
                        <span className="w-6 h-6 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center text-sm font-medium mr-3 flex-shrink-0">2</span>
                        <span>双击运行 <code className="bg-gray-200 px-2 py-0.5 rounded text-sm">.exe</code>后缀的客户端程序</span>
                      </li>
                      <li className="flex items-start">
                        <span className="w-6 h-6 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center text-sm font-medium mr-3 flex-shrink-0">3</span>
                        <span>浏览器访问前端页面，系统会自动检测并连接本地客户端</span>
                      </li>
                      <li className="flex items-start">
                        <span className="w-6 h-6 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center text-sm font-medium mr-3 flex-shrink-0">4</span>
                        <span>连接成功后即可使用套图功能</span>
                      </li>
                    </ol>
                  </div>
                  <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4">
                    <p className="text-yellow-800 text-sm">
                      <strong>注意：</strong>客户端仅在本地运行，不会上传您的任何数据到服务器。所有图片处理均在本地完成。
                    </p>
                  </div>
                </div>
              )}
              {introSubTab === 'tutorial' && (
                <div className="space-y-6">
                  <h2 className="text-2xl font-bold text-gray-900">使用教程</h2>

                  <div className="space-y-6">
                    <div className="bg-blue-50 rounded-xl p-6">
                      <div className="flex items-start space-x-4">
                        <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
                          <span className="text-blue-600 font-bold text-lg">1</span>
                        </div>
                        <div>
                          <h3 className="font-semibold text-gray-900 mb-2">创建模板</h3>
                          <p className="text-gray-600 text-sm mb-4">在模板管理中创建新模板，上传商品主图，并设置印花区域。</p>
                          <ul className="text-sm text-gray-500 space-y-2">
                            <li>• 点击"新建模板"按钮</li>
                            <li>• 上传商品主图（支持多颜色）</li>
                            <li>• 在图片上绘制印花区域</li>
                            <li>• 设置区域名称和尺寸</li>
                          </ul>
                        </div>
                      </div>
                    </div>

                    <div className="bg-green-50 rounded-xl p-6">
                      <div className="flex items-start space-x-4">
                        <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center flex-shrink-0">
                          <span className="text-green-600 font-bold text-lg">2</span>
                        </div>
                        <div>
                          <h3 className="font-semibold text-gray-900 mb-2">上传图案</h3>
                          <p className="text-gray-600 text-sm mb-4">在图案库中创建文件夹并上传印花图案。</p>
                          <ul className="text-sm text-gray-500 space-y-2">
                            <li>• 创建新文件夹</li>
                            <li>• 批量上传印花图案</li>
                            <li>• 系统自动按区域匹配图片</li>
                            <li>• 支持预览和删除操作</li>
                          </ul>
                        </div>
                      </div>
                    </div>

                    <div className="bg-purple-50 rounded-xl p-6">
                      <div className="flex items-start space-x-4">
                        <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center flex-shrink-0">
                          <span className="text-purple-600 font-bold text-lg">3</span>
                        </div>
                        <div>
                          <h3 className="font-semibold text-gray-900 mb-2">生成套图</h3>
                          <p className="text-gray-600 text-sm mb-4">选择模板和图案文件夹，一键生成所有组合的套图。</p>
                          <ul className="text-sm text-gray-500 space-y-2">
                            <li>• 选择图案文件夹</li>
                            <li>• 选择目标模板</li>
                            <li>• 点击"生成套图"按钮</li>
                            <li>• 实时查看任务进度</li>
                          </ul>
                        </div>
                      </div>
                    </div>

                    <div className="bg-orange-50 rounded-xl p-6">
                      <div className="flex items-start space-x-4">
                        <div className="w-12 h-12 bg-orange-100 rounded-lg flex items-center justify-center flex-shrink-0">
                          <span className="text-orange-600 font-bold text-lg">4</span>
                        </div>
                        <div>
                          <h3 className="font-semibold text-gray-900 mb-2">下载结果</h3>
                          <p className="text-gray-600 text-sm mb-4">在套图结果中查看和下载生成的图片。</p>
                          <ul className="text-sm text-gray-500 space-y-2">
                            <li>• 查看生成的套图预览</li>
                            <li>• 支持单张或批量下载</li>
                            <li>• 按图案组或颜色筛选</li>
                            <li>• 删除不需要的套图</li>
                          </ul>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="bg-gray-50 rounded-xl p-6">
                    <h3 className="font-semibold text-gray-900 mb-4">技巧提示</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="bg-white rounded-lg p-4 border border-gray-200">
                        <p className="text-sm text-gray-600">
                          <strong>图片命名规则：</strong>图案图片按"编号-区域号-序号"命名，如 IT001-001-1.png
                        </p>
                      </div>
                      <div className="bg-white rounded-lg p-4 border border-gray-200">
                        <p className="text-sm text-gray-600">
                          <strong>区域匹配：</strong>系统会根据图片编号自动匹配到对应的印花区域
                        </p>
                      </div>
                      <div className="bg-white rounded-lg p-4 border border-gray-200">
                        <p className="text-sm text-gray-600">
                          <strong>细节图：</strong>支持为每个颜色添加多个细节图，展示不同角度
                        </p>
                      </div>
                      <div className="bg-white rounded-lg p-4 border border-gray-200">
                        <p className="text-sm text-gray-600">
                          <strong>填充模式：</strong>选择"适应"保持比例，选择"裁切"填满区域
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
        {(activeTab === 'templates' || activeTab === 'templates-v2') && <TemplateManager />}
        {activeTab === 'patterns' && <PatternManager />}
        {activeTab === 'tools' && <ToolsPage subTool={toolsSub} />}
        {activeTab === 'tasks' && <TaskProgress />}
        {activeTab === 'results' && <MockupResult />}
        {activeTab === 'settings' && <SettingsPage />}
      </main>

      {/* 二维码放大弹窗 */}
      {showQr && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setShowQr(false)}
        >
          <div
            className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-gray-900">扫码加入微信群</h3>
              <button
                onClick={() => setShowQr(false)}
                className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors text-gray-400 hover:text-gray-600"
                title="关闭"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <img src="/qrcode.jpg" alt="微信群二维码" className="w-full rounded-lg" />
            <p className="text-sm text-gray-500 mt-3 text-center">微信扫一扫，加入微信交流群</p>
          </div>
        </div>
      )}
    </div>
  )
}

export default App