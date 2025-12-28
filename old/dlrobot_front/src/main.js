import { createApp } from 'vue'
import { createPinia } from 'pinia'
import router from './router'
import mqttService from './services/mqttService'
import apiService from './services/apiService'
import unreachableGoalService from './services/unreachableGoalService'
import { useRobotStore } from './stores/robotStore'

// 创建根组件，直接导入App
import App from './App.vue'

const app = createApp(App)
const pinia = createPinia()

app.use(pinia)
app.use(router)

// 在Pinia初始化完成后初始化服务的store
mqttService.initStore()
apiService.initStore()
unreachableGoalService.initStore(useRobotStore())

// 设置全局引用，方便测试
window.unreachableGoalService = unreachableGoalService
window.robotStore = useRobotStore()

app.mount('#app')