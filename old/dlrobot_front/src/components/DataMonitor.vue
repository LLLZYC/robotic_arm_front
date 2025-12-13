<template>
  <div class="data-monitor">
    <div class="monitor-header">
      <h3>数据监控面板</h3>
    </div>
    
    <!-- 传感器数据 -->
    <div class="sensor-section">
      <h4>传感器数据</h4>
      
      <!-- 激光雷达数据 -->
      <div class="sensor-card">
        <div class="sensor-header">
          <span class="sensor-title">激光雷达</span>
          <span class="sensor-status" :class="{ active: hasLaserData }">
            {{ hasLaserData ? '数据接收中' : '无数据' }}
          </span>
        </div>
        <div class="sensor-content">
          <div v-if="hasLaserData" class="laser-info">
            <div class="info-row">
              <span>数据点数:</span>
              <span>{{ laserScan.length }}</span>
            </div>
            <div class="info-row">
              <span>最近距离:</span>
              <span>{{ minDistance.toFixed(2) }} m</span>
            </div>
            <div class="info-row">
              <span>最远距离:</span>
              <span>{{ maxDistance.toFixed(2) }} m</span>
            </div>
          </div>
          <div v-else class="no-data">
            等待激光雷达数据...
          </div>
        </div>
      </div>
      
      <!-- 相机数据 -->
      <div class="sensor-card">
        <div class="sensor-header">
          <span class="sensor-title">相机图像</span>
          <span class="sensor-status" :class="{ active: hasCameraImage }">
            {{ hasCameraImage ? '图像接收中' : '无图像' }}
          </span>
        </div>
        <div class="sensor-content">
          <div v-if="hasCameraImage" class="image-preview">
            <img :src="cameraImage" alt="相机图像" class="camera-image" />
          </div>
          <div v-else class="no-data">
            等待相机图像数据...
          </div>
        </div>
      </div>
      
      <!-- 视频流 -->
      <div class="sensor-card">
        <div class="sensor-header">
          <span class="sensor-title">视频流</span>
          <span class="sensor-status" :class="{ active: hasVideoStream }">
            {{ hasVideoStream ? '流媒体接收中' : '无视频流' }}
          </span>
          <div class="stream-controls" v-if="hasVideoStream">
            <div class="zoom-controls">
              <button @click="zoomOut" class="zoom-btn" title="缩小">-</button>
              <span class="zoom-display">{{ Math.round(scaleFactor * 100) }}%</span>
              <button @click="zoomIn" class="zoom-btn" title="放大">+</button>
              <button @click="resetZoom" class="reset-btn" title="重置">重置</button>
            </div>
            <div class="preset-controls">
              <button @click="fitToScreen" class="preset-btn" title="适应屏幕">适应屏幕</button>
              <button @click="setZoom(0.5)" class="preset-btn" title="50%">50%</button>
              <button @click="setZoom(0.75)" class="preset-btn" title="75%">75%</button>
              <button @click="setZoom(1.0)" class="preset-btn" title="100%">100%</button>
            </div>
          </div>
        </div>
        <div class="sensor-content">
          <div v-if="hasVideoStream" class="video-preview">
            <!-- 视频流容器 -->
            <div class="video-container" :style="{ height: `${75 * scaleFactor}vh` }">
              <iframe 
                :src="currentStreamUrl" 
                class="iframe-stream"
                :style="{ 
                  transform: `scale(${scaleFactor})`,
                  width: `${100 / scaleFactor}%`,
                  height: `${100 / scaleFactor}%`
                }"
                frameborder="0"
                allowfullscreen
                @error="onStreamError"
              ></iframe>
            </div>
            
            <div v-if="streamError" class="stream-error">
              <p>视频流加载失败</p>
              <button @click="retryStream" class="retry-btn">重试</button>
            </div>
          </div>
          <div v-else class="no-data">
            <p>等待视频流数据...</p>
            
            <!-- 直接设置视频流URL -->
            <div class="direct-stream-setup">
              <p>或直接输入视频流URL:</p>
              <div class="url-input-group">
                <input 
                  v-model="directStreamUrl" 
                  placeholder="http://192.168.6.214:8080/stream_viewer?topic=/camera/rgb/image_raw"
                  class="url-input"
                  @keyup.enter="setDirectStream"
                />
                <button @click="setDirectStream" class="set-stream-btn">设置视频流</button>
              </div>
              <div class="quick-setup">
                <button @click="setDefaultStream" class="quick-btn">使用默认流</button>
              </div>
            </div>
            
            <div class="stream-setup" v-if="availableVideoTopics.length > 0">
              <p>检测到可用话题:</p>
              <div class="topic-list">
                <button 
                  v-for="topic in availableVideoTopics" 
                  :key="topic"
                  @click="selectVideoTopic(topic)"
                  class="topic-btn"
                >
                  {{ topic }}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
    
    <!-- 系统信息 -->
    <div class="system-section">
      <h4>系统信息</h4>
      <div class="system-info">
        <div class="info-card">
          <div class="info-title">连接统计</div>
          <div class="info-content">
            <div class="stat-item">
              <span>订阅话题数:</span>
              <span>{{ subscribedTopics.length }}</span>
            </div>
            <div class="stat-item">
              <span>数据接收:</span>
              <span>{{ dataReceivedCount }}</span>
            </div>
            <div class="stat-item">
              <span>连接时间:</span>
              <span>{{ connectionTime }}</span>
            </div>
          </div>
        </div>
        
        <div class="info-card">
          <div class="info-title">性能监控</div>
          <div class="info-content">
            <div class="stat-item">
              <span>内存使用:</span>
              <span>{{ memoryUsage }} MB</span>
            </div>
            <div class="stat-item">
              <span>FPS:</span>
              <span>{{ fps }}</span>
            </div>
            <div class="stat-item">
              <span>延迟:</span>
              <span>{{ latency }} ms</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useRobotStore } from '../stores/robotStore'
import mqttService from '../services/mqttService'
import webVideoService from '../services/webVideoService'

export default {
  name: 'DataMonitor',
  
  setup() {
    const robotStore = useRobotStore()
    const videoPlayer = ref(null)
    
    // 响应式数据
    const dataReceivedCount = ref(0)
    const connectionStartTime = ref(null)
    const fps = ref(0)
    const memoryUsage = ref(0)
    const latency = ref(0)
    const streamError = ref(false)
    const availableVideoTopics = ref([])
    const directStreamUrl = ref('')
    const scaleFactor = ref(1.0) // 缩放比例
    
    // 计算属性
    const hasLaserData = computed(() => robotStore.sensorData.laserScan.length > 0)
    const hasCameraImage = computed(() => robotStore.sensorData.cameraImage !== null)
    const hasVideoStream = computed(() => robotStore.sensorData.videoStream !== null)
    const laserScan = computed(() => robotStore.sensorData.laserScan)
    const cameraImage = computed(() => robotStore.sensorData.cameraImage)
    const videoStream = computed(() => robotStore.sensorData.videoStream)
    const videoStreamConfig = computed(() => robotStore.sensorData.videoStreamConfig)
    const subscribedTopics = computed(() => robotStore.subscribedTopics)
    const mqttConnected = computed(() => robotStore.mqttConnected)
    
    // 当前流URL
    const currentStreamUrl = computed(() => {
      if (!hasVideoStream.value) return null
      
      // 直接使用存储的URL
      return videoStream.value
    })
    
    const minDistance = computed(() => {
      if (!hasLaserData.value) return 0
      return Math.min(...laserScan.value.filter(d => d > 0))
    })
    
    const maxDistance = computed(() => {
      if (!hasLaserData.value) return 0
      return Math.max(...laserScan.value)
    })
    
    const connectionTime = computed(() => {
      if (!connectionStartTime.value) return '00:00:00'
      
      const now = new Date()
      const diff = now - connectionStartTime.value
      const hours = Math.floor(diff / 3600000)
      const minutes = Math.floor((diff % 3600000) / 60000)
      const seconds = Math.floor((diff % 60000) / 1000)
      
      return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
    })
    
    // 监听MQTT连接状态
    const updateConnectionTime = () => {
      if (mqttConnected.value && !connectionStartTime.value) {
        connectionStartTime.value = new Date()
      } else if (!mqttConnected.value) {
        connectionStartTime.value = null
      }
    }
    
    // 视频流控制方法
    const onStreamError = () => {
      streamError.value = true
      console.error('视频流加载失败')
    }
    
    const retryStream = () => {
      streamError.value = false
    }
    
    const selectVideoTopic = async (topic) => {
      try {
        await mqttService.addVideoStream(topic)
        console.log('已选择视频话题:', topic)
      } catch (error) {
        console.error('选择视频话题失败:', error)
      }
    }
    
    // 设置直接视频流URL
    const setDirectStream = () => {
      if (directStreamUrl.value.trim()) {
        // 模拟MQTT消息格式
        const mockVideoMessage = {
          web_video_server_url: directStreamUrl.value.trim()
        }
        
        // 调用MQTT服务处理视频流
        mqttService.handleVideoStream(mockVideoMessage)
        console.log('已设置直接视频流URL:', directStreamUrl.value)
      }
    }
    
    // 设置默认视频流（你的URL）
    const setDefaultStream = () => {
      directStreamUrl.value = 'http://192.168.6.214:8080/stream_viewer?topic=/camera/rgb/image_raw'
      setDirectStream()
    }
    
    // 缩放控制方法
    const zoomIn = () => {
      if (scaleFactor.value < 2.0) {
        scaleFactor.value += 0.1
      }
    }
    
    const zoomOut = () => {
      if (scaleFactor.value > 0.3) {
        scaleFactor.value -= 0.1
      }
    }
    
    const resetZoom = () => {
      scaleFactor.value = 1.0
    }
    
    const setZoom = (scale) => {
      scaleFactor.value = Math.max(0.3, Math.min(2.0, scale))
    }
    
    const fitToScreen = () => {
      // 自动计算适合屏幕的缩放比例
      const viewportHeight = window.innerHeight
      const availableHeight = viewportHeight * 0.6 // 留出一些空间给其他UI元素
      const idealHeight = 75 * scaleFactor.value // 当前iframe的基础高度
      
      if (idealHeight > availableHeight) {
        scaleFactor.value = availableHeight / 75
      } else {
        scaleFactor.value = 1.0
      }
    }
    
    // 加载可用视频话题
    const loadAvailableTopics = async () => {
      try {
        availableVideoTopics.value = await mqttService.getAvailableVideoTopics()
      } catch (error) {
        console.error('加载可用视频话题失败:', error)
      }
    }
    
    // 模拟性能数据
    const updatePerformanceData = () => {
      // 模拟内存使用（MB）
      memoryUsage.value = Math.round((performance.memory?.usedJSHeapSize || 0) / 1048576)
      
      // 模拟FPS
      fps.value = Math.round(1000 / 16) // 假设60fps
      
      // 模拟延迟
      latency.value = Math.round(Math.random() * 50 + 10)
    }
    
    // 性能监控定时器
    let performanceTimer = null
    
    onMounted(() => {
      // 启动性能监控
      performanceTimer = setInterval(updatePerformanceData, 1000)
      
      // 加载可用视频话题
      loadAvailableTopics()
      
      // 监听传感器数据变化
      const unsubscribe = robotStore.$subscribe((mutation, state) => {
        if (mutation.type.includes('updateSensorData')) {
          dataReceivedCount.value++
        }
      })
      
      // 监听连接状态变化
      const unsubscribeConnection = robotStore.$subscribe((mutation, state) => {
        if (mutation.type.includes('setMqttConnected')) {
          updateConnectionTime()
        }
      })
      
      // 监听视频流配置变化
      watch(videoStreamConfig, (newConfig) => {
        if (newConfig && newConfig.type) {
          currentStreamType.value = newConfig.type
        }
      })
      
      // 组件卸载时清理
      onUnmounted(() => {
        if (performanceTimer) {
          clearInterval(performanceTimer)
        }
        unsubscribe()
        unsubscribeConnection()
      })
    })
    
    return {
      videoPlayer,
      dataReceivedCount,
      fps,
      memoryUsage,
      latency,
      hasLaserData,
      hasCameraImage,
      hasVideoStream,
      laserScan,
      cameraImage,
      videoStream,
      videoStreamConfig,
      subscribedTopics,
      minDistance,
      maxDistance,
      connectionTime,
      currentStreamUrl,
      streamError,
      availableVideoTopics,
      directStreamUrl,
      scaleFactor,
      onStreamError,
      retryStream,
      selectVideoTopic,
      setDirectStream,
      setDefaultStream,
      zoomIn,
      zoomOut,
      resetZoom,
      setZoom,
      fitToScreen
    }
  }
}
</script>

<style scoped>
.data-monitor {
  height: 100%;
  background: #1a202c;
  border-left: 1px solid #2d3748;
  padding: 20px;
  overflow-y: auto;
}

.monitor-header {
  margin-bottom: 20px;
  padding-bottom: 15px;
  border-bottom: 1px solid #2d3748;
}

.monitor-header h3 {
  color: #e2e8f0;
  font-size: 18px;
  font-weight: 600;
}

.sensor-section,
.system-section {
  margin-bottom: 25px;
}

.sensor-section h4,
.system-section h4 {
  color: #e2e8f0;
  margin-bottom: 15px;
  font-size: 16px;
}

.sensor-card {
  background: #2d3748;
  border-radius: 8px;
  margin-bottom: 15px;
  overflow: hidden;
}

.sensor-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 15px;
  background: #4a5568;
  border-bottom: 1px solid #718096;
}

.stream-controls {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.zoom-controls {
  display: flex;
  align-items: center;
  gap: 5px;
}

.preset-controls {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
}

.zoom-btn {
  width: 24px;
  height: 24px;
  border: 1px solid #718096;
  background: #2d3748;
  color: #a0aec0;
  border-radius: 3px;
  font-size: 14px;
  font-weight: bold;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}

.zoom-btn:hover {
  background: #4a5568;
  color: #e2e8f0;
}

.zoom-display {
  color: #a0aec0;
  font-size: 12px;
  min-width: 40px;
  text-align: center;
}

.reset-btn {
  padding: 4px 8px;
  border: 1px solid #718096;
  background: #2d3748;
  color: #a0aec0;
  border-radius: 3px;
  font-size: 11px;
  cursor: pointer;
  transition: all 0.2s;
}

.reset-btn:hover {
  background: #4a5568;
  color: #e2e8f0;
}

.preset-btn {
  padding: 3px 6px;
  border: 1px solid #718096;
  background: #2d3748;
  color: #a0aec0;
  border-radius: 3px;
  font-size: 10px;
  cursor: pointer;
  transition: all 0.2s;
}

.preset-btn:hover {
  background: #4a5568;
  color: #e2e8f0;
}

.preset-btn:active {
  background: #1a202c;
  transform: scale(0.95);
}

.sensor-title {
  color: #e2e8f0;
  font-weight: 600;
  font-size: 14px;
}

.sensor-status {
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 600;
}

.sensor-status.active {
  background: #48bb78;
  color: white;
}

.sensor-status:not(.active) {
  background: #f56565;
  color: white;
}

.sensor-content {
  padding: 15px;
}

.laser-info {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.info-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  color: #a0aec0;
  font-size: 14px;
}

.no-data {
  text-align: center;
  color: #a0aec0;
  font-style: italic;
  padding: 20px;
}

.image-preview {
  display: flex;
  justify-content: center;
  align-items: center;
}

.video-preview {
  position: relative;
  overflow: hidden;
  border-radius: 4px;
  border: 1px solid #718096;
  background: #1a202c;
}

.video-container {
  position: relative;
  width: 100%;
  overflow: hidden;
  transition: height 0.3s ease;
}

.camera-image {
  max-width: 100%;
  max-height: 200px;
  border-radius: 4px;
  border: 1px solid #718096;
}

.mjpeg-stream {
  max-width: 100%;
  max-height: 200px;
  border-radius: 4px;
  border: 1px solid #718096;
}

.video-element {
  max-width: 100%;
  max-height: 200px;
  border-radius: 4px;
  border: 1px solid #718096;
}

.iframe-stream {
  border: none;
  background: #1a202c;
  transform-origin: top left;
  transition: transform 0.3s ease, width 0.3s ease, height 0.3s ease;
}

.stream-error {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  background: rgba(245, 101, 101, 0.9);
  padding: 15px;
  border-radius: 8px;
  text-align: center;
  color: white;
}

.retry-btn {
  margin-top: 10px;
  padding: 5px 10px;
  background: white;
  color: #f56565;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}

.retry-btn:hover {
  background: #f7fafc;
}

.stream-info {
  margin-top: 10px;
  padding: 10px;
  background: rgba(74, 85, 104, 0.5);
  border-radius: 4px;
  font-size: 12px;
}

.stream-setup {
  margin-top: 15px;
}

.direct-stream-setup {
  margin-top: 15px;
  padding: 15px;
  background: rgba(74, 85, 104, 0.3);
  border-radius: 6px;
}

.url-input-group {
  display: flex;
  gap: 10px;
  margin-top: 10px;
}

.url-input {
  flex: 1;
  padding: 8px 12px;
  border: 1px solid #718096;
  border-radius: 4px;
  background: #2d3748;
  color: #e2e8f0;
  font-size: 14px;
}

.url-input:focus {
  outline: none;
  border-color: #4299e1;
}

.set-stream-btn {
  padding: 8px 16px;
  background: #4299e1;
  border: none;
  border-radius: 4px;
  color: white;
  cursor: pointer;
  font-size: 14px;
  transition: background 0.2s;
}

.set-stream-btn:hover {
  background: #3182ce;
}

.quick-setup {
  margin-top: 10px;
}

.quick-btn {
  padding: 6px 12px;
  background: #48bb78;
  border: none;
  border-radius: 4px;
  color: white;
  cursor: pointer;
  font-size: 12px;
  transition: background 0.2s;
}

.quick-btn:hover {
  background: #38a169;
}

.topic-list {
  display: flex;
  flex-direction: column;
  gap: 5px;
  margin-top: 10px;
}

.topic-btn {
  padding: 8px 12px;
  background: #4a5568;
  border: 1px solid #718096;
  border-radius: 4px;
  color: #e2e8f0;
  cursor: pointer;
  text-align: left;
  font-size: 12px;
  transition: background 0.2s;
}

.topic-btn:hover {
  background: #5a6578;
}

.system-info {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 15px;
}

.info-card {
  background: #2d3748;
  border-radius: 8px;
  overflow: hidden;
}

.info-title {
  background: #4a5568;
  padding: 12px 15px;
  color: #e2e8f0;
  font-weight: 600;
  font-size: 14px;
  border-bottom: 1px solid #718096;
}

.info-content {
  padding: 15px;
}

.stat-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
  color: #a0aec0;
  font-size: 14px;
}

.stat-item:last-child {
  margin-bottom: 0;
}

/* 响应式设计 */
@media (max-width: 768px) {
  .system-info {
    grid-template-columns: 1fr;
  }
}

/* 滚动条样式 */
.data-monitor::-webkit-scrollbar {
  width: 6px;
}

.data-monitor::-webkit-scrollbar-track {
  background: #2d3748;
}

.data-monitor::-webkit-scrollbar-thumb {
  background: #4a5568;
  border-radius: 3px;
}

.data-monitor::-webkit-scrollbar-thumb:hover {
  background: #718096;
}
</style>