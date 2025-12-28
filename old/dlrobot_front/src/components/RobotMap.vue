<template>
  <div class="robot-map-container">
    <div ref="mapContainer" class="map-container"></div>
    
    <div v-if="mousePosition" class="mouse-coordinates">
      <div class="coord-title">鼠标位置</div>
      <div class="coord-value">
        ROS: ({{ mousePosition.x.toFixed(3) }}, {{ mousePosition.y.toFixed(3) }})
      </div>
      <div class="coord-value">
        地图: ({{ mousePosition.lat.toFixed(6) }}, {{ mousePosition.lng.toFixed(6) }})
      </div>
    </div>
    
    <div class="map-controls">
      <div class="control-group">
        <button @click="zoomIn" class="control-btn" title="放大">➕</button>
        <button @click="zoomOut" class="control-btn" title="缩小">➖</button>
        <button @click="resetView" class="control-btn" title="重置视图">🏠</button>
      </div>
      
      <div class="control-group">
        <button 
          @click="toggleClickMode" 
          :class="['control-btn', { active: isClickModeEnabled }]"
          title="点击设置目标位置">📍</button>
        <button
          @click="clearUnreachableGoals"
          :class="['control-btn', { disabled: robotStore.unreachableGoals.length === 0 }]"
          title="清除无法到达点标记">🗑️</button>
      </div>
    </div>

    <div v-if="clickedPosition" class="coordinates-display">
      <div class="coordinates-header"><strong>🎯 目标位置坐标</strong></div>
      <div class="coordinate-item">
        <span class="coord-label">ROS(X,Y):</span>
        <span class="coord-value">[{{ formatCoordinate(clickedPosition.x) }}, {{ formatCoordinate(clickedPosition.y) }}]</span>
      </div>
      <div class="coordinate-item">
        <span class="coord-label">前端(Lat,Lng):</span>
        <span class="coord-value frontend">[{{ formatCoordinate(clickedPosition.lat) }}, {{ formatCoordinate(clickedPosition.lng) }}]</span>
      </div>
      <div class="coordinate-item" v-if="clickedOrientation !== null">
        <span>Yaw:</span>
        <span>{{ formatCoordinate(clickedOrientation) }} rad ({{ formatCoordinate(clickedOrientation * 180 / Math.PI) }}°)</span>
      </div>
      <div v-if="clickedOrientation !== null" class="orientation-display">
        <div class="compass">
          <div class="compass-arrow" :style="{ transform: `rotate(${-clickedOrientation * 180 / Math.PI}deg) scaleY(-1)` }">→</div>
          <div class="compass-labels">
            <span class="label-n">Y+</span><span class="label-e">X+</span>
            <span class="label-s">Y-</span><span class="label-w">X-</span>
          </div>
        </div>
        <div class="orientation-info"><p>📍 朝向: {{ getOrientationDescription() }}</p></div>
      </div>
      <div class="coordinate-item">
        <button @click="sendGoalPosition" class="send-btn" :disabled="!mqttConnected || clickedOrientation === null">发送目标位置</button>
      </div>
    </div>
  </div>
</template>

<script>
import { onMounted, ref, computed, onUnmounted, watch } from 'vue'
import { useRobotStore } from '../stores/robotStore'
import apiService from '../services/apiService'
import mapService from '../services/mapService'
import { rosToLeaflet, leafletToRos } from '../utils/mapUtils'
import { displayPathPoints, highlightCurrentTarget, addTrajectoryPoint, clearPathDisplay } from '../utils/pathPoints.js'
import '../utils/pathPoints.css'
import { eventBus } from '../utils/eventBus.js'

export default {
  name: 'RobotMap',
  
  setup() {
    const robotStore = useRobotStore()
    const mapContainer = ref(null)
    const map = ref(null)
    
    // 图层引用
    const robotMarker = ref(null)
    const goalMarker = ref(null)
    const goalArrow = ref(null)
    const unreachableMarkersLayer = ref(null)
    
    // 路径点相关
    const pathMarkers = ref([])
    const pathLine = ref(null)
    const currentTargetMarker = ref(null)
    
    // 轨迹相关
    const trajectoryLine = ref(null)
    const trajectoryPoints = ref([])
    const lastTrajectoryPose = ref(null)
    const showTrajectory = ref(true)
    
    // 巡航数据缓存
    const currentWaypoints = ref([])
    const currentTargetIndex = ref(-1)

    const isClickModeEnabled = ref(false)
    const clickedPosition = ref(null)
    const clickedOrientation = ref(null)
    const isSettingOrientation = ref(false)
    const mousePosition = ref(null)

    const mqttConnected = computed(() => robotStore.mqttConnected)
    const robotPose = computed(() => robotStore.robotPose)

    // 处理巡航点更新
    const cruiseWaypointsHandler = async (newWaypoints) => {
      // 1. 保存数据
      if (Array.isArray(newWaypoints)) {
        currentWaypoints.value = newWaypoints
      }
      
      // 2. 检查地图是否就绪
      if (!map.value) {
        return
      }

      try {
        // 3. 清除旧的路径点（关键：最后两个参数传 null，防止误删历史轨迹！）
        await clearPathDisplay(map.value, pathMarkers, pathLine, currentTargetMarker, null, null)
        
        // 4. 绘制新路径点
        if (currentWaypoints.value && currentWaypoints.value.length > 0) {
          await displayPathPoints(map.value, currentWaypoints.value, pathMarkers, pathLine)
          
          // 5. 恢复高亮
          if (currentTargetIndex.value >= 0 && currentTargetIndex.value < currentWaypoints.value.length) {
             await highlightCurrentTarget(map.value, currentWaypoints.value, currentTargetIndex, currentTargetMarker)
          }
        }
      } catch (e) {
        console.error('RobotMap: 渲染路径点失败', e)
      }
    }

    // 处理当前目标高亮
    const cruiseGoalHandler = (goalName) => {
      if (!currentWaypoints.value.length || !map.value) return
      
      const idx = currentWaypoints.value.findIndex(p => 
        (p.name && p.name === goalName) || (p.description && p.description === goalName)
      )
      
      if (idx >= 0) {
        currentTargetIndex.value = idx
        highlightCurrentTarget(map.value, currentWaypoints.value, currentTargetIndex, currentTargetMarker)
      } else {
        // 目标清空时移除高亮
        if (currentTargetMarker.value && map.value.hasLayer(currentTargetMarker.value)) {
          map.value.removeLayer(currentTargetMarker.value)
        }
      }
    }

    // 清除轨迹的辅助函数
    const clearTrajectory = () => {
      if (trajectoryLine.value && map.value) {
        if (map.value.hasLayer(trajectoryLine.value)) {
          map.value.removeLayer(trajectoryLine.value)
        }
        trajectoryLine.value = null
        trajectoryPoints.value = []
        lastTrajectoryPose.value = null
        console.log('轨迹线已清除')
      }
    }

    // 轨迹显示开关
    const toggleTrajectoryHandler = (shouldShow) => {
      showTrajectory.value = !!shouldShow
      if (!map.value) return

      if (showTrajectory.value) {
        // 重新开启时，重置当前段
        lastTrajectoryPose.value = null 
      } else {
        // 关闭时清除线
        clearTrajectory()
      }
    }
    
    // 初始化地图
    const initMap = async () => {
      if (!mapContainer.value) return
      
      import('leaflet').then(async L => {
        const mapConfig = await mapService.loadMapConfig()
        const initialView = mapService.getInitialView(mapConfig)
        
        map.value = L.map(mapContainer.value, {
          center: initialView.center,
          zoom: initialView.zoom,
          zoomControl: false
        })
        
        L.control.zoom({ position: 'topright' }).addTo(map.value)
        eventBus.value.setMap(map.value)
        
        // 标记初始化
        const robotIcon = L.divIcon({ html: '<div class="robot-marker">🤖</div>', className: 'robot-marker-container', iconSize: [30, 30], iconAnchor: [15, 15], zIndex: 2000 })
        robotMarker.value = L.marker(initialView.center, { icon: robotIcon, zIndexOffset: 2000 }).addTo(map.value)
        
        const goalIcon = L.divIcon({ html: '<div class="goal-marker">🎯</div>', className: 'goal-marker-container', iconSize: [25, 25], iconAnchor: [12, 12] })
        goalMarker.value = L.marker(initialView.center, { icon: goalIcon, opacity: 0 }).addTo(map.value)
        
        goalArrow.value = L.polyline([], { color: '#f59e0b', weight: 3, opacity: 0 }).addTo(map.value)
        unreachableMarkersLayer.value = L.layerGroup().addTo(map.value)
        
        // 事件监听
        map.value.on('click', (e) => { if (isClickModeEnabled.value) handleMapClick(e) })
        map.value.on('mousemove', handleMouseMove)
        map.value.on('mouseout', () => { mousePosition.value = null })
        
        await loadActualMap(L, mapConfig)

        if (mapConfig) {
          robotStore.setMapResolution(mapConfig.resolution)
          robotStore.setMapOrigin(mapConfig.origin)
          robotStore.setMapPgmUrl(mapConfig.image)
        }

        // 初始化完成后，尝试渲染已有数据
        setTimeout(() => { 
          if (map.value) {
            map.value.invalidateSize()
            // 如果缓存里有数据，立即渲染
            if (currentWaypoints.value.length > 0) {
              cruiseWaypointsHandler(currentWaypoints.value)
            }
          }
        }, 500)
      })
    }

    const loadActualMap = async (L, mapConfig) => {
      try {
        const pngDataUrl = await mapService.convertPgmToPng(mapConfig.image)
        const mapBounds = mapService.getMapBounds(mapConfig)
        L.imageOverlay(pngDataUrl, mapBounds, { opacity: 0.9, attribution: 'DLROBOT Map' }).addTo(map.value)
        map.value.fitBounds(mapBounds)
      } catch (error) {
        console.error('加载地图失败:', error)
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18 }).addTo(map.value)
      }
    }
    
    const handleMouseMove = (e) => {
      const { lat, lng } = e.latlng
      const rosCoords = leafletToRos(lat, lng)
      if (!isNaN(rosCoords.x)) mousePosition.value = { x: rosCoords.x, y: rosCoords.y, lat, lng }
    }
    
    const handleMapClick = (e) => {
      const { lat, lng } = e.latlng
      if (isNaN(lat)) return
      if (!isSettingOrientation.value) {
        const rosCoords = leafletToRos(lat, lng)
        clickedPosition.value = { x: rosCoords.x, y: rosCoords.y, lat, lng }
        if (goalMarker.value) { goalMarker.value.setLatLng([lat, lng]); goalMarker.value.setOpacity(1) }
        if (goalArrow.value) { goalArrow.value.setLatLngs([]); goalArrow.value.setStyle({ opacity: 0 }) }
        clickedOrientation.value = null
        isSettingOrientation.value = true
      } else {
        const dx = lng - clickedPosition.value.lng
        const dy = lat - clickedPosition.value.lat
        clickedOrientation.value = Math.atan2(dy, dx)
        if (goalArrow.value) {
           goalArrow.value.setLatLngs([[clickedPosition.value.lat, clickedPosition.value.lng], [lat, lng]])
           goalArrow.value.setStyle({ opacity: 1 })
        }
        isSettingOrientation.value = false
      }
    }

    const sendGoalPosition = async () => {
      if (!clickedPosition.value) return
      try {
        await apiService.sendGoalPose({ ...clickedPosition.value, yaw: clickedOrientation.value || 0 })
        robotStore.setGoalPose(clickedPosition.value)
        isSettingOrientation.value = false
      } catch (e) {}
    }

    // 监听机器人移动（绘制红线历史轨迹）
    watch(() => robotStore.robotPose, (newPose) => {
      if (robotMarker.value && newPose && map.value) {
        const leafletCoords = rosToLeaflet(newPose.x, newPose.y)
        if (!isNaN(leafletCoords[0])) {
          robotMarker.value.setLatLng(leafletCoords)
          // 旋转图标
          const angle = newPose.theta * (180 / Math.PI)
          const el = robotMarker.value.getElement()
          if (el) { const inner = el.querySelector('.robot-marker'); if(inner) inner.style.transform = `rotate(${angle}deg)` }
          
          // 绘制轨迹
          if (showTrajectory.value) {
            const last = lastTrajectoryPose.value
            const dx = last ? (newPose.x - last.x) : null
            const dy = last ? (newPose.y - last.y) : null
            const dist = (dx === null) ? Infinity : Math.sqrt(dx*dx + dy*dy)
            
            // 降低阈值到 2cm，使轨迹更平滑
            if (!last || dist > 0.02) {
              addTrajectoryPoint(map.value, newPose, trajectoryLine, trajectoryPoints)
              lastTrajectoryPose.value = { x: newPose.x, y: newPose.y }
            }
          }
        }
      }
    }, { deep: true })

    // 监听导航状态变化
    watch(() => robotStore.navigationStatus, (newStatus) => {
      eventBus.value.emit('navigation-status-change', newStatus)
      
      // ✅ 新增逻辑：当导航结束（到达/空闲/失败/停止）时，清除轨迹线
      if (newStatus === 'arrived' || newStatus === 'idle' || newStatus === 'failed' || newStatus === 'stopped') {
        clearTrajectory()
      }
    })
    
    watch(() => robotStore.unreachableGoals, () => {
      if (!unreachableMarkersLayer.value || !map.value) return
      unreachableMarkersLayer.value.clearLayers()
      const L = window.L || require('leaflet')
      robotStore.unreachableGoals.forEach(goal => {
        const coords = rosToLeaflet(goal.position.x, goal.position.y)
        const icon = L.divIcon({ html: '❌', className: 'unreachable-marker' })
        L.marker(coords, { icon }).addTo(unreachableMarkersLayer.value)
      })
    }, { deep: true })

    onMounted(() => {
      initMap()
      if (eventBus.value.on) {
        eventBus.value.on('cruise-waypoints-updated', cruiseWaypointsHandler)
        eventBus.value.on('cruise-toggle-trajectory', toggleTrajectoryHandler)
        eventBus.value.on('cruise-current-goal', cruiseGoalHandler)
      }
    })
    
    onUnmounted(() => {
      if (eventBus.value.setMap) eventBus.value.setMap(null)
      if (map.value) map.value.remove()
      if (eventBus.value.off) {
        eventBus.value.off('cruise-waypoints-updated', cruiseWaypointsHandler)
        eventBus.value.off('cruise-toggle-trajectory', toggleTrajectoryHandler)
        eventBus.value.off('cruise-current-goal', cruiseGoalHandler)
      }
    })
    
    const zoomIn = () => map.value?.zoomIn()
    const zoomOut = () => map.value?.zoomOut()
    const resetView = () => { if (map.value && robotMarker.value) map.value.setView(robotMarker.value.getLatLng(), 13) }
    const toggleClickMode = () => isClickModeEnabled.value = !isClickModeEnabled.value
    const clearUnreachableGoals = () => robotStore.clearUnreachableGoals()
    const formatCoordinate = (v) => v ? Number(v).toFixed(2) : '0.00'
    const getOrientationDescription = () => '自定义方向'
    const testRobotPositionUpdate = () => {}

    return {
      mapContainer, isClickModeEnabled, clickedPosition, clickedOrientation, 
      mqttConnected, mousePosition, zoomIn, zoomOut, resetView, toggleClickMode,
      sendGoalPosition, formatCoordinate, getOrientationDescription, 
      clearUnreachableGoals, testRobotPositionUpdate,
      robotStore // 确保返回 store
    }
  }
}
</script>

<style scoped>
/* 样式保持不变 */
.robot-map-container { position: relative; width: 100%; height: 100%; }
.map-container { width: 100%; height: 100%; background: #1a1a1a; }
.map-controls { position: absolute; top: 70px; right: 10px; z-index: 1000; display: flex; flex-direction: column; gap: 10px; }
.control-group { display: flex; flex-direction: column; gap: 5px; background: rgba(0, 0, 0, 0.7); padding: 8px; border-radius: 8px; backdrop-filter: blur(10px); }
.control-btn { width: 40px; height: 40px; border: none; border-radius: 6px; background: #2d3748; color: white; font-size: 16px; cursor: pointer; display: flex; align-items: center; justify-content: center; }
.control-btn:hover { background: #4a5568; }
.control-btn.active { background: #3182ce; }
.mouse-coordinates { position: absolute; top: 20px; left: 20px; background: rgba(26, 32, 44, 0.9); padding: 8px 12px; border-radius: 6px; border: 1px solid rgba(66, 153, 225, 0.3); z-index: 1000; }
.coord-title { font-size: 12px; font-weight: 600; color: #4299e1; margin-bottom: 4px; }
.coord-value { font-size: 11px; color: #e2e8f0; margin-bottom: 2px; font-family: monospace; }
.coordinates-display { position: absolute; bottom: 20px; left: 20px; background: rgba(0, 0, 0, 0.8); padding: 15px; border-radius: 8px; border: 1px solid #4a5568; z-index: 1000; min-width: 200px; }
.coordinates-header { color: #63b3ed; font-weight: bold; margin-bottom: 10px; text-align: center; font-size: 14px; border-bottom: 1px solid #4a5568; padding-bottom: 5px; }
.coordinate-item { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; min-width: 180px; }
.coord-label { color: #a0aec0; font-weight: 500; font-size: 12px; }
.orientation-display { margin: 12px 0; padding: 12px; background: rgba(66, 153, 225, 0.1); border-radius: 6px; border: 1px solid rgba(66, 153, 225, 0.3); }
.compass { position: relative; width: 80px; height: 80px; margin: 0 auto 12px; background: radial-gradient(circle, rgba(66, 153, 225, 0.2) 0%, rgba(66, 153, 225, 0.05) 100%); border: 2px solid rgba(66, 153, 225, 0.5); border-radius: 50%; display: flex; align-items: center; justify-content: center; }
.compass-arrow { font-size: 32px; color: #4299e1; transition: transform 0.3s ease; transform-origin: center; }
.compass-labels span { position: absolute; font-size: 9px; color: #a0aec0; font-weight: 600; }
.label-n { top: -20px; left: 50%; transform: translateX(-50%); }
.label-e { right: -30px; top: 50%; transform: translateY(-50%); }
.label-s { bottom: -20px; left: 50%; transform: translateX(-50%); }
.label-w { left: -35px; top: 50%; transform: translateY(-50%); }
.orientation-info { text-align: center; color: #e2e8f0; font-size: 12px; }
.send-btn { background: #3182ce; color: white; border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer; font-size: 12px; }
.send-btn:disabled { background: #718096; cursor: not-allowed; }

:deep(.robot-marker-container), :deep(.goal-marker-container) { background: transparent; border: none; }
:deep(.robot-marker) { font-size: 24px; filter: drop-shadow(0 0 5px rgba(66, 153, 225, 0.8)); will-change: transform; }
:deep(.goal-marker) { font-size: 20px; filter: drop-shadow(0 0 5px rgba(236, 201, 75, 0.8)); }
</style>