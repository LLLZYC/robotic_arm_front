# 🚀 简单后端服务使用指南

## 概述

这是一个简单的Python后端服务，专门用于调用ROS2线性插入服务。只需要一个接口即可完成Demo演示。

## 📋 功能特点

- ✅ **极简设计**：只提供必要的API接口
- ✅ **模拟支持**：内置Demo模式，无需真实ROS2环境
- ✅ **线程安全**：支持并发请求保护
- ✅ **错误处理**：完善的异常处理和日志
- ✅ **健康检查**：提供状态监控接口

## 🛠️ 快速启动

### 方法1：使用启动脚本（推荐）
```bash
./start_backend.sh
```

### 方法2：手动启动
```bash
# 安装依赖
pip3 install -r requirements_backend.txt

# 启动服务
python3 simple_backend.py
```

### 方法3：使用npm
```bash
npm run simple-backend
```

## 📡 API接口

### 1. 调用线性插入服务
- **URL**: `POST http://localhost:5000/run_linear_insert`
- **Content-Type**: `application/json`
- **请求体**: 
  ```json
  {
    "simulation": true  // 使用模拟模式
  }
  ```
- **响应**:
  ```json
  {
    "success": true,
    "message": "线性插入操作完成",
    "timestamp": 1631234567.89
  }
  ```

### 2. 健康检查
- **URL**: `GET http://localhost:5000/health`
- **响应**:
  ```json
  {
    "status": "ok",
    "service": "Linear Insert Backend",
    "timestamp": 1631234567.89
  }
  ```

### 3. 服务状态
- **URL**: `GET http://localhost:5000/status`
- **响应**:
  ```json
  {
    "is_running": false,
    "timestamp": 1631234567.89
  }
  ```

## 🔗 前端集成

前端会自动连接到 `http://localhost:5000`，调用线性插入服务。

### 启动完整系统
```bash
# 启动前端和后端
npm run dev:simple
```

访问：http://localhost:3000

## 🎯 Demo模式

默认使用模拟模式，特点：
- ✅ 80%成功率
- ✅ 2秒执行时间
- ✅ 无需ROS2环境
- ✅ 完全离线运行

## 🔧 真实ROS2环境

如果要使用真实的ROS2服务：

1. 确保ROS2环境已配置
2. 确保服务 `/run_linear_insert` 存在
3. 修改请求参数：
   ```json
   {
     "simulation": false  // 使用真实ROS2服务
   }
   ```

## 📊 日志输出

服务运行时会输出详细日志：
```
🚀 启动线性插入服务后端
   服务地址: http://localhost:5000
   健康检查: http://localhost:5000/health
   API接口: http://localhost:5000/run_linear_insert

2023-09-10 10:30:00 - __main__ - INFO - 开始模拟线性插入服务...
2023-09-10 10:30:02 - __main__ - INFO - 模拟线性插入服务成功
```

## 🛡️ 安全特性

- **并发保护**：防止同时执行多个服务调用
- **超时处理**：30秒超时保护
- **错误隔离**：异常不会导致服务崩溃
- **跨域支持**：支持前端跨域请求

## 🔍 故障排除

### 1. 端口被占用
```bash
# 查看端口占用
lsof -i :5000

# 杀死进程
kill -9 <PID>
```

### 2. 依赖缺失
```bash
# 重新安装依赖
pip3 install -r requirements_backend.txt
```

### 3. ROS2环境问题
- 使用模拟模式测试：`{"simulation": true}`
- 检查ROS2安装：`ros2 --version`
- 检查服务存在：`ros2 service list`

---

**现在你有一个简单、可靠的后端服务，专注于线性插入Demo功能！** 🎯