<template>
  <div class="map-test">
    <h2>地图功能测试</h2>
    
    <div class="test-controls">
      <button @click="testCoordinateConversion" class="test-btn">
        测试坐标转换
      </button>
      <button @click="testMapLoading" class="test-btn">
        测试地图加载
      </button>
      <button @click="testMarkerPlacement" class="test-btn">
        测试标记放置
      </button>
    </div>
    
    <div class="test-results">
      <h3>测试结果</h3>
      <div v-if="testResults.length === 0" class="no-results">
        暂无测试结果
      </div>
      <div v-else>
        <div 
          v-for="(result, index) in testResults" 
          :key="index"
          :class="['test-result', result.success ? 'success' : 'error']"
        >
          <span class="result-icon">{{ result.success ? '✅' : '❌' }}</span>
          <span class="result-message">{{ result.message }}</span>
          <span class="result-details" v-if="result.details">{{ result.details }}</span>
        </div>
      </div>
    </div>
    
    <div class="coordinate-info">
      <h3>坐标信息</h3>
      <div class="info-grid">
        <div class="info-item">
          <label>ROS坐标:</label>
          <span>X: {{ rosCoords.x.toFixed(2) }}, Y: {{ rosCoords.y.toFixed(2) }}</span>
        </div>
        <div class="info-item">
          <label>Leaflet坐标:</label>
          <span>Lat: {{ leafletCoords.lat.toFixed(2) }}, Lng: {{ leafletCoords.lng.toFixed(2) }}</span>
        </div>
        <div class="info-item">
          <label>地图配置:</label>
          <span>分辨率: {{ mapConfig.resolution }}, 原点: [{{ mapConfig.origin.join(', ') }}]</span>
        </div>
      </div>
    </div>
    
    <!-- 嵌入实际的地图组件进行测试 -->
    <div class="map-container">
      <RobotMap />
    </div>
  </div>
</template>

<script>
import { ref, onMounted } from 'vue'
import RobotMap from './RobotMap.vue'
import { rosToLeaflet, leafletToRos, parseYaml } from '../utils/mapUtils'

export default {
  name: 'MapTest',
  components: {
    RobotMap
  },
  
  setup() {
    const testResults = ref([])
    const rosCoords = ref({ x: 5.0, y: 5.0 })
    const leafletCoords = ref({ lat: 0, lng: 0 })
    const mapConfig = ref({
      resolution: 0.05,
      origin: [-10, -10, 0]
    })
    
    // 添加测试结果
    const addTestResult = (success, message, details = '') => {
      testResults.value.push({
        success,
        message,
        details,
        timestamp: new Date().toLocaleTimeString()
      })
    }
    
    // 测试坐标转换
    const testCoordinateConversion = () => {
      try {
        // ROS转Leaflet
        const leaflet = rosToLeaflet(rosCoords.value.x, rosCoords.value.y)
        
        // Leaflet转ROS
        const ros = leafletToRos(leaflet[0], leaflet[1])
        
        // 验证转换准确性
        const xDiff = Math.abs(ros.x - rosCoords.value.x)
        const yDiff = Math.abs(ros.y - rosCoords.value.y)
        
        const success = xDiff < 0.01 && yDiff < 0.01
        
        addTestResult(
          success,
          '坐标转换测试',
          success ? 
            `转换准确，误差: X=${xDiff.toFixed(4)}, Y=${yDiff.toFixed(4)}` :
            `转换错误，误差过大: X=${xDiff.toFixed(4)}, Y=${yDiff.toFixed(4)}`
        )
        
        // 更新显示坐标
        leafletCoords.value = { lat: leaflet[0], lng: leaflet[1] }
        
      } catch (error) {
        addTestResult(false, '坐标转换测试失败', error.message)
      }
    }
    
    // 测试地图加载
    const testMapLoading = async () => {
      try {
        // 测试地图配置文件加载
        const response = await fetch('/maps/map.yaml')
        
        if (response.ok) {
          const yamlText = await response.text()
          const config = parseYaml(yamlText)
          
          addTestResult(true, '地图配置文件加载成功', `分辨率: ${config.resolution}`)
          
          // 更新地图配置
          mapConfig.value = config
          
        } else {
          addTestResult(false, '地图配置文件加载失败', '文件不存在或无法访问')
        }
        
      } catch (error) {
        addTestResult(false, '地图加载测试失败', error.message)
      }
    }
    
    // 测试标记放置
    const testMarkerPlacement = () => {
      try {
        // 模拟机器人位置更新
        const testPose = {
          x: Math.random() * 10 - 5, // -5 到 5 之间的随机值
          y: Math.random() * 10 - 5,
          theta: Math.random() * Math.PI * 2 // 0 到 2π 之间的随机角度
        }
        
        rosCoords.value = testPose
        
        // 转换坐标用于显示
        const leaflet = rosToLeaflet(testPose.x, testPose.y)
        leafletCoords.value = { lat: leaflet[0], lng: leaflet[1] }
        
        addTestResult(
          true, 
          '标记放置测试', 
          `机器人位置: X=${testPose.x.toFixed(2)}, Y=${testPose.y.toFixed(2)}, θ=${testPose.theta.toFixed(2)}`
        )
        
      } catch (error) {
        addTestResult(false, '标记放置测试失败', error.message)
      }
    }
    
    // 初始化测试
    onMounted(() => {
      // 自动运行基础测试
      setTimeout(() => {
        testMapLoading()
        testCoordinateConversion()
      }, 1000)
    })
    
    return {
      testResults,
      rosCoords,
      leafletCoords,
      mapConfig,
      testCoordinateConversion,
      testMapLoading,
      testMarkerPlacement
    }
  }
}
</script>

<style scoped>
.map-test {
  padding: 20px;
  max-width: 1200px;
  margin: 0 auto;
}

.test-controls {
  margin: 20px 0;
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.test-btn {
  padding: 10px 20px;
  background: #3182ce;
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
  transition: background 0.2s;
}

.test-btn:hover {
  background: #2b6cb0;
}

.test-results {
  background: #2d3748;
  border-radius: 8px;
  padding: 15px;
  margin: 20px 0;
}

.test-results h3 {
  margin: 0 0 15px 0;
  color: #e2e8f0;
}

.no-results {
  color: #a0aec0;
  font-style: italic;
  text-align: center;
  padding: 20px;
}

.test-result {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 0;
  border-bottom: 1px solid #4a5568;
}

.test-result:last-child {
  border-bottom: none;
}

.test-result.success {
  color: #48bb78;
}

.test-result.error {
  color: #f56565;
}

.result-icon {
  font-size: 16px;
}

.result-message {
  font-weight: 600;
}

.result-details {
  color: #a0aec0;
  font-size: 12px;
  margin-left: auto;
}

.coordinate-info {
  background: #2d3748;
  border-radius: 8px;
  padding: 15px;
  margin: 20px 0;
}

.coordinate-info h3 {
  margin: 0 0 15px 0;
  color: #e2e8f0;
}

.info-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 10px;
}

.info-item {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.info-item label {
  color: #a0aec0;
  font-size: 12px;
  font-weight: 600;
}

.info-item span {
  color: #e2e8f0;
  font-size: 14px;
}

.map-container {
  height: 500px;
  border: 2px solid #4a5568;
  border-radius: 8px;
  overflow: hidden;
  margin-top: 20px;
}

@media (max-width: 768px) {
  .info-grid {
    grid-template-columns: 1fr;
  }
  
  .test-controls {
    flex-direction: column;
  }
}
</style>