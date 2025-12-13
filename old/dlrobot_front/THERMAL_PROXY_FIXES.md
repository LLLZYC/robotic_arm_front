# ESP32热成像代理服务器问题与修复说明

## 问题诊断

### 1. CRC计算错误（主要问题）
**现象**：发送启动采集命令后没有数据帧返回

**根本原因**：
- Node.js中的`calculateCRC()`函数错误
- `data[i]` 对于字符串返回的是字符本身而不是ASCII码
- 导致CRC计算结果为0，而不是正确的`02CC`

**错误代码**：
```javascript
function calculateCRC(data) {
  let crcResult = 0;
  for (let i = 0; i < data.length; i++) {
    crcResult += data[i];  // ❌ 错误：data[i]返回字符，应该使用charCodeAt(i)
  }
  return crcResult;
}
```

**修复后**：
```javascript
function calculateCRC(data) {
  let crcResult = 0;
  for (let i = 0; i < data.length; i++) {
    crcResult += data.charCodeAt(i);  // ✅ 正确：获取ASCII码
  }
  return crcResult;
}
```

### 2. 启动命令格式问题
**原始错误命令**:
```javascript
const startCmd = `   #${cmdData}${crc}\n`  // ⚠️ 多了空格和换行符，CRC错误
// 输出:    #0010WREGB1030000\n (CRC=0000 错误)
```

**修复后命令**:
```javascript
const startCmd = `#${cmdData}${crc}`
// 正确输出: #0010WREGB10302CC (CRC=02CC 正确)
```

## CRC计算验证

### 正确CRC计算
命令数据: `0010WREGB103`
```
0: 48 (0x30)
0: 48 (0x30)
1: 49 (0x31)
0: 48 (0x30)
W: 87 (0x57)
R: 82 (0x52)
E: 69 (0x45)
G: 71 (0x47)
B: 66 (0x42)
1: 49 (0x31)
0: 48 (0x30)
3: 51 (0x33)
-----------------------------
总计: 716 = 0x02CC
```

正确CRC = **`02CC`**

完整命令: **`#0010WREGB10302CC`**

## 修复步骤

1. **修复CRC函数**
```bash
# 修复文件
thermal-proxy-server.js
thermal-proxy-server-enhanced.js
thermal-proxy-server-fixed.js

# 将所有文件中的 calculateCRC 函数改为使用 charCodeAt()
```

2. **验证修复**
```bash
node -e "
function calculateCRC(data) {
  let crcResult = 0;
  for (let i = 0; i < data.length; i++) {
    crcResult += data.charCodeAt(i);
  }
  return (crcResult & 0xFFFF).toString(16).toUpperCase().padStart(4, '0');
}
const cmdData = '0010WREGB103';
const crc = calculateCRC(cmdData);
console.log('完整命令:', \`#${cmdData}${crc}\`);
"
# 输出: #0010WREGB10302CC
```

3. **重新运行服务器**
```bash
node thermal-proxy-server-fixed.js
```

## 预期输出

修复后，运行服务器应该看到：
```
🌡️  Waveshare热成像模块代理服务器
=====================================
ESP32地址: 192.168.6.194:3333
WebSocket端口: 8080
=====================================

✅ WebSocket服务器启动成功
   监听端口: 8080
   前端连接地址: ws://localhost:8080
🔌 正在连接ESP32热成像模块...
   地址: 192.168.6.194:3333
✅ 已连接到ESP32热成像模块
   192.168.6.194:3333
📤 发送启动采集命令: #0010WREGB10302CC  ← CRC正确！
🌡️ 温度统计 [celsius] - 最小: 25.3°C, 最大: 38.7°C, 平均: 31.2°C
📊 统计信息:
   运行时间: 0h 0m 5s
   ESP32状态: ✅ 已连接
   WebSocket客户端: 0
   接收数据: 15.23 MB
   发送数据: 0 B
   处理帧数: 1497
   丢弃帧数: 3
   缓冲区大小: 0 字节
   温度范围: 24.5°C ~ 39.2°C (平均: 31.8°C) [celsius]
```

## 新增功能（增强版）

### 1. 实时温度统计
- 每30帧输出一次温度信息
- 自动识别温度单位（°C, °F, raw）
- 显示最小/最大/平均温度

### 2. 自动校准信息
ESP32固件具备以下自动校准功能：
- **自动增益控制（AutoGain）**: 根据温度范围自动切换增益
- **盲元校正**: 自动检测和补偿失效像素
- **NUC校正**: 非均匀性校正

### 3. 详细统计报告
在每分钟统计报告中新增温度信息

## 文件说明

- **`thermal-proxy-server.js`**: 原始版本，已修复CRC bug
- **`thermal-proxy-server-enhanced.js`**: 增强版，添加温度解析
- **`thermal-proxy-server-fixed.js`**: 完整修复版（备份）

## 测试建议

1. 先使用修复后的 `thermal-proxy-server.js`
2. 如果收到数据帧，再尝试增强版
3. 在浏览器中打开热成像前端页面查看实时图像
