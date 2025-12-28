{
type: uploaded file
fileName: src/components/CruiseControl.vue
fullContent:
<template>
  <div class="cruise-control">
    <div class="panel-header">
      <h3>🚗 巡航控制</h3>
    </div>
    
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
          :disabled="!mqttConnected || cruiseStatus === 'idle'">
          ⏹️ 停止巡航
        </button>

        <button
          @click="pauseCruise"
          class="control-btn pause"
          :disabled="!mqttConnected || !isNavigating">
          ⏸️ 暂停巡航
        </button>

        <button
          @click="resumeCruise"
          class="control-btn resume"
          :disabled="!mqttConnected || !isPaused">
          ⏯️ 恢复巡航
        </button>

        <button
          @click="toggleCharge"
          class="control-btn charge"
          :class="{ 'active': isCharging }"
          :disabled="!mqttConnected">
          {{ isCharging ? '🚫 停止回充' : '🔋 开启回充' }}
        </button>
      </div>
    </div>
    
    <div class="manual-control">
      <h4>手动控制</h4>
      
      <div v-if="cruiseStatus !== 'idle'" class="manual-control-warning">
        ⚠️ 手动控制仅在巡航停止状态下可用
      </div>
      <div class="control-grid">
        <div class="control-row">
          <button 
            @mousedown="startMove('forward')" 
            @mouseup="stopMove" 
            @mouseleave="stopMove"
            class="direction-btn up"
            :disabled="!mqttConnected || cruiseStatus !== 'paused'">
            ⬆️
          </button>
        </div>
        
        <div class="control-row">
          <button 
            @mousedown="startMove('left')" 
            @mouseup="stopMove" 
            @mouseleave="stopMove"
            class="direction-btn left"
            :disabled="!mqttConnected || cruiseStatus !== 'paused'">
            ⬅️
          </button>
          
          <button 
            @mousedown="startMove('backward')" 
            @mouseup="stopMove" 
            @mouseleave="stopMove"
            class="direction-btn down"
            :disabled="!mqttConnected || cruiseStatus !== 'paused'">
            ⬇️
          </button>
          
          <button 
            @mousedown="startMove('right')" 
            @mouseup="stopMove" 
            @mouseleave="stopMove"
            class="direction-btn right"
            :disabled="!mqttConnected || cruiseStatus !== 'paused'">
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
            :disabled="!mqttConnected || cruiseStatus !== 'paused'"
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
            :disabled="!mqttConnected || cruiseStatus !== 'paused'"
          />
          <span>{{ angularSpeed }} rad/s</span>
        </div>
      </div>
    </div>
    
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
          @click="toggleShowTrajectory"
          :class="['action-btn', { active: showTrajectory }]"
          :disabled="!mqttConnected"
        >
          {{ showTrajectory ? '隐藏轨迹' : '显示轨迹' }}
        </button>

        <button
          @click="showAddWaypoint = true"
          class="action-btn add"
          :disabled="!mqttConnected">
          ➕ 添加巡航点
        </button>
      </div>

      <div v-if="waypoints.length === 0" class="no-waypoints">
        暂无巡航点，请添加巡航点
      </div>
      <div v-else class="waypoint-list">
        <div 
          v-for="(wp, idx) in waypoints" 
          :key="wp.name + '_' + idx" 
          class="waypoint-item"
          :class="{ 'active': currentGoal === wp.name }"
        >
          <div class="waypoint-info">
            <div class="waypoint-name">
              {{ wp.name || ('wp_' + (idx+1)) }}
              <span v-if="currentGoal === wp.name" class="current-tag">📍 当前目标</span>
            </div>
            <div class="waypoint-coords">X: {{ (wp.position?.x ?? 0).toFixed(2) }}, Y: {{ (wp.position?.y ?? 0).toFixed(2) }}</div>
          </div>
          <div class="waypoint-actions">
            <button class="mini-btn go" @click="goToWaypoint(wp)">▶</button>
            <button class="mini-btn edit" @click="editWaypoint(idx)">✎</button>
            <button class="mini-btn delete" @click="deleteWaypoint(idx)">🗑</button>
          </div>
        </div>
      </div>
    </div>
    
    <div v-if="showAddWaypoint || editingIndex !== -1" class="modal-overlay" @click="closeWaypointModal">
      <div class="modal-content" @click.stop>
        <div class="modal-header">
          <h3>{{ editingIndex === -1 ? '添加巡航点' : '编辑巡航点' }}</h3>
          <button @click="closeWaypointModal" class="modal-close">×</button>
        </div>
        
        <div class="modal-body">
          <div class="form-group">
            <label for="wp-name-input">巡航点名称:</label>
            <input id="wp-name-input" v-model="waypointForm.name" type="text" placeholder="例如: waypoint_a" />
          </div>
          
          <div class="form-group">
            <label for="wp-pos-x-input">X 坐标 (ROS):</label>
            <input id="wp-pos-x-input" v-model.number="waypointForm.position.x" type="number" step="0.1" placeholder="例如: 1.23" />
          </div>
          
          <div class="form-group">
            <label for="wp-pos-y-input">Y 坐标 (ROS):</label>
            <input id="wp-pos-y-input" v-model.number="waypointForm.position.y" type="number" step="0.1" placeholder="例如: -7.60" />
          </div>
          
          <div class="form-group">
            <label for="wp-yaw-input">YAW 角度 (弧度):</label>
            <input id="wp-yaw-input" v-model.number="waypointForm.orientation.yaw" type="number" step="0.1" placeholder="例如: 0.785" />
          </div>
          
          <div class="form-group">
            <label for="wp-wait-before-input">到达前等待时间 (秒):</label>
            <input id="wp-wait-before-input" v-model.number="waypointForm.wait_before" type="number" step="0.5" min="0" placeholder="例如: 2.0" />
          </div>
          
          <div class="form-group">
            <label for="wp-wait-after-input">到达后等待时间 (秒):</label>
            <input id="wp-wait-after-input" v-model.number="waypointForm.wait_after" type="number" step="0.5" min="0" placeholder="例如: 3.0" />
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
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useRobotStore } from '../stores/robotStore'
import apiService from '../services/apiService'
import mqttService from '../services/mqttService'
import { eventBus } from '../utils/eventBus.js'
import mockRobotService from '../services/mockRobotService'

export default {
  name: 'CruiseControl',
  
  setup() {
    const robotStore = useRobotStore()
    
    // 响应式数据
    const cruiseStatus = ref(robotStore.navigationStatus || 'idle') 
    const currentGoal = ref('')
    const isPaused = ref(false) 
    const isCharging = ref(false)
    
    // 状态防抖变量
    const lastGoalSentTime = ref(0)
    
    // 状态轮询定时器
    let statusPollTimer = null

    const emitCurrentGoal = (goalName) => {
      try {
        if (eventBus && eventBus.value && eventBus.value.emit) {
          eventBus.value.emit('cruise-current-goal', goalName)
        }
      } catch (e) {
        console.warn('CruiseControl: emitCurrentGoal failed', e)
      }
    }
    const waypoints = ref([])
    const showAddWaypoint = ref(false)
    const showTrajectory = ref(true)
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
    const isNavigating = computed(() => cruiseStatus.value === 'navigating')
    
    const cruiseStatusText = computed(() => {
      const statusMap = {
        'idle': '已停止',
        'navigating': '巡航中',
        'paused': '已暂停',
        'stopped': '已完成'
      }
      return statusMap[cruiseStatus.value] || '未知'
    })
    
    const cruiseStatusClass = computed(() => {
      const classMap = {
        'idle': 'idle',
        'navigating': 'navigating',
        'paused': 'paused',
        'stopped': 'idle'
      }
      return classMap[cruiseStatus.value] || 'idle'
    })

    // 轮询后端状态
    const pollRobotStatus = async () => {
      // 如果处于Mock模式，跳过后端API调用，使用本地状态
      if (mockRobotService && mockRobotService.isRunning) {
        return
      }
      
      try {
        const status = await apiService.getRobotStatus()
        if (status && status.success) {
          // 同步当前目标名称
          if (status.active_goal) {
            currentGoal.value = status.active_goal.name
            // 如果后端有活跃目标，状态必定是 navigating
            if (cruiseStatus.value === 'idle') {
                cruiseStatus.value = 'navigating'
            }
          } else if (!isPaused.value && cruiseStatus.value === 'navigating' && !status.pending_goal) {
             // 如果没有活跃目标也没有挂起目标，且前端认为是navigating，可能后端已经完成了
          } else if (status.pending_goal) {
             // 正在等待中(充电/间隔)
             currentGoal.value = status.pending_goal.name
          } else {
             currentGoal.value = ''
          }
          
          // 同步暂停状态
          if (status.hold_active !== undefined) {
              if (status.hold_active) {
                  cruiseStatus.value = 'paused'
                  isPaused.value = true
              } else if (cruiseStatus.value === 'paused' && !status.hold_active) {
                  // 后端已经不暂停了
                  cruiseStatus.value = 'navigating'
                  isPaused.value = false
              }
          }
          
          // ⚠️ 【新增】同步回充状态
          if (status.charging_suspended !== undefined) {
             isCharging.value = status.charging_suspended
          }
        }
      } catch (e) {
        // 忽略轮询错误，避免刷屏
      }
    }
    
    // 准备起始快照（针对MockService）
    const prepareAndWriteStartSnapshot = (targetX, targetY, targetYaw) => {
      let startPos = null
      try {
        if (mockRobotService && mockRobotService.currentPose && typeof mockRobotService.currentPose.x !== 'undefined') {
          startPos = { ...mockRobotService.currentPose }
        } else if (window.robotStore && window.robotStore.robotPose) {
          startPos = { ...window.robotStore.robotPose }
        }
      } catch (e) {
        startPos = null
      }

      if (!startPos || isNaN(startPos.x) || isNaN(startPos.y)) {
        if (window.robotStore && window.robotStore.robotPose) {
          startPos = { ...window.robotStore.robotPose }
        } else {
          startPos = { x: targetX, y: targetY, theta: targetYaw || 0 }
        }
      }

      try {
        if (mockRobotService) {
          mockRobotService.currentPose = { x: startPos.x, y: startPos.y, theta: startPos.theta }
        }
      } catch (e) {}

      return { x: startPos.x, y: startPos.y, theta: startPos.theta }
    }

    // 将当前 waypoints 同步到 localStorage 并通知其他面板
    const syncWaypointsToPanels = () => {
      try {
        if (window.localStorage) {
          window.localStorage.setItem('cruiseWaypoints', JSON.stringify(waypoints.value))
        }
        if (eventBus && eventBus.value && eventBus.value.emit) {
          eventBus.value.emit('cruise-waypoints-updated', waypoints.value)
        }
      } catch (e) {
        console.warn('同步巡航点到面板失败', e)
      }
    }

    const loadWaypoints = async () => {
      try {
        const sharedWaypoints = window.localStorage.getItem('cruiseWaypoints')
        if (sharedWaypoints) {
          const parsedWaypoints = JSON.parse(sharedWaypoints)
          waypoints.value = parsedWaypoints
          try { syncWaypointsToPanels() } catch (e) { console.warn('同步巡航点到测试面板失败', e) }
          return
        }

        const response = await apiService.getDefaultGoals()
        if (response && response.goals) {
          waypoints.value = response.goals
          try { syncWaypointsToPanels() } catch (e) { console.warn('同步巡航点到测试面板失败', e) }
        }
      } catch (error) {
        console.error('加载巡航点失败:', error)
        alert('加载巡航点失败: ' + error.message)
      }
    }
    
    const saveWaypoints = async () => {
      try {
        const response = await apiService.updateDefaultGoals(waypoints.value)
        try {
          if (window.localStorage) {
            window.localStorage.setItem('cruiseWaypoints', JSON.stringify(waypoints.value))
          }
          if (eventBus && eventBus.value && eventBus.value.emit) {
            eventBus.value.emit('cruise-waypoints-updated', waypoints.value)
          }
        } catch (e) {
          console.warn('保存巡航点到 localStorage/eventBus 失败', e)
        }
        alert('巡航点保存成功!')
      } catch (error) {
        console.error('保存巡航点失败:', error)
        alert('保存巡航点失败: ' + error.message)
      }
    }
    
    const toggleShowTrajectory = () => {
      try {
        showTrajectory.value = !showTrajectory.value
        try { if (eventBus && eventBus.value && eventBus.value.emit) eventBus.value.emit('cruise-toggle-trajectory', showTrajectory.value) } catch(e) { console.warn('emit cruise-toggle-trajectory failed', e) }
      } catch (e) {
        console.warn('toggleShowTrajectory failed', e)
      }
    }
    
    const startCruise = async () => {
      try {
        // 先确保数据同步到地图，防止地图不知道有哪些点
        try { syncWaypointsToPanels() } catch (e) { console.warn('同步巡航点到测试面板失败', e) }
        
        // ⚠️ 【修复】重新开始时，重置本地进度索引
        cruiseIndex.value = 0
        // ⚠️ 【修复】更新时间戳，启用2秒的状态保护期
        lastGoalSentTime.value = Date.now()
        
        // 模拟模式
        if (mockRobotService && mockRobotService.isRunning) {
          // ... (模拟模式代码保持不变)
          if (!waypoints.value || waypoints.value.length === 0) {
            alert('没有巡航点可供模拟')
            return
          }

          cruiseIndex.value = 0
          const wp = waypoints.value[cruiseIndex.value]
          currentGoal.value = wp.name || `wp_${cruiseIndex.value + 1}`
          emitCurrentGoal(currentGoal.value)
          lastGoalSentTime.value = Date.now() 

          try {
            try { if (mockRobotService && mockRobotService.cancelCurrentMove) mockRobotService.cancelCurrentMove() } catch(e){}
            const startSnapshot = prepareAndWriteStartSnapshot(wp.position.x, wp.position.y, wp.orientation.yaw)
            mockRobotService.sendGoalPosition({ x: wp.position.x, y: wp.position.y, yaw: wp.orientation.yaw }, startSnapshot)

            if (window.robotStore) {
              try {
                window.robotStore.setGoalPose({ x: wp.position.x, y: wp.position.y, theta: wp.orientation.yaw })
                window.robotStore.updateNavigationStatus('navigating')
              } catch (e) { }
            }
          } catch (e) {
            console.warn('CruiseControl: 调用 mockRobotService.sendGoalPosition 失败', e)
          }
          
          cruiseStatus.value = 'navigating'
          try { if (eventBus && eventBus.value && eventBus.value.emit) eventBus.value.emit('navigation-status-change', 'navigating') } catch(e){}
          isPaused.value = false 
          console.log('模拟: 巡航已开始，发送第一个巡航点', currentGoal.value)
          return
        }

        // --- 真实后端模式 ---
        
        if (waypoints.value.length === 0) {
          alert('请先添加巡航点')
          return
        }
        
        console.log('正在同步巡航点到实车...', waypoints.value)
        await apiService.updateDefaultGoals(waypoints.value)
        
        await apiService.startCruise()
        
        try { syncWaypointsToPanels() } catch (e) { }
        try { robotStore.updateNavigationStatus('navigating') } catch (e) {}
        cruiseStatus.value = 'navigating'
        try { if (eventBus && eventBus.value && eventBus.value.emit) eventBus.value.emit('navigation-status-change', 'navigating') } catch(e){}
        isPaused.value = false 
        
        // 初始设置第一个点为目标，后续由轮询更新
        if (waypoints.value.length > 0) {
            currentGoal.value = waypoints.value[0].name
            emitCurrentGoal(waypoints.value[0].name)
        }
        
        console.log('巡航已开始 (后端)')
      } catch (error) {
        console.error('开始巡航失败:', error)
        alert('开始巡航失败: ' + (error.message || error))
      }
    }
    
    const stopCruise = async () => {
      try {
        if (mockRobotService && mockRobotService.isRunning) {
          try { if (mockRobotService && mockRobotService.cancelCurrentMove) mockRobotService.cancelCurrentMove() } catch(e){}
          mockRobotService.setNavigationStatus('idle')
          try { if (window.currentMoveInterval) { clearInterval(window.currentMoveInterval); window.currentMoveInterval = null } } catch(e){}
          
          cruiseStatus.value = 'idle'
          cruiseIndex.value = -1
          currentGoal.value = ''
          emitCurrentGoal('') 
          
          try { if (window.robotStore && window.robotStore.clearGoalPose) window.robotStore.clearGoalPose() } catch(e){}
          try { if (eventBus && eventBus.value && eventBus.value.emit) eventBus.value.emit('navigation-status-change', 'idle') } catch(e){}
          isPaused.value = false
          console.log('模拟: 巡航已停止')
          return
        }
        
        await apiService.holdNavigation()
        cruiseStatus.value = 'idle'
        currentGoal.value = ''
        emitCurrentGoal('') 
        try { if (window.robotStore && window.robotStore.clearGoalPose) window.robotStore.clearGoalPose() } catch(e){}
        try { if (eventBus && eventBus.value && eventBus.value.emit) eventBus.value.emit('navigation-status-change', 'idle') } catch(e){}
        isPaused.value = false
        console.log('巡航已停止 (后端)')
      } catch (error) {
        console.error('停止巡航失败:', error)
        alert('停止巡航失败: ' + (error.message || error))
      }
    }
    
    const pauseCruise = async () => {
      try {
        if (mockRobotService && mockRobotService.isRunning) {
          try { if (mockRobotService && mockRobotService.cancelCurrentMove) mockRobotService.cancelCurrentMove() } catch(e){}
          try { if (window.currentMoveInterval) { clearInterval(window.currentMoveInterval); window.currentMoveInterval = null } } catch (e) {}
          try { mockRobotService.navigationStatus = 'paused' } catch (e) {}
          mockRobotService.setNavigationStatus('paused')
          try { if (window.robotStore) window.robotStore.updateNavigationStatus('paused') } catch (e) {}
          cruiseStatus.value = 'paused'
          try { if (eventBus && eventBus.value && eventBus.value.emit) eventBus.value.emit('navigation-status-change', 'paused') } catch(e){}
          isPaused.value = true
          console.log('模拟: 巡航已暂停')
          return
        }

        await apiService.pauseNavigation()
        cruiseStatus.value = 'paused'
        try { if (window.robotStore) window.robotStore.updateNavigationStatus('paused') } catch (e) {}
        try { if (eventBus && eventBus.value && eventBus.value.emit) eventBus.value.emit('navigation-status-change', 'paused') } catch(e){}
        isPaused.value = true
        console.log('巡航已暂停 (后端)')
      } catch (error) {
        console.error('暂停巡航失败:', error)
        alert('暂停巡航失败: ' + (error.message || error))
      }
    }
    
    const resumeCruise = async () => {
      try {
        if (mockRobotService && mockRobotService.isRunning) {
          try { if (mockRobotService && mockRobotService.cancelCurrentMove) mockRobotService.cancelCurrentMove() } catch(e){}
          try { if (window.currentMoveInterval) { clearInterval(window.currentMoveInterval); window.currentMoveInterval = null } } catch (e) {}
          mockRobotService.setNavigationStatus('navigating')
          try { if (window.robotStore) window.robotStore.updateNavigationStatus('navigating') } catch (e) {}
          cruiseStatus.value = 'navigating'
          try { if (eventBus && eventBus.value && eventBus.value.emit) eventBus.value.emit('navigation-status-change', 'navigating') } catch(e){}
          isPaused.value = false
          
          if (cruiseIndex.value >= 0 && cruiseIndex.value < waypoints.value.length) {
            const wp = waypoints.value[cruiseIndex.value]
            const startSnapshot = prepareAndWriteStartSnapshot(wp.position.x, wp.position.y, wp.orientation.yaw)
            mockRobotService.sendGoalPosition({ x: wp.position.x, y: wp.position.y, yaw: wp.orientation.yaw }, startSnapshot)
            currentGoal.value = wp.name || `wp_${cruiseIndex.value + 1}`
            emitCurrentGoal(currentGoal.value)
            lastGoalSentTime.value = Date.now()
          }
          console.log('模拟: 巡航已恢复')
          return
        }

        await apiService.resumeNavigation()
        cruiseStatus.value = 'navigating'
        try { if (window.robotStore) window.robotStore.updateNavigationStatus('navigating') } catch (e) {}
        try { if (eventBus && eventBus.value && eventBus.value.emit) eventBus.value.emit('navigation-status-change', 'navigating') } catch(e){}
        isPaused.value = false 
        console.log('巡航已恢复 (后端)')
      } catch (error) {
        console.error('恢复巡航失败:', error)
        alert('恢复巡航失败: ' + (error.message || error))
      }
    }

    // ⚠️ 【新增】回充切换逻辑
    const toggleCharge = async () => {
      try {
        if (!isCharging.value) {
          // 开启回充
          if (confirm('确定要停止当前导航并开始回充吗？')) {
             await apiService.triggerAutoRecharge()
             // 状态更新会由轮询自动处理，但为了即时反馈，手动设一下
             isCharging.value = true
             cruiseStatus.value = 'idle' // 回充时不属于巡航状态
          }
        } else {
          // 停止回充
          if (confirm('确定要停止回充吗？')) {
             await apiService.stopAutoRecharge()
             isCharging.value = false
          }
        }
      } catch (error) {
        console.error('回充操作失败:', error)
        alert('回充操作失败: ' + error.message)
      }
    }
    
    const goToWaypoint = async (waypoint) => {
      try {
        try { syncWaypointsToPanels() } catch (e) { console.warn('同步巡航点到测试面板失败', e) }
        
        // 手动点击时，先设置一下，后续会被轮询覆盖
        currentGoal.value = waypoint.name
        emitCurrentGoal(waypoint.name)
        lastGoalSentTime.value = Date.now() 

        if (mockRobotService && mockRobotService.isRunning) {
          try { if (mockRobotService && mockRobotService.cancelCurrentMove) mockRobotService.cancelCurrentMove() } catch(e){}
          const startSnapshot = prepareAndWriteStartSnapshot(waypoint.position.x, waypoint.position.y, waypoint.orientation.yaw)
          mockRobotService.sendGoalPosition({ x: waypoint.position.x, y: waypoint.position.y, yaw: waypoint.orientation.yaw }, startSnapshot)
          
          cruiseStatus.value = 'navigating'
          try { if (eventBus && eventBus.value && eventBus.value.emit) eventBus.value.emit('navigation-status-change', 'navigating') } catch(e){}
          isPaused.value = false 
          
          const idx = waypoints.value.findIndex(w => w.name === waypoint.name)
          cruiseIndex.value = idx >= 0 ? idx : cruiseIndex.value
          console.log('模拟: 前往巡航点:', waypoint.name)
          return
        }

        await apiService.sendGoalPose({
          name: waypoint.name,
          x: waypoint.position.x,
          y: waypoint.position.y,
          yaw: waypoint.orientation.yaw,
          wait_before: waypoint.wait_before,
          wait_after: waypoint.wait_after
        })
        cruiseStatus.value = 'navigating'
        console.log('前往巡航点:', waypoint.name)
      } catch (error) {
        console.error('前往巡航点失败:', error)
        alert('前往巡航点失败: ' + error.message)
      }
    }

    const cruiseIndex = ref(-1)
    const handleNavigationStatus = (newStatus) => {
      try {
        if (!(mockRobotService && mockRobotService.isRunning)) return

        if (newStatus === 'arrived' && cruiseStatus.value === 'navigating') {
          
          // 增加防抖 (1000ms)，防止离开目标时的状态跳变
          if (Date.now() - lastGoalSentTime.value < 1000) {
             return
          }

          if (cruiseIndex.value < 0) {
            cruiseIndex.value = 0
          } else {
            cruiseIndex.value++
          }

          if (cruiseIndex.value >= 0 && cruiseIndex.value < waypoints.value.length) {
            const wp = waypoints.value[cruiseIndex.value]
            
            try {
              try { if (mockRobotService && mockRobotService.cancelCurrentMove) mockRobotService.cancelCurrentMove() } catch(e){}
              const startSnapshot2 = prepareAndWriteStartSnapshot(wp.position.x, wp.position.y, wp.orientation.yaw)
              mockRobotService.sendGoalPosition({ x: wp.position.x, y: wp.position.y, yaw: wp.orientation.yaw }, startSnapshot2)
              
              if (window.robotStore) {
                try { window.robotStore.setGoalPose({ x: wp.position.x, y: wp.position.y, theta: wp.orientation.yaw }); window.robotStore.updateNavigationStatus('navigating') } catch (e) { }
              }
            } catch (e) { }
            currentGoal.value = wp.name
            emitCurrentGoal(currentGoal.value)
            lastGoalSentTime.value = Date.now() 
            console.log('模拟: 发送下一个巡航点:', currentGoal.value)
          } else {
            cruiseStatus.value = 'stopped'
            cruiseIndex.value = -1
            currentGoal.value = ''
            emitCurrentGoal('') 
            console.log('模拟: 所有巡航点已完成')
          }
        }
      } catch (e) {
        console.warn('处理模拟导航状态变化失败', e)
      }
    }
    
    // 手动控制方法
    const startMove = (direction) => {
      if (cruiseStatus.value !== 'stopped' && cruiseStatus.value !== 'idle') {
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
      
      const twistMsg = {
        linear: { x: linearX, y: 0, z: 0 },
        angular: { x: 0, y: 0, z: angularZ }
      }
      
      mqttService.publish('/cmd_vel', JSON.stringify(twistMsg))
      console.log('发布移动命令:', direction, twistMsg)
    }
    
    const stopMove = () => {
      if (!isMoving.value) return
      isMoving.value = false
      const twistMsg = {
        linear: { x: 0, y: 0, z: 0 },
        angular: { x: 0, y: 0, z: 0 }
      }
      mqttService.publish('/cmd_vel', JSON.stringify(twistMsg))
      console.log('停止移动')
    }
    
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
        syncWaypointsToPanels()
      }
    }
    
    const saveWaypoint = () => {
      if (!waypointForm.value.name.trim()) {
        alert('请输入巡航点名称')
        return
      }
      const waypoint = { ...waypointForm.value }
      if (editingIndex.value === -1) {
        waypoints.value.push(waypoint)
      } else {
        waypoints.value[editingIndex.value] = waypoint
      }
      syncWaypointsToPanels()
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
          captureLabel.value = ''
          captureSession.value = ''
        }
      } catch (error) {
        captureResult.value = { success: false, error: error.message || '抓拍失败' }
      } finally {
        isCapturing.value = false
      }
    }
    
    const viewPhotos = async () => {
      try {
        const result = await apiService.getCameraImages('/home/dlrobot/dlrobot_autocontrol/photos')
        if (result.success && result.images && result.images.length > 0) {
          alert(`共有 ${result.images.length} 张照片\n最新照片: ${result.images[0]}`)
        } else {
          alert('暂无照片或获取失败')
        }
      } catch (error) {
        alert('查看照片失败: ' + error.message)
      }
    }
    
    // 监听其他面板同步的巡航点数据
    const handleCruiseWaypointsUpdated = (newWaypoints) => {
      try {
        if (Array.isArray(newWaypoints)) {
          waypoints.value = newWaypoints
          console.log('CruiseControl: 收到外部同步的巡航点:', newWaypoints.length)
        }
      } catch (e) {
        console.warn('CruiseControl: handleCruiseWaypointsUpdated failed', e)
      }
    }

    const navStatusHandler = (newStatus) => {
      // ⚠️ 【修复】启动保护期：开始巡航的2秒内，忽略所有的"idle/stopped"信号
      // 这是因为restart会先取消旧任务，move_base发出的取消信号会被误读为"停止"
      if (Date.now() - lastGoalSentTime.value < 2000) {
        if (newStatus === 'idle' || newStatus === 'stopped') {
            console.log('启动保护期：忽略状态', newStatus)
            return
        }
      }

      if (newStatus === 'idle' || newStatus === 'paused' || newStatus === 'navigating') {
        cruiseStatus.value = newStatus
      }
      handleNavigationStatus(newStatus)
    }

    onMounted(() => {
      loadWaypoints()
      try {
        if (eventBus && eventBus.value && eventBus.value.on) {
          eventBus.value.on('cruise-waypoints-updated', handleCruiseWaypointsUpdated)
          eventBus.value.on('navigation-status-change', navStatusHandler)
        }
      } catch (e) { console.warn('注册事件失败:', e) }
      
      // 挂载时尝试从 localStorage 同步，防止事件漏掉
      try {
        const shared = window.localStorage.getItem('cruiseWaypoints')
        if (shared) waypoints.value = JSON.parse(shared)
      } catch(e) {}

      // 启动状态轮询
      statusPollTimer = setInterval(pollRobotStatus, 1000)
    })

    onUnmounted(() => {
      try {
        if (eventBus && eventBus.value && eventBus.value.off) {
          eventBus.value.off('cruise-waypoints-updated', handleCruiseWaypointsUpdated)
          eventBus.value.off('navigation-status-change', navStatusHandler)
        }
      } catch (e) {}
      
      if (statusPollTimer) {
        clearInterval(statusPollTimer)
        statusPollTimer = null
      }
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
      isNavigating,
      isPaused,
      cruiseStatusText,
      cruiseStatusClass,
      showTrajectory,
      toggleShowTrajectory,
      captureLabel,
      captureSession,
      isCapturing,
      captureResult,
      loadWaypoints,
      saveWaypoints,
      startCruise,
      stopCruise,
      pauseCruise,
      resumeCruise,
      toggleCharge,
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
/* 样式与原文件保持一致 */
.cruise-control {
  height: 100%;
  background: #1a202c;
  padding: 20px;
  overflow-y: auto;
}
.panel-header { margin-bottom: 20px; padding-bottom: 15px; border-bottom: 1px solid #2d3748; }
.panel-header h3 { color: #e2e8f0; font-size: 18px; font-weight: 600; margin: 0; }
.status-section { margin-bottom: 25px; padding: 15px; background: #2d3748; border-radius: 8px; }
.status-item { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
.status-item:last-child { margin-bottom: 0; }
.status-label { color: #a0aec0; font-size: 14px; }
.status-value { color: #e2e8f0; font-size: 14px; font-weight: 600; }
.status-indicator { padding: 4px 8px; border-radius: 4px; font-size: 12px; font-weight: 600; }
.status-indicator.idle { background: #ed8936; color: white; }
.status-indicator.navigating { background: #4299e1; color: white; }
.status-indicator.stopped { background: #f56565; color: white; }
.cruise-controls, .manual-control, .photo-capture, .waypoint-management { margin-bottom: 25px; padding: 15px; background: #2d3748; border-radius: 8px; }
.cruise-controls h4, .manual-control h4, .photo-capture h4, .waypoint-management h4 { color: #e2e8f0; margin-bottom: 15px; font-size: 16px; }
.manual-control-warning { background: #ed8936; color: white; padding: 10px; border-radius: 6px; font-size: 13px; margin-bottom: 15px; text-align: center; }
.button-group { display: flex; gap: 10px; margin-bottom: 15px; }
.control-btn { flex: 1; padding: 10px; border: none; border-radius: 6px; font-size: 14px; font-weight: 600; cursor: pointer; transition: all 0.2s ease; }
.control-btn:disabled { opacity: 0.6; cursor: not-allowed; }
.control-btn.start { background: #48bb78; color: white; }
.control-btn.start:hover:not(:disabled) { background: #38a169; }
.control-btn.stop { background: #f56565; color: white; }
.control-btn.stop:hover:not(:disabled) { background: #e53e3e; }
.control-btn.pause { background: #ed8936; color: white; }
.control-btn.pause:hover:not(:disabled) { background: #dd6b20; }
.control-btn.resume { background: #4299e1; color: white; }
.control-btn.resume:hover:not(:disabled) { background: #3182ce; }
/* ⚠️ 【新增】回充按钮样式 */
.control-btn.charge { background: #805ad5; color: white; }
.control-btn.charge:hover:not(:disabled) { background: #6b46c1; }
.control-btn.charge.active { background: #e53e3e; } /* 激活后显示红色(停止) */
.control-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 5px; max-width: 200px; margin: 0 auto 15px; }
.control-row { display: flex; gap: 5px; justify-content: center; }
.control-row:first-child { grid-column: 2; }
.direction-btn { width: 50px; height: 50px; border: none; border-radius: 8px; background: #4a5568; color: white; font-size: 20px; cursor: pointer; transition: all 0.2s ease; }
.direction-btn:hover:not(:disabled) { background: #718096; transform: scale(1.05); }
.direction-btn:active:not(:disabled) { background: #2d3748; transform: scale(0.95); }
.direction-btn:disabled { opacity: 0.6; cursor: not-allowed; }
.speed-control { margin-top: 15px; }
.speed-control label { display: block; color: #a0aec0; font-size: 14px; margin-bottom: 5px; }
.speed-slider { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; }
.speed-slider input { flex: 1; height: 6px; border-radius: 3px; background: #4a5568; outline: none; }
.speed-slider input::-webkit-slider-thumb { appearance: none; width: 16px; height: 16px; border-radius: 50%; background: #4299e1; cursor: pointer; }
.speed-slider span { color: #e2e8f0; font-size: 14px; min-width: 60px; }
.waypoint-actions { display: flex; gap: 10px; margin-bottom: 15px; }
.action-btn { flex: 1; padding: 8px 12px; border: none; border-radius: 4px; font-size: 13px; font-weight: 600; cursor: pointer; transition: all 0.2s ease; }
.action-btn:disabled { opacity: 0.6; cursor: not-allowed; }
.action-btn:not(.add):not(.save) { background: #718096; color: white; }
.action-btn.add { background: #48bb78; color: white; }
.action-btn.save { background: #4299e1; color: white; }
.action-btn:hover:not(:disabled) { opacity: 0.8; }
.waypoint-list { max-height: 300px; overflow-y: auto; }
.waypoint-item { display: flex; justify-content: space-between; align-items: center; padding: 10px; background: #4a5568; border-radius: 4px; margin-bottom: 8px; border: 1px solid transparent; transition: all 0.3s; }
.waypoint-item.active { border-color: #48bb78; background: #2f3d4e; box-shadow: 0 0 5px rgba(72, 187, 120, 0.3); }
.waypoint-info { flex: 1; }
.waypoint-name { color: #e2e8f0; font-weight: 600; font-size: 14px; margin-bottom: 4px; }
.current-tag { display: inline-block; background: #48bb78; color: white; font-size: 10px; padding: 1px 4px; border-radius: 3px; margin-left: 5px; vertical-align: middle; }
.waypoint-coords { color: #a0aec0; font-size: 12px; }
.mini-btn { width: 30px; height: 30px; border: none; border-radius: 4px; font-size: 14px; cursor: pointer; transition: all 0.2s ease; }
.mini-btn.go { background: #4299e1; }
.mini-btn.edit { background: #ed8936; }
.mini-btn.delete { background: #f56565; }
.mini-btn:hover { opacity: 0.8; }
.no-waypoints { text-align: center; color: #a0aec0; font-style: italic; padding: 20px; }
.modal-overlay { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0, 0, 0, 0.7); display: flex; align-items: center; justify-content: center; z-index: 1000; }
.modal-content { background: #2d3748; border-radius: 12px; width: 400px; max-width: 90vw; max-height: 80vh; overflow: hidden; }
.modal-header { display: flex; justify-content: space-between; align-items: center; padding: 20px; border-bottom: 1px solid #4a5568; }
.modal-header h3 { color: #e2e8f0; margin: 0; font-size: 18px; }
.modal-close { background: none; border: none; color: #a0aec0; font-size: 24px; cursor: pointer; width: 30px; height: 30px; display: flex; align-items: center; justify-content: center; border-radius: 4px; }
.modal-close:hover { background: #4a5568; color: #e2e8f0; }
.modal-body { padding: 20px; max-height: 400px; overflow-y: auto; }
.form-group { margin-bottom: 15px; }
.form-group label { display: block; color: #a0aec0; font-size: 14px; margin-bottom: 5px; }
.form-group input { width: 100%; padding: 8px 12px; background: #4a5568; border: 1px solid #718096; border-radius: 4px; color: white; font-size: 14px; }
.form-group input:focus { outline: none; border-color: #4299e1; }
.input-group input:disabled { opacity: 0.6; cursor: not-allowed; }
.modal-footer { display: flex; gap: 10px; justify-content: flex-end; padding: 20px; border-top: 1px solid #4a5568; }
.btn-primary, .btn-secondary { padding: 8px 16px; border: none; border-radius: 4px; font-size: 14px; cursor: pointer; transition: background 0.2s; }
.btn-primary { background: #4299e1; color: white; }
.btn-primary:hover { background: #3182ce; }
.btn-secondary { background: #718096; color: white; }
.btn-secondary:hover { background: #4a5568; }
.cruise-control::-webkit-scrollbar, .waypoint-list::-webkit-scrollbar, .modal-body::-webkit-scrollbar { width: 6px; }
.cruise-control::-webkit-scrollbar-track, .waypoint-list::-webkit-scrollbar-track, .modal-body::-webkit-scrollbar-track { background: #2d3748; }
.cruise-control::-webkit-scrollbar-thumb, .waypoint-list::-webkit-scrollbar-thumb, .modal-body::-webkit-scrollbar-thumb { background: #4a5568; border-radius: 3px; }
.cruise-control::-webkit-scrollbar-thumb:hover, .waypoint-list::-webkit-scrollbar-thumb:hover, .modal-body::-webkit-scrollbar-thumb:hover { background: #718096; }
.capture-controls { margin-bottom: 15px; }
.capture-inputs { display: flex; gap: 15px; margin-bottom: 15px; }
.input-group { flex: 1; }
.input-group label { display: block; color: #a0aec0; font-size: 14px; margin-bottom: 5px; }
.input-group input { width: 100%; padding: 8px 12px; background: #4a5568; border: 1px solid #718096; border-radius: 4px; color: white; font-size: 14px; }
.input-group input:focus { outline: none; border-color: #4299e1; }
.capture-buttons { display: flex; gap: 10px; }
.capture-btn, .view-btn { flex: 1; padding: 10px; border: none; border-radius: 6px; font-size: 14px; font-weight: 600; cursor: pointer; transition: all 0.2s ease; }
.capture-btn { background: #48bb78; color: white; }
.capture-btn:hover:not(:disabled) { background: #38a169; }
.capture-btn:disabled { background: #718096; cursor: not-allowed; }
.view-btn { background: #4299e1; color: white; }
.view-btn:hover:not(:disabled) { background: #3182ce; }
.view-btn:disabled { background: #718096; cursor: not-allowed; }
.capture-result { margin-top: 15px; padding: 12px; background: #4a5568; border-radius: 6px; border: 1px solid #718096; }
.result-header { color: #63b3ed; font-weight: bold; margin-bottom: 10px; text-align: center; font-size: 14px; border-bottom: 1px solid #718096; padding-bottom: 5px; }
.result-item { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; font-size: 13px; }
.result-item:last-child { margin-bottom: 0; }
.result-label { color: #a0aec0; font-weight: 500; }
.result-value { color: #e2e8f0; font-weight: 600; word-break: break-all; max-width: 60%; }
.result-value.success { color: #48bb78; }
.result-value.error { color: #f56565; }
</style>
}