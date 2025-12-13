<template>
  <div class="arm-control">
    <div class="control-header">
      <h2>🦾 机械臂控制系统</h2>
      <div class="demo-badge">DEMO</div>
    </div>

    <!-- 机械臂状态显示 -->
    <div class="arm-status">
      <div class="status-card">
        <h3>机械臂状态</h3>
        <div class="status-grid">
          <div class="status-item">
            <span class="label">连接状态:</span>
            <span :class="['status-value', armConnected ? 'connected' : 'disconnected']">
              {{ armConnected ? '已连接' : '未连接' }}
            </span>
          </div>
          <div class="status-item">
            <span class="label">运行模式:</span>
            <span class="status-value">{{ armMode }}</span>
          </div>
          <div class="status-item">
            <span class="label">当前角度:</span>
            <span class="status-value">{{ currentAngle }}°</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Demo控制区域 -->
    <div class="demo-section">
      <div class="demo-header">
        <h3>🎯 Demo 控制</h3>
        <span class="demo-indicator" :class="{ 'active': demoMode }">
          {{ demoMode ? 'Demo模式' : '正常模式' }}
        </span>
      </div>
      
      <div class="demo-controls">
        <button 
          @click="toggleDemoMode"
          :class="['demo-toggle-btn', { 'active': demoMode }]">
          {{ demoMode ? '退出Demo' : '启动Demo' }}
        </button>
        
        <button 
          @click="callRunLinearInsert"
          :class="['service-btn', { 'executing': serviceExecuting }]"
          :disabled="!demoMode || serviceExecuting">
          {{ serviceExecuting ? '执行中...' : '🚀 执行线性插入服务' }}
        </button>
      </div>

      <div class="service-status" v-if="serviceResult">
        <h4>服务调用结果:</h4>
        <div class="service-result">
          <div class="result-item">
            <span class="label">状态:</span>
            <span :class="['status', serviceResult.success ? 'success' : 'error']">
              {{ serviceResult.success ? '成功' : '失败' }}
            </span>
          </div>
          <div class="result-item" v-if="serviceResult.message">
            <span class="label">消息:</span>
            <span class="message">{{ serviceResult.message }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { ref, reactive, onMounted, onUnmounted } from 'vue'
import apiService from '../services/apiService'

export default {
  name: 'ArmControl',
  
  setup() {
    // 响应式数据
    const armConnected = ref(false)
    const armMode = ref('待机')
    const currentAngle = ref(0)
    const demoMode = ref(false)
    const serviceExecuting = ref(false)
    const serviceResult = ref(null)
    
    // 连接机械臂
    const connectArm = async () => {
      try {
        // 模拟连接过程
        await new Promise(resolve => setTimeout(resolve, 1000))
        
        armConnected.value = true
        armMode.value = '就绪'
        
      } catch (error) {
        console.error(`连接失败: ${error.message}`)
      }
    }
    
    // 断开连接
    const disconnectArm = () => {
      armConnected.value = false
      armMode.value = '待机'
    }
    
    // 切换Demo模式
    const toggleDemoMode = () => {
      demoMode.value = !demoMode.value
      addLog(demoMode.value ? 'Demo模式已启动' : 'Demo模式已关闭', 'info')
    }
    
    // 调用ROS2服务
    const callRunLinearInsert = async () => {
      if (serviceExecuting.value) return
      
      try {
        serviceExecuting.value = true
        serviceResult.value = null
        
        addLog('调用ROS2服务: /run_linear_insert', 'info')
        
        // 这里调用实际的ROS2服务
        const result = await ros2ServiceCall()
        
        serviceResult.value = result
        addLog(`服务调用完成: ${result.success ? '成功' : '失败'}`, 
               result.success ? 'success' : 'error')
               
      } catch (error) {
        serviceResult.value = {
          success: false,
          message: error.message
        }
        addLog(`服务调用失败: ${error.message}`, 'error')
      } finally {
        serviceExecuting.value = false
      }
    }
    
    // ROS2服务调用实现
    const ros2ServiceCall = async () => {
      try {
        // 使用apiService调用ROS2服务
        const result = await apiService.runLinearInsert()
        
        return {
          success: result.success !== false, // 默认认为成功
          message: result.message || '线性插入操作完成'
        }
        
      } catch (error) {
        console.error('ROS2服务调用异常:', error)
        
        // 返回失败结果
        return {
          success: false,
          message: `服务调用失败: ${error.message}`
        }
      }
    }
    
    // 模拟实时状态更新
    let statusUpdateInterval = null
    
    const startStatusUpdates = () => {
      statusUpdateInterval = setInterval(() => {
        if (armConnected.value && !serviceExecuting.value) {
          // 模拟角度小幅变化
          currentAngle.value = Math.round((Math.random() * 0.5 - 0.25 + Number(currentAngle.value)) * 100) / 100
          // 保持在合理范围内
          if (currentAngle.value < -90) currentAngle.value = -90
          if (currentAngle.value > 90) currentAngle.value = 90
        }
      }, 1000)
    }
    
    onMounted(() => {
      console.log('机械臂控制组件初始化')
      connectArm()
      startStatusUpdates()
    })
    
    onUnmounted(() => {
      if (statusUpdateInterval) {
        clearInterval(statusUpdateInterval)
      }
      disconnectArm()
    })
    
    return {
      armConnected,
      armMode,
      currentAngle,
      demoMode,
      serviceExecuting,
      serviceResult,
      connectArm,
      disconnectArm,
      toggleDemoMode,
      callRunLinearInsert
    }
  }
}
</script>

<style scoped>
.arm-control {
  padding: 20px;
  background: #1a1a1a;
  color: #e0e0e0;
  height: 100%;
  overflow-y: auto;
}

.control-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
  padding-bottom: 15px;
  border-bottom: 2px solid #333;
}

.control-header h2 {
  margin: 0;
  color: #4CAF50;
}

.demo-badge {
  background: #FF9800;
  color: white;
  padding: 4px 12px;
  border-radius: 15px;
  font-size: 12px;
  font-weight: bold;
}

.arm-status {
  margin-bottom: 20px;
}

.status-card {
  background: #2a2a2a;
  border-radius: 8px;
  padding: 15px;
  border-left: 4px solid #4CAF50;
}

.status-card h3 {
  margin: 0 0 10px 0;
  color: #4CAF50;
}

.status-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 10px;
}

.status-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.status-item .label {
  color: #999;
}

.status-value {
  font-weight: bold;
}

.status-value.connected {
  color: #4CAF50;
}

.status-value.disconnected {
  color: #f44336;
}



.demo-section {
  background: linear-gradient(135deg, #2a2a2a 0%, #1e3c72 100%);
  border-radius: 12px;
  padding: 20px;
  margin-top: 20px;
  border: 2px solid #FF9800;
}

.demo-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 15px;
}

.demo-header h3 {
  margin: 0;
  color: #FF9800;
}

.demo-indicator {
  background: #666;
  color: white;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 12px;
}

.demo-indicator.active {
  background: #FF9800;
  animation: pulse 2s infinite;
}

.demo-controls {
  display: flex;
  gap: 15px;
  margin-bottom: 15px;
}

.demo-toggle-btn {
  background: #666;
  color: white;
  border: none;
  padding: 10px 20px;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.3s ease;
}

.demo-toggle-btn.active {
  background: #FF9800;
}

.service-btn {
  background: #4CAF50;
  color: white;
  border: none;
  padding: 12px 24px;
  border-radius: 6px;
  cursor: pointer;
  font-weight: bold;
  transition: all 0.3s ease;
  flex: 1;
}

.service-btn:hover:not(:disabled) {
  background: #45a049;
}

.service-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.service-btn.executing {
  background: #FF9800;
  animation: pulse 1s infinite;
}

.service-status {
  background: rgba(0, 0, 0, 0.3);
  border-radius: 6px;
  padding: 15px;
}

.service-status h4 {
  margin: 0 0 10px 0;
  color: #FF9800;
}

.service-result {
  display: grid;
  gap: 8px;
}

.result-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.result-item .label {
  color: #999;
}

.result-item .status.success {
  color: #4CAF50;
}

.result-item .status.error {
  color: #f44336;
}

.result-item .message {
  color: #e0e0e0;
  max-width: 300px;
  text-align: right;
}



@keyframes pulse {
  0% { opacity: 1; }
  50% { opacity: 0.7; }
  100% { opacity: 1; }
}

/* 响应式设计 */
@media (max-width: 768px) {
  .arm-control {
    padding: 15px;
  }
  
  .demo-controls {
    flex-direction: column;
  }
  
  .status-grid {
    grid-template-columns: 1fr;
  }
}
</style>