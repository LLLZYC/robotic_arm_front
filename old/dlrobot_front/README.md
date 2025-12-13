# hole_insertion

自动插孔流程节点（s300_pro + eco65）：读取初始关节位姿，等待导航触发后调用视觉服务获取孔位姿（camera_link），生成预靠位，直线插入、撤回并回初始，力控保护可选，旋转接口预留。

## 用法

```bash
colcon build --packages-select hole_insertion
source install/setup.bash
ros2 launch hole_insertion hole_insertion.launch.py
```

导航到位后调用开始服务：
```bash
ros2 service call /start_insertion std_srvs/srv/Trigger "{}"
```

视觉服务需要实现 `hole_insertion/srv/GetHolePose` 接口并在 `vision_service_name` 参数指定的名称上提供服务。默认参数在 `config/params.yaml`。

旋转占位服务（暂未实现旋转逻辑）：
```bash
ros2 service call /rotate_in_hole hole_insertion/srv/RotateInHole "{angle: 1.57, speed: 0.5}"
```

手动触发（无需视觉服务，直接给相机坐标系下的孔位姿）：
```bash
ros2 service call /run_insertion_manual hole_insertion/srv/RunInsertionManual "{
  pose_cam: {
    header: {frame_id: 'camera_link'},
    pose: {
      position: {x: 0.1, y: 0.0, z: 0.3},
      orientation: {x: 0.0, y: 0.0, z: 0.0, w: 1.0}
    }
  }
}"
```

## 关键参数（config/params.yaml）
- `initial_joints`：初始关节角，节点启动时会移动到此姿态。`initial_joints_in_degrees` 为 true 时按度数解析，否则按弧度解析。
- `pre_dock_distance`：固定预靠距离，沿孔的 +Z 轴反向偏移。
- `auto_pre_dock_from_depth`：true 时根据相机坐标系下的孔深度自动计算预靠距离（depth - `pre_dock_margin`，下限 `pre_dock_min_distance`）。
- `insert_depth`：插入深度，沿孔的 +Z 轴正向推进。
- `withdraw_distance`：撤出距离，默认为与预靠相同。
- `linear_step`：直线插补步长，越小越稳。
- `cartesian_speed_scale` / `cartesian_accel_scale`：MoveIt 的速度/加速度缩放。
- `use_force_guard` / `force_guard_threshold`：可选的力阈值保护，订阅 `force_topic`。
- `vision_service_name`：视觉服务名（GetHolePose）。
- `trigger_vision`：现在 `/start_insertion` 会调用 `trigger_service_name`（默认 `/trigger_vision`，std_srvs/Trigger），然后等待 `/process_pose` 推送 PoseStamped；超时时间由 `trigger_timeout`、`pose_wait_timeout` 控制。`/process_pose` 到的姿态总是用当前时间戳缓存。
- `/process_pose`：兼容 `robotic_arm` 的 ProcessPose 服务（相机坐标系 Pose -> 缓存），当 `accept_cached_process_pose` 为 true 且视觉服务不可用时，会使用缓存姿态。
- `camera_frame` / `base_frame`：孔位姿输入坐标系与规划参考系。
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
