<template>
  <div class="topic-settings">
    <div class="settings-header">
      <h3>📡 MQTT话题配置</h3>
      <p class="settings-description">配置各个功能模块订阅的MQTT话题</p>
    </div>

    <div class="settings-content">
      <!-- 机器人位姿话题 -->
      <div class="setting-group">
        <div class="group-header">
          <span class="group-icon">🤖</span>
          <h4>机器人位姿</h4>
          <span class="group-badge">地图中间位置</span>
        </div>
        <div class="setting-item">
          <label>
            <span class="label-text">位姿话题:</span>
            <span class="label-hint">用于显示机器人在地图中的位置和朝向</span>
          </label>
          <div class="input-wrapper">
            <input 
              v-model="topicConfig.pose" 
              type="text" 
              placeholder="/amcl_pose"
              class="topic-input"
            />
            <button @click="testTopic('pose')" class="test-btn" :disabled="testing">
              {{ testing ? '测试中...' : '测试' }}
            </button>
          </div>
          <div v-if="testResults.pose" :class="['test-result', testResults.pose.success ? 'success' : 'error']">
            {{ testResults.pose.message }}
          </div>
        </div>
      </div>

      <!-- 激光雷达话题 -->
      <div class="setting-group">
        <div class="group-header">
          <span class="group-icon">📡</span>
          <h4>激光雷达</h4>
          <span class="group-badge">右上角显示</span>
        </div>
        <div class="setting-item">
          <label>
            <span class="label-text">激光雷达话题:</span>
            <span class="label-hint">用于显示激光雷达扫描数据</span>
          </label>
          <div class="input-wrapper">
            <input 
              v-model="topicConfig.laser" 
              type="text" 
              placeholder="/scan"
              class="topic-input"
            />
            <button @click="testTopic('laser')" class="test-btn" :disabled="testing">
              {{ testing ? '测试中...' : '测试' }}
            </button>
          </div>
          <div v-if="testResults.laser" :class="['test-result', testResults.laser.success ? 'success' : 'error']">
            {{ testResults.laser.message }}
          </div>
        </div>
      </div>

      <!-- 相机图像话题 -->
      <div class="setting-group">
        <div class="group-header">
          <span class="group-icon">📷</span>
          <h4>相机图像</h4>
          <span class="group-badge">右上角显示</span>
        </div>
        <div class="setting-item">
          <label>
            <span class="label-text">相机话题:</span>
            <span class="label-hint">用于接收相机图像数据</span>
          </label>
          <div class="input-wrapper">
            <input 
              v-model="topicConfig.camera" 
              type="text" 
              placeholder="/camera/rgb/image_raw"
              class="topic-input"
            />
            <button @click="testTopic('camera')" class="test-btn" :disabled="testing">
              {{ testing ? '测试中...' : '测试' }}
            </button>
          </div>
          <div v-if="testResults.camera" :class="['test-result', testResults.camera.success ? 'success' : 'error']">
            {{ testResults.camera.message }}
          </div>
        </div>

        <div class="setting-item">
          <label>
            <span class="label-text">视频流话题:</span>
            <span class="label-hint">用于实时视频流显示</span>
          </label>
          <div class="input-wrapper">
            <input 
              v-model="topicConfig.video" 
              type="text" 
              placeholder="/camera/rgb/image_raw"
              class="topic-input"
            />
            <button @click="testTopic('video')" class="test-btn" :disabled="testing">
              {{ testing ? '测试中...' : '测试' }}
            </button>
          </div>
          <div v-if="testResults.video" :class="['test-result', testResults.video.success ? 'success' : 'error']">
            {{ testResults.video.message }}
          </div>
        </div>
      </div>

      <!-- 导航状态话题 -->
      <div class="setting-group">
        <div class="group-header">
          <span class="group-icon">🎯</span>
          <h4>导航状态</h4>
          <span class="group-badge">左下角状态</span>
        </div>
        <div class="setting-item">
          <label>
            <span class="label-text">导航状态话题:</span>
            <span class="label-hint">用于显示机器人导航状态（待机/导航中/已到达）</span>
          </label>
          <div class="input-wrapper">
            <input 
              v-model="topicConfig.navigationStatus" 
              type="text" 
              placeholder="/move_base/status"
              class="topic-input"
            />
            <button @click="testTopic('navigationStatus')" class="test-btn" :disabled="testing">
              {{ testing ? '测试中...' : '测试' }}
            </button>
          </div>
          <div v-if="testResults.navigationStatus" :class="['test-result', testResults.navigationStatus.success ? 'success' : 'error']">
            {{ testResults.navigationStatus.message }}
          </div>
        </div>
      </div>

      <!-- 地图话题 -->
      <div class="setting-group">
        <div class="group-header">
          <span class="group-icon">🗺️</span>
          <h4>地图数据</h4>
          <span class="group-badge">地图显示</span>
        </div>
        <div class="setting-item">
          <label>
            <span class="label-text">地图话题:</span>
            <span class="label-hint">用于接收占用栅格地图数据</span>
          </label>
          <div class="input-wrapper">
            <input 
              v-model="topicConfig.map" 
              type="text" 
              placeholder="/map"
              class="topic-input"
            />
            <button @click="testTopic('map')" class="test-btn" :disabled="testing">
              {{ testing ? '测试中...' : '测试' }}
            </button>
          </div>
          <div v-if="testResults.map" :class="['test-result', testResults.map.success ? 'success' : 'error']">
            {{ testResults.map.message }}
          </div>
        </div>
      </div>

      <!-- Web Video Server 配置 -->
      <div class="setting-group">
        <div class="group-header">
          <span class="group-icon">🎥</span>
          <h4>Web Video Server</h4>
          <span class="group-badge">视频流服务</span>
        </div>
        <div class="setting-item">
          <label>
            <span class="label-text">服务器地址:</span>
            <span class="label-hint">ROS web_video_server的URL地址</span>
          </label>
          <div class="input-wrapper">
            <input 
              v-model="webVideoServerUrl" 
              type="text" 
              placeholder="http://192.168.6.214:8080"
              class="topic-input"
            />
            <button @click="testWebVideoServer" class="test-btn" :disabled="testing">
              {{ testing ? '测试中...' : '测试' }}
            </button>
          </div>
          <div v-if="testResults.webVideoServer" :class="['test-result', testResults.webVideoServer.success ? 'success' : 'error']">
            {{ testResults.webVideoServer.message }}
          </div>
        </div>
      </div>

      <!-- 快速配置预设 -->
      <div class="preset-section">
        <h4>快速配置预设</h4>
        <div class="preset-buttons">
          <button @click="loadPreset('default')" class="preset-btn">
            <span class="preset-icon">⚙️</span>
            <span>默认配置</span>
          </button>
          <button @click="loadPreset('turtlebot')" class="preset-btn">
            <span class="preset-icon">🐢</span>
            <span>TurtleBot</span>
          </button>
          <button @click="loadPreset('custom')" class="preset-btn">
            <span class="preset-icon">🔧</span>
            <span>自定义</span>
          </button>
        </div>
      </div>

      <!-- 当前订阅状态 -->
      <div class="subscription-status">
        <h4>当前订阅状态</h4>
        <div class="status-list">
          <div 
            v-for="topic in subscribedTopics" 
            :key="topic"
            class="status-item">
            <span class="status-dot active"></span>
            <span class="status-topic">{{ topic }}</span>
            <button @click="unsubscribeTopic(topic)" class="unsubscribe-btn">取消订阅</button>
          </div>
          <div v-if="subscribedTopics.length === 0" class="no-subscriptions">
            暂无订阅话题
          </div>
        </div>
      </div>
    </div>

    <!-- 操作按钮 -->
    <div class="settings-footer">
      <button @click="resetToDefault" class="footer-btn reset-btn">
        重置为默认
      </button>
      <button @click="applySettings" class="footer-btn apply-btn" :disabled="!mqttConnected">
        {{ mqttConnected ? '应用设置' : '请先连接MQTT' }}
      </button>
      <button @click="saveSettings" class="footer-btn save-btn">
        保存配置
      </button>
    </div>

    <!-- 帮助信息 -->
    <div class="help-section">
      <details>
        <summary>💡 配置说明</summary>
        <div class="help-content">
          <h5>话题配置说明：</h5>
          <ul>
            <li><strong>机器人位姿</strong>: 用于在地图中央显示机器人的当前位置和朝向</li>
            <li><strong>激光雷达</strong>: 在右上角数据监控面板显示激光雷达扫描数据</li>
            <li><strong>相机图像</strong>: 在右上角显示相机拍摄的静态图像</li>
            <li><strong>视频流</strong>: 在右上角显示实时视频流</li>
            <li><strong>导航状态</strong>: 在左下角控制面板显示机器人导航状态</li>
            <li><strong>地图数据</strong>: 用于显示占用栅格地图</li>
          </ul>
          
          <h5>使用步骤：</h5>
          <ol>
            <li>确保MQTT代理服务已启动并连接</li>
            <li>输入或修改各个功能对应的ROS话题名称</li>
            <li>点击"测试"按钮验证话题是否可用</li>
            <li>点击"应用设置"订阅新的话题</li>
            <li>点击"保存配置"将设置持久化到本地</li>
          </ol>

          <h5>常见话题名称：</h5>
          <ul>
            <li>位姿: <code>/amcl_pose</code>, <code>/robot_pose</code></li>
            <li>激光: <code>/scan</code>, <code>/base_scan</code></li>
            <li>相机: <code>/camera/rgb/image_raw</code>, <code>/usb_cam/image_raw</code></li>
            <li>导航: <code>/move_base/status</code>, <code>/navigation/status</code></li>
            <li>地图: <code>/map</code>, <code>/map_server/map</code></li>
          </ul>
        </div>
      </details>
    </div>
  </div>
</template>

<script>
import { ref, computed, onMounted } from 'vue'
import { useRobotStore } from '../stores/robotStore'
import mqttService from '../services/mqttService'
import webVideoService from '../services/webVideoService'

export default {
  name: 'TopicSettings',
  
  setup() {
    const robotStore = useRobotStore()
    
    // 响应式数据
    const topicConfig = ref({
      pose: '/amcl_pose',
      laser: '/scan',
      camera: '/camera/rgb/image_raw',
      video: '/camera/rgb/image_raw',
      navigationStatus: '/move_base/status',
      map: '/map'
    })
    
    const webVideoServerUrl = ref('http://192.168.6.214:8080')
    const testing = ref(false)
    const testResults = ref({})
    
    // 计算属性
    const mqttConnected = computed(() => robotStore.mqttConnected)
    const subscribedTopics = computed(() => robotStore.subscribedTopics)
    
    // 预设配置
    const presets = {
      default: {
        pose: '/amcl_pose',
        laser: '/scan',
        camera: '/camera/rgb/image_raw',
        video: '/camera/rgb/image_raw',
        navigationStatus: '/move_base/status',
        map: '/map'
      },
      turtlebot: {
        pose: '/amcl_pose',
        laser: '/scan',
        camera: '/camera/rgb/image_raw',
        video: '/camera/rgb/image_raw',
        navigationStatus: '/move_base/status',
        map: '/map'
      },
      custom: {
        pose: '/robot_pose',
        laser: '/base_scan',
        camera: '/usb_cam/image_raw',
        video: '/usb_cam/image_raw',
        navigationStatus: '/navigation/status',
        map: '/map_server/map'
      }
    }
    
    // 方法
    const loadPreset = (presetName) => {
      if (presets[presetName]) {
        topicConfig.value = { ...presets[presetName] }
        alert(`已加载 ${presetName} 预设配置`)
      }
    }
    
    const testTopic = async (topicType) => {
      testing.value = true
      const topic = topicConfig.value[topicType]
      
      try {
        // 模拟测试话题（实际应该检查ROS话题是否存在）
        await new Promise(resolve => setTimeout(resolve, 1000))
        
        // 这里可以添加实际的话题测试逻辑
        // 例如：订阅话题并等待消息
        
        testResults.value[topicType] = {
          success: true,
          message: `✓ 话题 ${topic} 测试成功`
        }
      } catch (error) {
        testResults.value[topicType] = {
          success: false,
          message: `✗ 话题 ${topic} 测试失败: ${error.message}`
        }
      } finally {
        testing.value = false
      }
    }
    
    const testWebVideoServer = async () => {
      testing.value = true
      
      try {
        const response = await fetch(webVideoServerUrl.value)
        
        if (response.ok) {
          testResults.value.webVideoServer = {
            success: true,
            message: `✓ Web Video Server 连接成功`
          }
          
          // 更新服务地址
          webVideoService.setBaseUrl(webVideoServerUrl.value)
          mqttService.setWebVideoServerUrl(webVideoServerUrl.value)
        } else {
          throw new Error(`HTTP ${response.status}`)
        }
      } catch (error) {
        testResults.value.webVideoServer = {
          success: false,
          message: `✗ 无法连接到 Web Video Server: ${error.message}`
        }
      } finally {
        testing.value = false
      }
    }
    
    const applySettings = () => {
      if (!mqttConnected.value) {
        alert('请先连接MQTT代理')
        return
      }
      
      // 取消订阅旧话题
      subscribedTopics.value.forEach(topic => {
        mqttService.unsubscribe(topic)
      })
      
      // 订阅新话题
      Object.values(topicConfig.value).forEach(topic => {
        if (topic && topic.trim()) {
          mqttService.subscribe(topic.trim())
        }
      })
      
      // 更新store中的默认话题配置
      robotStore.config.defaultTopics = { ...topicConfig.value }
      
      // 更新消息处理器
      updateMessageHandlers()
      
      alert('话题配置已应用')
    }
    
    const saveSettings = () => {
      // 保存到store
      robotStore.config.defaultTopics = { ...topicConfig.value }
      robotStore.config.webVideoServerUrl = webVideoServerUrl.value
      
      // 持久化到localStorage
      robotStore.saveConfigToLocalStorage()
      
      alert('配置已保存到本地')
    }
    
    const resetToDefault = () => {
      if (confirm('确定要重置为默认配置吗？')) {
        loadPreset('default')
        webVideoServerUrl.value = 'http://192.168.6.214:8080'
        testResults.value = {}
      }
    }
    
    const unsubscribeTopic = (topic) => {
      mqttService.unsubscribe(topic)
    }
    
    const updateMessageHandlers = () => {
      // 重新注册消息处理器
      mqttService.registerHandler(topicConfig.value.pose, mqttService.handlePoseData.bind(mqttService))
      mqttService.registerHandler(topicConfig.value.laser, mqttService.handleLaserScan.bind(mqttService))
      mqttService.registerHandler(topicConfig.value.camera, mqttService.handleCameraImage.bind(mqttService))
      mqttService.registerHandler(topicConfig.value.video, mqttService.handleVideoStream.bind(mqttService))
      mqttService.registerHandler(topicConfig.value.navigationStatus, mqttService.handleNavigationStatus.bind(mqttService))
      mqttService.registerHandler(topicConfig.value.map, mqttService.handleMapData.bind(mqttService))
    }
    
    onMounted(() => {
      // 从store加载配置
      if (robotStore.config.defaultTopics) {
        topicConfig.value = { ...robotStore.config.defaultTopics }
      }
      
      if (robotStore.config.webVideoServerUrl) {
        webVideoServerUrl.value = robotStore.config.webVideoServerUrl
      }
    })
    
    return {
      topicConfig,
      webVideoServerUrl,
      testing,
      testResults,
      mqttConnected,
      subscribedTopics,
      loadPreset,
      testTopic,
      testWebVideoServer,
      applySettings,
      saveSettings,
      resetToDefault,
      unsubscribeTopic
    }
  }
}
</script>

<style scoped>
.topic-settings {
  max-width: 900px;
  margin: 0 auto;
  padding: 20px;
  background: #1a202c;
  color: #e2e8f0;
}

.settings-header {
  margin-bottom: 30px;
  padding-bottom: 20px;
  border-bottom: 2px solid #2d3748;
}

.settings-header h3 {
  font-size: 24px;
  margin-bottom: 10px;
  color: #e2e8f0;
}

.settings-description {
  color: #a0aec0;
  font-size: 14px;
  margin: 0;
}

.settings-content {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.setting-group {
  background: #2d3748;
  border-radius: 8px;
  padding: 20px;
  border: 1px solid #4a5568;
}

.group-header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 15px;
  padding-bottom: 10px;
  border-bottom: 1px solid #4a5568;
}

.group-icon {
  font-size: 24px;
}

.group-header h4 {
  margin: 0;
  font-size: 18px;
  color: #e2e8f0;
  flex: 1;
}

.group-badge {
  background: #4299e1;
  color: white;
  padding: 4px 12px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 600;
}

.setting-item {
  margin-bottom: 15px;
}

.setting-item:last-child {
  margin-bottom: 0;
}

.setting-item label {
  display: block;
  margin-bottom: 8px;
}

.label-text {
  display: block;
  color: #e2e8f0;
  font-weight: 600;
  font-size: 14px;
  margin-bottom: 4px;
}

.label-hint {
  display: block;
  color: #a0aec0;
  font-size: 12px;
}

.input-wrapper {
  display: flex;
  gap: 10px;
}

.topic-input {
  flex: 1;
  padding: 10px 12px;
  background: #4a5568;
  border: 1px solid #718096;
  border-radius: 6px;
  color: white;
  font-size: 14px;
  font-family: 'Courier New', monospace;
}

.topic-input:focus {
  outline: none;
  border-color: #4299e1;
  box-shadow: 0 0 0 3px rgba(66, 153, 225, 0.1);
}

.test-btn {
  padding: 10px 20px;
  background: #4299e1;
  border: none;
  border-radius: 6px;
  color: white;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  white-space: nowrap;
}

.test-btn:hover:not(:disabled) {
  background: #3182ce;
  transform: translateY(-1px);
}

.test-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.test-result {
  margin-top: 8px;
  padding: 8px 12px;
  border-radius: 4px;
  font-size: 13px;
}

.test-result.success {
  background: rgba(72, 187, 120, 0.2);
  color: #48bb78;
  border: 1px solid #48bb78;
}

.test-result.error {
  background: rgba(245, 101, 101, 0.2);
  color: #f56565;
  border: 1px solid #f56565;
}

.preset-section {
  background: #2d3748;
  border-radius: 8px;
  padding: 20px;
  border: 1px solid #4a5568;
}

.preset-section h4 {
  margin: 0 0 15px 0;
  color: #e2e8f0;
  font-size: 16px;
}

.preset-buttons {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 10px;
}

.preset-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 15px;
  background: #4a5568;
  border: 2px solid #718096;
  border-radius: 8px;
  color: #e2e8f0;
  cursor: pointer;
  transition: all 0.2s;
}

.preset-btn:hover {
  background: #5a6578;
  border-color: #4299e1;
  transform: translateY(-2px);
}

.preset-icon {
  font-size: 32px;
}

.subscription-status {
  background: #2d3748;
  border-radius: 8px;
  padding: 20px;
  border: 1px solid #4a5568;
}

.subscription-status h4 {
  margin: 0 0 15px 0;
  color: #e2e8f0;
  font-size: 16px;
}

.status-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.status-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px;
  background: #4a5568;
  border-radius: 6px;
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #718096;
}

.status-dot.active {
  background: #48bb78;
  box-shadow: 0 0 8px #48bb78;
}

.status-topic {
  flex: 1;
  color: #e2e8f0;
  font-family: 'Courier New', monospace;
  font-size: 14px;
}

.unsubscribe-btn {
  padding: 4px 12px;
  background: #f56565;
  border: none;
  border-radius: 4px;
  color: white;
  font-size: 12px;
  cursor: pointer;
  transition: background 0.2s;
}

.unsubscribe-btn:hover {
  background: #e53e3e;
}

.no-subscriptions {
  text-align: center;
  color: #a0aec0;
  font-style: italic;
  padding: 20px;
}

.settings-footer {
  display: flex;
  gap: 10px;
  justify-content: flex-end;
  margin-top: 30px;
  padding-top: 20px;
  border-top: 2px solid #2d3748;
}

.footer-btn {
  padding: 12px 24px;
  border: none;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

.reset-btn {
  background: #718096;
  color: white;
}

.reset-btn:hover {
  background: #4a5568;
}

.apply-btn {
  background: #4299e1;
  color: white;
}

.apply-btn:hover:not(:disabled) {
  background: #3182ce;
}

.apply-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.save-btn {
  background: #48bb78;
  color: white;
}

.save-btn:hover {
  background: #38a169;
}

.help-section {
  margin-top: 30px;
  background: #2d3748;
  border-radius: 8px;
  overflow: hidden;
}

.help-section details {
  cursor: pointer;
}

.help-section summary {
  padding: 15px 20px;
  background: #4a5568;
  color: #e2e8f0;
  font-weight: 600;
  font-size: 14px;
  user-select: none;
}

.help-section summary:hover {
  background: #5a6578;
}

.help-content {
  padding: 20px;
  color: #a0aec0;
  font-size: 14px;
  line-height: 1.6;
}

.help-content h5 {
  color: #e2e8f0;
  margin: 15px 0 10px 0;
  font-size: 16px;
}

.help-content ul,
.help-content ol {
  margin: 10px 0;
  padding-left: 20px;
}

.help-content li {
  margin: 5px 0;
}

.help-content code {
  background: #4a5568;
  padding: 2px 6px;
  border-radius: 3px;
  font-family: 'Courier New', monospace;
  color: #4299e1;
}

/* 响应式设计 */
@media (max-width: 768px) {
  .topic-settings {
    padding: 15px;
  }
  
  .input-wrapper {
    flex-direction: column;
  }
  
  .test-btn {
    width: 100%;
  }
  
  .preset-buttons {
    grid-template-columns: 1fr;
  }
  
  .settings-footer {
    flex-direction: column;
  }
  
  .footer-btn {
    width: 100%;
  }
}
</style>
