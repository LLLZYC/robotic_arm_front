# DLRobot Frontend

Vue.js前端应用，用于ROS机器人控制系统。支持地图导航、巡航控制、相机图像库、热成像和机械臂控制。

## 功能特性

- 🗺️ **地图导航**: 实时显示机器人位置和地图，支持点击设置目标位置
- 🚗 **巡航控制**: 预设巡航点自动导航
- 📷 **相机图像库**: 显示和下载相机捕获的图像
- 🌡️ **热成像**: 实时热成像数据显示
- 🦾 **机械臂控制**: 机械臂姿态控制和操作
- 📡 **MQTT通信**: 与ROS后端通过MQTT进行实时通信
- 🎨 **响应式设计**: 支持桌面和移动设备

## 技术栈

- **前端框架**: Vue 3 + Composition API
- **状态管理**: Pinia
- **路由**: Vue Router 4
- **地图**: Leaflet
- **通信**: Paho MQTT (WebSocket)
- **HTTP客户端**: Axios
- **构建工具**: Vite
- **样式**: CSS3 + Flexbox/Grid

## 快速开始

### 安装依赖

```bash
npm install
```

### 开发模式

```bash
npm run dev
```

应用将在 `http://localhost:3000` 启动（如果端口被占用，会自动使用其他端口）。

### 构建生产版本

```bash
npm run build
```

### 预览生产版本

```bash
npm run preview
```

## 配置

### MQTT连接

默认连接到 `ws://localhost:9001`。可在设置面板中修改。

### REST API

默认连接到 `http://localhost:5001`。可在设置面板中修改。

### 地图配置

地图分辨率、原点坐标等可在设置面板中配置。

## 项目结构

```
src/
├── components/          # Vue组件
│   ├── ControlPanel.vue # 控制面板
│   ├── RobotMap.vue     # 机器人地图
│   ├── CruiseControl.vue# 巡航控制
│   ├── CameraGallery.vue# 相机图像库
│   ├── ThermalDisplay.vue# 热成像显示
│   ├── ArmControl.vue   # 机械臂控制
│   └── ...
├── stores/              # Pinia状态管理
│   └── robotStore.js    # 机器人状态
├── services/            # 服务层
│   ├── mqttService.js   # MQTT通信服务
│   ├── apiService.js    # REST API服务
│   └── ...
├── utils/               # 工具函数
│   ├── mapUtils.js      # 地图工具
│   └── ...
├── views/               # 页面视图
├── router/              # 路由配置
└── main.js              # 应用入口
```

## 开发指南

### 添加新组件

1. 在 `src/components/` 创建Vue组件
2. 在 `src/App.vue` 中导入并注册
3. 在模板中使用

### 添加新服务

在 `src/services/` 中创建服务类，实现相关功能。

### 状态管理

使用Pinia进行状态管理。主要状态存储在 `robotStore.js` 中。

## 浏览器支持

- Chrome 70+
- Firefox 65+
- Safari 12+
- Edge 79+

## 许可证

MIT License
- 深度可选：`use_depth_topic`（开启从深度图取孔中心距离）、`depth_topic`、`camera_info_topic`、`depth_timeout`、`depth_window`。取到的深度会替代 vision Pose 的 z 来计算预靠距离（depth - `pre_dock_margin`，下限 `pre_dock_min_distance`），取不到则回退到 vision z。

## 零基础快速配置（一步一步）
1) 设初始关节角  
   - 有度数：把 `initial_joints_in_degrees` 设为 true，把 6 个角度（度）填进 `initial_joints`。  
   - 有弧度：保持 `initial_joints_in_degrees` 为 false，`initial_joints` 填弧度。

2) 选视觉接口  
   - 有 `/vision/get_hole_pose`（返回 PoseStamped，frame 通常是 camera_link）：直接填/保持 `vision_service_name`。  
   - 只会推送 `/process_pose`：保持 `accept_cached_process_pose: true`（默认），视觉端调用 `/process_pose` 推送 Pose。

3) 设预靠距离  
   - 固定值：`auto_pre_dock_from_depth: false`，调 `pre_dock_distance`（米）。  
   - 跟随深度：`auto_pre_dock_from_depth: true`，调 `pre_dock_margin`（相机深度减去的安全余量）和 `pre_dock_min_distance`（最小预靠距离）。

4) 插入/撤出参数  
   - `insert_depth`：插入多少米。  
   - `withdraw_distance`：撤出多少米（不填或设相同即可回到预靠位）。  
   - `linear_step`：插入步长，0.003~0.01 之间更稳。

5) 速度与保护  
   - `cartesian_speed_scale` / `cartesian_accel_scale`：0~1，越小越稳。  
   - 有力传感：`use_force_guard: true`，调 `force_guard_threshold`（牛顿）。

6) 启动与执行  
   ```bash
   colcon build --packages-select hole_insertion
   source install/setup.bash
   ros2 launch hole_insertion hole_insertion.launch.py params_file:=/path/to/your/params.yaml
   ros2 service call /start_insertion std_srvs/srv/Trigger "{}"
   ```
   手动调试（跳过视觉）：按上面的 `/run_insertion_manual` 示例，填入相机坐标系下的孔位姿即可。

## 流程
1) 启动节点后自动回到 `initial_joints`。  
2) 收到 `/start_insertion` 服务调用后：  
   - 第一次视觉识别拿孔位姿（camera_link），TF 转换到 base_link。  
   - 计算预靠位（沿孔轴反向偏移 `pre_dock_distance`），MoveIt 规划过去。  
   - 到达预靠位后再次调用视觉服务做精确对准，必要时再次微调到新的预靠位。  
   - 小步长笛卡尔直线插入 `insert_depth`，可启用力阈保护。  
   - 撤回 `withdraw_distance` 回到预靠位。  
   - 回初始关节位姿。  
3) 旋转接口预留为 `/rotate_in_hole` 服务，当前仅返回未实现提示。

## 注意
- 默认规划组/末端：`rm_group` / `gripper`，如与现场配置不同请在参数中修改。
- 孔位姿假设 Z 轴为插入方向；预靠沿 -Z，插入沿 +Z。  
- 力控保护只做阈值停止，未做主动对准；如需更精细的力位混合请补充控制策略。

## 初学者调试指南
1) 编译顺序（确保依赖先装好）  
   ```bash
   colcon build --packages-select rm_ros_interfaces --symlink-install
   source install/setup.bash
   colcon build --packages-select robotic_arm --symlink-install
   source install/setup.bash
   colcon build --packages-select hole_insertion --symlink-install
   ```
2) 运行  
   ```bash
   source install/setup.bash
   ros2 launch hole_insertion hole_insertion.launch.py
   ```
3) 视觉输入  
   - 常规：启动 `vision_node.py`，保证 `/process_pose` 能被调用（或实现 `/vision/get_hole_pose`）。  
   - 没有视觉时：用 `/run_insertion_manual` 手动输入相机坐标系下的孔位姿，测试流程。
4) TF 检查  
   - 确保 `camera_link -> base_link` 有 TF（手眼标定或静态 TF）。  
   - 没有 TF 会在日志里报 transform 失败。
5) 深度调试  
   - 要用深度算预靠：在 params 里设 `use_depth_topic: true` 并确认深度/相机内参话题存在。  
   - 如果斜视导致中心深度缺失，会回退到视觉 z，日志会有 “Depth sample failed” 警告。
6) 常见问题  
   - “Node busy”：上一次流程未结束，等完成或重启节点。  
   - 视觉服务不可用：开启 `accept_cached_process_pose`，让视觉端推送 `/process_pose`；否则用手动服务。  
   - 末端运动方向反了：检查孔姿态的 Z 轴方向是否与实际插入方向一致。
