# dlrobot_autocontrol

`dlrobot_autocontrol` 节点负责统一调度巡逻路径、临时任务插队、拍照归档以及低电压自动回充。所有行为均由 `config/autocontrol.yaml` 配置文件控制，可与已有的 `auto_recharger` 模块协同工作。

## 功能特性
- **巡逻执行**：按照 `goals` 顺序发布 `move_base_simple/goal`，支持循环、重试、目标间停顿。
- **REST 插队**：监听 `rest_interface`，接受临时目标请求并在执行完毕后恢复巡逻队列。
- **拍照归档**：抵达目标后可按配置自转、多次抓拍，图片与 JSON 元数据自动归档到指定目录。
- **低电压回充**：订阅 `/PowerVoltage`，在阈值以下暂停巡逻、发布 `robot_recharge_flag`、调用 `/set_charge`（或自定义服务），电压恢复后继续。
  状态切换时会多次广播 `robot_recharge_flag` 并使用 latched 发布者，以兼顾旧版监听方的订阅行为。
- **完全可配置**：话题/服务名称、旋转参数、REST 端口、充电逻辑等均通过 YAML 设置，无需修改源码。

## 快速启动

```bash
roslaunch dlrobot_autocontrol autocontrol.launch
```

如需替换配置文件：

```bash
roslaunch dlrobot_autocontrol autocontrol.launch config_file:=/path/to/custom.yaml
```

## REST API 说明

- **请求方式**：`POST {host}:{port}{endpoint}`（默认 `http://0.0.0.0:17863/goal`）
- **请求示例**：

```json
{
  "name": "inspection_point",
  "frame_id": "map",
  "position": {"x": 5.3, "y": -1.2, "z": 0.0},
  "orientation": {"yaw": 1.57},
  "wait_before": 1.0,
  "wait_after": 2.0
}
```

如配置了 `rest_interface.access_token`，需附带 `Authorization: Bearer <token>` 或 `X-Access-Token` 头。

## 配置文件要点

| Section | 说明 |
|---------|------|
| `sequence` | 巡逻调度参数（循环、空闲等待、目标超时、目标间停顿等） |
| `topics` / `services` | 话题与服务名称映射，可根据实际项目重映射 |
| `photo_capture` | 自转、快照数量、图像话题、归档目录、照片格式等 |
| `charging` | 低电压阈值、恢复阈值、防抖时间、回充服务类型及参数 |
| `goals` | 巡逻点列表，可使用 `yaw` 或完整四元数描述姿态 |

> 提示：当 `charging.service_type` 设为 `spawn` 时，节点将仿照 `auto_recharger` 调用 `/set_charge` 服务，同步发布 `robot_recharge_flag` 与 `/move_base/cancel`，从而兼容现有底盘回充流程。

## 目录结构

```
dlrobot_autocontrol/
├── config/          # 默认配置文件
├── launch/          # 启动文件（支持 config_file 覆盖）
├── scripts/         # 主节点脚本 autocontrol_node.py
├── CMakeLists.txt   # catkin 构建脚本
└── package.xml
```

如需扩展自定义逻辑，可在 `scripts/autocontrol_node.py` 中添加额外状态处理；建议同步更新 YAML 和本文档，保持配置与行为一致。
