<template>
  <div class="thermal-display" :class="{ fullscreen: isFullscreen }">
    <!-- Video Display Area -->
    <div class="video-container">
      <div v-if="currentFrame" class="image-wrapper">
        <img
          ref="imageRef"
          :src="`data:image/bmp;base64,${currentFrame.frame}`"
          alt="Thermal Imaging"
          class="thermal-image"
          draggable="false"
          @click="handleImageClick"
        />
        
        <!-- Center Crosshair -->
        <div class="crosshair">
          <div class="crosshair-v"></div>
          <div class="crosshair-h"></div>
        </div>
      </div>
      
      <div v-else class="loading-state">
        <div class="spinner"></div>
        <p>{{ isConnected ? '等待视频流...' : '未连接到服务器' }}</p>
      </div>
    </div>

    <!-- Connection Status -->
    <div class="status-indicator">
      <div class="status-dot" :class="{ connected: isConnected }"></div>
      <span class="status-text">{{ isConnected ? '已连接' : '未连接' }}</span>
    </div>

    <!-- Controls -->
    <button class="fullscreen-btn" @click="toggleFullscreen" :title="isFullscreen ? '退出全屏' : '全屏'">
      {{ isFullscreen ? '↙' : '↗' }}
    </button>

    <!-- Info Overlay -->
    <div v-if="currentFrame" class="info-overlay">
      <div class="info-group">
        <div class="info-row">
          <span class="label">范围:</span>
          <span class="value">{{ currentFrame.temperature_range.min.toFixed(1) }} - {{ currentFrame.temperature_range.max.toFixed(1) }}°C</span>
        </div>
        <div v-if="currentFrame.center_temp !== undefined" class="info-row">
          <span class="label center">中心:</span>
          <span class="value">{{ currentFrame.center_temp.toFixed(1) }}°C</span>
        </div>
        <div v-if="currentFrame.max_temp !== undefined" class="info-row">
          <span class="label max">最高:</span>
          <span class="value">{{ currentFrame.max_temp.toFixed(1) }}°C</span>
        </div>
      </div>

      <div v-if="clickedPoint" class="clicked-point">
        <span class="label point">选点 ({{ clickedPoint.x }}, {{ clickedPoint.y }}):</span>
        <span class="value">{{ clickedPoint.temp.toFixed(1) }}°C</span>
      </div>
    </div>
  </div>
</template>

<script>
import { ref, onMounted, onUnmounted, watch } from 'vue'
import { useRobotStore } from '../stores/robotStore'

export default {
  name: 'ThermalDisplay',
  setup() {
    const robotStore = useRobotStore()
    const isConnected = ref(false)
    const currentFrame = ref(null)
    const isFullscreen = ref(false)
    const clickedPoint = ref(null)
    const imageRef = ref(null)
    let ws = null
    let reconnectTimer = null

    const connect = () => {
      if (ws) {
        ws.close()
      }

      // Connect to the thermal bridge server
      ws = new WebSocket('ws://localhost:3002')

      ws.onopen = () => {
        console.log('Connected to thermal bridge')
        isConnected.value = true
        
        // Send current configuration
        sendConfig()
      }

      ws.onclose = () => {
        console.log('Disconnected from thermal bridge')
        isConnected.value = false
        currentFrame.value = null
        // Auto reconnect
        reconnectTimer = setTimeout(connect, 2000)
      }

      ws.onerror = (err) => {
        console.error('WebSocket error:', err)
        ws.close()
      }

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data)
          if (message.type === 'video_frame') {
            currentFrame.value = message.data
          } else if (message.type === 'connection_status') {
            // Handle status update if needed
          }
        } catch (e) {
          console.error('Error parsing message:', e)
        }
      }
    }

    const sendConfig = () => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        const ip = robotStore.config.thermalIp || '192.168.31.170'
        ws.send(JSON.stringify({
          type: 'configure_thermal',
          data: { host: ip }
        }))
      }
    }

    // Watch for config changes
    watch(() => robotStore.config.thermalIp, (newIp) => {
      if (newIp) {
        sendConfig()
      }
    })

    const toggleFullscreen = () => {
      if (!document.fullscreenElement) {
        const el = document.querySelector('.thermal-display')
        if (el) {
          el.requestFullscreen().catch(err => {
            console.error(`Error attempting to enable fullscreen: ${err.message}`)
          })
          isFullscreen.value = true
        }
      } else {
        document.exitFullscreen()
        isFullscreen.value = false
      }
    }

    const handleImageClick = (e) => {
      if (!currentFrame.value || !currentFrame.value.temps || !imageRef.value) return

      const img = imageRef.value
      const rect = img.getBoundingClientRect()
      
      // Calculate actual displayed image dimensions (object-fit: contain)
      const imageAspect = currentFrame.value.width / currentFrame.value.height
      const containerAspect = rect.width / rect.height
      
      let renderWidth, renderHeight, offsetX, offsetY
      
      if (containerAspect > imageAspect) {
        renderHeight = rect.height
        renderWidth = rect.height * imageAspect
        offsetX = (rect.width - renderWidth) / 2
        offsetY = 0
      } else {
        renderWidth = rect.width
        renderHeight = rect.width / imageAspect
        offsetX = 0
        offsetY = (rect.height - renderHeight) / 2
      }

      const clickX = e.clientX - rect.left - offsetX
      const clickY = e.clientY - rect.top - offsetY

      if (clickX >= 0 && clickX < renderWidth && clickY >= 0 && clickY < renderHeight) {
        const sourceX = Math.floor((clickX / renderWidth) * currentFrame.value.width)
        const sourceY = Math.floor((clickY / renderHeight) * currentFrame.value.height)
        
        const index = sourceY * currentFrame.value.width + sourceX
        if (index >= 0 && index < currentFrame.value.temps.length) {
          clickedPoint.value = { 
            x: sourceX, 
            y: sourceY, 
            temp: currentFrame.value.temps[index] 
          }
        }
      } else {
        clickedPoint.value = null
      }
    }

    // Listen for fullscreen change events (ESC key)
    const onFullscreenChange = () => {
      isFullscreen.value = !!document.fullscreenElement
    }

    onMounted(() => {
      connect()
      document.addEventListener('fullscreenchange', onFullscreenChange)
    })

    onUnmounted(() => {
      if (ws) {
        ws.close()
      }
      if (reconnectTimer) {
        clearTimeout(reconnectTimer)
      }
      document.removeEventListener('fullscreenchange', onFullscreenChange)
    })

    return {
      isConnected,
      currentFrame,
      isFullscreen,
      clickedPoint,
      imageRef,
      toggleFullscreen,
      handleImageClick
    }
  }
}
</script>

<style scoped>
.thermal-display {
  position: relative;
  width: 100%;
  height: 100%;
  background: #000;
  border-radius: 8px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.thermal-display.fullscreen {
  border-radius: 0;
}

.video-container {
  flex: 1;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.image-wrapper {
  position: relative;
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.thermal-image {
  width: 100%;
  height: 100%;
  object-fit: contain;
  cursor: crosshair;
  image-rendering: pixelated;
}

.crosshair {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  pointer-events: none;
  opacity: 0.5;
}

.crosshair-v {
  position: absolute;
  top: -10px;
  left: 0;
  width: 1px;
  height: 20px;
  background: white;
}

.crosshair-h {
  position: absolute;
  top: 0;
  left: -10px;
  width: 20px;
  height: 1px;
  background: white;
}

.loading-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  color: #666;
}

.spinner {
  width: 32px;
  height: 32px;
  border: 3px solid #333;
  border-top-color: #666;
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin-bottom: 10px;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.status-indicator {
  position: absolute;
  top: 10px;
  left: 10px;
  display: flex;
  align-items: center;
  gap: 6px;
  background: rgba(0, 0, 0, 0.5);
  padding: 4px 8px;
  border-radius: 4px;
  z-index: 10;
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #f56565;
}

.status-dot.connected {
  background: #48bb78;
}

.status-text {
  color: white;
  font-size: 12px;
}

.fullscreen-btn {
  position: absolute;
  top: 10px;
  right: 10px;
  background: rgba(0, 0, 0, 0.5);
  border: none;
  color: white;
  width: 32px;
  height: 32px;
  border-radius: 4px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  z-index: 10;
}

.fullscreen-btn:hover {
  background: rgba(0, 0, 0, 0.7);
}

.info-overlay {
  position: absolute;
  bottom: 10px;
  left: 10px;
  right: 10px;
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  pointer-events: none;
}

.info-group, .clicked-point {
  background: rgba(0, 0, 0, 0.6);
  padding: 8px 12px;
  border-radius: 4px;
  color: white;
  font-size: 12px;
}

.info-row {
  display: flex;
  gap: 10px;
  margin-bottom: 2px;
}

.info-row:last-child {
  margin-bottom: 0;
}

.label {
  color: #aaa;
}

.label.center {
  color: #63b3ed;
}

.label.max {
  color: #fc8181;
}

.label.point {
  color: #f6e05e;
}

.value {
  font-weight: bold;
  min-width: 40px;
  text-align: right;
}
</style>
