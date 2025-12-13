<template>
  <div class="cruise-control">
    <div class="panel-header">
      <h3>🚗 巡航控制</h3>
    </div>
    
    <!-- 巡航状态 -->
    <div class="status-section">
      <div class="status-item">
        <span class="status-label">巡航状态:</span>
        <span :class="['status-indicator', cruiseStatusClass]">
          {{ cruiseStatusText }}
        </span>
      </div>
      
      <div class="status-item">
        <span class="status-label">当前目标:</span>
        <span class="status-value">{{ currentGoal || '无' }}</span>
      </div>
      
      <div class="status-item">
        <span class="status-label">巡航点数:</span>
        <span class="status-value">{{ waypoints.length }}</span>
      </div>
    </div>
    
    <!-- 巡航控制按钮 -->
    <div class="cruise-controls">
      <h4>巡航控制</h4>
      <div class="button-group">
        <button 
          @click="startCruise" 
          class="control-btn start"
          :disabled="!mqttConnected || cruiseStatus === 'navigating'">
          ▶️ 开始巡航
        </button>
        
        <button 
          @click="stopCruise" 
          class="control-btn stop"
          :disabled="!mqttConnected || cruiseStatus === 'stopped'">
          ⏹️ 停止巡航
        </button>
        
        <button 
          @click="resumeCruise" 
          class="control-btn resume"
          :disabled="!mqttConnected || cruiseStatus !== 'stopped'">
          ⏯️ 恢复巡航
        </button>
      </div>
    </div>
    
    <!-- 手动控制 -->
    <div class="manual-control">
      <h4>手动控制</h4>
      
      <!-- 手动控制状态提示 -->
      <div v-if="cruiseStatus !== 'stopped'" class="manual-control-warning">
        ⚠️ 手动控制仅在巡航停止状态下可用
      </div>
      <div class="control-grid">
        <!-- 前进后退 -->
        <div class="control-row">
          <button 
            @mousedown="startMove('forward')" 
            @mouseup="stopMove" 
            @mouseleave="stopMove"
            class="direction-btn up"
            :disabled="!mqttConnected || cruiseStatus !== 'stopped'">
            ⬆️
          </button>
        </div>
        
        <!-- 左右转向 -->
        <div class="control-row">
          <button 
            @mousedown="startMove('left')" 
            @mouseup="stopMove" 
            @mouseleave="stopMove"
            class="direction-btn left"
            :disabled="!mqttConnected || cruiseStatus !== 'stopped'">
            ⬅️
          </button>
          
          <button 
            @mousedown="startMove('backward')" 
            @mouseup="stopMove" 
            @mouseleave="stopMove"
            class="direction-btn down"
            :disabled="!mqttConnected || cruiseStatus !== 'stopped'">
            ⬇️
          </button>
          
          <button 
            @mousedown="startMove('right')" 
            @mouseup="stopMove" 
            @mouseleave="stopMove"
            class="direction-btn right"
            :disabled="!mqttConnected || cruiseStatus !== 'stopped'">
            ➡️
          </button>
        </div>
      </div>
      
      <div class="speed-control">
        <label>速度控制:</label>
        <div class="speed-slider">
          <input 
            v-model="linearSpeed" 
            type="range" 
            min="0.1" 
            max="1.0" 
            step="0.1"
            :disabled="!mqttConnected || cruiseStatus !== 'stopped'"
          />
          <span>{{ linearSpeed }} m/s</span>
        </div>
        
        <label>转向速度:</label>
        <div class="speed-slider">
          <input 
            v-model="angularSpeed" 
            type="range" 
            min="0.1" 
            max="1.0" 
            step="0.1"
            :disabled="!mqttConnected || cruiseStatus !== 'stopped'"
          />
          <span>{{ angularSpeed }} rad/s</span>
        </div>
      </div>
    </div>
    
    <!-- 手动抓拍 -->
    <div class="photo-capture">
      <h4>📸 手动抓拍</h4>
      
      <div class="capture-controls">
        <div class="capture-inputs">
          <div class="input-group">
            <label>抓拍标签:</label>
            <input 
              v-model="captureLabel" 
              type="text" 
              placeholder="例如: checkpoint_a"
              :disabled="!mqttConnected"
            />
          </div>
          
          <div class="input-group">
            <label>会话标识:</label>
            <input 
              v-model="captureSession" 
              type="text" 
              placeholder="留空自动生成"
              :disabled="!mqttConnected"
            />
          </div>
        </div>
        
        <div class="capture-buttons">
          <button 
            @click="capturePhoto" 
            class="capture-btn"
            :disabled="!mqttConnected || isCapturing">
            {{ isCapturing ? '📸 抓拍中...' : '📸 立即抓拍' }}
          </button>
          
          <button 
            @click="viewPhotos" 
            class="view-btn"
            :disabled="!mqttConnected">
            🖼️ 查看照片
          </button>
        </div>
      </div>
      
      <!-- 抓拍结果显示 -->
      <div v-if="captureResult" class="capture-result">
        <div class="result-header">
          <strong>📸 抓拍结果</strong>
        </div>
        <div class="result-item">
          <span class="result-label">状态:</span>
          <span :class="['result-value', captureResult.success ? 'success' : 'error']">
            {{ captureResult.success ? '成功' : '失败' }}
          </span>
        </div>
        <div v-if="captureResult.success" class="result-item">
          <span class="result-label">路径:</span>
          <span class="result-value">{{ captureResult.path || captureResult.relative_path }}</span>
        </div>
        <div v-if="captureResult.success" class="result-item">
          <span class="result-label">标签:</span>
          <span class="result-value">{{ captureResult.label }}</span>
        </div>
        <div v-if="captureResult.success" class="result-item">
          <span class="result-label">会话:</span>
          <span class="result-value">{{ captureResult.session }}</span>
        </div>
        <div v-if="captureResult.success" class="result-item">
          <span class="result-label">时间:</span>
          <span class="result-value">{{ captureResult.timestamp }}</span>
        </div>
        <div v-if="!captureResult.success" class="result-item">
          <span class="result-label">错误:</span>
          <span class="result-value error">{{ captureResult.error }}</span>
        </div>
      </div>
    </div>
    
    <!-- 巡航点管理 -->
    <div class="waypoint-management">
      <h4>巡航点管理</h4>
      
      <div class="waypoint-actions">
        <button 
          @click="loadWaypoints" 
          class="action-btn"
          :disabled="!mqttConnected">
          🔄 刷新巡航点
        </button>
        
        <button 
          @click="showAddWaypoint = true" 
          class="action-btn add"
          :disabled="!mqttConnected">
          ➕ 添加巡航点
        </button>
        
        <button 
          @click="saveWaypoints" 
          class="action-btn save"
          :disabled="!mqttConnected || waypoints.length === 0">
          💾 保存巡航点
        </button>
      </div>
      
      <!-- 巡航点列表 -->
      <div class="waypoint-list">
        <div 
          v-for="(waypoint, index) in waypoints" 
          :key="waypoint.name"
          class="waypoint-item">
          <div class="waypoint-info">
            <div class="waypoint-name">{{ waypoint.name }}</div>
            <div class="waypoint-coords">
              ROS (X: {{ waypoint.position.x.toFixed(2) }}, 
              Y: {{ waypoint.position.y.toFixed(2) }})
            </div>
          </div>
          
          <div class="waypoint-actions">
            <button 
              @click="goToWaypoint(waypoint)" 
              class="mini-btn go"
              title="前往此巡航点">
              🎯
            </button>
            
            <button 
              @click="editWaypoint(index)" 
              class="mini-btn edit"
              title="编辑巡航点">
              ✏️
            </button>
            
            <button 
              @click="deleteWaypoint(index)" 
              class="mini-btn delete"
              title="删除巡航点">
              🗑️
            </button>
          </div>
        </div>
        
        <div v-if="waypoints.length === 0" class="no-waypoints">
          暂无巡航点，请添加巡航点
        </div>
      </div>
    </div>
    
    <!-- 添加/编辑巡航点模态框 -->
    <div v-if="showAddWaypoint || editingIndex !== -1" class="modal-overlay" @click="closeWaypointModal">
      <div class="modal-content" @click.stop>
        <div class="modal-header">
          <h3>{{ editingIndex === -1 ? '添加巡航点' : '编辑巡航点' }}</h3>
          <button @click="closeWaypointModal" class="modal-close">×</button>
        </div>
        
        <div class="modal-body">
          <div class="form-group">
            <label>巡航点名称:</label>
            <input v-model="waypointForm.name" type="text" placeholder="例如: waypoint_a" />
          </div>
          
          <div class="form-group">
            <label>X 坐标 (ROS):</label>
            <input v-model.number="waypointForm.position.x" type="number" step="0.1" />
          </div>
          
          <div class="form-group">
            <label>Y 坐标 (ROS):</label>
            <input v-model.number="waypointForm.position.y" type="number" step="0.1" />
          </div>
          
          <div class="form-group">
            <label>YAW 角度 (弧度):</label>
            <input v-model.number="waypointForm.orientation.yaw" type="number" step="0.1" />
          </div>
          
          <div class="form-group">
            <label>到达前等待时间 (秒):</label>
            <input v-model.number="waypointForm.wait_before" type="number" step="0.5" min="0" />
          </div>
          
          <div class="form-group">
            <label>到达后等待时间 (秒):</label>
            <input v-model.number="waypointForm.wait_after" type="number" step="0.5" min="0" />
          </div>
        </div>
        
        <div class="modal-footer">
          <button @click="saveWaypoint" class="btn-primary">保存</button>
          <button @click="closeWaypointModal" class="btn-secondary">取消</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRobotStore } from '../stores/robotStore'
import apiService from '../services/apiService'
import mqttService from '../services/mqttService'

export default {
  name: 'CruiseControl',
  
  setup() {
    const robotStore = useRobotStore()
    
    // 响应式数据
    const cruiseStatus = ref('idle') // idle, navigating, stopped
    const currentGoal = ref('')
    const waypoints = ref([])
    const showAddWaypoint = ref(false)
    const editingIndex = ref(-1)
    const waypointForm = ref({
      name: '',
      position: { x: 0, y: 0, z: 0 },
      orientation: { yaw: 0 },
      wait_before: 2.0,
      wait_after: 3.0
    })
    
    // 手动控制相关
    const linearSpeed = ref(0.3)
    const angularSpeed = ref(0.5)
    const isMoving = ref(false)
    
    // 手动抓拍相关
    const captureLabel = ref('')
    const captureSession = ref('')
    const isCapturing = ref(false)
    const captureResult = ref(null)
    
    // 计算属性
    const mqttConnected = computed(() => robotStore.mqttConnected)
    
    const cruiseStatusText = computed(() => {
      const statusMap = {
        'idle': '待机',
        'navigating': '巡航中',
        'stopped': '已停止'
      }
      return statusMap[cruiseStatus.value] || '未知'
    })
    
    const cruiseStatusClass = computed(() => {
      const classMap = {
        'idle': 'idle',
        'navigating': 'navigating',
        'stopped': 'stopped'
      }
      return classMap[cruiseStatus.value] || 'idle'
    })
    
    // 方法
    const loadWaypoints = async () => {
      try {
        const response = await apiService.getDefaultGoals()
        if (response && response.goals) {
          waypoints.value = response.goals
          console.log('加载巡航点成功:', waypoints.value)
        }
      } catch (error) {
        console.error('加载巡航点失败:', error)
        alert('加载巡航点失败: ' + error.message)
      }
    }
    
    const saveWaypoints = async () => {
      try {
        const response = await apiService.updateDefaultGoals(waypoints.value)
        console.log('保存巡航点成功:', response)
        alert('巡航点保存成功!')
      } catch (error) {
        console.error('保存巡航点失败:', error)
        alert('保存巡航点失败: ' + error.message)
      }
    }
    
    const startCruise = async () => {
      try {
        // 恢复巡航相当于开始巡航
        await apiService.resumeNavigation()
        cruiseStatus.value = 'navigating'
        console.log('巡航已开始')
      } catch (error) {
        console.error('开始巡航失败:', error)
        alert('开始巡航失败: ' + error.message)
      }
    }
    
    const stopCruise = async () => {
      try {
        await apiService.holdNavigation()
        cruiseStatus.value = 'stopped'
        console.log('巡航已停止')
      } catch (error) {
        console.error('停止巡航失败:', error)
        alert('停止巡航失败: ' + error.message)
      }
    }
    
    const resumeCruise = async () => {
      try {
        await apiService.resumeNavigation()
        cruiseStatus.value = 'navigating'
        console.log('巡航已恢复')
      } catch (error) {
        console.error('恢复巡航失败:', error)
        alert('恢复巡航失败: ' + error.message)
      }
    }
    
    const goToWaypoint = async (waypoint) => {
      try {
        await apiService.sendGoalPose({
          name: waypoint.name,
          x: waypoint.position.x,
          y: waypoint.position.y,
          yaw: waypoint.orientation.yaw,
          wait_before: waypoint.wait_before,
          wait_after: waypoint.wait_after
        })
        currentGoal.value = waypoint.name
        cruiseStatus.value = 'navigating'
        console.log('前往巡航点:', waypoint.name)
      } catch (error) {
        console.error('前往巡航点失败:', error)
        alert('前往巡航点失败: ' + error.message)
      }
    }
    
    // 手动控制方法
    const startMove = (direction) => {
      // 检查巡航状态，只有在停止状态下才能手动控制
      if (cruiseStatus.value !== 'stopped') {
        alert('请先停止巡航后再进行手动控制！')
        return
      }
      
      if (isMoving.value) return
      
      isMoving.value = true
      let linearX = 0
      let angularZ = 0
      
      switch (direction) {
        case 'forward':
          linearX = linearSpeed.value
          break
        case 'backward':
          linearX = -linearSpeed.value
          break
        case 'left':
          angularZ = angularSpeed.value
          break
        case 'right':
          angularZ = -angularSpeed.value
          break
      }
      
      // 发布速度命令
      const twistMsg = {
        linear: { x: linearX, y: 0, z: 0 },
        angular: { x: 0, y: 0, z: angularZ }
      }
      
      // 通过MQTT发布到/cmd_vel话题
      mqttService.publish('/cmd_vel', JSON.stringify(twistMsg))
      console.log('发布移动命令:', direction, twistMsg)
    }
    
    const stopMove = () => {
      if (!isMoving.value) return
      
      isMoving.value = false
      
      // 停止机器人
      const twistMsg = {
        linear: { x: 0, y: 0, z: 0 },
        angular: { x: 0, y: 0, z: 0 }
      }
      
      mqttService.publish('/cmd_vel', JSON.stringify(twistMsg))
      console.log('停止移动')
    }
    
    // 巡航点管理方法
    const editWaypoint = (index) => {
      editingIndex.value = index
      const waypoint = waypoints.value[index]
      waypointForm.value = {
        name: waypoint.name,
        position: { ...waypoint.position },
        orientation: { ...waypoint.orientation },
        wait_before: waypoint.wait_before || 2.0,
        wait_after: waypoint.wait_after || 3.0
      }
    }
    
    const deleteWaypoint = (index) => {
      if (confirm(`确定删除巡航点 "${waypoints.value[index].name}" 吗？`)) {
        waypoints.value.splice(index, 1)
      }
    }
    
    const saveWaypoint = () => {
      if (!waypointForm.value.name.trim()) {
        alert('请输入巡航点名称')
        return
      }
      
      const waypoint = { ...waypointForm.value }
      
      if (editingIndex.value === -1) {
        // 添加新巡航点
        waypoints.value.push(waypoint)
      } else {
        // 更新现有巡航点
        waypoints.value[editingIndex.value] = waypoint
      }
      
      closeWaypointModal()
    }
    
    const closeWaypointModal = () => {
      showAddWaypoint.value = false
      editingIndex.value = -1
      waypointForm.value = {
        name: '',
        position: { x: 0, y: 0, z: 0 },
        orientation: { yaw: 0 },
        wait_before: 2.0,
        wait_after: 3.0
      }
    }
    
    // 手动抓拍方法
    const capturePhoto = async () => {
      if (isCapturing.value) return
      
      isCapturing.value = true
      captureResult.value = null
      
      try {
        const result = await apiService.captureManualPhoto(
          captureLabel.value || null,
          captureSession.value || null
        )
        
        captureResult.value = result
        
        if (result.success) {
          console.log('手动抓拍成功:', result)
          // 清空输入框
          captureLabel.value = ''
          captureSession.value = ''
        } else {
          console.error('手动抓拍失败:', result)
        }
      } catch (error) {
        console.error('手动抓拍异常:', error)
        captureResult.value = {
          success: false,
          error: error.message || '抓拍失败'
        }
      } finally {
        isCapturing.value = false
      }
    }
    
    const viewPhotos = async () => {
      try {
        const result = await apiService.getCameraImages('/home/dlrobot/dlrobot_autocontrol/photos')
        console.log('相机图片列表:', result)
        
        if (result.success && result.images && result.images.length > 0) {
          // 简单显示图片数量，后续可以扩展为图片浏览器
          alert(`共有 ${result.images.length} 张照片\n最新照片: ${result.images[0]}`)
        } else {
          alert('暂无照片或获取失败')
        }
      } catch (error) {
        console.error('查看照片失败:', error)
        alert('查看照片失败: ' + error.message)
      }
    }
    
    // 组件挂载时加载巡航点
    onMounted(() => {
      loadWaypoints()
    })
    
    // 组件卸载时确保停止移动
    onUnmounted(() => {
      stopMove()
    })
    
    return {
      cruiseStatus,
      currentGoal,
      waypoints,
      showAddWaypoint,
      editingIndex,
      waypointForm,
      linearSpeed,
      angularSpeed,
      isMoving,
      mqttConnected,
      cruiseStatusText,
      cruiseStatusClass,
      // 手动抓拍相关
      captureLabel,
      captureSession,
      isCapturing,
      captureResult,
      // 方法
      loadWaypoints,
      saveWaypoints,
      startCruise,
      stopCruise,
      resumeCruise,
      goToWaypoint,
      startMove,
      stopMove,
      editWaypoint,
      deleteWaypoint,
      saveWaypoint,
      closeWaypointModal,
      capturePhoto,
      viewPhotos
    }
  }
}
</script>

<style scoped>
.cruise-control {
  height: 100%;
  background: #1a202c;
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
  margin: 0;
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

.status-value {
  color: #e2e8f0;
  font-size: 14px;
  font-weight: 600;
}

.status-indicator {
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 600;
}

.status-indicator.idle {
  background: #ed8936;
  color: white;
}

.status-indicator.navigating {
  background: #4299e1;
  color: white;
}

.status-indicator.stopped {
  background: #f56565;
  color: white;
}

.cruise-controls,
.manual-control,
.photo-capture,
.waypoint-management {
  margin-bottom: 25px;
  padding: 15px;
  background: #2d3748;
  border-radius: 8px;
}

.cruise-controls h4,
.manual-control h4,
.photo-capture h4,
.waypoint-management h4 {
  color: #e2e8f0;
  margin-bottom: 15px;
  font-size: 16px;
}

.manual-control-warning {
  background: #ed8936;
  color: white;
  padding: 10px;
  border-radius: 6px;
  font-size: 13px;
  margin-bottom: 15px;
  text-align: center;
}

.button-group {
  display: flex;
  gap: 10px;
  margin-bottom: 15px;
}

.control-btn {
  flex: 1;
  padding: 10px;
  border: none;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
}

.control-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.control-btn.start {
  background: #48bb78;
  color: white;
}

.control-btn.start:hover:not(:disabled) {
  background: #38a169;
}

.control-btn.stop {
  background: #f56565;
  color: white;
}

.control-btn.stop:hover:not(:disabled) {
  background: #e53e3e;
}

.control-btn.resume {
  background: #4299e1;
  color: white;
}

.control-btn.resume:hover:not(:disabled) {
  background: #3182ce;
}

.control-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 5px;
  max-width: 200px;
  margin: 0 auto 15px;
}

.control-row {
  display: flex;
  gap: 5px;
  justify-content: center;
}

.control-row:first-child {
  grid-column: 2;
}

.direction-btn {
  width: 50px;
  height: 50px;
  border: none;
  border-radius: 8px;
  background: #4a5568;
  color: white;
  font-size: 20px;
  cursor: pointer;
  transition: all 0.2s ease;
  user-select: none;
}

.direction-btn:hover:not(:disabled) {
  background: #718096;
  transform: scale(1.05);
}

.direction-btn:active:not(:disabled) {
  background: #2d3748;
  transform: scale(0.95);
}

.direction-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.speed-control {
  margin-top: 15px;
}

.speed-control label {
  display: block;
  color: #a0aec0;
  font-size: 14px;
  margin-bottom: 5px;
}

.speed-slider {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
}

.speed-slider input {
  flex: 1;
  height: 6px;
  border-radius: 3px;
  background: #4a5568;
  outline: none;
}

.speed-slider input::-webkit-slider-thumb {
  appearance: none;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: #4299e1;
  cursor: pointer;
}

.speed-slider span {
  color: #e2e8f0;
  font-size: 14px;
  min-width: 60px;
}

.waypoint-actions {
  display: flex;
  gap: 10px;
  margin-bottom: 15px;
}

.action-btn {
  flex: 1;
  padding: 8px 12px;
  border: none;
  border-radius: 4px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
}

.action-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.action-btn:not(.add):not(.save) {
  background: #718096;
  color: white;
}

.action-btn.add {
  background: #48bb78;
  color: white;
}

.action-btn.save {
  background: #4299e1;
  color: white;
}

.action-btn:hover:not(:disabled) {
  opacity: 0.8;
}

.waypoint-list {
  max-height: 300px;
  overflow-y: auto;
}

.waypoint-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px;
  background: #4a5568;
  border-radius: 4px;
  margin-bottom: 8px;
}

.waypoint-info {
  flex: 1;
}

.waypoint-name {
  color: #e2e8f0;
  font-weight: 600;
  font-size: 14px;
  margin-bottom: 4px;
}

.waypoint-coords {
  color: #a0aec0;
  font-size: 12px;
}

.waypoint-actions {
  display: flex;
  gap: 5px;
}

.mini-btn {
  width: 30px;
  height: 30px;
  border: none;
  border-radius: 4px;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.mini-btn.go {
  background: #4299e1;
}

.mini-btn.edit {
  background: #ed8936;
}

.mini-btn.delete {
  background: #f56565;
}

.mini-btn:hover {
  opacity: 0.8;
}

.no-waypoints {
  text-align: center;
  color: #a0aec0;
  font-style: italic;
  padding: 20px;
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
}

.modal-content {
  background: #2d3748;
  border-radius: 12px;
  width: 400px;
  max-width: 90vw;
  max-height: 80vh;
  overflow: hidden;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px;
  border-bottom: 1px solid #4a5568;
}

.modal-header h3 {
  color: #e2e8f0;
  margin: 0;
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
  background: #4a5568;
  color: #e2e8f0;
}

.modal-body {
  padding: 20px;
  max-height: 400px;
  overflow-y: auto;
}

.form-group {
  margin-bottom: 15px;
}

.form-group label {
  display: block;
  color: #a0aec0;
  font-size: 14px;
  margin-bottom: 5px;
}

.form-group input {
  width: 100%;
  padding: 8px 12px;
  background: #4a5568;
  border: 1px solid #718096;
  border-radius: 4px;
  color: white;
  font-size: 14px;
}

.form-group input:focus {
  outline: none;
  border-color: #4299e1;
}

.modal-footer {
  display: flex;
  gap: 10px;
  justify-content: flex-end;
  padding: 20px;
  border-top: 1px solid #4a5568;
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
  background: #718096;
  color: white;
}

.btn-secondary:hover {
  background: #4a5568;
}

/* 滚动条样式 */
.cruise-control::-webkit-scrollbar,
.waypoint-list::-webkit-scrollbar,
.modal-body::-webkit-scrollbar {
  width: 6px;
}

.cruise-control::-webkit-scrollbar-track,
.waypoint-list::-webkit-scrollbar-track,
.modal-body::-webkit-scrollbar-track {
  background: #2d3748;
}

.cruise-control::-webkit-scrollbar-thumb,
.waypoint-list::-webkit-scrollbar-thumb,
.modal-body::-webkit-scrollbar-thumb {
  background: #4a5568;
  border-radius: 3px;
}

.cruise-control::-webkit-scrollbar-thumb:hover,
.waypoint-list::-webkit-scrollbar-thumb:hover,
.modal-body::-webkit-scrollbar-thumb:hover {
  background: #718096;
}

/* 手动抓拍样式 */
.capture-controls {
  margin-bottom: 15px;
}

.capture-inputs {
  display: flex;
  gap: 15px;
  margin-bottom: 15px;
}

.input-group {
  flex: 1;
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

.capture-buttons {
  display: flex;
  gap: 10px;
}

.capture-btn,
.view-btn {
  flex: 1;
  padding: 10px;
  border: none;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
}

.capture-btn {
  background: #48bb78;
  color: white;
}

.capture-btn:hover:not(:disabled) {
  background: #38a169;
}

.capture-btn:disabled {
  background: #718096;
  cursor: not-allowed;
}

.view-btn {
  background: #4299e1;
  color: white;
}

.view-btn:hover:not(:disabled) {
  background: #3182ce;
}

.view-btn:disabled {
  background: #718096;
  cursor: not-allowed;
}

.capture-result {
  margin-top: 15px;
  padding: 12px;
  background: #4a5568;
  border-radius: 6px;
  border: 1px solid #718096;
}

.result-header {
  color: #63b3ed;
  font-weight: bold;
  margin-bottom: 10px;
  text-align: center;
  font-size: 14px;
  border-bottom: 1px solid #718096;
  padding-bottom: 5px;
}

.result-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
  font-size: 13px;
}

.result-item:last-child {
  margin-bottom: 0;
}

.result-label {
  color: #a0aec0;
  font-weight: 500;
}

.result-value {
  color: #e2e8f0;
  font-weight: 600;
  word-break: break-all;
  max-width: 60%;
}

.result-value.success {
  color: #48bb78;
}

.result-value.error {
  color: #f56565;
}
</style>