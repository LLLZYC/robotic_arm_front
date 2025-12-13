# 📚 DLRobot 文档索引

欢迎使用 DLRobot 前端系统！本索引帮助您快速找到所需的文档。

---

## 🚀 快速开始

**第一次使用？从这里开始：**

1. 📖 [README.md](./README.md) - 项目概述和快速开始
2. 📘 [后端配置指南](./BACKEND_SETUP_GUIDE.md) - 配置后端服务
3. 📗 [MQTT话题配置指南](./MQTT_TOPIC_CONFIG_GUIDE.md) - 配置前端话题
4. 📙 [快速参考卡片](./QUICK_REFERENCE.md) - 常用命令速查

---

## 📋 文档分类

### 配置指南

| 文档 | 描述 | 适用场景 |
|------|------|----------|
| [后端配置指南](./BACKEND_SETUP_GUIDE.md) | 详细的后端服务配置步骤 | 首次部署、服务器配置 |
| [MQTT话题配置指南](./MQTT_TOPIC_CONFIG_GUIDE.md) | MQTT话题配置详解 | 修改话题、适配不同机器人 |
| [配置总结](./CONFIGURATION_SUMMARY.md) | 配置功能概览 | 了解配置功能、快速上手 |

### 参考文档

| 文档 | 描述 | 适用场景 |
|------|------|----------|
| [快速参考卡片](./QUICK_REFERENCE.md) | 常用命令和配置速查 | 日常使用、快速查找 |
| [API文档](./API_CAMERA_IMAGES.md) | 相机图像API接口说明 | API开发、接口调用 |

### 项目文档

| 文档 | 描述 | 适用场景 |
|------|------|----------|
| [README.md](./README.md) | 项目概述和使用说明 | 了解项目、快速开始 |
| [任务完成报告](./TASK_COMPLETION_REPORT.md) | 配置功能实现报告 | 了解新功能、查看更新 |
| [更新摘要](./UPDATES_SUMMARY.md) | 项目更新记录 | 查看历史更新 |

---

## 🎯 按使用场景查找

### 场景1: 首次部署系统

**推荐阅读顺序：**

1. [README.md](./README.md) - 了解项目
2. [后端配置指南](./BACKEND_SETUP_GUIDE.md) - 配置后端
   - MQTT代理配置
   - ROS MQTT Bridge配置
   - Web Video Server配置
   - REST API配置
3. [MQTT话题配置指南](./MQTT_TOPIC_CONFIG_GUIDE.md) - 配置话题
4. [快速参考卡片](./QUICK_REFERENCE.md) - 保存备用

### 场景2: 修改话题配置

**推荐阅读：**

1. [MQTT话题配置指南](./MQTT_TOPIC_CONFIG_GUIDE.md)
   - 查看界面位置与话题映射
   - 了解配置方法
   - 参考配置示例
2. [快速参考卡片](./QUICK_REFERENCE.md)
   - 查看默认话题配置表
   - 使用快速配置步骤

### 场景3: 日常使用和维护

**推荐使用：**

1. [快速参考卡片](./QUICK_REFERENCE.md)
   - 常用命令速查
   - 常见问题解决
   - 性能优化建议

### 场景4: 故障排查

**推荐查看：**

1. [快速参考卡片](./QUICK_REFERENCE.md) - 常见问题速查
2. [后端配置指南](./BACKEND_SETUP_GUIDE.md) - 详细故障排查
3. [MQTT话题配置指南](./MQTT_TOPIC_CONFIG_GUIDE.md) - 话题相关问题

---

## 🔍 按问题类型查找

### MQTT连接问题

- [后端配置指南 → 故障排查 → MQTT连接失败](./BACKEND_SETUP_GUIDE.md#mqtt连接失败)
- [快速参考 → 常见问题 → MQTT连接失败](./QUICK_REFERENCE.md#mqtt连接失败)

### 话题无数据

- [MQTT话题配置指南 → 故障排查 → 话题无数据](./MQTT_TOPIC_CONFIG_GUIDE.md#问题1-话题无数据)
- [快速参考 → 常见问题 → 话题无数据](./QUICK_REFERENCE.md#话题无数据)

### 视频流问题

- [后端配置指南 → 故障排查 → 视频流无法显示](./BACKEND_SETUP_GUIDE.md#视频流无法显示)
- [快速参考 → 常见问题 → 视频流无法显示](./QUICK_REFERENCE.md#视频流无法显示)

### 配置不生效

- [配置总结 → 故障排查 → 配置不生效](./CONFIGURATION_SUMMARY.md#配置不生效)
- [MQTT话题配置指南 → 使用步骤](./MQTT_TOPIC_CONFIG_GUIDE.md#使用步骤)

---

## 📊 文档统计

| 文档 | 行数 | 大小 | 主要内容 |
|------|------|------|----------|
| 后端配置指南 | 605 | ~13KB | 后端服务配置 |
| MQTT话题配置指南 | 412 | ~9KB | 话题配置详解 |
| 快速参考卡片 | 318 | ~8KB | 命令和配置速查 |
| 配置总结 | 368 | ~10KB | 功能概览 |
| 任务完成报告 | 435 | ~12KB | 实现报告 |
| **总计** | **2,138** | **~52KB** | **完整文档** |

---

## 💡 使用建议

### 新手用户

1. 从 [README.md](./README.md) 开始
2. 按顺序阅读配置指南
3. 保存 [快速参考卡片](./QUICK_REFERENCE.md) 以便日常使用

### 有经验用户

1. 直接查看 [快速参考卡片](./QUICK_REFERENCE.md)
2. 需要详细信息时查阅对应的完整指南
3. 使用文档索引快速定位

### 开发者

1. 查看 [任务完成报告](./TASK_COMPLETION_REPORT.md) 了解实现细节
2. 参考 [API文档](./API_CAMERA_IMAGES.md) 进行开发
3. 查看源代码中的组件实现

---

## 🔗 相关资源

### 在线文档

- [ROS Wiki](http://wiki.ros.org) - ROS官方文档
- [MQTT.org](https://mqtt.org) - MQTT协议文档
- [Vue.js](https://vuejs.org) - Vue.js官方文档
- [Leaflet](https://leafletjs.com) - Leaflet地图库文档

### GitHub仓库

- [MQTT Bridge](https://github.com/groove-x/mqtt_bridge) - ROS MQTT Bridge
- [Web Video Server](https://github.com/RobotWebTools/web_video_server) - ROS Web Video Server

---

## 📝 文档更新

### 最新版本

- **版本**: v1.0.0
- **日期**: 2025-11-05
- **更新内容**: 初始版本，包含完整的配置指南和话题配置功能

### 更新历史

查看 [UPDATES_SUMMARY.md](./UPDATES_SUMMARY.md) 了解详细的更新历史。

---

## 🆘 获取帮助

### 文档内查找

1. 使用本索引快速定位
2. 在文档中搜索关键词
3. 查看目录和章节标题

### 问题排查

1. 查看快速参考中的常见问题
2. 参考详细指南中的故障排查章节
3. 检查浏览器控制台和服务日志

### 联系支持

- 查看项目 README 中的联系方式
- 提交 GitHub Issue
- 查看在线文档和社区

---

## 📌 快速链接

### 最常用文档

- 🔧 [后端配置指南](./BACKEND_SETUP_GUIDE.md)
- 📡 [MQTT话题配置指南](./MQTT_TOPIC_CONFIG_GUIDE.md)
- ⚡ [快速参考卡片](./QUICK_REFERENCE.md)

### 配置文件位置

- 前端配置: `src/stores/robotStore.js`
- 话题设置组件: `src/components/TopicSettings.vue`
- MQTT服务: `src/services/mqttService.js`

### 常用命令

```bash
# 启动开发服务器
npm run dev

# 构建生产版本
npm run build

# 查看ROS话题
rostopic list

# 测试MQTT连接
mosquitto_sub -h localhost -p 1883 -t "/scan"
```

---

**文档索引版本**: v1.0.0  
**最后更新**: 2025-11-05  
**维护者**: DLRobot Team
