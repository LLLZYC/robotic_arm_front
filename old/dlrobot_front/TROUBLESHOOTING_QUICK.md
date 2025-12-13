# 🔧 快速故障排除指南

## 常见问题速查表

---

## 🌡️ 问题1：温度显示异常

### ❌ 症状：室温显示2-3°C（正常应该15-25°C）
**原因**：ESP32使用0.1°C分辨率，但后端按0.01°C解析
**解决**：修改分辨率
```bash
# 文件：thermal-proxy-backend.js
# 位置：第~50行
const CONFIG = {
  sensor: {
    resolution: 10,  // 改为10，原来是100
  }
};
```

### ❌ 症状：温度显示250-300°C（明显过高）
**原因**：相反的问题，可能需要更高精度
**解决**：确认使用0.01°C分辨率
```javascript
resolution: 100,  // 0.01°C精度，推荐默认
```

---

## 🎨 问题2：图像显示异常

### ❌ 症状：图像像雪花/完全乱码
**原因**：字节序不匹配
**解决**：修改字节序
```javascript
// 文件：thermal-proxy-backend.js
// 位置：第~120行
const pixelValue = dataView.getUint16(offset, false); // 改为false
```

### ❌ 症状：图像有规律的条纹
**原因**：数据解析错位
**解决**：检查帧同步
```javascript
// 确认帧头匹配
const FRAME_HEADER = Buffer.from('   #2808GFRA');
```

---

## 🔌 问题3：连接问题

### ❌ 症状："TCP连接失败"
**检查步骤**：
```bash
# 1. 检查ESP32 IP
ping 192.168.x.xxx

# 2. 检查端口
 telnet 192.168.x.xxx 3333

# 3. 检查防火墙
sudo ufw allow 3333
```

### ❌ 症状："WebSocket连接失败"
**检查步骤**：
```bash
# 1. 检查后端运行
ps aux | grep node

# 2. 检查端口
lsof -i :8080

# 3. 检查防火墙
sudo ufw allow 8080
```

---

## 🚀 一键修复命令

### 修复温度问题
```bash
sed -i 's/resolution: 100/resolution: 10/' thermal-proxy-backend.js
node thermal-proxy-backend.js
```

### 修复字节序问题
```bash
sed -i 's/getUint16(offset, true)/getUint16(offset, false)/' thermal-proxy-backend.js
node thermal-proxy-backend.js
```

### 重启整个系统
```bash
# 停止所有服务
pkill -f node

# 启动后端
node thermal-proxy-backend.js &

# 启动前端
npm run dev &
```

---

## 📊 正常状态参考

### ✅ 温度范围
- 室温：15-25°C
- 人体：30-35°C
- 热水：40-60°C
- 冰水：0-5°C

### ✅ 图像特征
- 80×64像素清晰网格
- 平滑温度过渡
- 无明显噪点
- 色彩映射正常

### ✅ 性能指标
- 帧率：5-15 FPS
- 延迟：<200ms
- 连接稳定：无频繁断线

---

## 🎯 判断流程图

```
温度异常？
├─ 显示2-3°C → 改resolution=10
├─ 显示200-300°C → 确认resolution=100
└─ 显示正常 → 检查图像

图像异常？
├─ 雪花/乱码 → 改字节序false
├─ 条纹/错位 → 检查帧同步
└─ 显示正常 → 检查连接

连接异常？
├─ TCP失败 → 检查IP和端口
├─ WebSocket失败 → 检查后端和端口
└─ 都正常 → 系统就绪！
```

---

## ⚡ 紧急修复

如果系统完全无法工作：

1. **停止所有服务**：`pkill -f node`
2. **检查ESP32 IP**：确认网络连接
3. **重新配置**：修改IP地址
4. **重启服务**：按部署指南顺序启动
5. **查看日志**：启用DEBUG=true

---

## 📞 技术支持

按照这个顺序排查：
1. 网络连接 → 2. 配置参数 → 3. 数据解析 → 4. 显示渲染

**记住**：整个链条逻辑已验证，问题通常是配置不匹配！💪