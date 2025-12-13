<template>
  <div class="thermal-camera">
    <div class="thermal-header">
      <h3>🌡️ 热成像相机（简化版）</h3>
      <div class="header-controls">
        <div class="connection-group">
          <div class="input-row">
            <label>WebSocket地址:</label>
            <input 
              v-model="wsAddress" 
              type="text" 
              placeholder="ws://localhost:8080"
              class="input-field"
            />
          </div>
          <button @click="connectStream" class="connect-btn" :disabled="isConnected">
            {{ isConnected ? '✓ 已连接' : '🔌 连接' }}
          </button>
          <button @click="disconnectStream" class="disconnect-btn" :disabled="!isConnected">
            ⏹ 断开
          </button>
        </div>
        <button @click="toggleFullscreen" class="fullscreen-btn">
          {{ isFullscreen ? '⛶ 退出全屏' : '⛶ 全屏' }}
        </button>
      </div>
    </div>

    <div class="stream-info">
      <div class="info-item">
        <span class="info-label">连接状态:</span>
        <span :class="['status-badge', streamStatus]">
          {{ streamStatusText }}
        </span>
      </div>
      <div class="info-item">
        <span class="info-label">数据流:</span>
        <span class="info-value">{{ wsAddress }}</span>
      </div>
      <div class="info-item">
        <span class="info-label">帧率:</span>
        <span class="info-value">{{ fps.toFixed(1) }} FPS</span>
      </div>
      <div class="info-item">
        <span class="info-label">分辨率:</span>
        <span class="info-value">{{ imageInfo.width }} × {{ imageInfo.height }}</span>
      </div>
    </div>

    <div v-if="error" class="error-message">
      <p>⚠️ {{ error }}</p>
      <button @click="connectStream" class="retry-btn">重试连接</button>
    </div>

    <div v-if="!isConnected && !error" class="empty-state">
      <div class="empty-icon">🌡️</div>
      <h4>Waveshare热成像模块</h4>
      <p>后端处理版 - 前端只需渲染</p>
      <div class="example-hint">
        <p><strong>📋 使用步骤:</strong></p>
        <ul>
          <li><strong>1. 启动后端服务器:</strong>
            <code>node thermal-proxy-backend.js</code>
          </li>
          <li><strong>2. 确保ESP32连接到WiFi</strong></li>
          <li><strong>3. 点击连接按钮</strong></li>
          <li><strong>4. 查看热成像图像</strong></li>
        </ul>
        <p><strong>💡 特点:</strong></p>
        <ul>
          <li>后端解析温度数据</li>
          <li>前端接收JSON格式温度矩阵</li>
          <li>无需复杂计算，直接渲染</li>
          <li>支持多种色彩映射</li>
        </ul>
      </div>
    </div>

    <div class="canvas-container" style="flex: 1; position: relative;">
      <canvas
        ref="thermalCanvas"
        class="thermal-canvas"
        :style="{
          width: canvasWidth + 'px',
          height: canvasHeight + 'px',
          display: isConnected && imageInfo.width > 0 ? 'block' : 'none'
        }"
      ></canvas>
      
      <!-- 温度信息叠加层 -->
      <div class="image-overlay" v-if="isConnected && temperatureStats">
        <div class="overlay-item">
          <span>温度范围:</span>
          <span>{{ temperatureStats.minTemp.toFixed(1) }}°C ~ {{ temperatureStats.maxTemp.toFixed(1) }}°C</span>
        </div>
        <div class="overlay-item">
          <span>平均温度:</span>
          <span>{{ temperatureStats.avgTemp.toFixed(1) }}°C</span>
        </div>
        <div class="overlay-item">
          <span>有效像素:</span>
          <span>{{ temperatureStats.validPixels }} / {{ temperatureStats.totalPixels }}</span>
        </div>
        <div class="overlay-item">
          <span>色彩映射:</span>
          <span>{{ colorMaps[currentColorMap] }}</span>
        </div>
      </div>
    </div>

    <div class="thermal-footer">
      <div class="footer-info">
        <span>💡 Waveshare热成像 | 后端处理 | 前端渲染</span>
      </div>
      <div class="footer-actions">
        <button @click="saveSnapshot" class="action-btn" :disabled="!isConnected">
          📸 保存快照
        </button>
        <button @click="toggleColorMap" class="action-btn" :disabled="!isConnected">
          🎨 {{ colorMaps[currentColorMap] }}
        </button>
        <button @click="testRender" class="action-btn">
          🧪 测试
        </button>
      </div>
    </div>
  </div>
</template>

<script>
import { ref, computed, onMounted, onUnmounted } from 'vue'

export default {
  name: 'ThermalCameraSimple',
  
  setup() {
    // 配置
    const wsAddress = ref('ws://localhost:8080')
    const canvasWidth = ref(640)   // Canvas显示宽度（可缩放）
    const canvasHeight = ref(512)  // Canvas显示高度（保持80:64比例）
    
    // 状态
    const isConnected = ref(false)
    const loading = ref(false)
    const error = ref(null)
    const streamStatus = ref('disconnected')
    const isFullscreen = ref(false)
    const streamContainer = ref(null)
    
    // 图像信息
    const imageInfo = ref({
      width: 80,    // MI0802实际分辨率
      height: 64,
      format: 'Temperature Matrix'
    })
    
    // 温度统计（从后端接收）
    const temperatureStats = ref(null)
    
    // Canvas相关
    const thermalCanvas = ref(null)
    let canvasContext = null
    let canvasImageData = null
    
    // 性能统计
    const fps = ref(0)
    let frameCount = 0
    let lastFrameTime = Date.now()
    let fpsInterval = null
    
    // 色彩映射
    const colorMaps = ['iron', 'rainbow', 'grayscale', 'hot']
    const currentColorMap = ref(0)
    
    // WebSocket
    let ws = null
    
    // 计算属性
    const streamStatusText = computed(() => {
      switch (streamStatus.value) {
        case 'connected':
          return '已连接'
        case 'connecting':
          return '连接中...'
        case 'error':
          return '连接失败'
        default:
          return '未连接'
      }
    })
    
    // 确保Canvas初始化
    const ensureCanvasInitialized = () => {
      if (!thermalCanvas.value) return false
      
      if (!canvasContext) {
        thermalCanvas.value.width = imageInfo.value.width
        thermalCanvas.value.height = imageInfo.value.height
        canvasContext = thermalCanvas.value.getContext('2d')
        canvasImageData = canvasContext.createImageData(imageInfo.value.width, imageInfo.value.height)
      }
      
      return true
    }
    
    // 连接到WebSocket
    const connectStream = () => {
      if (isConnected.value) return
      
      error.value = null
      loading.value = true
      streamStatus.value = 'connecting'
      
      try {
        console.log('连接到热成像后端:', wsAddress.value)
        
        ws = new WebSocket(wsAddress.value)
        ws.binaryType = 'arraybuffer'
        
        ws.onopen = () => {
          console.log('✅ WebSocket连接成功')
          isConnected.value = true
          loading.value = false
          streamStatus.value = 'connected'
          error.value = null
          
          // 确保Canvas初始化
          ensureCanvasInitialized()
          
          // 启动FPS计算
          startFpsCounter()
        }
        
        ws.onmessage = (event) => {
          frameCount++
          updateFps()
          
          // 处理JSON格式的温度矩阵（推荐）
          if (typeof event.data === 'string') {
            try {
              const data = JSON.parse(event.data)
              
              if (data.type === 'thermalFrame') {
                // 接收温度矩阵
                temperatureStats.value = data.statistics
                renderTemperatureMatrix(data.data, data.width, data.height)
              } else if (data.type === 'info') {
                console.log('后端信息:', data.message)
              } else if (data.type === 'stats') {
                console.log('后端统计:', data)
              }
            } catch (err) {
              console.error('解析JSON失败:', err)
            }
          }
          // 也可以处理二进制数据（如果需要）
        }
        
        ws.onerror = (err) => {
          console.error('WebSocket错误:', err)
          error.value = `连接失败，请检查：\n1. 后端服务器是否运行\n2. 地址是否正确：${wsAddress.value}\n3. 网络连接是否正常`
          streamStatus.value = 'error'
          loading.value = false
        }
        
        ws.onclose = () => {
          console.log('WebSocket连接关闭')
          isConnected.value = false
          streamStatus.value = 'disconnected'
          temperatureStats.value = null
          stopFpsCounter()
        }
        
      } catch (err) {
        console.error('连接失败:', err)
        error.value = err.message || '连接失败'
        streamStatus.value = 'error'
        loading.value = false
      }
    }
    
    // 断开连接
    const disconnectStream = () => {
      if (ws) {
        ws.close()
        ws = null
      }
      isConnected.value = false
      streamStatus.value = 'disconnected'
      stopFpsCounter()
    }
    
    // 渲染温度矩阵（后端已完成所有计算）
    const renderTemperatureMatrix = (temperatureMatrix, width, height) => {
      if (!ensureCanvasInitialized()) return
      
      const ctx = canvasContext
      const imageData = canvasImageData
      const stats = temperatureStats.value
      
      if (!stats) return
      
      // 获取温度范围（从后端统计信息）
      const minTemp = stats.minTemp
      const maxTemp = stats.maxTemp
      const tempSpan = maxTemp - minTemp || 1
      
      // 渲染每个像素
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const temp = temperatureMatrix[y][x]
          const pixelIndex = (y * width + x) * 4
          
          // 无效像素（显示为黑色）
          if (temp === null) {
            imageData.data[pixelIndex] = 0
            imageData.data[pixelIndex + 1] = 0
            imageData.data[pixelIndex + 2] = 0
            imageData.data[pixelIndex + 3] = 255
            continue
          }
          
          // 归一化到0-1
          const normalized = Math.max(0, Math.min(1, (temp - minTemp) / tempSpan))
          
          // 应用色彩映射
          const color = applyColorMap(normalized, colorMaps[currentColorMap.value])
          
          imageData.data[pixelIndex] = color.r
          imageData.data[pixelIndex + 1] = color.g
          imageData.data[pixelIndex + 2] = color.b
          imageData.data[pixelIndex + 3] = 255
        }
      }
      
      // 绘制到Canvas
      ctx.putImageData(imageData, 0, 0)
    }
    
    // 应用色彩映射
    const applyColorMap = (value, mapName) => {
      switch (mapName) {
        case 'iron':
          return ironColorMap(value)
        case 'rainbow':
          return rainbowColorMap(value)
        case 'hot':
          return hotColorMap(value)
        case 'grayscale':
        default:
          const gray = Math.floor(value * 255)
          return { r: gray, g: gray, b: gray }
      }
    }
    
    // Iron色彩映射
    const ironColorMap = (value) => {
      if (value < 0.25) {
        const intensity = value * 4
        return { r: Math.floor(intensity * 50), g: Math.floor(intensity * 50), b: Math.floor(128 + intensity * 127) }
      } else if (value < 0.5) {
        const intensity = (value - 0.25) * 4
        return { r: 0, g: Math.floor(intensity * 255), b: 255 }
      } else if (value < 0.75) {
        const intensity = (value - 0.5) * 4
        return { r: Math.floor(intensity * 255), g: 255, b: 255 - Math.floor(intensity * 255) }
      } else {
        const intensity = (value - 0.75) * 4
        return { r: 255, g: 255, b: Math.floor(intensity * 255) }
      }
    }
    
    // Rainbow色彩映射
    const rainbowColorMap = (value) => {
      const h = value * 360
      const c = 1
      const x = c * (1 - Math.abs((h / 60) % 2 - 1))
      const m = 0
      
      let r, g, b
      if (h < 60) [r, g, b] = [c, x, 0]
      else if (h < 120) [r, g, b] = [x, c, 0]
      else if (h < 180) [r, g, b] = [0, c, x]
      else if (h < 240) [r, g, b] = [0, x, c]
      else if (h < 300) [r, g, b] = [x, 0, c]
      else [r, g, b] = [c, 0, x]
      
      return { r: Math.floor((r + m) * 255), g: Math.floor((g + m) * 255), b: Math.floor((b + m) * 255) }
    }
    
    // Hot色彩映射
    const hotColorMap = (value) => {
      if (value < 0.33) {
        return { r: Math.floor(value * 3 * 255), g: 0, b: 0 }
      } else if (value < 0.66) {
        return { r: 255, g: Math.floor((value - 0.33) * 3 * 255), b: 0 }
      } else {
        return { r: 255, g: 255, b: Math.floor((value - 0.66) * 3 * 255) }
      }
    }
    
    // FPS计算
    const startFpsCounter = () => {
      frameCount = 0
      lastFrameTime = Date.now()
      
      fpsInterval = setInterval(() => {
        const now = Date.now()
        const elapsed = (now - lastFrameTime) / 1000
        fps.value = frameCount / elapsed
        frameCount = 0
        lastFrameTime = now
      }, 1000)
    }
    
    const stopFpsCounter = () => {
      if (fpsInterval) {
        clearInterval(fpsInterval)
        fpsInterval = null
      }
      fps.value = 0
    }
    
    const updateFps = () => {
      // FPS在startFpsCounter中每秒更新一次
    }
    
    // 切换色彩映射
    const toggleColorMap = () => {
      currentColorMap.value = (currentColorMap.value + 1) % colorMaps.length
      console.log('切换色彩映射:', colorMaps[currentColorMap.value])
    }
    
    // 保存快照
    const saveSnapshot = () => {
      if (!thermalCanvas.value) return
      
      const link = document.createElement('a')
      link.download = `thermal_snapshot_${Date.now()}.png`
      link.href = thermalCanvas.value.toDataURL()
      link.click()
      
      console.log('✅ 快照已保存')
    }
    
    // 测试渲染
    const testRender = () => {
      console.log('🧪 开始测试渲染（渐变）...')
      
      // 创建测试温度矩阵（室温12-17°C渐变）
      const testMatrix = []
      const width = 80
      const height = 64
      
      for (let y = 0; y < height; y++) {
        const row = []
        for (let x = 0; x < width; x++) {
          // 从左到右的温度渐变
          const temp = 12 + (x / width) * 5  // 12°C 到 17°C
          row.push(parseFloat(temp.toFixed(2)))
        }
        testMatrix.push(row)
      }
      
      // 模拟统计信息
      temperatureStats.value = {
        minTemp: 12,
        maxTemp: 17,
        avgTemp: 14.5,
        validPixels: width * height,
        totalPixels: width * height
      }
      
      ensureCanvasInitialized()
      renderTemperatureMatrix(testMatrix, width, height)
      console.log('✅ 测试渲染完成')
    }
    
    // 全屏切换
    const toggleFullscreen = () => {
      if (!streamContainer.value) return
      
      if (!document.fullscreenElement) {
        streamContainer.value.requestFullscreen()
        isFullscreen.value = true
      } else {
        document.exitFullscreen()
        isFullscreen.value = false
      }
    }
    
    // 监听全屏变化
    const handleFullscreenChange = () => {
      isFullscreen.value = !!document.fullscreenElement
    }
    
    onMounted(() => {
      console.log('ThermalCameraSimple组件已挂载（后端处理版）')
      document.addEventListener('fullscreenchange', handleFullscreenChange)
    })
    
    onUnmounted(() => {
      disconnectStream()
      document.removeEventListener('fullscreenchange', handleFullscreenChange)
    })
    
    return {
      wsAddress,
      canvasWidth,
      canvasHeight,
      isConnected,
      loading,
      error,
      streamStatus,
      streamStatusText,
      isFullscreen,
      fps,
      imageInfo,
      temperatureStats,
      thermalCanvas,
      streamContainer,
      colorMaps,
      currentColorMap,
      connectStream,
      disconnectStream,
      toggleFullscreen,
      saveSnapshot,
      toggleColorMap,
      testRender
    }
  }
}
</script>

<style scoped>
.thermal-camera {
  height: 100%;
  background: #1a202c;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.thermal-header {
  padding: 20px;
  border-bottom: 1px solid #2d3748;
  background: #1a202c;
}

.thermal-header h3 {
  color: #e2e8f0;
  font-size: 18px;
  font-weight: 600;
  margin: 0 0 15px 0;
}

.header-controls {
  display: flex;
  gap: 10px;
  align-items: flex-end;
  flex-wrap: wrap;
}

.connection-group {
  display: flex;
  gap: 10px;
  align-items: flex-end;
  flex: 1;
  flex-wrap: wrap;
}

.input-row {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.input-row label {
  color: #a0aec0;
  font-size: 12px;
}

.input-field {
  padding: 8px 12px;
  background: #2d3748;
  border: 1px solid #4a5568;
  border-radius: 6px;
  color: #e2e8f0;
  font-size: 14px;
  min-width: 200px;
}

.input-field:focus {
  outline: none;
  border-color: #4299e1;
  box-shadow: 0 0 0 3px rgba(66, 153, 225, 0.1);
}

.connect-btn,
.disconnect-btn,
.fullscreen-btn {
  padding: 8px 16px;
  border: none;
  border-radius: 6px;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s;
  white-space: nowrap;
  height: 38px;
}

.connect-btn {
  background: #48bb78;
  color: white;
}

.connect-btn:hover:not(:disabled) {
  background: #38a169;
}

.connect-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
  background: #2d5f3f;
}

.disconnect-btn {
  background: #f56565;
  color: white;
}

.disconnect-btn:hover:not(:disabled) {
  background: #e53e3e;
}

.disconnect-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.fullscreen-btn {
  background: #805ad5;
  color: white;
}

.fullscreen-btn:hover {
  background: #6b46c1;
}

.stream-info {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 15px;
  padding: 15px 20px;
  background: #2d3748;
  border-bottom: 1px solid #4a5568;
}

.info-item {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.info-label {
  color: #a0aec0;
  font-size: 12px;
}

.info-value {
  color: #e2e8f0;
  font-size: 14px;
  font-family: monospace;
  word-break: break-all;
}

.status-badge {
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 600;
  display: inline-block;
  width: fit-content;
}

.status-badge.connected {
  background: #48bb78;
  color: white;
}

.status-badge.connecting {
  background: #4299e1;
  color: white;
  animation: pulse 1.5s infinite;
}

.status-badge.error {
  background: #f56565;
  color: white;
}

.error-message {
  padding: 20px;
  background: rgba(245, 101, 101, 0.1);
  border: 1px solid #f56565;
  border-radius: 8px;
  margin: 20px;
  text-align: center;
}

.error-message p {
  color: #f56565;
  margin-bottom: 15px;
  white-space: pre-line;
}

.retry-btn {
  padding: 8px 16px;
  background: #f56565;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
}

.retry-btn:hover {
  background: #e53e3e;
}

.empty-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px;
  text-align: center;
  color: #a0aec0;
}

.empty-icon {
  font-size: 48px;
  margin-bottom: 20px;
}

.empty-state h4 {
  color: #e2e8f0;
  margin-bottom: 10px;
  font-size: 20px;
}

.empty-state p {
  margin-bottom: 20px;
}

.example-hint {
  background: rgba(66, 153, 225, 0.1);
  border: 1px solid rgba(66, 153, 225, 0.3);
  border-radius: 8px;
  padding: 20px;
  max-width: 500px;
  text-align: left;
}

.example-hint p {
  margin-bottom: 10px;
  color: #e2e8f0;
  font-weight: 600;
}

.example-hint ul {
  margin: 0;
  padding-left: 20px;
}

.example-hint li {
  margin-bottom: 8px;
  font-size: 14px;
}

.example-hint code {
  background: rgba(0, 0, 0, 0.3);
  padding: 2px 6px;
  border-radius: 3px;
  font-family: monospace;
  font-size: 13px;
}

.canvas-container {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #000;
  position: relative;
  min-height: 300px;
}

.thermal-canvas {
  display: block;
  max-width: 100%;
  max-height: 100%;
  image-rendering: pixelated;  /* 保持像素清晰 */
  image-rendering: crisp-edges;
}

.image-overlay {
  position: absolute;
  top: 10px;
  right: 10px;
  background: rgba(0, 0, 0, 0.7);
  color: white;
  padding: 10px;
  border-radius: 4px;
  font-size: 12px;
  pointer-events: none;
}

.overlay-item {
  display: flex;
  justify-content: space-between;
  gap: 15px;
  margin-bottom: 4px;
}

.overlay-item:last-child {
  margin-bottom: 0;
}

.overlay-item span:first-child {
  color: #a0aec0;
}

.overlay-item span:last-child {
  color: #e2e8f0;
  font-family: monospace;
  font-weight: 600;
}

.thermal-footer {
  padding: 15px 20px;
  background: #2d3748;
  border-top: 1px solid #4a5568;
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
}

.footer-info {
  color: #a0aec0;
  font-size: 13px;
}

.footer-actions {
  display: flex;
  gap: 10px;
}

.action-btn {
  padding: 6px 12px;
  background: #4a5568;
  color: white;
  border: none;
  border-radius: 4px;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s;
}

.action-btn:hover:not(:disabled) {
  background: #718096;
}

.action-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

@keyframes pulse {
  0%, 100% {
    opacity: 1;
  }
  50% {
    opacity: 0.5;
  }
}
</style>
