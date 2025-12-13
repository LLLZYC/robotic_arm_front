<template>
  <div class="robot-map-container">
    <div ref="mapContainer" class="map-container"></div>
    
    <!-- 地图控制面板 -->
    <div class="map-controls">
      <div class="control-group">
        <button 
          @click="zoomIn" 
          class="control-btn"
          title="放大">
          ➕
        </button>
        <button 
          @click="zoomOut" 
          class="control-btn"
          title="缩小">
          ➖
        </button>
        <button 
          @click="resetView" 
          class="control-btn"
          title="重置视图">
          🏠
        </button>
      </div>
      
      <div class="control-group">
        <button 
          @click="toggleClickMode" 
          :class="['control-btn', { active: isClickModeEnabled }]"
          title="点击设置目标位置">
          📍
        </button>
        <button 
          @click="testRobotPositionUpdate" 
          class="control-btn"
          title="测试机器人位置更新">
          🧪
        </button>
        <button 
          @click="testCoordinateConversion" 
          class="control-btn"
          title="测试坐标转换准确性">
          🔄
        </button>
      </div>
    </div>
    
    <!-- 实时坐标显示 -->
    <div v-if="isClickModeEnabled && mousePosition" class="mouse-coordinates-display">
      <div class="coordinates-header">
        <strong>🖱️ 鼠标位置坐标</strong>
      </div>
      <div class="coordinate-item">
        <span class="coord-label">ROS(X,Y):</span>
        <span class="coord-value">[{{ mousePosition.x }}, {{ mousePosition.y }}]</span>
      </div>
      <div class="coordinate-item">
        <span class="coord-label">前端(Lat,Lng):</span>
        <span class="coord-value frontend">[{{ mousePosition.lat }}, {{ mousePosition.lng }}]</span>
      </div>
    </div>
    
    <!-- 点击坐标显示 -->
    <div v-if="clickedPosition" class="coordinates-display">
      <div class="coordinates-header">
        <strong>🎯 目标位置坐标</strong>
      </div>
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
          <div class="compass-arrow" :style="{ transform: `rotate(${-clickedOrientation * 180 / Math.PI}deg) scaleY(-1)` }">
            →
          </div>
          <div class="compass-labels">
            <span class="label-n">Y+ (90°)</span>
            <span class="label-e">X+ (0°)</span>
            <span class="label-s">Y- (-90°)</span>
            <span class="label-w">X- (180°)</span>
          </div>
        </div>
        <div class="orientation-info">
          <p>📍 机器人朝向: {{ getOrientationDescription(clickedOrientation) }}</p>
          <p style="font-size: 10px; color: #a0aec0; margin-top: 4px;">
            ROS坐标系 (ENU):<br/>
            0° = X轴正方向 (右/东)<br/>
            90° = Y轴正方向 (上/北)<br/>
            ±180° = X轴负方向 (左/西)<br/>
            -90° = Y轴负方向 (下/南)
          </p>
        </div>
      </div>
      <div v-if="isSettingOrientation" class="orientation-hint">
        <span>👆 点击第二个点确定方向</span>
      </div>
      <div class="coordinate-item">
        <button 
          @click="sendGoalPosition" 
          class="send-btn"
          :disabled="!mqttConnected || clickedOrientation === null">
          发送目标位置
        </button>
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

export default {
  name: 'RobotMap',
  
  setup() {
    const mapContainer = ref(null)
    const map = ref(null)
    const robotMarker = ref(null)
    const goalMarker = ref(null)
    const goalArrow = ref(null) // 方向箭头
    const isClickModeEnabled = ref(false)
    const clickedPosition = ref(null)
    const clickedOrientation = ref(null) // 存储yaw角度
    const isSettingOrientation = ref(false) // 是否正在设置方向
    
    // 实时鼠标坐标
    const mousePosition = ref(null)
    
    // 测试转换：验证已知点
    const testConversion = () => {
      const testRos = { x: -0.78, y: 1.11 }
      const testFrontend = rosToLeaflet(testRos.x, testRos.y)
      console.log('测试转换:', testRos, '->', testFrontend)
      
      const backToRos = leafletToRos(testFrontend[0], testFrontend[1])
      console.log('逆向转换:', testFrontend, '->', backToRos)
    }
    
    const robotStore = useRobotStore()
    
    // 监听机器人状态变化 - 直接使用store的响应式数据
    const mqttConnected = computed(() => robotStore.mqttConnected)
    const robotPose = computed(() => robotStore.robotPose)
    
    // 初始化地图
    const initMap = async () => {
      if (!mapContainer.value) return
      
      // 动态导入Leaflet
      import('leaflet').then(async L => {
        // 加载地图配置
        const mapConfig = await mapService.loadMapConfig()
        
        // 获取初始视图配置
        const initialView = mapService.getInitialView(mapConfig)
        
        // 创建地图实例
        map.value = L.map(mapContainer.value, {
          center: initialView.center,
          zoom: initialView.zoom,
          zoomControl: false
        })
        
        // 添加缩放控件
        L.control.zoom({
          position: 'topright'
        }).addTo(map.value)
        
        // 创建机器人标记
        const robotIcon = L.divIcon({
          html: '<div class="robot-marker">🤖</div>',
          className: 'robot-marker-container',
          iconSize: [30, 30],
          iconAnchor: [15, 15],
          zIndex: 1000 // 确保机器人标记在最上层
        })
        
        robotMarker.value = L.marker(initialView.center, { 
          icon: robotIcon,
          zIndexOffset: 1000 // 额外的z-index偏移
        })
          .addTo(map.value)
          .bindPopup('机器人当前位置')
        
        // 创建目标标记
        const goalIcon = L.divIcon({
          html: '<div class="goal-marker">🎯</div>',
          className: 'goal-marker-container',
          iconSize: [25, 25],
          iconAnchor: [12, 12]
        })
        
        goalMarker.value = L.marker(initialView.center, { 
          icon: goalIcon,
          opacity: 0 
        }).addTo(map.value)
        
        // 创建方向箭头（使用polyline）
        goalArrow.value = L.polyline([], {
          color: '#f59e0b',
          weight: 3,
          opacity: 0
        }).addTo(map.value)
        
        // 地图点击事件
        map.value.on('click', (e) => {
          if (isClickModeEnabled.value) {
            handleMapClick(e)
          }
        })
        
        // 鼠标移动事件 - 实时显示ROS坐标
        map.value.on('mousemove', (e) => {
          if (isClickModeEnabled.value) {
            handleMouseMove(e)
          }
        })
        
        // 加载实际地图
        const mapMetadata = await loadActualMap(L, mapConfig)

        // 将实际地图尺寸存入store，供坐标转换使用
        if (mapMetadata) {
          robotStore.setMapPixels(mapMetadata.widthPixels, mapMetadata.heightPixels)
          robotStore.setMapResolution(mapConfig.resolution)
          robotStore.setMapOrigin(mapConfig.origin)
          robotStore.setMapPgmUrl(mapConfig.image)
        }
      })
    }

    // 加载实际地图
    const loadActualMap = async (L, mapConfig) => {
      try {
        console.log('开始加载DLROBOT地图...', mapConfig)
        
        // 检查地图配置有效性
        if (!mapConfig || !mapConfig.image) {
          throw new Error('地图配置无效')
        }
        
        // 转换PGM为PNG格式
        const pngDataUrl = await mapService.convertPgmToPng(mapConfig.image)
        
        // 检查转换结果是否为占位符地图
        const isPlaceholder = pngDataUrl.includes('data:image/png') && 
                            pngDataUrl.length < 10000 // 占位符地图通常较小
        
        if (isPlaceholder) {
          console.log('检测到占位符地图，使用OpenStreetMap')
          throw new Error('实际地图不可用，使用OpenStreetMap')
        }
        
        // 获取地图边界
        const mapBounds = mapService.getMapBounds(mapConfig)
        
        // 验证边界有效性
        if (!mapBounds || !Array.isArray(mapBounds) || mapBounds.length !== 2) {
          throw new Error('地图边界计算无效')
        }
        
        // 创建图像覆盖层
        L.imageOverlay(pngDataUrl, mapBounds, {
          opacity: 0.9,
          attribution: 'DLROBOT Map'
        }).addTo(map.value)

        // 设置地图视图到实际地图边界
        map.value.fitBounds(mapBounds)

        console.log('DLROBOT地图加载成功')

        return mapMetadata

      } catch (error) {
        console.error('加载DLROBOT地图失败:', error)
        
        // 回退到OpenStreetMap
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '© OpenStreetMap contributors',
          maxZoom: 18
        }).addTo(map.value)
        
        // 添加地图加载状态提示
        const statusControl = L.control({ position: 'bottomleft' })
        statusControl.onAdd = function() {
          const div = L.DomUtil.create('div', 'map-status-control')
          div.innerHTML = `
            <div style="background: rgba(0,0,0,0.8); color: white; padding: 8px; border-radius: 4px; font-size: 12px;">
              <span style="color: #f56565;">⚠</span> 使用OpenStreetMap作为基础地图
            </div>
          `
          return div
        }
        statusControl.addTo(map.value)
        
        console.log('使用OpenStreetMap作为默认地图')

        return null
      }
    }
    
    // 处理地图点击事件
    const handleMouseMove = (e) => {
      const { lat, lng } = e.latlng
      
      if (isNaN(lat) || isNaN(lng)) {
        return
      }
      
      const rosCoords = leafletToRos(lat, lng)
      
      if (!isNaN(rosCoords.x) && !isNaN(rosCoords.y)) {
        mousePosition.value = {
          x: Number(rosCoords.x.toFixed(3)),
          y: Number(rosCoords.y.toFixed(3)),
          lat: Number(lat.toFixed(6)),
          lng: Number(lng.toFixed(6))
        }
        
        // 调试信息（可选，避免过多日志）
        if (Math.random() < 0.1) { // 10%的概率输出日志
          console.log('鼠标坐标更新:', {
            leaflet: { lat, lng },
            ros: rosCoords,
            display: mousePosition.value
          })
        }
      }
    }
    
    const handleMapClick = (e) => {
      const { lat, lng } = e.latlng
      
      // 验证点击坐标的有效性
      if (isNaN(lat) || isNaN(lng)) {
        console.warn('无效的地图点击坐标:', { lat, lng })
        return
      }
      
      if (!isSettingOrientation.value) {
        // 第一次点击：设置位置
        // 将Leaflet坐标转换为ROS坐标
        const rosCoords = leafletToRos(lat, lng)
        
        console.log('目标位置设置:', {
          leaflet: { lat, lng },
          ros: rosCoords
        })
        
        // 验证转换结果
        if (isNaN(rosCoords.x) || isNaN(rosCoords.y)) {
          console.warn('坐标转换失败，使用默认值:', rosCoords)
          clickedPosition.value = { x: 0, y: 0, lat, lng }
        } else {
          clickedPosition.value = { 
            x: Number(rosCoords.x.toFixed(3)), 
            y: Number(rosCoords.y.toFixed(3)),
            lat: Number(lat.toFixed(6)),  // 保留更多小数位
            lng: Number(lng.toFixed(6))
          }
        }
        
        // 更新目标标记位置
        if (goalMarker.value) {
          goalMarker.value.setLatLng([lat, lng])
          goalMarker.value.setOpacity(1)
        }
        
        // 重置方向箭头
        if (goalArrow.value) {
          goalArrow.value.setLatLngs([])
          goalArrow.value.setStyle({ opacity: 0 })
        }
        
        clickedOrientation.value = null
        isSettingOrientation.value = true
        
        console.log('位置已设置，请点击第二个点确定方向:', clickedPosition.value)
      } else {
        // 第二次点击：设置方向
        if (clickedPosition.value && clickedPosition.value.lat !== undefined) {
          const startLat = clickedPosition.value.lat
          const startLng = clickedPosition.value.lng
          
          // 计算yaw角度（从起点到终点的角度）
          // Leaflet: lng是X（向右增加），lat是Y（向上/北增加）
          const dx = lng - startLng  // X方向差值（向右为正）
          const dy = lat - startLat  // Y方向差值（向上为正）
          
          // ROS坐标系：X轴向右为0°，Y轴向上为90°，逆时针为正
          const yaw = Math.atan2(dy, dx)
          
          clickedOrientation.value = Number(yaw.toFixed(3))
          
          // 绘制方向箭头
          if (goalArrow.value) {
            const arrowLength = 0.0002
            const distance = Math.sqrt(dx*dx + dy*dy)
            if (distance > 0) {
              const endLat = startLat + (dy / distance) * arrowLength
              const endLng = startLng + (dx / distance) * arrowLength
              
              goalArrow.value.setLatLngs([
                [startLat, startLng],
                [endLat, endLng]
              ])
              goalArrow.value.setStyle({ opacity: 1 })
            }
          }
          
          isSettingOrientation.value = false
          
          console.log('方向已设置:', { 
            yaw: clickedOrientation.value, 
            degrees: (yaw * 180 / Math.PI).toFixed(1),
            startPoint: { lat: startLat, lng: startLng },
            endPoint: { lat, lng },
            delta: { dx, dy },
            direction: '从起点到终点的向量',
            test: `向右dx>0应该是0°, 向上dy>0应该是90°`
          })
        }
      }
      
      console.log('地图点击事件:', { lat, lng, isSettingOrientation: isSettingOrientation.value })
    }
    
    // 发送目标位置
    const sendGoalPosition = async () => {
      if (!clickedPosition.value) return
      
      try {
        await apiService.sendGoalPose({
          x: clickedPosition.value.x,
          y: clickedPosition.value.y,
          yaw: clickedOrientation.value !== null ? clickedOrientation.value : 0
        })
        
        robotStore.setGoalPose(clickedPosition.value)
        console.log('目标位置发送成功', {
          position: clickedPosition.value,
          yaw: clickedOrientation.value
        })
        
        // 重置状态
        isSettingOrientation.value = false
        
      } catch (error) {
        console.error('发送目标位置失败:', error)
        alert('发送目标位置失败，请检查后端服务是否正常运行')
      }
    }
    
    // 地图控制方法
    const zoomIn = () => {
      if (map.value) map.value.zoomIn()
    }
    
    const zoomOut = () => {
      if (map.value) map.value.zoomOut()
    }
    
    const resetView = () => {
      if (map.value && robotMarker.value) {
        map.value.setView(robotMarker.value.getLatLng(), 13)
      }
    }
    
    const toggleClickMode = () => {
      isClickModeEnabled.value = !isClickModeEnabled.value
    }
    
    // 测试函数：手动触发机器人位置更新
    const testRobotPositionUpdate = () => {
      console.log('测试机器人位置更新...')
      // 使用地图中心附近的合理坐标进行测试
      const testPoses = [
        { x: -2.5, y: -7.6, theta: 0 },      // 地图中心
        { x: 0, y: 0, theta: Math.PI / 4 },  // 原点附近
        { x: -5, y: -15.2, theta: 0 },       // 地图原点
        { x: 2, y: -10, theta: Math.PI / 2 } // 地图内其他位置
      ]
      const testPose = testPoses[Math.floor(Math.random() * testPoses.length)]
      console.log('发送测试位姿:', testPose)
      robotStore.updateRobotPose(testPose)
    }
    
    // 测试坐标转换准确性
    const testCoordinateConversion = () => {
      console.log('=== 测试坐标转换准确性 ===')
      
      // 测试已知的ROS坐标，包括用户提到的正确坐标
      const testRosCoords = [
        { x: -0.7, y: 1.08 },   // 用户提到的正确坐标
        { x: -5, y: -15.2 },    // 地图原点
        { x: 0, y: 0 },         // 世界原点
        { x: -2.5, y: -7.6 }    // 地图中心
      ]
      
      testRosCoords.forEach(ros => {
        // ROS → Leaflet
        const leaflet = rosToLeaflet(ros.x, ros.y)
        console.log(`ROS(${ros.x}, ${ros.y}) → Leaflet(${leaflet[0].toFixed(6)}, ${leaflet[1].toFixed(6)})`)
        
        // Leaflet → ROS (逆向转换)
        const backToRos = leafletToRos(leaflet[0], leaflet[1])
        console.log(`Leaflet(${leaflet[0].toFixed(6)}, ${leaflet[1].toFixed(6)}) → ROS(${backToRos.x.toFixed(3)}, ${backToRos.y.toFixed(3)})`)
        
        // 计算误差
        const errorX = Math.abs(ros.x - backToRos.x)
        const errorY = Math.abs(ros.y - backToRos.y)
        console.log(`转换误差: X=${errorX.toFixed(6)}, Y=${errorY.toFixed(6)}`)
        console.log('---')
      })
      
      // 特别测试用户提到的坐标
      console.log('特别测试用户提到的坐标:')
      const userCoord = { x: -0.7, y: 1.08 }
      const userLeaflet = rosToLeaflet(userCoord.x, userCoord.y)
      const userBackToRos = leafletToRos(userLeaflet[0], userLeaflet[1])
      console.log(`用户坐标 ROS(-0.7, 1.08) 应该转换后保持一致`)
      console.log(`实际转换结果: ROS(${userBackToRos.x.toFixed(3)}, ${userBackToRos.y.toFixed(3)})`)
    }
    
    // 格式化坐标显示
    const formatCoordinate = (coord) => {
      if (coord === null || coord === undefined || isNaN(coord)) {
        return '0.00'
      }
      return Number(coord).toFixed(2)
    }
    
    // 获取方向描述
    const getOrientationDescription = (yaw) => {
      const degrees = yaw * 180 / Math.PI
      const normalizedDegrees = ((degrees % 360) + 360) % 360 // 归一化到0-360
      
      if (normalizedDegrees >= 337.5 || normalizedDegrees < 22.5) {
        return '正东 →'
      } else if (normalizedDegrees >= 22.5 && normalizedDegrees < 67.5) {
        return '东北 ↗'
      } else if (normalizedDegrees >= 67.5 && normalizedDegrees < 112.5) {
        return '正北 ↑'
      } else if (normalizedDegrees >= 112.5 && normalizedDegrees < 157.5) {
        return '西北 ↖'
      } else if (normalizedDegrees >= 157.5 && normalizedDegrees < 202.5) {
        return '正西 ←'
      } else if (normalizedDegrees >= 202.5 && normalizedDegrees < 247.5) {
        return '西南 ↙'
      } else if (normalizedDegrees >= 247.5 && normalizedDegrees < 292.5) {
        return '正南 ↓'
      } else {
        return '东南 ↘'
      }
    }
    
    // 监听机器人位姿变化 - 直接更新，无防抖
    watch(() => robotStore.robotPose, (newPose) => {
      console.log('RobotMap: 检测到机器人位姿变化:', newPose)
      
      // 直接更新机器人位置，无延迟
      if (robotMarker.value && newPose) {
        // 将ROS坐标转换为Leaflet坐标
        const leafletCoords = rosToLeaflet(newPose.x, newPose.y)
        
        console.log('RobotMap: 坐标转换结果:', {
          ros: { x: newPose.x, y: newPose.y },
          leaflet: { lat: leafletCoords[0], lng: leafletCoords[1] }
        })
        
        // 验证转换结果的有效性
        if (isNaN(leafletCoords[0]) || isNaN(leafletCoords[1])) {
          console.warn('坐标转换结果无效，跳过更新:', leafletCoords)
          return
        }
        
        // 放宽坐标范围检查，允许更大的显示范围
        if (Math.abs(leafletCoords[0]) > 1000 || Math.abs(leafletCoords[1]) > 1000) {
          console.warn('机器人坐标超出合理范围，跳过更新:', leafletCoords)
          return
        }
        
        try {
          // 直接瞬移到新位置，无动画
          robotMarker.value.setLatLng(leafletCoords)
          console.log('RobotMap: 机器人标记位置已更新')
          
          // 自动调整地图视图，确保机器人在视野内
          if (map.value) {
            const currentZoom = map.value.getZoom()
            // 只在机器人位置超出当前视野时才调整视图
            const bounds = map.value.getBounds()
            if (!bounds.contains(leafletCoords)) {
              console.log('RobotMap: 机器人超出视野，调整地图视图')
              map.value.setView(leafletCoords, currentZoom)
            }
          }
          
          // 更新机器人朝向
          const angle = newPose.theta * (180 / Math.PI)
          const markerElement = robotMarker.value.getElement()
          if (markerElement) {
            markerElement.style.transform = `rotate(${angle}deg)`
            console.log('RobotMap: 机器人朝向已更新:', angle + '°')
          }
        } catch (error) {
          console.error('更新机器人标记失败:', error)
        }
      } else {
        console.log('RobotMap: robotMarker或newPose不存在', {
          robotMarker: !!robotMarker.value,
          newPose: !!newPose
        })
      }
    }, { deep: true, immediate: true })
    
    // 监听MQTT连接状态 - 现在使用computed，无需手动赋值
    // watch(() => robotStore.mqttConnected, (connected) => {
    //   mqttConnected.value = connected
    // })
    
    // 监听地图数据变化 - 现在使用computed，无需手动赋值
    watch(() => robotStore.mapData, (newMapData) => {
      if (map.value && newMapData.pgmUrl) {
        // 重新加载地图瓦片
        import('leaflet').then(L => {
          loadMapTiles(L)
        })
      }
    }, { deep: true })
    
    onMounted(() => {
      testConversion() // 测试坐标转换
      initMap()
    })
    
    onUnmounted(() => {
      if (map.value) {
        map.value.remove()
      }
    })
    
    return {
      mapContainer,
      isClickModeEnabled,
      clickedPosition,
      clickedOrientation,
      isSettingOrientation,
      mqttConnected,
      robotPose,
      zoomIn,
      zoomOut,
      resetView,
      toggleClickMode,
      sendGoalPosition,
      formatCoordinate,
      getOrientationDescription,
      testRobotPositionUpdate,
      testCoordinateConversion
    }
  }
}
</script>

<style scoped>
.robot-map-container {
  position: relative;
  width: 100%;
  height: 100%;
}

.map-container {
  width: 100%;
  height: 100%;
  background: #1a1a1a;
}

.map-controls {
  position: absolute;
  top: 10px;
  right: 10px;
  z-index: 1000;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.control-group {
  display: flex;
  flex-direction: column;
  gap: 5px;
  background: rgba(0, 0, 0, 0.7);
  padding: 8px;
  border-radius: 8px;
  backdrop-filter: blur(10px);
}

.control-btn {
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

.control-btn:hover {
  background: #4a5568;
  transform: scale(1.05);
}

.control-btn.active {
  background: #3182ce;
  box-shadow: 0 0 10px rgba(49, 130, 206, 0.5);
}

.mouse-coordinates-display {
  position: absolute;
  top: 20px;
  right: 20px;
  background: rgba(0, 0, 0, 0.9);
  padding: 12px;
  border-radius: 8px;
  backdrop-filter: blur(10px);
  border: 1px solid #4299e1;
  z-index: 1000;
  min-width: 180px;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.3);
}

.coordinates-display {
  position: absolute;
  bottom: 20px;
  left: 20px;
  background: rgba(0, 0, 0, 0.8);
  padding: 15px;
  border-radius: 8px;
  backdrop-filter: blur(10px);
  border: 1px solid #4a5568;
  z-index: 1000;
  min-width: 200px;
}

.coordinates-header {
  color: #63b3ed;
  font-weight: bold;
  margin-bottom: 10px;
  text-align: center;
  font-size: 14px;
  border-bottom: 1px solid #4a5568;
  padding-bottom: 5px;
}

.coordinate-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
  min-width: 180px;
}

.coord-label {
  color: #a0aec0;
  font-weight: 500;
  font-size: 12px;
}

.coord-value {
  color: #e2e8f0;
  font-weight: 600;
  font-family: 'Courier New', monospace;
  font-size: 13px;
}

.coord-value.frontend {
  color: #68d391;
  font-size: 11px;
}

.coord-value.ros {
  color: #fbb6ce;
  font-size: 11px;
}

.coordinate-item:last-child {
  margin-bottom: 0;
  margin-top: 10px;
}

.orientation-hint {
  margin: 8px 0;
  padding: 8px;
  background: rgba(245, 158, 11, 0.2);
  border-radius: 4px;
  text-align: center;
  color: #f59e0b;
  font-size: 12px;
  border: 1px solid rgba(245, 158, 11, 0.3);
}

.orientation-display {
  margin: 12px 0;
  padding: 12px;
  background: rgba(66, 153, 225, 0.1);
  border-radius: 6px;
  border: 1px solid rgba(66, 153, 225, 0.3);
}

.compass {
  position: relative;
  width: 80px;
  height: 80px;
  margin: 0 auto 12px;
  background: radial-gradient(circle, rgba(66, 153, 225, 0.2) 0%, rgba(66, 153, 225, 0.05) 100%);
  border: 2px solid rgba(66, 153, 225, 0.5);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.compass-arrow {
  font-size: 32px;
  color: #4299e1;
  transition: transform 0.3s ease;
  filter: drop-shadow(0 0 4px rgba(66, 153, 225, 0.8));
  transform-origin: center;
}

.compass-labels {
  position: absolute;
  width: 120px;
  height: 120px;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
}

.compass-labels span {
  position: absolute;
  font-size: 9px;
  color: #a0aec0;
  font-weight: 600;
}

.label-n {
  top: -20px;
  left: 50%;
  transform: translateX(-50%);
}

.label-e {
  right: -30px;
  top: 50%;
  transform: translateY(-50%);
}

.label-s {
  bottom: -20px;
  left: 50%;
  transform: translateX(-50%);
}

.label-w {
  left: -35px;
  top: 50%;
  transform: translateY(-50%);
}

.orientation-info {
  text-align: center;
  color: #e2e8f0;
  font-size: 12px;
}

.orientation-info p {
  margin: 4px 0;
}

.send-btn {
  background: #3182ce;
  color: white;
  border: none;
  padding: 8px 16px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
  transition: background 0.2s;
}

.send-btn:hover:not(:disabled) {
  background: #2b6cb0;
}

.send-btn:disabled {
  background: #718096;
  cursor: not-allowed;
}

/* Leaflet标记样式 */
:deep(.robot-marker-container) {
  background: transparent;
  border: none;
  /* 确保标记稳定显示 */
  will-change: transform;
  backface-visibility: hidden;
  transform: translateZ(0);
}

:deep(.robot-marker) {
  font-size: 24px;
  filter: drop-shadow(0 0 5px rgba(66, 153, 225, 0.8));
  /* 移除过渡效果，避免位置闪烁 */
  /* 确保渲染性能 */
  will-change: transform;
  backface-visibility: hidden;
  transform: translateZ(0);
}

:deep(.goal-marker-container) {
  background: transparent;
  border: none;
}

:deep(.goal-marker) {
  font-size: 20px;
  filter: drop-shadow(0 0 5px rgba(236, 201, 75, 0.8));
}
</style>