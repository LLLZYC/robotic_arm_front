<template>
  <div class="control-panel">
    <div class="panel-header">
      <h3>机器人控制面板</h3>
    </div>
    
    <div class="status-section">
      <div class="status-item">
        <span class="status-label">MQTT连接:</span>
        <span :class="['status-indicator', mqttConnected ? 'connected' : 'disconnected']">
          {{ mqttConnected ? '已连接' : '未连接' }}
        </span>
      </div>
      
      <div class="status-item">
        <span class="status-label">导航状态:</span>
        <span :class="['status-indicator', navigationStatusClass]">
          {{ navigationStatusText }}
        </span>
      </div>
      
      <div class="status-item" v-if="currentGoalName">
        <span class="status-label">当前任务:</span>
        <span class="status-value">{{ currentGoalName }}</span>
      </div>
    </div>
    
    <div class="connection-section">
      <h4>连接设置</h4>
      <div class="input-group">
        <label>MQTT代理地址:</label>
        <input 
          v-model="mqttBrokerUrl" 
          type="text" 
          placeholder="ws://localhost:9001"
          :disabled="mqttConnected"
        />
      </div>
      
      <div class="input-group">
        <label>REST API地址:</label>
        <input 
          v-model="restApiUrl" 
          type="text" 
          placeholder="http://localhost:5000"
        />
      </div>
      
      <div class="button-group">
        <button 
          @click="toggleConnection" 
          :class="['connect-btn', mqttConnected ? 'disconnect' : 'connect']"
          :disabled="connecting">
          {{ mqttConnected ? '断开连接' : connecting ? '连接中...' : '连接' }}
        </button>
        
        <button 
          @click="updateApiUrl" 
          class="update-btn"
          :disabled="mqttConnected">
          更新API地址
        </button>
        
        <button 
          @click="debugApiConfig" 
          class="debug-btn">
          🔍 调试配置
        </button>
      </div>
    </div>
    
    <div class="topics-section">
      <h4>话题订阅管理</h4>
      
      <div class="quick-subscribe">
        <button 
          @click="subscribeDefaultTopics"
          class="quick-subscribe-btn"
          :disabled="!mqttConnected">
          📌 订阅默认话题
        </button>
      </div>
      
      <div class="topics-list">
        <div 
          v-for="topic in subscribedTopics" 
          :key="topic"
          class="topic-item">
          <span class="topic-name">{{ topic }}</span>
          <button 
            @click="unsubscribeTopic(topic)"
            class="unsubscribe-btn"
            :disabled="!mqttConnected">
            取消订阅
          </button>
        </div>
        
        <div v-if="subscribedTopics.length === 0" class="no-topics">
          暂无订阅话题
        </div>
      </div>
      
      <div class="add-topic">
        <input 
          v-model="newTopic" 
          type="text" 
          placeholder="输入话题名称"
          @keyup.enter="subscribeNewTopic"
        />
        <button 
          @click="subscribeNewTopic"
          class="subscribe-btn"
          :disabled="!mqttConnected || !newTopic">
          订阅
        </button>
      </div>
    </div>
    
    <div class="robot-status-section">
      <h4>机器人状态</h4>
      <div class="robot-info">
        <div class="info-item">
          <span>位置 X:</span>
          <span>{{ formatCoordinate(robotPose.x) }}</span>
        </div>
        <div class="info-item">
          <span>位置 Y:</span>
          <span>{{ formatCoordinate(robotPose.y) }}</span>
        </div>
        <div class="info-item">
          <span>朝向:</span>
          <span>{{ formatAngle(robotPose.theta) }}</span>
        </div>
      </div>
      
      <div v-if="goalPose" class="goal-info">
        <div class="info-header">目标位置</div>
        <div class="info-item">
          <span>目标 X:</span>
          <span>{{ formatCoordinate(goalPose.x) }}</span>
        </div>
        <div class="info-item">
          <span>目标 Y:</span>
          <span>{{ formatCoordinate(goalPose.y) }}</span>
        </div>
        <button 
          @click="cancelNavigation"
          class="cancel-btn"
          :disabled="navigationStatus !== 'navigating'">
          取消导航
        </button>
      </div>
    </div>
  </div>
</template>

<script>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue' // ✅ 引入 onUnmounted
import { useRobotStore } from '../stores/robotStore'
import mqttService from '../services/mqttService'
import apiService from '../services/apiService'

export default {
  name: 'ControlPanel',
  
  setup() {
    const robotStore = useRobotStore()
    
    // 响应式数据
    const mqttBrokerUrl = ref(robotStore.config.mqttBroker)
    const restApiUrl = ref(robotStore.config.restApiUrl)
    const newTopic = ref('')
    const connecting = ref(false)
    const currentGoalName = ref('') // ✅ 记录当前任务名
    
    // ✅ 定义轮询定时器
    let statusPollingTimer = null

    // 计算属性
    const mqttConnected = computed(() => robotStore.mqttConnected)
    const subscribedTopics = computed(() => robotStore.subscribedTopics)
    const robotPose = computed(() => robotStore.robotPose)
    const goalPose = computed(() => robotStore.goalPose)
    const navigationStatus = computed(() => robotStore.navigationStatus)
    
    const navigationStatusText = computed(() => {
      const statusMap = {
        'idle': '待机',
        'navigating': '导航中',
        'arrived': '已到达',
        'failed': '导航失败'
      }
      return statusMap[navigationStatus.value] || '未知'
    })
    
    const navigationStatusClass = computed(() => {
      const classMap = {
        'idle': 'idle',
        'navigating': 'navigating',
        'arrived': 'connected',
        'failed': 'disconnected'
      }
      return classMap[navigationStatus.value] || 'idle'
    })
    
    // ✅ 核心修复：启动轮询，自动同步后端状态
    const startPolling = () => {
      stopPolling()
      console.log('启动状态自动同步...')
      
      statusPollingTimer = setInterval(async () => {
        try {
          // 1. 获取后端完整状态
          const status = await apiService.getRobotStatus()
          
          if (status) {
            // 2. 同步当前任务目标 (解决“下一个目标不刷新”的问题)
            if (status.active_goal && status.active_goal.position) {
              const g = status.active_goal
              currentGoalName.value = g.name || '未知目标'
              
              // 构造新的目标点对象
              // 注意：这里我们简单地只取x,y，因为面板只需要显示位置
              // 如果需要箭头显示，还需要转换 orientation 四元数到 theta
              const newGoalPose = {
                x: g.position.x,
                y: g.position.y,
                theta: 0 // 简化处理，面板主要看坐标
              }
              
              // 只有当坐标发生变化时才更新，避免频繁刷新导致性能问题
              if (!robotStore.goalPose || 
                  Math.abs(robotStore.goalPose.x - newGoalPose.x) > 0.01 || 
                  Math.abs(robotStore.goalPose.y - newGoalPose.y) > 0.01) {
                console.log('检测到后端目标切换:', g.name)
                robotStore.setGoalPose(newGoalPose)
              }
              
              // 强制同步状态为导航中
              if (robotStore.navigationStatus !== 'navigating') {
                robotStore.updateNavigationStatus('navigating')
              }
            } else {
              // 如果后端没有 active_goal，说明处于待机或等待中
              currentGoalName.value = ''
              // 可选：如果要清空显示，可以调用 robotStore.clearGoalPose()
              // 但通常保留最后一个目标显示会更友好
            }
            
            // 3. 顺便更新一下机器人位置（如果 MQTT 没连上，这个轮询也能保证位置更新）
            if (!mqttConnected.value) {
              // 假设 MQTT service 有解析逻辑，或者我们这里简单尝试更新位置（如果有回传的话）
              // 通常位置还是依赖 MQTT 比较流畅，这里作为备用
            }
          }
        } catch (error) {
          // 静默失败，不要弹出 alert 打扰用户
          // console.warn('状态同步失败:', error)
        }
      }, 1000) // 每秒同步一次
    }

    const stopPolling = () => {
      if (statusPollingTimer) {
        clearInterval(statusPollingTimer)
        statusPollingTimer = null
      }
    }

    // 方法
    const toggleConnection = async () => {
      if (mqttConnected.value) {
        // 断开连接
        try {
          mqttService.disconnect()
          console.log('MQTT连接已断开')
        } catch (error) {
          console.error('断开连接失败:', error)
          alert('断开连接失败，请重试')
        }
      } else {
        // 连接
        connecting.value = true
        
        // 验证MQTT代理地址格式
        if (!mqttBrokerUrl.value || !mqttBrokerUrl.value.trim()) {
          alert('请输入有效的MQTT代理地址')
          connecting.value = false
          return
        }
        
        // 验证地址格式
        try {
          const url = new URL(mqttBrokerUrl.value)
          if (url.protocol !== 'ws:' && url.protocol !== 'wss:') {
            alert('MQTT代理地址必须使用ws://或wss://协议')
            connecting.value = false
            return
          }
        } catch (error) {
          alert('MQTT代理地址格式无效，请使用类似 ws://localhost:9001 的格式')
          connecting.value = false
          return
        }
        
        try {
          await mqttService.connect(mqttBrokerUrl.value)
          robotStore.updateConfig('mqttBroker', mqttBrokerUrl.value)
          console.log('MQTT连接成功，配置已保存')
        } catch (error) {
          // ... (保持原有错误处理逻辑不变)
          console.error('连接失败:', error)
          let errorMessage = 'MQTT连接失败'
          if (error.message.includes('Socket连接错误')) {
            errorMessage = '无法连接到MQTT代理服务'
          } else if (error.message.includes('连接超时')) {
            errorMessage = '连接超时，请检查网络连接'
          }
          alert(`${errorMessage}\n\n详细错误: ${error.message}`)
        } finally {
          connecting.value = false
        }
      }
    }
    
    const updateApiUrl = () => {
      apiService.updateBaseUrl(restApiUrl.value)
      robotStore.updateConfig('restApiUrl', restApiUrl.value)
      // ✅ 修复：地址变更后重启轮询，确保连上新的地址
      startPolling()
      alert('API地址已更新并保存')
    }
    
    const debugApiConfig = () => {
      const currentBaseUrl = apiService.getCurrentBaseUrl()
      const storeConfig = robotStore.config.restApiUrl
      const inputUrl = restApiUrl.value
      
      console.log('=== API配置调试信息 ===')
      console.log('apiService实际baseURL:', currentBaseUrl)
      console.log('robotStore中保存的配置:', storeConfig)
      console.log('输入框中的值:', inputUrl)
      
      alert(`API配置调试:\n\n实际baseURL: ${currentBaseUrl}\nStore配置: ${storeConfig}\n输入框值: ${inputUrl}`)
    }
    
    const subscribeDefaultTopics = () => {
      const defaultTopics = robotStore.config.defaultTopics
      Object.values(defaultTopics).forEach(topic => {
        if (topic && !subscribedTopics.value.includes(topic)) {
          mqttService.subscribe(topic)
        }
      })
      alert('已订阅默认话题')
    }
    
    const subscribeNewTopic = () => {
      if (newTopic.value.trim()) {
        mqttService.subscribe(newTopic.value.trim())
        newTopic.value = ''
      }
    }
    
    const unsubscribeTopic = (topic) => {
      mqttService.unsubscribe(topic)
    }
    
    const cancelNavigation = async () => {
      try {
        await apiService.cancelGoal()
        robotStore.updateNavigationStatus('idle')
        robotStore.goalPose = null
        currentGoalName.value = '' // 清空任务名
      } catch (error) {
        console.error('取消导航失败:', error)
        alert('取消导航失败')
      }
    }
    
    // 格式化坐标显示
    const formatCoordinate = (coord) => {
      if (coord === null || coord === undefined || isNaN(coord)) {
        return '0.00'
      }
      return Number(coord).toFixed(2)
    }
    
    // 格式化角度显示
    const formatAngle = (angle) => {
      if (angle === null || angle === undefined || isNaN(angle)) {
        return '0.0°'
      }
      return (angle * 180 / Math.PI).toFixed(1) + '°'
    }
    
    // 监听MQTT连接状态变化
    watch(mqttConnected, (connected) => {
      if (!connected) {
        connecting.value = false
      }
    })
    
    onMounted(() => {
      // 从localStorage加载配置
      robotStore.loadConfigFromLocalStorage()
      
      // 初始化配置
      mqttBrokerUrl.value = robotStore.config.mqttBroker
      restApiUrl.value = robotStore.config.restApiUrl
      
      // ✅ 修复：组件加载完毕立即启动轮询
      startPolling()
    })

    // ✅ 修复：组件销毁时清理定时器
    onUnmounted(() => {
      stopPolling()
    })
    
    return {
      mqttBrokerUrl,
      restApiUrl,
      newTopic,
      connecting,
      mqttConnected,
      subscribedTopics,
      robotPose,
      goalPose,
      navigationStatus,
      navigationStatusText,
      navigationStatusClass,
      currentGoalName, // ✅ 返回给模板
      toggleConnection,
      updateApiUrl,
      debugApiConfig,
      subscribeDefaultTopics,
      subscribeNewTopic,
      unsubscribeTopic,
      cancelNavigation,
      formatCoordinate,
      formatAngle
    }
  }
}
</script>

<style scoped>
/* 样式保持原样，增加 status-value 样式 */
.control-panel {
  height: 100%;
  background: #1a202c;
  border-right: 1px solid #2d3748;
  padding: 20px;
  overflow-y: auto;
}

.panel-header {
  margin-bottom: 20px;
  padding-bottom: 15px;
  border-bottom: 1px solid #2d3748;
}

.panel-header h3 {
  color: #e2e8f0;
  font-size: 18px;
  font-weight: 600;
}

.status-section {
  margin-bottom: 25px;
  padding: 15px;
  background: #2d3748;
  border-radius: 8px;
}

.status-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}

.status-item:last-child {
  margin-bottom: 0;
}

.status-label {
  color: #a0aec0;
  font-size: 14px;
}

.status-value { /* 新增样式 */
  color: #e2e8f0;
  font-size: 14px;
  font-weight: 500;
}

.status-indicator {
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 600;
}

.status-indicator.connected {
  background: #48bb78;
  color: white;
}

.status-indicator.disconnected {
  background: #f56565;
  color: white;
}

.status-indicator.idle {
  background: #ed8936;
  color: white;
}

.status-indicator.navigating {
  background: #4299e1;
  color: white;
}

.connection-section,
.topics-section,
.robot-status-section {
  margin-bottom: 25px;
  padding: 15px;
  background: #2d3748;
  border-radius: 8px;
}

.connection-section h4,
.topics-section h4,
.robot-status-section h4 {
  color: #e2e8f0;
  margin-bottom: 15px;
  font-size: 16px;
}

.quick-subscribe {
  margin-bottom: 15px;
}

.quick-subscribe-btn {
  width: 100%;
  padding: 10px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  border: none;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s ease;
}

.quick-subscribe-btn:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
}

.quick-subscribe-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.input-group {
  margin-bottom: 15px;
}

.input-group label {
  display: block;
  color: #a0aec0;
  font-size: 14px;
  margin-bottom: 5px;
}

.input-group input {
  width: 100%;
  padding: 8px 12px;
  background: #4a5568;
  border: 1px solid #718096;
  border-radius: 4px;
  color: white;
  font-size: 14px;
}

.input-group input:focus {
  outline: none;
  border-color: #4299e1;
}

.input-group input:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.button-group {
  display: flex;
  gap: 10px;
  margin-top: 15px;
}

.connect-btn,
.update-btn,
.unsubscribe-btn,
.subscribe-btn,
.cancel-btn {
  padding: 8px 16px;
  border: none;
  border-radius: 4px;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.connect-btn.connect {
  background: #48bb78;
  color: white;
}

.connect-btn.disconnect {
  background: #f56565;
  color: white;
}

.connect-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.update-btn {
  background: #4299e1;
  color: white;
}

.update-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.debug-btn {
  background: #805ad5;
  color: white;
  font-size: 12px;
  padding: 6px 12px;
}

.debug-btn:hover {
  background: #6b46c1;
}

.topics-list {
  max-height: 200px;
  overflow-y: auto;
  margin-bottom: 15px;
}

.topic-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px;
  background: #4a5568;
  border-radius: 4px;
  margin-bottom: 5px;
}

.topic-name {
  color: #e2e8f0;
  font-size: 14px;
  word-break: break-all;
}

.unsubscribe-btn {
  background: #f56565;
  color: white;
  padding: 4px 8px;
  border: none;
  border-radius: 3px;
  font-size: 12px;
  cursor: pointer;
}

.unsubscribe-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.no-topics {
  text-align: center;
  color: #a0aec0;
  font-style: italic;
  padding: 20px;
}

.add-topic {
  display: flex;
  gap: 10px;
}

.add-topic input {
  flex: 1;
  padding: 8px 12px;
  background: #4a5568;
  border: 1px solid #718096;
  border-radius: 4px;
  color: white;
  font-size: 14px;
}

.subscribe-btn {
  background: #48bb78;
  color: white;
  white-space: nowrap;
}

.subscribe-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.robot-info,
.goal-info {
  background: #4a5568;
  padding: 15px;
  border-radius: 4px;
  margin-bottom: 15px;
}

.goal-info {
  border-left: 4px solid #4299e1;
}

.info-header {
  color: #4299e1;
  font-weight: 600;
  margin-bottom: 10px;
}

.info-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
  color: #e2e8f0;
  font-size: 14px;
}

.cancel-btn {
  background: #f56565;
  color: white;
  width: 100%;
  margin-top: 10px;
}

.cancel-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

/* 滚动条样式 */
.control-panel::-webkit-scrollbar {
  width: 6px;
}

.control-panel::-webkit-scrollbar-track {
  background: #2d3748;
}

.control-panel::-webkit-scrollbar-thumb {
  background: #4a5568;
  border-radius: 3px;
}

.control-panel::-webkit-scrollbar-thumb:hover {
  background: #718096;
}
</style>