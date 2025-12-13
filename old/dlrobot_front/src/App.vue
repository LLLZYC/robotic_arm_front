<template>
  <div class="app">
    <!-- 顶部导航栏 -->
    <header class="app-header">
      <div class="header-left">
        <h1 class="app-title">DLRobot Frontend</h1>
        <span class="app-subtitle">ROS机器人控制前端系统</span>
      </div>
      
      <div class="header-center">
        <div class="system-status">
          <div class="status-item">
            <span class="status-label">系统状态:</span>
            <span :class="['status-dot', systemStatusClass]"></span>
            <span class="status-text">{{ systemStatusText }}</span>
          </div>
          <div class="status-item">
            <span class="status-label">时间:</span>
            <span class="status-text">{{ currentTime }}</span>
          </div>
        </div>
      </div>
      
      <div class="header-right">
        <button @click="toggleFullscreen" class="header-btn" title="全屏">
          <span v-if="!isFullscreen">⛶</span>
          <span v-else>⛶</span>
        </button>
        <button @click="showSettings" class="header-btn" title="设置">
          ⚙️
        </button>
      </div>
    </header>
    
    <!-- 主内容区域 -->
    <main class="app-main">
      <!-- 左侧控制面板 -->      <aside class="app-sidebar left">
        <ControlPanel />
      </aside>
      
      <!-- 中间内容区域 -->
      <section class="app-content">
        <!-- 标签页切换 -->
        <div class="content-tabs">
          <button 
            :class="['tab-btn', { active: activeTab === 'map' }]"
            @click="activeTab = 'map'">
            🗺️ 地图导航
          </button>
          <button 
            :class="['tab-btn', { active: activeTab === 'cruise' }]"
            @click="activeTab = 'cruise'">
            🚗 巡航控制
          </button>
          <button 
            :class="['tab-btn', { active: activeTab === 'camera' }]"
            @click="activeTab = 'camera'">
            📷 相机图像库
          </button>
          <button 
            :class="['tab-btn', { active: activeTab === 'thermal' }]"
            @click="activeTab = 'thermal'">
            🌡️ 热成像
          </button>
          <button 
            :class="['tab-btn', { active: activeTab === 'arm' }]"
            @click="activeTab = 'arm'">
            🦾 机械臂控制
          </button>
        </div>
        
        <!-- 标签页内容 -->
        <div class="tab-content">
          <RobotMap v-show="activeTab === 'map'" />
          <CruiseControl v-show="activeTab === 'cruise'" />
          <CameraGallery v-show="activeTab === 'camera'" />
          <ThermalDisplay v-if="activeTab === 'thermal'" />
          <ArmControl v-show="activeTab === 'arm'" />
        </div>
      </section>
      
      <!-- 右侧数据监控 -->
      <aside class="app-sidebar right">
        <DataMonitor />
      </aside>
    </main>
    
    <!-- 底部状态栏 -->
    <footer class="app-footer">
      <div class="footer-left">
        <span>连接状态: </span>
        <span :class="['connection-status', mqttConnected ? 'connected' : 'disconnected']">
          {{ mqttConnected ? '已连接' : '未连接' }}
        </span>
        <span v-if="mqttConnected" class="connection-info">
          | 话题数: {{ subscribedTopics.length }} | 数据接收: {{ dataReceivedCount }}
        </span>
      </div>
      
      <div class="footer-right">
        <span>版本: v1.0.0 | 开发模式</span>
      </div>
    </footer>
    
    <!-- 设置模态框 -->
    <div v-if="showSettingsModal" class="modal-overlay" @click="hideSettings">
      <div class="modal-content" @click.stop>
        <div class="modal-header">
          <h3>系统设置</h3>
          <button @click="hideSettings" class="modal-close">×</button>
        </div>
        <div class="modal-body">
          <!-- 标签页导航 -->
          <div class="settings-tabs">
            <button 
              :class="['settings-tab', { active: settingsTab === 'connection' }]"
              @click="settingsTab = 'connection'">
              🔌 连接设置
            </button>
            <button 
              :class="['settings-tab', { active: settingsTab === 'topics' }]"
              @click="settingsTab = 'topics'">
              📡 MQTT话题
            </button>
            <button 
              :class="['settings-tab', { active: settingsTab === 'map' }]"
              @click="settingsTab = 'map'">
              🗺️ 地图设置
            </button>
            <button 
              :class="['settings-tab', { active: settingsTab === 'interface' }]"
              @click="settingsTab = 'interface'">
              🎨 界面设置
            </button>
          </div>

          <!-- 连接设置 -->
          <div v-show="settingsTab === 'connection'" class="settings-content">
            <div class="setting-group">
              <h4>连接配置</h4>
              <div class="setting-item">
                <label>MQTT代理地址:</label>
                <input v-model="settings.mqttBroker" type="text" placeholder="ws://localhost:9001" />
              </div>
              <div class="setting-item">
                <label>REST API地址:</label>
                <input v-model="settings.restApiUrl" type="text" placeholder="http://localhost:5000" />
              </div>
              <div class="setting-group">
                <h4>🌡️ 热成像配置</h4>
                <div class="setting-item">
                  <label>
                    <span class="label-icon">📡</span>
                    ESP32 IP地址:
                  </label>
                  <input 
                    v-model="settings.thermalIp" 
                    type="text" 
                    placeholder="192.168.31.166" />
                </div>
              </div>
              <div class="setting-hint">
                💡 提示: 修改连接地址后需要重新连接才能生效
              </div>
            </div>
          </div>

          <!-- MQTT话题配置 -->
          <div v-show="settingsTab === 'topics'" class="settings-content">
            <div class="setting-group">
              <h4>📊 机器人状态话题</h4>
              <div class="setting-item">
                <label>
                  <span class="label-icon">📍</span>
                  机器人位姿 (左下角状态):
                </label>
                <input 
                  v-model="settings.mqttTopics.robotStatus" 
                  type="text" 
                  placeholder="/robot_pose" />
              </div>
              <div class="setting-item">
                <label>
                  <span class="label-icon">🗺️</span>
                  地图位姿 (地图中机器人):
                </label>
                <input 
                  v-model="settings.mqttTopics.robotPoseMap" 
                  type="text" 
                  placeholder="/amcl_pose" />
              </div>
              <div class="setting-item">
                <label>
                  <span class="label-icon">🚦</span>
                  导航状态:
                </label>
                <input 
                  v-model="settings.mqttTopics.navigationStatus" 
                  type="text" 
                  placeholder="/move_base/status" />
              </div>
            </div>

            <div class="setting-group">
              <h4>📡 传感器数据话题</h4>
              <div class="setting-item">
                <label>
                  <span class="label-icon">📡</span>
                  激光雷达 (右上角显示):
                </label>
                <input 
                  v-model="settings.mqttTopics.laserScan" 
                  type="text" 
                  placeholder="/scan" />
              </div>
              <div class="setting-item">
                <label>
                  <span class="label-icon">📷</span>
                  相机图像:
                </label>
                <input 
                  v-model="settings.mqttTopics.cameraImage" 
                  type="text" 
                  placeholder="/camera/rgb/image_raw" />
              </div>
              <div class="setting-item">
                <label>
                  <span class="label-icon">🎥</span>
                  视频流:
                </label>
                <input 
                  v-model="settings.mqttTopics.videoStream" 
                  type="text" 
                  placeholder="/camera/rgb/image_raw" />
              </div>
            </div>

            <div class="setting-group">
              <h4>🗺️ 地图数据话题</h4>
              <div class="setting-item">
                <label>
                  <span class="label-icon">🗺️</span>
                  地图数据:
                </label>
                <input 
                  v-model="settings.mqttTopics.mapData" 
                  type="text" 
                  placeholder="/map" />
              </div>
            </div>

            <div class="setting-hint">
              💡 提示: 修改话题后需要重新订阅才能接收新话题的数据
            </div>
          </div>

          <!-- 地图设置 -->
          <div v-show="settingsTab === 'map'" class="settings-content">
            <div class="setting-group">
              <h4>地图参数</h4>
              <div class="setting-item">
                <label>地图分辨率 (m/pixel):</label>
                <input v-model="settings.mapResolution" type="number" step="0.01" />
              </div>
              <div class="setting-item">
                <label>地图原点 X (m):</label>
                <input v-model="settings.mapOriginX" type="number" step="0.1" />
              </div>
              <div class="setting-item">
                <label>地图原点 Y (m):</label>
                <input v-model="settings.mapOriginY" type="number" step="0.1" />
              </div>
              <div class="setting-item">
                <label>相机图像路径:</label>
                <input v-model="settings.cameraImagePath" type="text" placeholder="/home/dlrobot_autocontrol" />
              </div>
            </div>
          </div>

          <!-- 界面设置 -->
          <div v-show="settingsTab === 'interface'" class="settings-content">
            <div class="setting-group">
              <h4>外观设置</h4>
              <div class="setting-item">
                <label>主题:</label>
                <select v-model="settings.theme">
                  <option value="dark">深色</option>
                  <option value="light">浅色</option>
                </select>
              </div>
              <div class="setting-item">
                <label>语言:</label>
                <select v-model="settings.language">
                  <option value="zh-CN">中文</option>
                  <option value="en-US">English</option>
                </select>
              </div>
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button @click="saveSettings" class="btn-primary">保存</button>
          <button @click="hideSettings" class="btn-secondary">取消</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRobotStore } from './stores/robotStore'
import ControlPanel from './components/ControlPanel.vue'
import RobotMap from './components/RobotMap.vue'
import CruiseControl from './components/CruiseControl.vue'
import DataMonitor from './components/DataMonitor.vue'
import CameraGallery from './components/CameraGallery.vue'
import ArmControl from './components/ArmControl.vue'
import ThermalDisplay from './components/ThermalDisplay.vue'
import mqttService from './services/mqttService'

export default {
  name: 'App',
  components: {
    ControlPanel,
    RobotMap,
    CruiseControl,
    DataMonitor,
    CameraGallery,
    ArmControl,
    ThermalDisplay
  },
  
  setup() {
    const robotStore = useRobotStore()
    
    // 加载保存的配置
    robotStore.loadConfigFromLocalStorage()
    
    // 响应式数据
    const isFullscreen = ref(false)
    const showSettingsModal = ref(false)
    const currentTime = ref('')
    const dataReceivedCount = ref(0)
    const activeTab = ref('map') // 当前激活的标签页
    const settingsTab = ref('connection') // 设置模态框中的标签页
    
    // 设置数据
    const settings = ref({
      mqttBroker: robotStore.config.mqttBroker,
      restApiUrl: robotStore.config.restApiUrl,
      mapResolution: robotStore.mapData.resolution,
      mapOriginX: robotStore.mapData.origin.x,
      mapOriginY: robotStore.mapData.origin.y,
      cameraImagePath: robotStore.config.cameraImagePath,
      thermalIp: robotStore.config.thermalIp || '192.168.31.170',
      theme: 'dark',
      language: 'zh-CN',
      // MQTT话题配置
      mqttTopics: {
        robotStatus: robotStore.config.mqttTopics?.robotStatus || '/robot_pose',
        laserScan: robotStore.config.mqttTopics?.laserScan || '/scan',
        cameraImage: robotStore.config.mqttTopics?.cameraImage || '/camera/rgb/image_raw',
        videoStream: robotStore.config.mqttTopics?.videoStream || '/camera/rgb/image_raw',
        robotPoseMap: robotStore.config.mqttTopics?.robotPoseMap || '/amcl_pose',
        mapData: robotStore.config.mqttTopics?.mapData || '/map',
        navigationStatus: robotStore.config.mqttTopics?.navigationStatus || '/move_base/status'
      }
    })
    
    // 计算属性
    const mqttConnected = computed(() => robotStore.mqttConnected)
    const subscribedTopics = computed(() => robotStore.subscribedTopics)
    const navigationStatus = computed(() => robotStore.navigationStatus)
    
    const systemStatusText = computed(() => {
      if (!mqttConnected.value) return '离线'
      if (navigationStatus.value === 'navigating') return '导航中'
      if (navigationStatus.value === 'arrived') return '已到达'
      return '在线'
    })
    
    const systemStatusClass = computed(() => {
      if (!mqttConnected.value) return 'offline'
      if (navigationStatus.value === 'navigating') return 'navigating'
      if (navigationStatus.value === 'arrived') return 'arrived'
      return 'online'
    })
    
    // 方法
    const toggleFullscreen = () => {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen()
        isFullscreen.value = true
      } else {
        document.exitFullscreen()
        isFullscreen.value = false
      }
    }
    
    const showSettings = () => {
      showSettingsModal.value = true
    }
    
    const hideSettings = () => {
      showSettingsModal.value = false
    }
    
    const saveSettings = () => {
      // 更新机器人存储中的配置
      robotStore.updateConfig('mqttBroker', settings.value.mqttBroker)
      robotStore.updateConfig('restApiUrl', settings.value.restApiUrl)
      robotStore.updateConfig('cameraImagePath', settings.value.cameraImagePath)
      robotStore.updateConfig('thermalIp', settings.value.thermalIp)
      
      // 更新MQTT话题配置
      robotStore.updateConfig('mqttTopics', settings.value.mqttTopics)
      
      // 更新地图配置
      robotStore.mapData.resolution = settings.value.mapResolution
      robotStore.mapData.origin.x = settings.value.mapOriginX
      robotStore.mapData.origin.y = settings.value.mapOriginY
      
      // 应用主题
      document.documentElement.setAttribute('data-theme', settings.value.theme)
      
      // 保存到localStorage
      robotStore.saveConfigToLocalStorage()
      
      // 如果MQTT已连接，重新注册处理器和订阅话题
      if (mqttConnected.value) {
        try {
          // 取消订阅旧话题
          const oldTopics = [...subscribedTopics.value]
          oldTopics.forEach(topic => {
            mqttService.unsubscribe(topic)
          })
          
          // 重新注册处理器
          mqttService.reregisterHandlers()
          
          // 订阅新话题
          mqttService.subscribeToDefaultTopics()
          
          console.log('已重新订阅话题')
        } catch (error) {
          console.error('重新订阅话题失败:', error)
        }
      }
      
      hideSettings()
      
      const message = mqttConnected.value 
        ? '设置已保存！\n\n✅ MQTT话题配置已更新\n✅ 已重新订阅新话题'
        : '设置已保存！\n\n💡 提示：请连接MQTT以使话题配置生效'
      
      alert(message)
    }
    
    // 更新时间
    const updateTime = () => {
      const now = new Date()
      currentTime.value = now.toLocaleTimeString('zh-CN')
    }
    
    onMounted(() => {
      // 启动时间更新
      updateTime()
      const timeInterval = setInterval(updateTime, 1000)
      
      // 监听数据接收
      const unsubscribe = robotStore.$subscribe((mutation, state) => {
        if (mutation.type.includes('updateSensorData')) {
          dataReceivedCount.value++
        }
      })
      
      // 组件卸载时清理
      onUnmounted(() => {
        clearInterval(timeInterval)
        unsubscribe()
      })
    })
    
    return {
      isFullscreen,
      showSettingsModal,
      currentTime,
      dataReceivedCount,
      activeTab,
      settingsTab,
      settings,
      mqttConnected,
      subscribedTopics,
      navigationStatus,
      systemStatusText,
      systemStatusClass,
      toggleFullscreen,
      showSettings,
      hideSettings,
      saveSettings
    }
  }
}
</script>

<style>
.app {
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: #0f1419;
  color: #e8eaed;
}

.app-header {
  height: 60px;
  background: #1a202c;
  border-bottom: 1px solid #2d3748;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 20px;
  flex-shrink: 0;
}

.header-left {
  display: flex;
  flex-direction: column;
}

.app-title {
  font-size: 20px;
  font-weight: 600;
  color: #e2e8f0;
  margin: 0;
}

.app-subtitle {
  font-size: 12px;
  color: #a0aec0;
  margin-top: 2px;
}

.header-center {
  display: flex;
  align-items: center;
}

.system-status {
  display: flex;
  gap: 20px;
}

.status-item {
  display: flex;
  align-items: center;
  gap: 8px;
}

.status-label {
  font-size: 14px;
  color: #a0aec0;
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.status-dot.online {
  background: #48bb78;
  box-shadow: 0 0 5px #48bb78;
}

.status-dot.offline {
  background: #f56565;
}

.status-dot.navigating {
  background: #4299e1;
  box-shadow: 0 0 5px #4299e1;
  animation: pulse 1.5s infinite;
}

.status-dot.arrived {
  background: #ed8936;
  box-shadow: 0 0 5px #ed8936;
}

.status-text {
  font-size: 14px;
  font-weight: 600;
}

.header-right {
  display: flex;
  gap: 10px;
}

.header-btn {
  width: 40px;
  height: 40px;
  border: none;
  border-radius: 6px;
  background: #2d3748;
  color: white;
  font-size: 16px;
  cursor: pointer;
  transition: all 0.2s ease;
  display: flex;
  align-items: center;
  justify-content: center;
}

.header-btn:hover {
  background: #4a5568;
  transform: scale(1.05);
}

.app-main {
  flex: 1;
  display: flex;
  overflow: hidden;
}

.app-sidebar {
  width: 320px;
  flex-shrink: 0;
  overflow: hidden;
}

.app-sidebar.left {
  border-right: 1px solid #2d3748;
}

.app-sidebar.right {
  border-left: 1px solid #2d3748;
}

.app-content {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.content-tabs {
  display: flex;
  background: #1a202c;
  border-bottom: 1px solid #2d3748;
  padding: 0 10px;
  gap: 5px;
}

.tab-btn {
  padding: 12px 24px;
  border: none;
  background: transparent;
  color: #a0aec0;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  border-bottom: 2px solid transparent;
  transition: all 0.2s;
  position: relative;
}

.tab-btn:hover {
  color: #e2e8f0;
  background: rgba(66, 153, 225, 0.1);
}

.tab-btn.active {
  color: #4299e1;
  border-bottom-color: #4299e1;
  background: rgba(66, 153, 225, 0.1);
}

.tab-content {
  flex: 1;
  overflow: hidden;
  position: relative;
}

.app-footer {
  height: 40px;
  background: #1a202c;
  border-top: 1px solid #2d3748;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 20px;
  font-size: 12px;
  color: #a0aec0;
  flex-shrink: 0;
}

.footer-left {
  display: flex;
  align-items: center;
  gap: 10px;
}

.connection-status {
  padding: 2px 6px;
  border-radius: 3px;
  font-weight: 600;
  font-size: 11px;
}

.connection-status.connected {
  background: #48bb78;
  color: white;
}

.connection-status.disconnected {
  background: #f56565;
  color: white;
}

.connection-info {
  color: #718096;
}

/* 模态框样式 */
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  backdrop-filter: blur(5px);
}

.modal-content {
  background: #1a202c;
  border-radius: 12px;
  border: 1px solid #2d3748;
  width: 500px;
  max-width: 90vw;
  max-height: 80vh;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px;
  border-bottom: 1px solid #2d3748;
}

.modal-header h3 {
  margin: 0;
  color: #e2e8f0;
  font-size: 18px;
}

.modal-close {
  background: none;
  border: none;
  color: #a0aec0;
  font-size: 24px;
  cursor: pointer;
  width: 30px;
  height: 30px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
}

.modal-close:hover {
  background: #2d3748;
  color: #e2e8f0;
}

.modal-body {
  flex: 1;
  padding: 0;
  overflow-y: auto;
}

.settings-tabs {
  display: flex;
  border-bottom: 2px solid #2d3748;
  background: #1a202c;
  position: sticky;
  top: 0;
  z-index: 10;
}

.settings-tab {
  flex: 1;
  padding: 12px 16px;
  border: none;
  background: transparent;
  color: #a0aec0;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  border-bottom: 2px solid transparent;
  transition: all 0.2s;
  white-space: nowrap;
}

.settings-tab:hover {
  color: #e2e8f0;
  background: rgba(66, 153, 225, 0.1);
}

.settings-tab.active {
  color: #4299e1;
  border-bottom-color: #4299e1;
  background: rgba(66, 153, 225, 0.1);
}

.settings-content {
  padding: 20px;
}

.setting-group {
  margin-bottom: 25px;
}

.setting-group h4 {
  color: #e2e8f0;
  margin-bottom: 15px;
  font-size: 16px;
  border-bottom: 1px solid #2d3748;
  padding-bottom: 8px;
}

.setting-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.setting-item label {
  color: #a0aec0;
  font-size: 14px;
  min-width: 180px;
  display: flex;
  align-items: center;
  gap: 6px;
}

.label-icon {
  font-size: 16px;
}

.setting-item input,
.setting-item select {
  flex: 1;
  max-width: 280px;
  padding: 8px 12px;
  background: #4a5568;
  border: 1px solid #718096;
  border-radius: 4px;
  color: white;
  font-size: 14px;
}

.setting-item input:focus,
.setting-item select:focus {
  outline: none;
  border-color: #4299e1;
  box-shadow: 0 0 0 3px rgba(66, 153, 225, 0.1);
}

.setting-hint {
  margin-top: 15px;
  padding: 12px;
  background: rgba(66, 153, 225, 0.1);
  border-left: 3px solid #4299e1;
  border-radius: 4px;
  color: #90cdf4;
  font-size: 13px;
  line-height: 1.5;
}

.modal-footer {
  display: flex;
  gap: 10px;
  justify-content: flex-end;
  padding: 20px;
  border-top: 1px solid #2d3748;
}

.btn-primary,
.btn-secondary {
  padding: 8px 16px;
  border: none;
  border-radius: 4px;
  font-size: 14px;
  cursor: pointer;
  transition: background 0.2s;
}

.btn-primary {
  background: #4299e1;
  color: white;
}

.btn-primary:hover {
  background: #3182ce;
}

.btn-secondary {
  background: #4a5568;
  color: white;
}

.btn-secondary:hover {
  background: #718096;
}

/* 动画 */
@keyframes pulse {
  0% {
    opacity: 1;
  }
  50% {
    opacity: 0.5;
  }
  100% {
    opacity: 1;
  }
}

/* 响应式设计 */
@media (max-width: 1024px) {
  .app-sidebar {
    width: 280px;
  }
}

@media (max-width: 768px) {
  .app-sidebar {
    width: 250px;
  }
  
  .header-center {
    display: none;
  }
}

/* 滚动条样式 */
.modal-body::-webkit-scrollbar {
  width: 6px;
}

.modal-body::-webkit-scrollbar-track {
  background: #2d3748;
}

.modal-body::-webkit-scrollbar-thumb {
  background: #4a5568;
  border-radius: 3px;
}

.modal-body::-webkit-scrollbar-thumb:hover {
  background: #718096;
}
</style>