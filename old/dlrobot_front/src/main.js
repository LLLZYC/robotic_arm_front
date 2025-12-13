import { createApp } from 'vue'
import { createPinia } from 'pinia'
import router from './router'
import mqttService from './services/mqttService'
import apiService from './services/apiService'

// 创建根组件，直接导入App
import App from './App.vue'

const app = createApp(App)
const pinia = createPinia()

app.use(pinia)
app.use(router)

// 在Pinia初始化完成后初始化服务的store
mqttService.initStore()
apiService.initStore()

app.mount('#app')