# 🚀 热成像系统部署指南

## 系统架构总览

```
🔥 MI0802传感器 → ESP32 → TCP:3333 → Node.js后端 → WebSocket:8080 → Vue前端
     80×64像素      10256字节帧      JSON温度矩阵        Canvas渲染
```

---

## 📋 部署前检查清单

### ✅ 硬件准备
- [ ] ESP32-S3开发板（已烧录热成像固件）
- [ ] MI0802热成像传感器（已连接）
- [ ] 电脑（运行后端和前端）
- [ ] 网络环境（ESP32和电脑在同一网络）

### ✅ 软件环境
- [ ] Node.js (v14+ 推荐v16+)
- [ ] npm 或 yarn
- [ ] Python 3（可选，用于测试）
- [ ] 网络调试工具（可选，如Wireshark）

---

## 🔧 步骤1：后端部署

### 1.1 安装依赖
```bash
cd /Users/liyifan/codebuddy/dlrobot_front
npm install ws
```

### 1.2 启动后端服务器
```bash
node thermal-proxy-backend.js
```

### 1.3 验证后端启动
检查输出是否显示：
```
🌡️  热成像代理服务器启动
📡 WebSocket服务器运行在端口 8080
🔌 TCP客户端连接到ESP32: 192.168.x.x:3333
✅ 服务器启动成功！
```

### 1.4 后端测试（可选）
```bash
# 测试WebSocket连接
python3 -c "
import websocket
ws = websocket.WebSocket()
ws.connect('ws://localhost:8080')
print('WebSocket连接成功')
"
```

---

## 🌐 步骤2：前端部署

### 2.1 安装Vue项目依赖（如果需要）
```bash
# 如果ThermalCameraSimple.vue是独立项目
cd /path/to/vue/project
npm install
```

### 2.2 启动前端开发服务器
```bash
npm run dev
# 或
yarn dev
```

### 2.3 访问前端界面
打开浏览器访问：
```
http://localhost:5173  # 或其他显示的端口
```

### 2.4 前端配置检查
确保WebSocket地址正确：
```javascript
// 在ThermalCameraSimple.vue中
wsAddress: 'ws://localhost:8080'
```

---

## 📡 步骤3：ESP32连接

### 3.1 获取ESP32 IP地址
通过串口监视器或路由器查看ESP32的IP地址，通常是：
```
192.168.1.xxx 或 192.168.0.xxx
```

### 3.2 修改后端配置（如果需要）
编辑`thermal-proxy-backend.js`：
```javascript
const ESP32_CONFIG = {
    host: '192.168.x.xxx',  // 修改为你的ESP32 IP
    port: 3333,
    // ...其他配置
};
```

### 3.3 重启后端服务
```bash
# 停止之前的进程
Ctrl+C
# 重新启动
node thermal-proxy-backend.js
```

---

## 🎯 步骤4：系统联调

### 4.1 连接测试流程
1. **启动ESP32** → 确保TCP服务器在端口3333运行
2. **启动后端** → 看到"TCP客户端已连接"
3. **启动前端** → 看到"WebSocket已连接"
4. **观察图像** → 应该显示热成像画面

### 4.2 成功指标
```
✅ 后端显示: "TCP客户端已连接: 192.168.x.x:3333"
✅ 后端显示: "WebSocket客户端已连接"
✅ 前端显示: 实时热成像图像
✅ 帧率显示: 5-15 FPS
✅ 温度显示: 室温15-25°C（合理范围）
```

---

## 🔍 步骤5：故障排除

### ❌ 问题1：后端无法连接ESP32
**症状**: "TCP连接失败"或"连接超时"
**解决**:
```bash
# 检查ESP32是否在线
ping 192.168.x.xxx

# 检查ESP32端口是否开放
telnet 192.168.x.xxx 3333

# 检查防火墙设置
sudo ufw status  # Ubuntu/Mac
```

### ❌ 问题2：前端无法连接后端
**症状**: "WebSocket连接失败"
**解决**:
```bash
# 检查后端是否运行
ps aux | grep node

# 检查端口8080是否被占用
lsof -i :8080

# 检查防火墙
sudo ufw allow 8080
```

### ❌ 问题3：图像显示异常
**症状**: 无图像/花屏/温度异常
**解决**:

#### 温度异常高（显示200-300°C）
```javascript
// 修改后端温度分辨率
// thermal-proxy-backend.js 第~50行
const CONFIG = {
    sensor: {
        resolution: 10  // 改为10，原来是100
    }
};
```

#### 图像乱码（字节序问题）
```javascript
// 修改字节序
// thermal-proxy-backend.js 第~120行
const pixelValue = dataView.getUint16(offset, false);  // false=大端序
```

#### 帧验证失败
```bash
# 启用调试模式
# 修改thermal-proxy-backend.js
const DEBUG = true;  // 设置为true查看详细日志
```

---

## 📊 步骤6：性能优化

### 6.1 网络优化
```bash
# 使用有线连接代替WiFi
# 确保ESP32信号强度良好
# 关闭不必要的网络应用
```

### 6.2 后端优化
```javascript
// 调整缓冲区大小
const TCP_CONFIG = {
    bufferSize: 65536,  // 增大缓冲区
};

// 调整帧处理间隔
const PROCESS_INTERVAL = 50;  // 毫秒
```

### 6.3 前端优化
```javascript
// 降低渲染频率
const RENDER_INTERVAL = 100;  // 毫秒

// 使用requestAnimationFrame
function render() {
    requestAnimationFrame(render);
    // 渲染逻辑
}
```

---

## 🧪 步骤7：高级测试

### 7.1 温度准确性测试
```bash
# 使用冰袋测试低温
# 使用热水杯测试高温
# 使用人体测试（30-35°C）
# 对比商业体温计
```

### 7.2 网络压力测试
```bash
# 同时打开多个前端客户端
# 使用网络限速工具测试弱网环境
# 长时间运行稳定性测试
```

### 7.3 数据包分析
```bash
# 抓取TCP数据包
tcpdump -i any port 3333 -w thermal.pcap

# 分析数据包
wireshark thermal.pcap
```

---

## 📋 部署验证清单

部署完成后，请检查以下项目：

### ✅ 基础功能
- [ ] ESP32正常启动并显示IP地址
- [ ] 后端成功连接ESP33（显示"TCP客户端已连接"）
- [ ] 前端成功连接后端（显示"WebSocket已连接"）
- [ ] 热成像图像正常显示
- [ ] 帧率在5-15 FPS之间
- [ ] 温度显示合理（室温15-25°C）

### ✅ 高级功能
- [ ] 手触摸传感器，温度上升
- [ ] 色彩映射切换正常
- [ ] 长时间运行无崩溃
- [ ] 网络断开后能自动重连
- [ ] 多个客户端能同时连接

### ✅ 性能指标
- [ ] 延迟 < 200ms
- [ ] CPU占用 < 50%
- [ ] 内存占用 < 200MB
- [ ] 网络带宽 < 1MB/s

---

## 🎯 最终确认

如果所有检查项目都通过，恭喜你！🎉

热成像系统已成功部署，整个链条：
```
🔥 MI0802 → ESP32 → TCP → Node.js → WebSocket → Vue → Canvas
```

**系统已就绪，可以享受实时热成像了！**

---

## 📞 技术支持

如果遇到问题：
1. 检查本指南的故障排除部分
2. 查看各组件的调试日志
3. 使用网络抓包工具分析
4. 对比配置参数是否匹配

**记住**：整个链条的逻辑已经完整验证，问题通常是配置或网络连接方面的。保持耐心，逐步排查！

晚安，祝你部署顺利！😴✨