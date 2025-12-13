<template>
  <div class="thermal-camera">
    <div class="thermal-header">
      <h3>🌡️ 热成像相机</h3>
      <div class="header-controls">
        <div class="connection-group">
          <div class="input-row">
            <label>连接模式:</label>
            <select v-model="connectionMode" class="input-field">
              <option value="proxy">本地代理</option>
              <option value="direct">直连ESP32</option>
            </select>
          </div>
          
          <!-- 本地代理模式 -->
          <div v-if="connectionMode === 'proxy'" class="proxy-config">
            <div class="input-row">
              <label>代理地址:</label>
              <input 
                v-model="esp32Host" 
                type="text" 
                placeholder="localhost"
                class="input-field"
              />
            </div>
            <div class="input-row">
              <label>代理端口:</label>
              <input 
                v-model.number="esp32Port" 
                type="number" 
                placeholder="8080"
                class="input-field port-input"
              />
            </div>
          </div>
          
          <!-- 直连ESP32模式 -->
          <div v-if="connectionMode === 'direct'" class="direct-config">
            <div class="input-row">
              <label>ESP32地址:</label>
              <input 
                v-model="esp32DirectHost" 
                type="text" 
                placeholder="192.168.1.100"
                class="input-field"
              />
            </div>
            <div class="input-row">
              <label>ESP32端口:</label>
              <input 
                v-model.number="esp32DirectPort" 
                type="number" 
                placeholder="3333"
                class="input-field port-input"
              />
            </div>
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
        <span class="info-value">{{ esp32Host }}:{{ esp32Port }}</span>
      </div>
      <div class="info-item">
        <span class="info-label">帧率:</span>
        <span class="info-value">{{ fps.toFixed(1) }} FPS</span>
      </div>
      <div class="info-item">
        <span class="info-label">接收数据:</span>
        <span class="info-value">{{ formatBytes(bytesReceived) }}</span>
      </div>
    </div>

    <div v-if="error" class="error-message">
      <p>⚠️ {{ error }}</p>
      <button @click="connectStream" class="retry-btn">重试连接</button>
      <button @click="ensureCanvasInitialized" class="retry-btn" style="margin-left: 10px;">检查Canvas</button>
    </div>

    <div v-if="!isConnected && !error" class="empty-state">
      <div class="empty-icon">🌡️</div>
      <h4>Waveshare热成像模块 (80×63)</h4>
      <p>通过本地代理连接到ESP32-S3模块</p>
      <div class="example-hint">
        <p><strong>📋 使用步骤:</strong></p>
        <ul>
          <li><strong>1. 启动代理服务器:</strong> 运行 <code>npm run thermal-proxy</code></li>
          <li><strong>2. 配置ESP32地址:</strong> 编辑 <code>.env</code> 文件设置ESP32_HOST</li>
          <li><strong>3. 点击连接:</strong> 连接到本地代理服务器</li>
          <li><strong>4. 查看热成像:</strong> 代理会自动从ESP32获取数据</li>
        </ul>
        <p><strong>⚠️ 重要提示:</strong></p>
        <ul>
          <li>前端连接到本地代理（localhost:8080）</li>
          <li>代理服务器连接到ESP32（默认端口3333）</li>
          <li>确保电脑和ESP32在同一WiFi网络</li>
          <li>图像分辨率：80×64像素，最大25 FPS</li>
          <li>数据帧格式：10256字节（含帧头和CRC）</li>
        </ul>
      </div>
    </div>

    <div v-else class="stream-container" ref="streamContainer">
      <div v-if="loading" class="loading-overlay">
        <div class="spinner"></div>
        <p>正在连接热成像流...</p>
      </div>
    </div>

    <!-- Canvas用于显示热成像图像 - 始终渲染以确保初始化 -->
    <div class="canvas-container" style="flex: 1; position: relative;">
      <canvas
        ref="thermalCanvas"
        class="thermal-canvas"
        :style="{ display: isConnected ? 'block' : 'none' }"
      ></canvas>
        
      <!-- 图像信息叠加层 -->
      <div class="image-overlay" v-if="imageInfo.width && isConnected">
        <div class="overlay-item">
          <span>分辨率:</span>
          <span>{{ imageInfo.width }} × {{ imageInfo.height }}</span>
        </div>
        <div class="overlay-item">
          <span>温度范围:</span>
          <span>{{ tempRange.current.min.toFixed(1) }}°C ~ {{ tempRange.current.max.toFixed(1) }}°C</span>
        </div>
        <div class="overlay-item">
          <span>色彩映射:</span>
          <span>{{ colorMaps[currentColorMap] }}</span>
        </div>
        <div class="overlay-item">
          <span>温度偏移:</span>
          <span>{{ tempCalibration.offset.toFixed(1) }}°C</span>
        </div>
      </div>
      
      <!-- 🎛️ 温度校准面板（参考官方软件） -->
      <div class="temp-calibration-panel" v-if="isConnected">
        <div class="panel-header">
          <h4>🎯 温度校准</h4>
          <button @click="showCalibration = !showCalibration" class="toggle-btn">
            {{ showCalibration ? '▼' : '▶' }}
          </button>
        </div>
        
        <div v-show="showCalibration" class="panel-content">
          <div class="calibration-row">
            <label>温度偏移 (°C):</label>
            <input 
              v-model.number="tempCalibration.offset" 
              type="number" 
              step="0.5"
              class="temp-input"
            />
            <span class="hint">调整使温度准确</span>
          </div>
          
          <div class="calibration-row">
            <label>显示最低温 (°C):</label>
            <input 
              v-model.number="tempCalibration.minDisplay" 
              type="number" 
              step="0.5"
              class="temp-input"
            />
          </div>
          
          <div class="calibration-row">
            <label>显示最高温 (°C):</label>
            <input 
              v-model.number="tempCalibration.maxDisplay" 
              type="number" 
              step="0.5"
              class="temp-input"
            />
          </div>
          
          <div class="calibration-row">
            <label>移除极端最大值 (°C):</label>
            <input 
              v-model.number="tempCalibration.removeExtremeMax" 
              type="number" 
              step="1"
              class="temp-input"
            />
          </div>
          
          <div class="calibration-info">
            <div class="info-row">
              <span>当前温度范围:</span>
              <span>{{ tempRange.current.min.toFixed(1) }}°C ~ {{ tempRange.current.max.toFixed(1) }}°C</span>
            </div>
            <div class="info-row">
              <span>转换公式:</span>
              <span>温度 = (像素值÷100) + {{ tempCalibration.offset }}°C</span>
            </div>
          </div>
          
          <div class="calibration-presets">
            <button @click="resetCalibration" class="preset-btn">
              🔄 重置为默认
            </button>
          </div>
        </div>
      </div>
    </div>

    <div class="thermal-footer">
      <div class="footer-info">
        <span>💡 Waveshare热成像模块 | MI0802传感器 | 80×64分辨率 | TCP端口3333 | 帧大小10256字节</span>
      </div>
      <div class="footer-actions">
        <button @click="saveSnapshot" class="action-btn" :disabled="!isConnected">
          📸 保存快照
        </button>
        <button @click="toggleColorMap" class="action-btn" :disabled="!isConnected">
          🎨 {{ colorMaps[currentColorMap] }}
        </button>
        <button @click="testRender" class="action-btn">
          🧪 测试渲染
        </button>
      </div>
    </div>
  </div>
</template>

<script>
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue'

export default {
  name: 'ThermalCamera',
  
  setup() {
    // 连接模式
    const connectionMode = ref('proxy')  // 'proxy' 或 'direct'
    
    // 本地代理配置
    const esp32Host = ref('localhost')
    const esp32Port = ref(8080)  // 本地WebSocket代理端口
    
    // 直连ESP32配置
    const esp32DirectHost = ref('192.168.1.100')
    const esp32DirectPort = ref(3333)  // ESP32 TCP端口
    
    // 状态
    const isConnected = ref(false)
    const loading = ref(false)
    const error = ref(null)
    const streamStatus = ref('disconnected')
    const isFullscreen = ref(false)
    
    // 数据统计
    const fps = ref(0)
    const bytesReceived = ref(0)
    const frameCount = ref(0)
    const lastFrameTime = ref(0)
    
    // 图像信息
    const imageInfo = ref({
      width: 80,   // Waveshare实际80x63（受帧大小限制）
      height: 63,
      format: 'Thermal Binary'
    })
    
    // 温度范围（用于色彩映射）
    const tempRange = ref({
      min: 0,
      max: 100,
      current: { min: 0, max: 0 }
    })
    
    // 🎯 温度校准参数（根据MI0802传感器规格优化）
    const tempCalibration = ref({
      offset: 0.0,          // 温度偏移（°C）- ESP32已校准，设为0
      minDisplay: 10.0,     // 显示最低温度
      maxDisplay: 40.0,     // 显示最高温度
      resolution: 100,      // ✅ 分辨率：0.01°C (100) 或 0.1°C (10)
      removeExtremeMax: 80.0, // 移除极端最大值
      sensitivity: 0.95,    // 灵敏度
      autoCalibrate: true   // 是否使用ESP32提供的元数据自动校准
    })
    
    // 校准面板显示状态
    const showCalibration = ref(true)
    
    // DOM引用
    const streamContainer = ref(null)
    const thermalCanvas = ref(null)
    
    // TCP Socket连接（使用WebSocket作为TCP的替代）
    let ws = null
    let canvasContext = null
    let fpsInterval = null
    let dataBuffer = new Uint8Array(0)  // 数据缓冲区
    
    // 色彩映射模式
    const colorMaps = ['iron', 'rainbow', 'grayscale', 'hot']
    const currentColorMap = ref(0)
    
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
    const ensureCanvasInitialized = async () => {
      console.log('开始Canvas初始化检查...')
      
      // 等待DOM更新
      await nextTick()
      
      // 多次尝试获取Canvas引用，防止时序问题
      let attempts = 0
      while (!thermalCanvas.value && attempts < 10) {
        console.log(`等待Canvas引用... 尝试 ${attempts + 1}/10`)
        await new Promise(resolve => setTimeout(resolve, 50))
        attempts++
      }
      
      if (!thermalCanvas.value) {
        const errorMsg = 'Canvas未初始化 - 请确保组件已正确挂载\n\n调试信息：\n- Canvas引用: ' + !!thermalCanvas.value + '\n- 尝试次数: ' + attempts + '\n\n可能的解决方案：\n1. 刷新页面重试\n2. 检查浏览器控制台是否有其他错误\n3. 确保Vue组件正确渲染'
        console.error(errorMsg)
        throw new Error(errorMsg)
      }
      
      console.log('Canvas初始化成功:', {
        element: thermalCanvas.value.tagName,
        width: thermalCanvas.value.width,
        height: thermalCanvas.value.height
      })
      
      return thermalCanvas.value
    }
    
    // 从localStorage加载保存的配置
    const loadSavedConfig = () => {
      // 加载连接模式
      const savedMode = localStorage.getItem('esp32ThermalMode')
      if (savedMode) connectionMode.value = savedMode
      
      // 加载本地代理配置
      const savedHost = localStorage.getItem('esp32ThermalHost')
      const savedPort = localStorage.getItem('esp32ThermalPort')
      if (savedHost) esp32Host.value = savedHost
      if (savedPort) esp32Port.value = parseInt(savedPort)
      
      // 加载直连ESP32配置
      const savedDirectHost = localStorage.getItem('esp32ThermalDirectHost')
      const savedDirectPort = localStorage.getItem('esp32ThermalDirectPort')
      if (savedDirectHost) esp32DirectHost.value = savedDirectHost
      if (savedDirectPort) esp32DirectPort.value = parseInt(savedDirectPort)
    }
    
    // 保存配置
    const saveConfig = () => {
      localStorage.setItem('esp32ThermalMode', connectionMode.value)
      localStorage.setItem('esp32ThermalHost', esp32Host.value)
      localStorage.setItem('esp32ThermalPort', esp32Port.value.toString())
      localStorage.setItem('esp32ThermalDirectHost', esp32DirectHost.value)
      localStorage.setItem('esp32ThermalDirectPort', esp32DirectPort.value.toString())
    }
    
    // 连接到ESP32数据流
    const connectStream = async () => {
      if (isConnected.value) return
      
      error.value = null
      loading.value = true
      streamStatus.value = 'connecting'
      
      try {
        // 保存配置
        saveConfig()
        
        // 确保Canvas已初始化
        if (!thermalCanvas.value) {
          await ensureCanvasInitialized()
        }
        
        // 设置Canvas尺寸为ESP32实际分辨率
        thermalCanvas.value.width = 80
        thermalCanvas.value.height = 63  // ESP32源码定义：80×63
        
        // 获取2D上下文
        canvasContext = thermalCanvas.value.getContext('2d')
        if (!canvasContext) {
          throw new Error('无法获取Canvas 2D上下文')
        }
        
        console.log('Canvas初始化成功:', {
          width: thermalCanvas.value.width,
          height: thermalCanvas.value.height,
          context: !!canvasContext
        })
        
        // 根据连接模式构建URL
        let wsUrl, connectInfo
        
        if (connectionMode.value === 'proxy') {
          // 本地代理模式
          wsUrl = `ws://${esp32Host.value}:${esp32Port.value}`
          connectInfo = `本地代理 ${esp32Host.value}:${esp32Port.value}`
        } else {
          // 直连ESP32模式
          wsUrl = `ws://${esp32DirectHost.value}:${esp32DirectPort.value}`
          connectInfo = `直连ESP32 ${esp32DirectHost.value}:${esp32DirectPort.value}`
        }
        
        console.log('连接到Waveshare热成像模块:', connectInfo)
        console.log('WebSocket URL:', wsUrl)
        
        ws = new WebSocket(wsUrl)
        ws.binaryType = 'arraybuffer'
        
        ws.onopen = () => {
          console.log('WebSocket连接成功')
          isConnected.value = true
          loading.value = false
          streamStatus.value = 'connected'
          error.value = null
          dataBuffer = new Uint8Array(0)
          
          // 启动FPS计算
          startFpsCounter()
        }
        
        ws.onmessage = (event) => {
          handleBinaryData(event.data)
        }
        
        ws.onerror = (err) => {
          console.error('WebSocket错误:', err)
          error.value = `连接失败，请检查：
1. ESP32地址是否正确（当前: ${esp32Host.value}:${esp32Port.value}）
2. ESP32是否在STA模式并已连接WiFi
3. 设备是否在同一局域网
4. ESP32是否提供WebSocket服务（端口${esp32Port.value}）

提示：Waveshare模块默认使用TCP端口3333，浏览器需要WebSocket支持`
          streamStatus.value = 'error'
          loading.value = false
        }
        
        ws.onclose = () => {
          console.log('WebSocket连接关闭')
          isConnected.value = false
          streamStatus.value = 'disconnected'
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
    
    // 处理二进制数据（ESP32实际格式）
    const handleBinaryData = (data) => {
      try {
        // 跳过JSON消息（服务器状态信息）
        if (typeof data === 'string') {
          return
        }
        
        if (!(data instanceof ArrayBuffer)) {
          console.warn('⚠️ 收到非ArrayBuffer数据:', typeof data)
          return
        }
        
        bytesReceived.value += data.byteLength
        
        // 将新数据追加到缓冲区
        const newData = new Uint8Array(data)
        const combined = new Uint8Array(dataBuffer.length + newData.length)
        combined.set(dataBuffer)
        combined.set(newData, dataBuffer.length)
        dataBuffer = combined
        
        // ESP32数据帧格式（根据MI0802传感器规格）：
        // 总大小：10256字节 (mTxSize = 10256)
        // [0-3]       前缀：'   #' (3个空格 + #)
        // [4-7]       长度：'2808' (十六进制，10248字节)
        // [8-11]      帧头：'GFRA'
        // 
        // [12-171]    帧头数据 (Frame Header)：160字节 = 80 words
        //   [12-13]   Frame counter: 1 word
        //   [14-15]   SenXor VDD: 1 word
        //   [16-17]   SenXor die temperature: 1 word
        //   [18-21]   Time stamp: 2 words
        //   [22-23]   Max pixel value: 1 word ⭐ 重要！
        //   [24-25]   Min pixel value: 1 word ⭐ 重要！
        //   [26-27]   CRC: 1 word
        //   [28-171]  Reserved: 72 words
        // 
        // [172-10251] 像素数据：10080字节 = 80×63×2字节 (uint16小端序)
        //             注意：官方文档说80×62，但ESP32实际发送80×63
        // [10252-10255] CRC：4字节 ASCII
        
        const FRAME_SIZE = 10256
        const FRAME_HEADER = '2808GFRA'  // 帧头标识
        const HEADER_OFFSET = 12         // 帧头数据起始偏移
        const PIXEL_DATA_OFFSET = 172    // 像素数据起始偏移
        const WIDTH = 80
        const HEIGHT = 64                // ✅ 修正：ESP32实际发送80×64像素
        const PIXEL_COUNT = WIDTH * HEIGHT  // 5120像素（与ESP32一致）
        
        // 安全检查：防止缓冲区过大（保留最多3帧）
        if (dataBuffer.length > FRAME_SIZE * 3) {
          console.warn(`缓冲区过大(${dataBuffer.length}字节)，保留最后2帧数据`)
          dataBuffer = dataBuffer.slice(-FRAME_SIZE * 2)
        }
        
        // 处理所有完整帧
        while (dataBuffer.length >= FRAME_SIZE) {
          // 查找帧头 "2808GFRA" (从偏移4开始)
          let frameStartIndex = -1
          
          // 优化：先检查缓冲区开头是否就是帧头
          if (dataBuffer.length >= 12) {
            const headerCheck = String.fromCharCode(...dataBuffer.slice(4, 12))
            if (headerCheck === FRAME_HEADER) {
              frameStartIndex = 0
            }
          }
          
          // 如果开头不是帧头，搜索整个缓冲区
          if (frameStartIndex === -1) {
            for (let i = 1; i <= dataBuffer.length - 12; i++) {
              const headerStr = String.fromCharCode(...dataBuffer.slice(i + 4, i + 12))
              if (headerStr === FRAME_HEADER) {
                frameStartIndex = i
                break
              }
            }
          }
          
          if (frameStartIndex === -1) {
            // 没找到帧头，保留最后11字节（可能包含部分帧头），丢弃其余
            if (dataBuffer.length > 11) {
              console.warn(`未找到帧头，丢弃${dataBuffer.length - 11}字节数据`)
              dataBuffer = dataBuffer.slice(-11)
            }
            break
          }
          
          // 如果帧头不在开头，说明有数据丢失
          if (frameStartIndex > 0) {
            console.warn(`⚠️ 帧头偏移${frameStartIndex}字节，丢弃无效数据`)
            dataBuffer = dataBuffer.slice(frameStartIndex)
            frameStartIndex = 0
          }
          
          // 检查是否有完整帧
          if (dataBuffer.length < FRAME_SIZE) {
            break  // 等待更多数据
          }
          
          // 验证帧完整性
          const frameData = dataBuffer.slice(0, FRAME_SIZE)
          
          if (!validateFrameIntegrity(frameData)) {
            console.warn('❌ 帧完整性验证失败，丢弃此帧')
            dataBuffer = dataBuffer.slice(FRAME_SIZE)  // 跳过整个帧
            continue
          }
          
          // 更新图像信息
          if (imageInfo.value.width !== WIDTH || imageInfo.value.height !== HEIGHT) {
            imageInfo.value.width = WIDTH
            imageInfo.value.height = HEIGHT
            
            // 调整Canvas尺寸
            if (thermalCanvas.value) {
              thermalCanvas.value.width = WIDTH
              thermalCanvas.value.height = HEIGHT
            }
          }
          
          // 解析帧头数据
          const dataView = new DataView(frameData.buffer, frameData.byteOffset)
          
          // 🔍 ESP32帧结构（根据源码 tcpServerTask.c）：
          // - 偏移 0-11: 帧标识 "   #2808GFRA"
          // - 偏移 12-171: 保留区域（160字节 = 80 words）
          //   * 可能包含：VDD、Die Temp、maxPixelValue、minPixelValue 等元数据
          //   * 但ESP32未填充，全为0
          // - 偏移 172-10251: 像素数据（80×64×2 = 10080字节）
          // - 偏移 10252-10255: CRC校验
          
          // 🔬 尝试解析保留区域中的元数据（小端序）
          let vdd = 0
          let dieTemp = 0
          let ambientTemp = 0
          
          // 尝试从保留区域读取（如果不是全0）
          const reservedData = new Uint16Array(frameData.buffer, frameData.byteOffset + 12, 80)
          const hasMetadata = reservedData.some(v => v !== 0)
          
          if (hasMetadata) {
            // 假设结构（需要根据实际数据调整）：
            // Word 0-1: VDD (mV)
            // Word 2-3: Die Temp (mK)
            // Word 4-5: Ambient Temp (mK)
            // Word 6: maxPixelValue
            // Word 7: minPixelValue
            vdd = dataView.getUint16(12, true)  // 小端序
            dieTemp = dataView.getUint16(16, true)
            ambientTemp = dataView.getUint16(20, true)
          }
          
          // 提取温度数据（安全边界检查）
          const tempData = new Uint16Array(PIXEL_COUNT)
          // 确保不会越界
          const maxOffset = PIXEL_DATA_OFFSET + PIXEL_COUNT * 2
          if (maxOffset > frameData.length) {
            console.error('❌ 像素数据区域超出帧大小', {
              pixelDataOffset: PIXEL_DATA_OFFSET,
              pixelCount: PIXEL_COUNT,
              requiredSize: maxOffset,
              actualSize: frameData.length
            })
            dataBuffer = dataBuffer.slice(FRAME_SIZE)
            continue
          }
          
          for (let i = 0; i < PIXEL_COUNT; i++) {
            const offset = PIXEL_DATA_OFFSET + i * 2
            // MI0802传感器使用小端序
            tempData[i] = dataView.getUint16(offset, true)  // 小端序
          }
          
          // 🔍 计算实际像素值的最大/最小值（ESP32未提供帧头信息）
          const validPixels = []
          for (let i = 0; i < PIXEL_COUNT; i++) {
            if (tempData[i] > 0 && tempData[i] < 65000) {
              validPixels.push(tempData[i])
            }
          }
          
          const maxPixelValue = validPixels.length > 0 ? Math.max(...validPixels) : 0
          const minPixelValue = validPixels.length > 0 ? Math.min(...validPixels) : 0
          
          // 🔬 如果检测到元数据，尝试自动校准
          if (hasMetadata && vdd > 0) {
            // VDD 和 Die Temp 可用于温度补偿
            // 公式：T_compensated = T_raw + f(VDD, DieTemp)
            // 这里需要根据 MI0802 数据手册的补偿公式实现
            console.log('📡 检测到传感器元数据:', {
              'VDD': `${vdd} mV`,
              'Die Temp': `${(dieTemp / 1000).toFixed(2)}°C`,
              'Ambient Temp': `${(ambientTemp / 1000).toFixed(2)}°C`
            })
            
            // 自动调整温度偏移（基于环境温度）
            if (ambientTemp > 0) {
              const ambientTempC = ambientTemp / 1000  // mK → °C
              const avgPixelValue = (maxPixelValue + minPixelValue) / 2
              const avgTempRaw = avgPixelValue / 100
              
              // 假设环境温度应该接近平均温度
              const suggestedOffset = ambientTempC - avgTempRaw
              
              if (Math.abs(suggestedOffset - tempCalibration.value.offset) > 1) {
                console.log(`💡 建议温度偏移: ${suggestedOffset.toFixed(1)}°C (当前: ${tempCalibration.value.offset}°C)`)
              }
            }
          }
          
          // 调试：检查帧头信息（每100帧输出一次）
          if (frameCount.value % 100 === 0) {
            const header = String.fromCharCode(...frameData.slice(4, 12))
            
            // 解析前10个像素
            const firstPixels = []
            for (let i = 0; i < 10; i++) {
              const offset = PIXEL_DATA_OFFSET + i * 2
              firstPixels.push(dataView.getUint16(offset, true))
            }
            
            console.log('🔍 ESP32热成像数据分析:', {
              '帧头标识': header,
              '保留区域状态': hasMetadata ? '✅ 包含元数据' : '⚠️ 全为0（ESP32未填充）',
              ...(hasMetadata && {
                '传感器元数据': {
                  'VDD': `${vdd} mV`,
                  'Die Temp': `${(dieTemp / 1000).toFixed(2)}°C`,
                  'Ambient Temp': ambientTemp > 0 ? `${(ambientTemp / 1000).toFixed(2)}°C` : 'N/A'
                }
              }),
              '计算的像素值范围': {
                '⭐ maxPixelValue': maxPixelValue,
                '⭐ minPixelValue': minPixelValue,
                'pixelRange': maxPixelValue - minPixelValue,
                'validPixels': validPixels.length
              },
              '前10个像素值': firstPixels,
              '✅ 数据格式': 'ESP32输出 = 温度×100（摄氏度）',
              '💡 说明': hasMetadata ? '可使用元数据自动校准' : '需要手动校准温度偏移'
            })
          }
          
          // 调试：检查数据分布（每100帧输出一次）
          if (frameCount.value % 100 === 0) {
            const validCount = tempData.filter(v => v > 0 && v < 65000).length
            const zeroCount = tempData.filter(v => v === 0).length
            const maxCount = tempData.filter(v => v >= 65000).length
            const validData = tempData.filter(v => v > 0 && v < 65000)
            const rawMin = validData.length > 0 ? Math.min(...validData) : 0
            const rawMax = validData.length > 0 ? Math.max(...validData) : 0
            const rawAvg = validData.length > 0 ? Math.round(validData.reduce((a, b) => a + b, 0) / validData.length) : 0
            
            console.log('📊 像素数据分布:', {
              total: tempData.length,
              valid: validCount,
              zero: zeroCount,
              overflow: maxCount,
              '实际像素值范围': {
                min: rawMin,
                max: rawMax,
                avg: rawAvg
              },
              '帧头声明的范围': {
                min: minPixelValue,
                max: maxPixelValue,
                range: maxPixelValue - minPixelValue
              },
              '是否匹配': {
                minMatch: Math.abs(rawMin - minPixelValue) < 100,
                maxMatch: Math.abs(rawMax - maxPixelValue) < 100
              },
              sample: Array.from(tempData.slice(0, 10))
            })
          }
          
          // 渲染图像（传递计算出的像素值范围）
          renderThermalImage(tempData, WIDTH, HEIGHT, {
            maxPixelValue,
            minPixelValue
          })
          
          // 更新帧计数
          frameCount.value++
          updateFps()
          
          // 移除已处理的数据
          dataBuffer = dataBuffer.slice(FRAME_SIZE)
        }
        
      } catch (err) {
        console.error('处理二进制数据失败:', err)
        // 清空缓冲区以防止错误累积
        dataBuffer = new Uint8Array(0)
      }
    }
    
    // 验证帧完整性
    const validateFrameIntegrity = (frameData) => {
      try {
        // 基本大小检查
        if (frameData.length !== 10256) {
          console.warn('帧大小不匹配:', frameData.length)
          return false
        }
        
        // 前缀检查：偏移0-3应该是 "   #"
        const prefix = String.fromCharCode(...frameData.slice(0, 4))
        if (prefix !== '   #') {
          console.warn('帧前缀不匹配:', prefix)
          return false
        }
        
        // 帧头检查：偏移4-11应该是 "2808GFRA"
        const headerStr = String.fromCharCode(...frameData.slice(4, 12))
        if (headerStr !== '2808GFRA') {
          console.warn('帧头不匹配:', headerStr)
          return false
        }
        
        // CRC校验（可选，因为ESP32的CRC计算可能有问题）
        // 根据ESP32源码：sprintf((char *)&mTxBuff[mTxPacketSize - 4], "%04X", getCRC(mTxBuff+4,mTxPacketSize-4))
        // CRC位置：10252-10255，计算范围：从偏移4开始，长度10252字节
        const crcFromFrame = String.fromCharCode(...frameData.slice(10252, 10256))
        
        // 验证CRC是否为4位十六进制
        if (!/^[0-9A-F]{4}$/.test(crcFromFrame)) {
          console.warn('CRC格式无效:', crcFromFrame)
          // 不返回false，因为可能是数据问题，继续尝试解析
        }
        
        return true
      } catch (err) {
        console.error('帧验证错误:', err)
        return false
      }
    }
    
    // 计算CRC（与ESP32源码相同的算法）
    // 注意：ESP32的getCRC函数对字节数组求和
    const calculateCRC = (data) => {
      let crcResult = 0
      for (let i = 0; i < data.length; i++) {
        crcResult += data[i]
      }
      // 只取低16位（4位十六进制）
      crcResult = crcResult & 0xFFFF
      return crcResult.toString(16).toUpperCase().padStart(4, '0')
    }
    
    // 查找下一个帧头位置
    const findNextFrameHeader = (buffer, startOffset) => {
      const FRAME_HEADER = '   #2808GFRA'
      for (let i = startOffset; i < buffer.length - 12; i++) {
        const headerStr = String.fromCharCode(...buffer.slice(i, i + 12))
        if (headerStr === FRAME_HEADER) {
          return i
        }
      }
      return -1
    }
    
    // 🌡️ 渲染热成像图像（基于 MI0802 传感器规格优化）
    const renderThermalImage = (tempData, width, height, frameHeader = null) => {
      if (!canvasContext) {
        console.error('❌ Canvas上下文未初始化')
        return
      }
      
      // 创建ImageData对象
      const imageData = canvasContext.createImageData(width, height)
      
      /**
       * MI0802 传感器数据处理流程（基于官方文档）：
       * 
       * 1. 原始数据：14-bit ADC 值（0-16383）
       * 2. ESP32 已处理：
       *    - 偏置校正（Offset Correction）
       *    - 增益校正（Gain Correction）  
       *    - 环境温度补偿
       * 3. 前端接收：已校准的像素值（uint16）
       * 4. 前端任务：映射到实际温度并可视化
       * 
       * 温度计算公式（简化版）：
       *   T_obj = T_min + (pixel - pixel_min) / (pixel_max - pixel_min) * (T_max - T_min)
       * 
       * 其中：
       *   - pixel: 当前像素值
       *   - pixel_min/max: 当前帧的像素值范围（ESP32已计算）
       *   - T_min/max: 用户设定的温度范围（可调整）
       */
      
      let minTemp = Infinity
      let maxTemp = -Infinity
      let validCount = 0
      const tempCelsius = new Float32Array(tempData.length)
      
      // 使用帧头信息进行温度映射
      if (frameHeader && frameHeader.maxPixelValue && frameHeader.minPixelValue) {
        const pixelRange = frameHeader.maxPixelValue - frameHeader.minPixelValue
        
        // ✅ ESP32 输出的是摄氏度×100，直接转换
        for (let i = 0; i < tempData.length; i++) {
          // 过滤无效像素（0 或溢出值）
          if (tempData[i] === 0 || tempData[i] > 65000) {
            tempCelsius[i] = NaN
            continue
          }
          
          // 🔥 温度转换：像素值 ÷ 分辨率 + 偏移量
          let temp = tempData[i] / tempCalibration.value.resolution + tempCalibration.value.offset
          
          // 移除极端值
          if (temp > tempCalibration.value.removeExtremeMax) {
            temp = tempCalibration.value.removeExtremeMax
          }
          
          tempCelsius[i] = temp
          
          // 统计有效温度范围
          if (temp >= -50 && temp <= 500) {
            if (temp < minTemp) minTemp = temp
            if (temp > maxTemp) maxTemp = temp
            validCount++
          }
        }
        
        // 调试信息（每100帧输出一次）
        if (frameCount.value % 100 === 0) {
          const resolution = tempCalibration.value.resolution
          console.log('🌡️ MI0802 温度测量结果（已校准）:', {
            '像素值范围': `${frameHeader.minPixelValue} ~ ${frameHeader.maxPixelValue}`,
            '原始温度': `${(frameHeader.minPixelValue/resolution).toFixed(1)}°C ~ ${(frameHeader.maxPixelValue/resolution).toFixed(1)}°C`,
            '校准后温度': `${minTemp.toFixed(1)}°C ~ ${maxTemp.toFixed(1)}°C`,
            '有效像素数': `${validCount} / ${tempData.length}`,
            '温度偏移': `${tempCalibration.value.offset}°C`,
            '分辨率': `0.${resolution === 100 ? '01' : '1'}°C`,
            '💡 说明': `温度 = (像素值÷${resolution}) + 偏移量`
          })
        }
      } else {
        // 降级处理：没有帧头信息时也使用相同逻辑
        console.warn('⚠️ 未提供帧头信息，使用降级温度映射')
        
        for (let i = 0; i < tempData.length; i++) {
          if (tempData[i] === 0 || tempData[i] > 65000) {
            tempCelsius[i] = NaN
            continue
          }
          
          // 温度转换 + 偏移
          let temp = tempData[i] / tempCalibration.value.resolution + tempCalibration.value.offset
          
          // 移除极端值
          if (temp > tempCalibration.value.removeExtremeMax) {
            temp = tempCalibration.value.removeExtremeMax
          }
          
          tempCelsius[i] = temp
          
          if (temp >= -50 && temp <= 500) {
            if (temp < minTemp) minTemp = temp
            if (temp > maxTemp) maxTemp = temp
            validCount++
          }
        }
      }
      
      // 如果没有有效数据，使用默认范围
      if (minTemp === Infinity || maxTemp === -Infinity) {
        minTemp = 15
        maxTemp = 25
        console.warn('⚠️ 未找到有效温度数据，使用默认范围')
      }
      
      // 更新温度范围
      tempRange.value.current.min = minTemp
      tempRange.value.current.max = maxTemp
      
      // 调试信息（每100帧输出一次）
      if (frameCount.value % 100 === 0) {
        const invalidPixels = tempData.filter(v => v === 0 || v >= 65000).length
        console.log('✅ 最终温度范围:', {
          min: minTemp.toFixed(1) + '°C',
          max: maxTemp.toFixed(1) + '°C',
          validPixels: validCount,
          invalidPixels: invalidPixels,
          totalPixels: tempData.length,
          canvasSize: `${width}×${height}`,
          '室温参考': '12-17°C',
          '温度是否合理': minTemp >= 10 && maxTemp <= 30 ? '✅ 是' : '❌ 否，需要调整转换公式'
        })
      }
      
      // 根据色彩映射转换数据
      const colorMapName = colorMaps[currentColorMap.value]
      const tempSpan = maxTemp - minTemp || 1  // 避免除以0
      
      for (let i = 0; i < tempData.length; i++) {
        const pixelIndex = i * 4
        
        // 处理无效像素
        if (isNaN(tempCelsius[i]) || tempData[i] === 0 || tempData[i] > 65000) {
          imageData.data[pixelIndex] = 0
          imageData.data[pixelIndex + 1] = 0
          imageData.data[pixelIndex + 2] = 0
          imageData.data[pixelIndex + 3] = 255
          continue
        }
        
        const temp = tempCelsius[i]
        
        // 归一化到0-1
        let normalized = (temp - minTemp) / tempSpan
        normalized = Math.max(0, Math.min(1, normalized))
        
        const color = applyColorMap(normalized, colorMapName)
        
        imageData.data[pixelIndex] = color.r
        imageData.data[pixelIndex + 1] = color.g
        imageData.data[pixelIndex + 2] = color.b
        imageData.data[pixelIndex + 3] = 255
      }
      
      // 绘制到Canvas
      canvasContext.putImageData(imageData, 0, 0)
    }
    
    // 应用色彩映射
    const applyColorMap = (value, mapName) => {
      // value 已经是 0-1 范围的归一化值
      
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
    
    // Iron色彩映射（常用于热成像）- 改进版，低温更亮
    const ironColorMap = (value) => {
      if (value < 0.25) {
        // 低温：深蓝到亮蓝
        const intensity = value * 4
        return {
          r: Math.floor(intensity * 50),  // 添加一点红色
          g: Math.floor(intensity * 50),  // 添加一点绿色
          b: Math.floor(128 + intensity * 127)  // 从128开始，更亮
        }
      } else if (value < 0.5) {
        // 中低温：蓝到青
        const intensity = (value - 0.25) * 4
        return {
          r: 0,
          g: Math.floor(intensity * 255),
          b: 255
        }
      } else if (value < 0.75) {
        // 中高温：青到黄
        const intensity = (value - 0.5) * 4
        return {
          r: Math.floor(intensity * 255),
          g: 255,
          b: 255 - Math.floor(intensity * 255)
        }
      } else {
        // 高温：黄到白
        const intensity = (value - 0.75) * 4
        return {
          r: 255,
          g: 255,
          b: Math.floor(intensity * 255)  // 添加蓝色变成白色
        }
      }
    }
    
    // Rainbow色彩映射
    const rainbowColorMap = (value) => {
      const h = value * 360
      const s = 1
      const v = 1
      
      const c = v * s
      const x = c * (1 - Math.abs((h / 60) % 2 - 1))
      const m = v - c
      
      let r, g, b
      if (h < 60) {
        [r, g, b] = [c, x, 0]
      } else if (h < 120) {
        [r, g, b] = [x, c, 0]
      } else if (h < 180) {
        [r, g, b] = [0, c, x]
      } else if (h < 240) {
        [r, g, b] = [0, x, c]
      } else if (h < 300) {
        [r, g, b] = [x, 0, c]
      } else {
        [r, g, b] = [c, 0, x]
      }
      
      return {
        r: Math.floor((r + m) * 255),
        g: Math.floor((g + m) * 255),
        b: Math.floor((b + m) * 255)
      }
    }
    
    // Hot色彩映射
    const hotColorMap = (value) => {
      if (value < 0.33) {
        return {
          r: Math.floor(value * 3 * 255),
          g: 0,
          b: 0
        }
      } else if (value < 0.66) {
        return {
          r: 255,
          g: Math.floor((value - 0.33) * 3 * 255),
          b: 0
        }
      } else {
        return {
          r: 255,
          g: 255,
          b: Math.floor((value - 0.66) * 3 * 255)
        }
      }
    }
    
    // FPS计算
    const startFpsCounter = () => {
      frameCount.value = 0
      lastFrameTime.value = Date.now()
      
      fpsInterval = setInterval(() => {
        const now = Date.now()
        const elapsed = (now - lastFrameTime.value) / 1000
        fps.value = frameCount.value / elapsed
        frameCount.value = 0
        lastFrameTime.value = now
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
    
    // 格式化字节数
    const formatBytes = (bytes) => {
      if (bytes < 1024) return bytes + ' B'
      if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB'
      return (bytes / (1024 * 1024)).toFixed(2) + ' MB'
    }
    
    // 切换色彩映射
    const toggleColorMap = () => {
      currentColorMap.value = (currentColorMap.value + 1) % colorMaps.length
      console.log('切换色彩映射:', colorMaps[currentColorMap.value])
    }
    
    // 重置校准参数
    const resetCalibration = () => {
      tempCalibration.value = {
        offset: -13.0,
        minDisplay: 12.0,
        maxDisplay: 17.0,
        autoGain: 0.001,
        removeExtremeMax: 36.0,
        sensitivity: 0.95
      }
      console.log('✅ 校准参数已重置为默认值')
    }
    
    // 保存快照
    const saveSnapshot = () => {
      if (!thermalCanvas.value) return
      
      const link = document.createElement('a')
      link.download = `thermal_snapshot_${Date.now()}.png`
      link.href = thermalCanvas.value.toDataURL()
      link.click()
      
      console.log('快照已保存')
    }
    
    // 测试渲染功能
    const testRender = () => {
      console.log('🧪 开始测试渲染...')
      
      if (!thermalCanvas.value) {
        console.error('❌ Canvas未找到')
        return
      }
      
      if (!canvasContext) {
        console.error('❌ Canvas上下文未初始化')
        canvasContext = thermalCanvas.value.getContext('2d')
      }
      
      console.log('Canvas信息:', {
        width: thermalCanvas.value.width,
        height: thermalCanvas.value.height,
        context: !!canvasContext
      })
      
      // 创建测试数据（渐变温度）
      // 根据实际数据格式，测试多种可能的编码方式
      const testData = new Uint16Array(80 * 63)  // ESP32实际：63行
      
      // 测试场景：室温12-17°C的渐变
      // 尝试不同的编码方式
      for (let y = 0; y < 63; y++) {
        for (let x = 0; x < 80; x++) {
          const index = y * 80 + x
          // 创建从左到右的温度渐变（12°C到17°C）
          const tempC = 12 + (x / 80) * 5  // 12°C 到 17°C
          
          // 测试编码1：开尔文×100（如果传感器输出开尔文）
          const tempK = tempC + 273.15
          testData[index] = Math.round(tempK * 100)  // 28515 到 29015
          
          // 如果上面的不对，可以尝试其他编码：
          // testData[index] = Math.round(tempC * 10)  // 120 到 170
          // testData[index] = Math.round(tempC * 100)  // 1200 到 1700
        }
      }
      
      console.log('测试数据:', {
        length: testData.length,
        rawMin: Math.min(...testData),
        rawMax: Math.max(...testData),
        '编码1_开尔文×100': {
          min: Math.min(...testData),
          max: Math.max(...testData),
          '转换后温度': `${(Math.min(...testData) / 100 - 273.15).toFixed(1)}°C ~ ${(Math.max(...testData) / 100 - 273.15).toFixed(1)}°C`
        }
      })
      
      renderThermalImage(testData, 80, 63)  // ESP32实际：63行
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
    
    onMounted(async () => {
      console.log('ThermalCamera组件已挂载')
      
      // 等待DOM完全渲染
      await nextTick()
      
      // 确保Canvas初始化
      try {
        await ensureCanvasInitialized()
        console.log('Canvas在组件挂载时初始化成功')
      } catch (err) {
        console.warn('Canvas在组件挂载时初始化失败，将在连接时重试:', err.message)
      }
      
      loadSavedConfig()
      document.addEventListener('fullscreenchange', handleFullscreenChange)
    })
    
    onUnmounted(() => {
      disconnectStream()
      document.removeEventListener('fullscreenchange', handleFullscreenChange)
    })
    
    return {
      connectionMode,
      esp32Host,
      esp32Port,
      esp32DirectHost,
      esp32DirectPort,
      isConnected,
      loading,
      error,
      streamStatus,
      streamStatusText,
      isFullscreen,
      fps,
      bytesReceived,
      imageInfo,
      tempRange,
      tempCalibration,
      showCalibration,
      colorMaps,
      currentColorMap,
      streamContainer,
      thermalCanvas,
      connectStream,
      disconnectStream,
      toggleFullscreen,
      saveSnapshot,
      toggleColorMap,
      resetCalibration,
      formatBytes,
      ensureCanvasInitialized,
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
  min-width: 180px;
}

.port-input {
  min-width: 100px;
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

.status-badge.disconnected {
  background: #718096;
  color: white;
}

.error-message {
  margin: 20px;
  padding: 20px;
  background: rgba(245, 101, 101, 0.1);
  border: 1px solid rgba(245, 101, 101, 0.3);
  border-radius: 8px;
  text-align: center;
  color: #f56565;
}

.error-message p {
  margin: 0 0 10px 0;
  white-space: pre-line;
  line-height: 1.6;
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
  color: #a0aec0;
  text-align: center;
}

.empty-icon {
  font-size: 64px;
  margin-bottom: 20px;
  opacity: 0.5;
}

.empty-state h4 {
  color: #e2e8f0;
  margin: 0 0 10px 0;
  font-size: 18px;
}

.empty-state p {
  margin: 0 0 20px 0;
  font-size: 14px;
}

.example-hint {
  background: #2d3748;
  padding: 20px;
  border-radius: 8px;
  border-left: 3px solid #4299e1;
  max-width: 500px;
  text-align: left;
}

.example-hint p {
  margin: 0 0 10px 0;
  color: #e2e8f0;
}

.example-hint ul {
  margin: 10px 0;
  padding-left: 20px;
  color: #a0aec0;
  font-size: 14px;
  line-height: 1.8;
}

.example-hint li {
  margin: 5px 0;
}

.stream-container {
  flex: 1;
  position: relative;
  background: #000;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
}

.loading-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.8);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  z-index: 10;
  color: white;
}

.spinner {
  width: 50px;
  height: 50px;
  border: 4px solid #2d3748;
  border-top-color: #4299e1;
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin-bottom: 20px;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

.thermal-canvas {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  object-fit: contain;
  image-rendering: pixelated; /* 保持热成像的像素清晰度 */
  z-index: 1;
}

.image-overlay {
  position: absolute;
  top: 10px;
  right: 10px;
  background: rgba(0, 0, 0, 0.7);
  padding: 10px 15px;
  border-radius: 6px;
  color: white;
  font-size: 12px;
  display: flex;
  flex-direction: column;
  gap: 5px;
  z-index: 10;
}

.overlay-item {
  display: flex;
  justify-content: space-between;
  gap: 10px;
}

/* 🎛️ 温度校准面板样式 */
.temp-calibration-panel {
  position: absolute;
  top: 10px;
  left: 10px;
  background: rgba(0, 0, 0, 0.85);
  padding: 15px;
  border-radius: 8px;
  color: white;
  font-size: 13px;
  min-width: 280px;
  max-width: 320px;
  z-index: 10;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
  padding-bottom: 10px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.2);
}

.panel-header h4 {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: #4299e1;
}

.toggle-btn {
  background: transparent;
  border: none;
  color: white;
  cursor: pointer;
  font-size: 16px;
  padding: 0 5px;
  transition: transform 0.2s;
}

.toggle-btn:hover {
  transform: scale(1.2);
}

.panel-content {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.calibration-row {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.calibration-row label {
  font-size: 12px;
  color: #cbd5e0;
  font-weight: 500;
}

.temp-input {
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 4px;
  padding: 6px 10px;
  color: white;
  font-size: 14px;
  width: 100%;
}

.temp-input:focus {
  outline: none;
  border-color: #4299e1;
  background: rgba(255, 255, 255, 0.15);
}

.hint {
  font-size: 11px;
  color: #a0aec0;
  font-style: italic;
}

.calibration-info {
  background: rgba(66, 153, 225, 0.1);
  padding: 10px;
  border-radius: 4px;
  border-left: 3px solid #4299e1;
}

.info-row {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  margin-bottom: 5px;
}

.info-row:last-child {
  margin-bottom: 0;
}

.info-row span:first-child {
  color: #cbd5e0;
}

.info-row span:last-child {
  color: #4299e1;
  font-weight: 600;
}

.calibration-presets {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 5px;
}

.preset-btn {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  border: none;
  border-radius: 4px;
  padding: 8px 12px;
  color: white;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s;
  text-align: left;
}

.preset-btn:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 8px rgba(102, 126, 234, 0.4);
}

.preset-btn:active {
  transform: translateY(0);
}

.overlay-item span:first-child {
  color: #a0aec0;
}

.overlay-item span:last-child {
  color: #4299e1;
  font-family: monospace;
}

/* 温度校准面板样式 */
.temp-calibration-panel {
  position: absolute;
  top: 10px;
  left: 10px;
  background: rgba(0, 0, 0, 0.85);
  border: 1px solid #4a5568;
  border-radius: 8px;
  padding: 12px;
  color: #e2e8f0;
  font-size: 13px;
  max-width: 320px;
  z-index: 10;
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
  padding-bottom: 8px;
  border-bottom: 1px solid #4a5568;
}

.panel-header h4 {
  margin: 0;
  font-size: 14px;
  color: #4299e1;
}

.toggle-btn {
  background: transparent;
  border: none;
  color: #a0aec0;
  cursor: pointer;
  font-size: 12px;
  padding: 2px 6px;
}

.toggle-btn:hover {
  color: #4299e1;
}

.panel-content {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.calibration-row {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.calibration-row label {
  color: #a0aec0;
  font-size: 12px;
}

.temp-input {
  background: #2d3748;
  border: 1px solid #4a5568;
  border-radius: 4px;
  padding: 6px 8px;
  color: #e2e8f0;
  font-size: 13px;
  width: 100%;
}

.temp-input:focus {
  outline: none;
  border-color: #4299e1;
}

.hint {
  color: #718096;
  font-size: 11px;
  font-style: italic;
}

.calibration-info {
  background: rgba(66, 153, 225, 0.1);
  border: 1px solid rgba(66, 153, 225, 0.3);
  border-radius: 4px;
  padding: 8px;
  margin-top: 5px;
}

.info-row {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 4px;
  font-size: 11px;
}

.info-row:last-child {
  margin-bottom: 0;
}

.info-row span:first-child {
  color: #a0aec0;
}

.info-row span:last-child {
  color: #4299e1;
  font-family: monospace;
}

.calibration-presets {
  display: flex;
  gap: 8px;
  margin-top: 5px;
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

/* 全屏模式样式 */
.stream-container:fullscreen {
  background: #000;
}

.stream-container:fullscreen .thermal-canvas {
  width: 100vw;
  height: 100vh;
}
</style>
