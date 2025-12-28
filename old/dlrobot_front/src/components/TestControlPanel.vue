<template>
  <div class="test-control-panel">
    <div class="panel-header">
      <h3>机器人模拟测试面板</h3>
      <button 
        @click="togglePanel" 
        class="toggle-btn">
        {{ isExpanded ? '收起' : '展开' }}
      </button>
    </div>

    <div v-if="isExpanded" class="panel-content">
      <div class="control-section">
        <h4>连接控制</h4>
        <button 
          @click="startSimulation" 
          :disabled="isSimulating"
          class="control-btn start">
          启动模拟
        </button>
        <button 
          @click="stopSimulation" 
          :disabled="!isSimulating"
          class="control-btn stop">
          停止模拟
        </button>
        <button
          @click="resetRobotPosition"
          class="control-btn reset">
          恢复初始位置
        </button>
      </div>

      <div class="control-section">
        <h4>导航状态</h4>
        <div class="status-indicator">
          当前状态: <span :class="['status', navigationStatus]">{{ getStatusText(navigationStatus) }}</span>
        </div>
        <button 
          @click="setNavigationStatus('idle')" 
          :disabled="!isSimulating"
          class="control-btn">
          设为空闲
        </button>
        <button 
          @click="setNavigationStatus('navigating')" 
          :disabled="!isSimulating"
          class="control-btn">
          设为导航中
        </button>
        <button 
          @click="setNavigationStatus('arrived')" 
          :disabled="!isSimulating"
          class="control-btn">
          设为已到达
        </button>
      </div>

      <div class="control-section">
        <h4>无法到达点测试</h4>
        <div class="input-group">
          <label for="unreach-name">目标名称:</label>
          <input id="unreach-name" v-model="unreachableGoalName" type="text" placeholder="输入目标名称" />
        </div>
        <div class="input-group">
          <label for="unreach-x">X坐标:</label>
          <input id="unreach-x" v-model="unreachableGoalX" type="number" step="0.1" placeholder="例如: 1.23" />
        </div>
        <div class="input-group">
          <label for="unreach-y">Y坐标:</label>
          <input id="unreach-y" v-model="unreachableGoalY" type="number" step="0.1" placeholder="例如: -7.60" />
        </div>
        <button 
          @click="addUnreachableGoal" 
          :disabled="!isSimulating"
          class="control-btn warn">
          添加无法到达点
        </button>
        <button 
          @click="clearUnreachableGoals" 
          :disabled="!isSimulating"
          class="control-btn">
          清除所有无法到达点
        </button>
      </div>

      <div class="control-section">
        <h4>路径点测试</h4>
        <button
          @click="loadPathPointsFunc"
          :disabled="isPathMode || !isSimulating"
          class="control-btn">
          加载路径点
        </button>
        <button
          @click="clearPathPoints"
          :disabled="!isPathMode"
          class="control-btn">
          清除路径点
        </button>
        <div v-if="isPathMode && pathPoints.length > 0" class="path-status">
          <div>路径点数量: {{ pathPoints.length }}</div>
          <div>当前目标: {{ currentTargetIndex >= 0 ? currentTargetIndex + 1 : '未开始' }}/{{ pathPoints.length }}</div>
          <div>导航状态: <span :class="['status', navigationStatus]">{{ getStatusText(navigationStatus) }}</span></div>
        </div>
        <div v-if="isPathMode && pathPoints.length > 0" class="path-controls">
          <button
            @click="startPathNavigation"
            :disabled="(!mqttConnected && !isSimulating) || pathPoints.length === 0 || isNavigating"
            class="control-btn start">
            开始导航
          </button>
          <button
            @click="pausePathNavigation"
            :disabled="!isNavigating"
            class="control-btn warn">
            暂停
          </button>
          <button
            @click="resumePathNavigation"
            :disabled="!isPaused"
            class="control-btn">
            继续
          </button>
          <button
            @click="stopPathNavigation"
            :disabled="!isNavigating && !isPaused"
            class="control-btn stop">
            停止
          </button>
        </div>
      </div>

      <div class="control-section">
        <h4>机器人位置</h4>
        <div class="position-display">
          <div>X: {{ robotPosition.x.toFixed(2) }}</div>
          <div>Y: {{ robotPosition.y.toFixed(2) }}</div>
          <div>角度: {{ (robotPosition.theta * 180 / Math.PI).toFixed(1) }}°</div>
        </div>
        <div class="input-group">
          <label for="move-target-x">移动到X:</label>
          <input id="move-target-x" title="移动到X" v-model="targetX" type="number" step="0.1" placeholder="例如: 0.00" />
        </div>
        <div class="input-group">
          <label for="move-target-y">移动到Y:</label>
          <input id="move-target-y" title="移动到Y" v-model="targetY" type="number" step="0.1" placeholder="例如: 0.00" />
        </div>
        <button 
          @click="moveRobot" 
          :disabled="!isSimulating"
          class="control-btn">
          移动机器人
        </button>
      </div>

      <div class="control-section">
        <h4>传感器数据</h4>
        <button 
          @click="generateLaserScan" 
          :disabled="!isSimulating"
          class="control-btn">
          更新激光扫描
        </button>
        <button 
          @click="generateCameraImage" 
          :disabled="!isSimulating"
          class="control-btn">
          更新相机图像
        </button>
      </div>
    </div>
  </div>
</template>

<script>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRobotStore } from '../stores/robotStore'
import mockRobotService from '../services/mockRobotService'
import apiService from '../services/apiService'
import { loadPathPoints } from '../utils/pathPoints.js'
import '../utils/pathPoints.css'
import { eventBus } from '../utils/eventBus.js'

export default {
  name: 'TestControlPanel',

  setup() {
    const robotStore = useRobotStore()

    // 面板状态
    const isExpanded = ref(true)
    const isSimulating = ref(false)

    // 无法到达点输入
    const unreachableGoalName = ref('test_goal')
    const unreachableGoalX = ref(0)
    const unreachableGoalY = ref(0)

    // 机器人位置
    const targetX = ref(0)
    const targetY = ref(0)
    const robotPosition = computed(() => robotStore.robotPose)
    const navigationStatus = computed(() => robotStore.navigationStatus)

    // 路径点相关状态
    const pathPoints = ref([]) // 路径点数组
    const isPathMode = ref(false) // 是否处于路径模式
    const currentTargetIndex = ref(-1) // 当前目标点的索引
    const isNavigating = ref(false) // 是否正在导航
    const isPaused = ref(false) // 是否已暂停
    
    // 状态防抖变量
    const lastGoalSentTime = ref(0) 

    const mqttConnected = computed(() => robotStore.mqttConnected) // MQTT连接状态
    const simulationInitialPose = ref({ x: 7, y: 0.8, theta: 0 })

    document.body.classList.add('test-mode')

    const togglePanel = () => {
      isExpanded.value = !isExpanded.value
    }

    const startSimulation = () => {
      mockRobotService.start()
      isSimulating.value = true
      window.mockRobotService = mockRobotService
      window.robotStore = robotStore
      try {
        robotStore.updateRobotPose(simulationInitialPose.value)
      } catch (e) {
        console.warn('设置固定模拟初始位姿时出错:', e)
      }
    }

    const stopSimulation = () => {
      mockRobotService.stop()
      isSimulating.value = false
    }

    const setNavigationStatus = (status) => {
      mockRobotService.setNavigationStatus(status)
    }

    const addUnreachableGoal = () => {
      mockRobotService.simulateUnreachableGoal(
        unreachableGoalName.value,
        {
          x: parseFloat(unreachableGoalX.value),
          y: parseFloat(unreachableGoalY.value)
        }
      )
    }

    const clearUnreachableGoals = () => {
      robotStore.clearUnreachableGoals()
    }

    const moveRobot = () => {
      const newPose = {
        x: parseFloat(targetX.value),
        y: parseFloat(targetY.value),
        theta: robotPosition.value.theta
      }
      if (!isNaN(newPose.x) && !isNaN(newPose.y)) {
        robotStore.updateRobotPose(newPose)
      }
    }

    const resetRobotPosition = () => {
      if (simulationInitialPose.value) {
        robotStore.updateRobotPose({ ...simulationInitialPose.value })
      } else {
        robotStore.updateRobotPose({ x: 0, y: 0, theta: 0 })
      }
      robotStore.updateNavigationStatus('idle')
    }

    const generateLaserScan = () => {
      mockRobotService.initLaserScan()
      robotStore.updateSensorData('laserScan', mockRobotService.laserScanData)
    }

    const generateCameraImage = () => {
      const mockImageData = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAv/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCdABmX/9k='
      robotStore.updateSensorData('cameraImage', mockImageData)
    }

    const loadPathPointsFunc = async () => {
      try {
        console.log('开始加载路径点...')
        const points = await loadPathPoints()
        pathPoints.value = points
        isPathMode.value = true

        const cruisePoints = points.map((point, idx) => ({
          name: point.description || `点${idx + 1}`,
          position: { x: point.x, y: point.y, z: 0 },
          orientation: { yaw: point.yaw || 0 },
          wait_before: point.wait_before || 0,
          wait_after: point.wait_after || 0
        }))

        try {
          if (eventBus && eventBus.value && eventBus.value.emit) {
            eventBus.value.emit('cruise-waypoints-updated', cruisePoints)
          }
        } catch (e) {
          console.warn('通知地图更新失败:', e)
        }

        if (window.localStorage) {
          window.localStorage.setItem('cruiseWaypoints', JSON.stringify(cruisePoints))
        }

      } catch (error) {
        console.error('加载路径点失败:', error)
      }
    }

    const clearPathPoints = async (emit = true) => {
      pathPoints.value = []
      isPathMode.value = false
      currentTargetIndex.value = -1
      isNavigating.value = false
      isPaused.value = false

      if (window.currentMoveInterval) {
        clearInterval(window.currentMoveInterval)
        window.currentMoveInterval = null
      }

      robotStore.updateNavigationStatus('idle')

      if (emit) {
        try {
          if (window.localStorage) {
            window.localStorage.removeItem('cruiseWaypoints')
          }
          if (eventBus && eventBus.value && eventBus.value.emit) {
            eventBus.value.emit('cruise-waypoints-updated', [])
          }
        } catch (e) {
          console.warn('清除通知失败', e)
        }
      }
    }

    const startPathNavigation = async () => {
      if (pathPoints.value.length === 0) return

      isNavigating.value = true
      isPaused.value = false
      currentTargetIndex.value = 0

      if (eventBus && eventBus.value && eventBus.value.emit) {
        const firstPointName = pathPoints.value[0].description || '点1'
        eventBus.value.emit('cruise-current-goal', firstPointName)
      }

      const firstPoint = pathPoints.value[0]
      lastGoalSentTime.value = Date.now()
      
      try {
        if (typeof mockRobotService !== 'undefined' && mockRobotService && mockRobotService.isRunning) {
          mockRobotService.sendGoalPosition({ x: firstPoint.x, y: firstPoint.y, yaw: firstPoint.yaw })
          robotStore.setGoalPose({ x: firstPoint.x, y: firstPoint.y, theta: firstPoint.yaw })
          robotStore.updateNavigationStatus('navigating')
          return
        }

        if (mqttConnected.value) {
          await apiService.sendGoalPose({
            x: firstPoint.x,
            y: firstPoint.y,
            yaw: firstPoint.yaw
          })
          robotStore.setGoalPose({
            x: firstPoint.x,
            y: firstPoint.y,
            theta: firstPoint.yaw
          })
          robotStore.updateNavigationStatus('navigating')
          return 
        }

        // 离线模拟逻辑
        robotStore.setGoalPose({
          x: firstPoint.x,
          y: firstPoint.y,
          theta: firstPoint.yaw
        })
        robotStore.updateNavigationStatus('navigating')

        const startPos = { ...robotStore.robotPose }
        if (!startPos || isNaN(startPos.x)) {
           Object.assign(startPos, { x: 0, y: 0, theta: 0 })
        }

        const endPos = { x: firstPoint.x, y: firstPoint.y, theta: firstPoint.yaw }
        const duration = 4000 
        const steps = 40 
        const stepDuration = duration / steps
        let currentStep = 0

        window.currentMoveInterval = setInterval(() => {
          currentStep++
          const progress = currentStep / steps
          const currentX = startPos.x + (endPos.x - startPos.x) * progress
          const currentY = startPos.y + (endPos.y - startPos.y) * progress
          const currentTheta = startPos.theta + (endPos.theta - startPos.theta) * progress

          robotStore.updateRobotPose({ x: currentX, y: currentY, theta: currentTheta })

          if (currentStep >= steps) {
            clearInterval(window.currentMoveInterval)
            window.currentMoveInterval = null
            robotStore.updateNavigationStatus('arrived')
            if (window.eventBus) {
                setTimeout(() => {
                    eventBus.value.emit('navigation-status-change', 'arrived')
                }, 100)
            }
          }
        }, stepDuration)

      } catch (error) {
        console.error('发送目标点失败:', error)
        isNavigating.value = false
      }
    }

    const pausePathNavigation = () => {
      isPaused.value = true
      if (window.currentMoveInterval) {
        clearInterval(window.currentMoveInterval)
        window.currentMoveInterval = null
      }
      if (mqttConnected.value) {
          apiService.pauseNavigation().catch(console.error)
      }
      robotStore.updateNavigationStatus('paused')
    }

    const resumePathNavigation = () => {
      if (!isPaused.value || currentTargetIndex.value < 0) return

      isPaused.value = false
      robotStore.updateNavigationStatus('navigating')
      lastGoalSentTime.value = Date.now()
      
      if (mqttConnected.value) {
          apiService.resumeNavigation().catch(console.error)
          return
      }
    }

    const stopPathNavigation = async () => {
      isNavigating.value = false
      isPaused.value = false
      currentTargetIndex.value = -1
      
      if (window.currentMoveInterval) {
        clearInterval(window.currentMoveInterval)
        window.currentMoveInterval = null
      }
      
      if (mqttConnected.value) {
          apiService.cancelGoal().catch(console.error)
      }

      await clearPathPoints()
      
      robotStore.updateNavigationStatus('idle')
    }

    const getStatusText = (status) => {
      switch (status) {
        case 'idle': return '空闲'
        case 'navigating': return '导航中'
        case 'arrived': return '已到达'
        case 'failed': return '失败'
        default: return '未知'
      }
    }

    const calculateDistance = (p1, p2) => {
      if (!p1 || !p2) return Infinity
      const dx = p1.x - p2.x
      const dy = p1.y - p2.y
      return Math.sqrt(dx * dx + dy * dy)
    }

    const handleNavigationStatusChange = async (newStatus) => {
      if (newStatus === 'arrived' && isNavigating.value && !isPaused.value) {
        if (Date.now() - lastGoalSentTime.value < 200) return

        if (currentTargetIndex.value >= 0 && currentTargetIndex.value < pathPoints.value.length) {
          const currentTarget = pathPoints.value[currentTargetIndex.value]
          const currentPose = robotStore.robotPose
          const dist = calculateDistance(currentPose, currentTarget)
          if (dist > 0.5) return
        }

        await moveToNextPoint()
      }
    }

    // 关键修复：监听巡航目标变化
    const handleCruiseCurrentGoal = (goalName) => {
      if (!goalName) {
        if (isNavigating.value) {
           // 可选：重置索引
        }
        return
      }
      
      // 查找对应名称的目标点索引
      const idx = pathPoints.value.findIndex(p => p.description === goalName || p.name === goalName)
      if (idx >= 0) {
        currentTargetIndex.value = idx
      }
    }

    const handleCruiseWaypointsUpdated = async (newWaypoints) => {
      if (!Array.isArray(newWaypoints)) return
      
      const converted = newWaypoints.map((w, idx) => ({
          x: w.position?.x ?? 0,
          y: w.position?.y ?? 0,
          yaw: w.orientation?.yaw ?? 0,
          description: w.name || `点${idx + 1}`,
          wait_before: w.wait_before ?? 0,
          wait_after: w.wait_after ?? 0
      }))
      pathPoints.value = converted
      isPathMode.value = converted.length > 0
    }

    const moveToNextPoint = async () => {
      if (currentTargetIndex.value < pathPoints.value.length - 1) {
        currentTargetIndex.value++
        
        const nextPoint = pathPoints.value[currentTargetIndex.value]
        
        if (eventBus && eventBus.value && eventBus.value.emit) {
            const pointName = nextPoint.description || `点${currentTargetIndex.value + 1}`
            eventBus.value.emit('cruise-current-goal', pointName)
        }

        lastGoalSentTime.value = Date.now()

        if (typeof mockRobotService !== 'undefined' && mockRobotService && mockRobotService.isRunning) {
             mockRobotService.sendGoalPosition({ x: nextPoint.x, y: nextPoint.y, yaw: nextPoint.yaw })
             robotStore.updateNavigationStatus('navigating')
             return
        }

        if (mqttConnected.value) {
            await apiService.sendGoalPose({
                x: nextPoint.x,
                y: nextPoint.y,
                yaw: nextPoint.yaw
            })
            robotStore.updateNavigationStatus('navigating')
            return
        }

        const startPos = { ...robotStore.robotPose }
        const endPos = { x: nextPoint.x, y: nextPoint.y, theta: nextPoint.yaw }
        const duration = 4000 
        const steps = 40 
        const stepDuration = duration / steps
        let currentStep = 0

        window.currentMoveInterval = setInterval(() => {
          currentStep++
          const progress = currentStep / steps
          const currentX = startPos.x + (endPos.x - startPos.x) * progress
          const currentY = startPos.y + (endPos.y - startPos.y) * progress
          const currentTheta = startPos.theta + (endPos.theta - startPos.theta) * progress

          robotStore.updateRobotPose({ x: currentX, y: currentY, theta: currentTheta })

          if (currentStep >= steps) {
            clearInterval(window.currentMoveInterval)
            window.currentMoveInterval = null
            robotStore.updateNavigationStatus('arrived')
            if (window.eventBus) {
                setTimeout(() => eventBus.value.emit('navigation-status-change', 'arrived'), 100)
            }
          }
        }, stepDuration)
        
      } else {
        isNavigating.value = false
        await stopPathNavigation()
      }
    }

    onMounted(() => {
      eventBus.value.on('navigation-status-change', handleNavigationStatusChange)
      eventBus.value.on('cruise-waypoints-updated', handleCruiseWaypointsUpdated)
      eventBus.value.on('cruise-current-goal', handleCruiseCurrentGoal)
      
      const shared = window.localStorage.getItem('cruiseWaypoints')
      if (shared) {
          try {
              handleCruiseWaypointsUpdated(JSON.parse(shared))
          } catch(e) {}
      }
    })

    onUnmounted(() => {
      eventBus.value.off('navigation-status-change', handleNavigationStatusChange)
      eventBus.value.off('cruise-waypoints-updated', handleCruiseWaypointsUpdated)
      eventBus.value.off('cruise-current-goal', handleCruiseCurrentGoal)
      
      if (window.currentMoveInterval) {
        clearInterval(window.currentMoveInterval)
        window.currentMoveInterval = null
      }
    })

    return {
      isExpanded,
      isSimulating,
      unreachableGoalName,
      unreachableGoalX,
      unreachableGoalY,
      targetX,
      targetY,
      robotPosition,
      navigationStatus,
      togglePanel,
      startSimulation,
      stopSimulation,
      setNavigationStatus,
      addUnreachableGoal,
      clearUnreachableGoals,
      moveRobot,
      resetRobotPosition,
      generateLaserScan,
      generateCameraImage,
      getStatusText,
      pathPoints,
      isPathMode,
      currentTargetIndex,
      isNavigating,
      isPaused,
      loadPathPointsFunc,
      clearPathPoints,
      startPathNavigation,
      pausePathNavigation,
      resumePathNavigation,
      stopPathNavigation,
      mqttConnected
    }
  }
}
</script>

<style scoped>
/* 样式保持不变 */
.test-control-panel {
  position: fixed;
  bottom: 40px;
  left: 20px;
  width: 300px;
  background: rgba(33, 37, 41, 0.95);
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  z-index: 1000;
  font-family: Arial, sans-serif;
  font-size: 14px;
  color: #f8f9fa;
  min-height: 50px;
}
/* ...略... */
.panel-header { display: flex; justify-content: space-between; align-items: center; padding: 10px 15px; background: rgba(52, 58, 64, 0.8); border-bottom: 1px solid #495057; border-radius: 8px 8px 0 0; z-index: 1001; }
.panel-header h3 { margin: 0; font-size: 16px; color: #f8f9fa; }
.toggle-btn { background: #6c757d; color: white; border: none; border-radius: 4px; padding: 4px 8px; cursor: pointer; font-size: 12px; z-index: 1002; position: relative; }
.panel-content { padding: 15px; max-height: 70vh; overflow-y: auto; }
.control-section { margin-bottom: 20px; }
.control-section h4 { margin-top: 0; margin-bottom: 10px; font-size: 14px; color: #f8f9fa; border-bottom: 1px solid #495057; padding-bottom: 5px; }
.control-btn { display: inline-block; margin-right: 5px; margin-bottom: 5px; padding: 6px 10px; border: none; border-radius: 4px; cursor: pointer; font-size: 12px; background: #007bff; color: white; }
.control-btn:disabled { background: #6c757d; cursor: not-allowed; }
.control-btn.start { background: #28a745; }
.control-btn.stop { background: #dc3545; }
.control-btn.warn { background: #ffc107; color: #212529; }
.input-group { display: flex; align-items: center; margin-bottom: 8px; }
.input-group label { width: 80px; font-size: 12px; }
.input-group input { flex: 1; padding: 4px 8px; border: 1px solid #ced4da; border-radius: 4px; font-size: 12px; }
.status-indicator { margin-bottom: 10px; font-size: 12px; }
.status { font-weight: bold; }
.status.idle { color: #6c757d; }
.status.navigating { color: #007bff; }
.status.arrived { color: #28a745; }
.status.failed { color: #dc3545; }
.position-display { background: rgba(52, 58, 64, 0.5); padding: 8px; border-radius: 4px; margin-bottom: 10px; font-size: 12px; color: #f8f9fa; }
.position-display div { margin-bottom: 4px; }
</style>