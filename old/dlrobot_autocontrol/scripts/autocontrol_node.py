#!/usr/bin/env python3
import json
import math
import mimetypes
import os
import shutil
import threading
import time
from collections import deque
from datetime import datetime
from http.server import BaseHTTPRequestHandler, HTTPServer
from typing import Any, Deque, Dict, List, Optional, Set, Tuple, Union
from urllib.parse import parse_qs, unquote, urlparse

import rospy
import yaml
from actionlib_msgs.msg import GoalID, GoalStatus
from geometry_msgs.msg import PoseStamped, Twist
from move_base_msgs.msg import MoveBaseActionGoal, MoveBaseActionResult
from sensor_msgs.msg import CompressedImage, Image
from std_msgs.msg import Float32, Int8
from std_srvs.srv import Trigger, TriggerRequest

try:
    from cv_bridge import CvBridge
except ImportError:  # noqa: WPS440
    CvBridge = None

try:
    import cv2
except ImportError:  # noqa: WPS440
    cv2 = None

try:
    import numpy as np
except ImportError:  # noqa: WPS440
    np = None

try:
    from std_srvs.srv import SetBool, SetBoolRequest
except ImportError:  # noqa: WPS440
    SetBool = None
    SetBoolRequest = None

try:
    from turtlesim.srv import Spawn
except ImportError:  # noqa: WPS440
    Spawn = None


class Goal:
    """轻量结构体：描述一个导航目标及其附加动作参数。"""

    __slots__ = ("name", "frame_id", "position", "orientation", "wait_before", "wait_after", "source")

    def __init__(
        self,
        name: str,
        frame_id: str,
        position: Dict[str, float],
        orientation: Dict[str, float],
        wait_before: float = 0.0,
        wait_after: float = 0.0,
        source: str = "sequence",
    ) -> None:
        self.name = name
        self.frame_id = frame_id
        self.position = position
        self.orientation = orientation
        self.wait_before = wait_before
        self.wait_after = wait_after
        self.source = source

    def pose_stamped(self) -> PoseStamped:
        msg = PoseStamped()
        msg.header.stamp = rospy.Time.now()
        msg.header.frame_id = self.frame_id
        msg.pose.position.x = float(self.position.get("x", 0.0))
        msg.pose.position.y = float(self.position.get("y", 0.0))
        msg.pose.position.z = float(self.position.get("z", 0.0))
        msg.pose.orientation.x = float(self.orientation.get("x", 0.0))
        msg.pose.orientation.y = float(self.orientation.get("y", 0.0))
        msg.pose.orientation.z = float(self.orientation.get("z", 0.0))
        msg.pose.orientation.w = float(self.orientation.get("w", 1.0))
        return msg


class _QuietHTTPServer(HTTPServer):
    allow_reuse_address = True


def _quaternion_from_euler(roll: float, pitch: float, yaw: float) -> Tuple[float, float, float, float]:
    """纯数学实现欧拉角转四元数，避免依赖 ROS Python2 扩展。"""
    half_roll = roll * 0.5
    half_pitch = pitch * 0.5
    half_yaw = yaw * 0.5
    sin_r = math.sin(half_roll)
    cos_r = math.cos(half_roll)
    sin_p = math.sin(half_pitch)
    cos_p = math.cos(half_pitch)
    sin_y = math.sin(half_yaw)
    cos_y = math.cos(half_yaw)
    qx = sin_r * cos_p * cos_y - cos_r * sin_p * sin_y
    qy = cos_r * sin_p * cos_y + sin_r * cos_p * sin_y
    qz = cos_r * cos_p * sin_y - sin_r * sin_p * cos_y
    qw = cos_r * cos_p * cos_y + sin_r * sin_p * sin_y
    return qx, qy, qz, qw


def _build_orientation(orientation_cfg: Dict[str, Any], fallback: Dict[str, float]) -> Dict[str, float]:
    if not orientation_cfg:
        orientation_cfg = {}
    if all(k in orientation_cfg for k in ("x", "y", "z", "w")):
        try:
            return {
                "x": float(orientation_cfg["x"]),
                "y": float(orientation_cfg["y"]),
                "z": float(orientation_cfg["z"]),
                "w": float(orientation_cfg["w"]),
            }
        except (TypeError, ValueError) as exc:
            raise ValueError(f"invalid quaternion component: {exc}")
    try:
        yaw = float(orientation_cfg.get("yaw", fallback.get("yaw", 0.0)))
        pitch = float(orientation_cfg.get("pitch", fallback.get("pitch", 0.0)))
        roll = float(orientation_cfg.get("roll", fallback.get("roll", 0.0)))
    except (TypeError, ValueError) as exc:
        raise ValueError(f"invalid euler angle: {exc}")
    qx, qy, qz, qw = _quaternion_from_euler(roll, pitch, yaw)
    return {"x": qx, "y": qy, "z": qz, "w": qw}


def _load_goals(config: Dict[str, Any]) -> deque:
    frame_id = config.get("frame_id", "map")
    fallback_orientation = config.get("fallback_orientation", {"yaw": 0.0})
    goals = deque()
    for idx, entry in enumerate(config.get("goals", [])):
        name = entry.get("name") or f"sequence_{idx:02d}"
        entry_frame = entry.get("frame_id", frame_id)
        try:
            position = _normalize_position(entry.get("position", {}))
            orientation = _build_orientation(entry.get("orientation", {}), fallback_orientation)
            wait_before = _to_float(entry.get("wait_before", 0.0), f"goal {name} wait_before", 0.0)
            wait_after = _to_float(entry.get("wait_after", 0.0), f"goal {name} wait_after", 0.0)
        except ValueError as exc:
            rospy.logerr("Goal %s skipped: %s", name, exc)
            continue
        goals.append(Goal(name=name, frame_id=entry_frame, position=position, orientation=orientation, wait_before=wait_before, wait_after=wait_after))
    return goals


def _goal_to_config_entry(goal: Goal) -> Dict[str, Any]:
    position = {axis: float(goal.position.get(axis, 0.0)) for axis in ("x", "y", "z")}
    orientation = {
        axis: float(goal.orientation.get(axis, 1.0 if axis == "w" else 0.0))
        for axis in ("x", "y", "z", "w")
    }
    return {
        "name": goal.name,
        "frame_id": goal.frame_id,
        "position": position,
        "orientation": orientation,
        "wait_before": float(goal.wait_before),
        "wait_after": float(goal.wait_after),
    }

def _ensure_directory(path: str) -> bool:
    if not path:
        return True
    try:
        os.makedirs(path, exist_ok=True)
        return True
    except OSError as exc:
        rospy.logerr("Create directory %s failed: %s", path, exc)
        return False


def _sanitize_segment(segment: str, default: str = "unknown") -> str:
    if not segment:
        return default
    cleaned = "".join(char if char.isalnum() or char in ("-", "_", ".") else "_" for char in str(segment))
    cleaned = cleaned.strip("_")
    return cleaned or default


# 坐标合法性校验：确保 x/y/z 都能转换成浮点数
def _normalize_position(position_cfg: Dict[str, Any]) -> Dict[str, float]:
    coords: Dict[str, float] = {}
    for axis in ("x", "y", "z"):
        raw = position_cfg.get(axis, 0.0)
        try:
            coords[axis] = float(raw)
        except (TypeError, ValueError):
            raise ValueError(f"invalid {axis} value: {raw}")
    return coords


# 通用浮点转换，确保配置项与 REST 参数不会带入非法类型
def _to_float(value: Any, field: str, default: float = 0.0) -> float:
    if value is None:
        return float(default)
    try:
        return float(value)
    except (TypeError, ValueError):
        raise ValueError(f"invalid {field} value: {value}")


def _to_bool(value: Any) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return value != 0
    if isinstance(value, str):
        normalized = value.strip().lower()
        return normalized in {"1", "true", "yes", "on"}
    return False


class RestApiServer(threading.Thread):
    def __init__(self, node: "AutoControlNode", host: str, port: int, endpoint: str, token: str, timeout: float) -> None:
        super().__init__(daemon=True)
        self._node = node
        normalized_endpoint = ""
        if endpoint is not None:
            normalized_endpoint = str(endpoint).strip()
        if normalized_endpoint and not normalized_endpoint.startswith("/"):
            normalized_endpoint = f"/{normalized_endpoint}"
        self._legacy_endpoint = normalized_endpoint or "/api/navigation/goal"
        self._token = token or ""
        self._timeout = timeout
        handler_class = self._build_handler()
        self._server = _QuietHTTPServer((host, port), handler_class)

    def _build_handler(self):
        node = self._node
        legacy_endpoint = self._legacy_endpoint
        token = self._token
        timeout = self._timeout

        class ApiRequestHandler(BaseHTTPRequestHandler):
            server_version = "DLRobotREST/1.0"

            def log_message(self, *args: Any, **kwargs: Any) -> None:  # noqa: D401, N802
                return

            def _set_common_headers(self, status: int, content_type: str, content_length: Optional[int] = None) -> None:
                self.send_response(status)
                self.send_header("Content-Type", content_type)
                self.send_header("Access-Control-Allow-Origin", "*")
                self.send_header("Access-Control-Allow-Methods", "GET,POST,OPTIONS")
                self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Access-Token")
                if content_length is not None:
                    self.send_header("Content-Length", str(content_length))
                self.end_headers()

            def _send_json(self, status: int, payload: Dict[str, Any]) -> None:
                body = json.dumps(payload).encode("utf-8")
                self._set_common_headers(status, "application/json; charset=utf-8", len(body))
                self.wfile.write(body)

            def _read_json_body(self) -> Optional[Dict[str, Any]]:
                length = int(self.headers.get("Content-Length", "0"))
                if length <= 0:
                    return {}
                raw = self.rfile.read(length)
                try:
                    return json.loads(raw.decode("utf-8"))
                except (ValueError, UnicodeDecodeError):
                    return None

            def _authorize(self) -> bool:
                if not token:
                    return True
                header_token = self.headers.get("Authorization", "")
                if header_token.lower().startswith("bearer "):
                    header_token = header_token[7:]
                elif not header_token:
                    header_token = self.headers.get("X-Access-Token", "")
                return header_token == token

            def do_OPTIONS(self) -> None:  # noqa: N802
                self.send_response(204)
                self.send_header("Access-Control-Allow-Origin", "*")
                self.send_header("Access-Control-Allow-Methods", "GET,POST,OPTIONS")
                self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Access-Token")
                self.end_headers()

            def do_POST(self) -> None:  # noqa: N802
                if not self._authorize():
                    self._send_json(401, {"success": False, "error": "unauthorized"})
                    return
                parsed = urlparse(self.path)
                path = parsed.path
                payload = self._read_json_body()
                if payload is None:
                    self._send_json(400, {"success": False, "error": "invalid json"})
                    return
                try:
                    if path in (legacy_endpoint, "/api/navigation/goal", "/api/goal"):
                        accepted, msg = node.handle_rest_goal(payload, timeout)
                        status = 200 if accepted else 400
                        self._send_json(status, {"success": accepted, "message": msg})
                    elif path in ("/api/navigation/cancel", "/api/goal/cancel"):
                        success, message, status = node.cancel_navigation()
                        self._send_json(status, {"success": success, "message": message})
                    elif path in ("/api/navigation/hold", "/api/goal/hold"):
                        success, message, status = node.hold_position(payload)
                        self._send_json(status, {"success": success, "message": message})
                    elif path in ("/api/navigation/resume", "/api/goal/resume"):
                        success, message, status = node.resume_schedule(payload)
                        self._send_json(status, {"success": success, "message": message})
                    elif path.rstrip("/") == "/api/navigation/default_goals":
                        success, result, status = node.update_default_goals(payload)
                        result["success"] = success
                        self._send_json(status, result)
                    elif path in ("/api/camera/capture",):
                        success, result = node.capture_manual_photo(payload)
                        result["success"] = success
                        self._send_json(200 if success else 503, result)
                    else:
                        self._send_json(404, {"success": False, "error": "unknown endpoint"})
                except Exception as exc:  # noqa: BLE001
                    rospy.logerr("REST API error on %s: %s", path, exc)
                    self._send_json(500, {"success": False, "error": "internal error"})

            def do_GET(self) -> None:  # noqa: N802
                if not self._authorize():
                    self._send_json(401, {"success": False, "error": "unauthorized"})
                    return
                parsed = urlparse(self.path)
                path = parsed.path
                query = parse_qs(parsed.query)
                try:
                    if path == "/api/robot/status":
                        snapshot = node.status_snapshot()
                        snapshot["success"] = True
                        self._send_json(200, snapshot)
                    elif path.rstrip("/") == "/api/navigation/default_goals":
                        data = node.default_goals_snapshot()
                        data["success"] = True
                        self._send_json(200, data)
                    elif path == "/api/map/info":
                        info = node.map_info()
                        info["success"] = True
                        self._send_json(200, info)
                    elif path == "/api/camera/images":
                        requested = query.get("path", [None])[0]
                        success, payload = node.list_camera_images(requested)
                        payload["success"] = success
                        self._send_json(200 if success else 400, payload)
                    elif path.startswith("/api/camera/image/"):
                        requested = path[len("/api/camera/image/") :]
                        requested = unquote(requested)
                        success, info = node.resolve_camera_file(requested)
                        if success:
                            try:
                                with open(info["path"], "rb") as handle:
                                    data = handle.read()
                            except OSError as exc:
                                rospy.logwarn("Failed to read image %s: %s", info["path"], exc)
                                self._send_json(500, {"success": False, "error": "failed to read image"})
                                return
                            mime = info.get("mime", "application/octet-stream")
                            self._set_common_headers(200, mime, len(data))
                            self.wfile.write(data)
                        else:
                            info.setdefault("success", False)
                            status = info.pop("status", 404)
                            self._send_json(status, info)
                    elif path == "/health":
                        self._send_json(200, {"success": True, "status": "ok", "timestamp": datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ")})
                    else:
                        self._send_json(404, {"success": False, "error": "unknown endpoint"})
                except Exception as exc:  # noqa: BLE001
                    rospy.logerr("REST API error on %s: %s", path, exc)
                    self._send_json(500, {"success": False, "error": "internal error"})

        return ApiRequestHandler

    def run(self) -> None:
        address, port = self._server.server_address
        rospy.loginfo("REST interface listening on %s:%d", address, port)
        self._server.serve_forever()

    def shutdown(self) -> None:
        if self._server:
            self._server.shutdown()
            self._server.server_close()

    def goal_endpoint(self) -> str:
        return self._legacy_endpoint


class AutoControlNode:
    """核心控制节点：在巡逻、临时任务与自动回充之间切换。"""
    def __init__(self) -> None:
        config_param = rospy.get_param("~config_file", "")
        if not config_param:
            raise RuntimeError("~config_file parameter is required")
        config_path = os.path.expanduser(os.path.expandvars(config_param))
        if not os.path.isfile(config_path):
            raise RuntimeError(f"config file not found: {config_path}")
        with open(config_path, "r", encoding="utf-8") as stream:
            self._config = yaml.safe_load(stream) or {}
        self._config_path = os.path.abspath(config_path)
        self._sequence_cfg = self._config.get("sequence", {})
        self._loop_sequence = bool(self._sequence_cfg.get("loop", True))
        self._resume_previous_goal = bool(self._sequence_cfg.get("resume_previous_goal", True))
        self._publish_interval = float(self._sequence_cfg.get("publish_interval", 1.0))
        self._idle_wait = float(self._sequence_cfg.get("idle_wait", 5.0))
        self._goal_timeout = float(self._sequence_cfg.get("goal_timeout", 180.0))
        self._goal_interval = float(self._sequence_cfg.get("wait_between_goals", 0.0))
        self._patrol_interval = float(self._sequence_cfg.get("wait_between_patrols", 0.0))
        goal_store_hint = self._sequence_cfg.get("goal_store_path", "")
        goal_store_param = rospy.get_param("~goal_store_path", None)
        if goal_store_param is None:
            store_raw = goal_store_hint or f"{self._config_path}.runtime_goals.yaml"
        else:
            store_raw = goal_store_param or ""
        if store_raw:
            expanded_store = os.path.expanduser(os.path.expandvars(str(store_raw)))
            self._goal_store_path = os.path.abspath(expanded_store)
        else:
            self._goal_store_path = ""
        base_goals = list(_load_goals(self._config))
        runtime_goals = self._load_runtime_goals()
        if runtime_goals is not None:
            self._default_goals = runtime_goals
        else:
            self._default_goals = base_goals
        self._config["goals"] = [_goal_to_config_entry(goal) for goal in self._default_goals]
        self._node_name = rospy.get_name().strip("/") or "dlrobot_autocontrol"

        self._topics = self._config.get("topics", {})
        self._services = self._config.get("services", {})
        self._photo_cfg = self._config.get("photo_capture", {})
        self._charging_cfg = self._config.get("charging", {})

        self._simple_goal_topic = self._topics.get("simple_goal", "/move_base_simple/goal")
        self._use_action_goal = self._simple_goal_topic.endswith("/move_base/goal")
        if self._use_action_goal:
            self._simple_goal_pub = rospy.Publisher(self._simple_goal_topic, MoveBaseActionGoal, queue_size=1)
        else:
            self._simple_goal_pub = rospy.Publisher(self._simple_goal_topic, PoseStamped, queue_size=1)
        self._cmd_vel_pub = rospy.Publisher(self._topics.get("cmd_vel", "/cmd_vel"), Twist, queue_size=10)
        result_topic = self._topics.get("move_base_result", "/move_base/result")
        self._result_sub = rospy.Subscriber(result_topic, MoveBaseActionResult, self._result_callback, queue_size=10)
        voltage_topic = self._topics.get("power_voltage", "/PowerVoltage")
        self._voltage_sub = rospy.Subscriber(voltage_topic, Float32, self._voltage_callback, queue_size=10)
        self._latest_voltage: Optional[float] = None
        self._latest_voltage_stamp = 0.0

        self._photo_service_name = self._services.get("photo_capture", "")
        self._charge_service_name = self._services.get("charge", "")
        self._charge_service_type = str(self._charging_cfg.get("service_type", "trigger")).lower()
        self._charge_request_on = self._charging_cfg.get("request_on", 1)
        self._charge_request_off = self._charging_cfg.get("request_off", 0)
        self._charge_flag_topic = self._charging_cfg.get("flag_topic", "")
        self._charge_flag_on = int(self._charging_cfg.get("flag_on", 1))
        self._charge_flag_off = int(self._charging_cfg.get("flag_off", 0))
        self._charge_flag_repeats = int(self._charging_cfg.get("flag_repeats", 10))  # 状态切换时重复广播次数
        self._manual_charge_inhibit = float(self._charging_cfg.get("manual_inhibit_sec", 60.0))
        self._charge_exit_delay = max(0.0, float(self._charging_cfg.get("exit_delay_sec", 3.0)))
        self._cancel_topic = self._charging_cfg.get("cancel_topic", "")
        self._charge_service_timeout = float(self._charging_cfg.get("service_timeout", 5.0))
        self._photo_service = None
        self._photo_service_ready = False
        self._charge_service = None
        if self._photo_service_name:
            self._photo_service = rospy.ServiceProxy(self._photo_service_name, Trigger)
        if self._charge_service_name:
            if self._charge_service_type == "set_bool" and SetBool is None:
                rospy.logwarn("SetBool service requested but std_srvs/SetBool unavailable; falling back to Trigger")
                self._charge_service_type = "trigger"
            if self._charge_service_type == "spawn" and Spawn is None:
                rospy.logwarn("Spawn service requested but turtlesim.srv.Spawn unavailable; falling back to Trigger")
                self._charge_service_type = "trigger"
            if self._charge_service_type == "trigger":
                self._charge_service = rospy.ServiceProxy(self._charge_service_name, Trigger)
            elif self._charge_service_type == "set_bool":
                self._charge_service = rospy.ServiceProxy(self._charge_service_name, SetBool)
            elif self._charge_service_type == "spawn":
                self._charge_service = rospy.ServiceProxy(self._charge_service_name, Spawn)
            else:
                rospy.logwarn("Unknown charge service type '%s', defaulting to Trigger", self._charge_service_type)
                self._charge_service_type = "trigger"
                self._charge_service = rospy.ServiceProxy(self._charge_service_name, Trigger)

        self._charge_flag_pub = None
        if self._charge_flag_topic:
            self._charge_flag_pub = rospy.Publisher(self._charge_flag_topic, Int8, queue_size=1, latch=True)
        self._charge_flag_last = None

        self._cancel_pub = None
        if self._cancel_topic:
            self._cancel_pub = rospy.Publisher(self._cancel_topic, GoalID, queue_size=1)

        archive_dir = self._photo_cfg.get("archive_directory", "")
        if archive_dir:
            _ensure_directory(archive_dir)

    # 巡逻队列与状态寄存
        self._override_goals: Deque[Goal] = deque()
        self._pending_goal: Optional[Goal] = None
        self._goal_index = 0
        self._active_goal: Optional[Goal] = None
        self._active_goal_sent = rospy.Time(0)
        self._active_goal_deadline = rospy.Time(0)
        self._charging_suspended = False
        self._charging_inhibit_until = 0.0
        self._last_charge_call = 0.0
        self._post_goal_busy = False
        self._charging_release_active = False
        self._goal_seq = 0

        self._lock = threading.RLock()
        self._goal_available = threading.Condition(self._lock)

        # 照片模块：支持原始或压缩图像话题
        self._image_topic = self._photo_cfg.get("image_topic", "")
        self._image_transport = self._photo_cfg.get("image_transport", "compressed").lower()
        self._image_extension = self._photo_cfg.get("image_extension", ".jpg")
        self._photo_directory = self._photo_cfg.get("photo_directory", archive_dir)
        if self._photo_directory:
            _ensure_directory(self._photo_directory)
        min_free_mb = float(self._photo_cfg.get("min_free_space_mb", 0.0))
        target_free_mb = float(self._photo_cfg.get("target_free_space_mb", 0.0))
        if target_free_mb <= 0.0:
            target_free_mb = min_free_mb
        self._photo_min_free_bytes = max(0, int(min_free_mb * 1024 * 1024))
        self._photo_target_free_bytes = max(self._photo_min_free_bytes, int(target_free_mb * 1024 * 1024))
        self._photo_cleanup_batch = max(1, int(self._photo_cfg.get("cleanup_batch_sessions", 3)))
        self._max_image_age = float(self._photo_cfg.get("max_image_age_sec", 0.0))
        self._image_lock = threading.RLock()
        self._latest_image: Optional[Union[Image, CompressedImage]] = None
        self._latest_image_stamp = rospy.Time(0)
        self._bridge = CvBridge() if CvBridge else None
        self._image_sub = None
        if self._image_topic:
            if self._image_transport == "compressed":
                self._image_sub = rospy.Subscriber(self._image_topic, CompressedImage, self._image_callback, queue_size=1)
            else:
                self._image_sub = rospy.Subscriber(self._image_topic, Image, self._image_callback, queue_size=1)
        self._photo_storage_lock = threading.Lock()

        # REST 接口线程：允许外部注入临时目标
        rest_cfg = self._config.get("rest_interface", {})
        rest_host = rest_cfg.get("host", "0.0.0.0")
        rest_port = int(rest_cfg.get("port", 17863))
        rest_endpoint = rest_cfg.get("endpoint", "/goal")
        rest_token = rest_cfg.get("access_token", "")
        rest_timeout = float(rest_cfg.get("request_timeout", 5.0))
        self._override_min_dwell = float(rest_cfg.get("override_wait_after", 60.0))
        self._hold_idle_timeout = max(0.0, float(rest_cfg.get("hold_idle_timeout", 60.0)))
        self._hold_active = False
        self._hold_triggered_recharge = False
        self._hold_last_activity = time.time()
        self._metrics: Dict[str, int] = {
            "override_requests": 0,
            "hold_requests": 0,
            "resume_requests": 0,
            "goals_completed": 0,
            "override_goals_completed": 0,
            "sequence_cycles_completed": 0,
            "auto_recharge_requests": 0,
            "auto_recharge_success": 0,
            "auto_recharge_failures": 0,
            "auto_recharge_stop_requests": 0,
            "auto_recharge_stop_failures": 0,
            "hold_idle_timeouts": 0,
        }
        auto_recharge_cfg = self._config.get("auto_recharge", {})
        start_service_name = str(auto_recharge_cfg.get("start_service", "auto_recharger/start_auto_recharge")).strip()
        self._auto_recharge_service_candidates = self._build_service_candidates(start_service_name)
        self._auto_recharge_service_name = self._auto_recharge_service_candidates[0] if self._auto_recharge_service_candidates else ""
        self._auto_recharge_timeout = float(auto_recharge_cfg.get("service_timeout", 5.0))
        self._auto_recharge_clients: List[Tuple[str, Any]] = []
        if len(self._auto_recharge_service_candidates) > 1:
            rospy.loginfo(
                "Auto recharge start service candidates: %s",
                ", ".join(self._auto_recharge_service_candidates),
            )
        for candidate in self._auto_recharge_service_candidates:
            try:
                client = rospy.ServiceProxy(candidate, Trigger)
            except Exception as exc:  # noqa: BLE001
                rospy.logwarn("Failed to prepare auto recharge service proxy %s: %s", candidate, exc)
                continue
            self._auto_recharge_clients.append((candidate, client))
        stop_service_name = str(auto_recharge_cfg.get("stop_service", "auto_recharger/stop_auto_recharge")).strip()
        self._auto_recharge_stop_service_candidates = self._build_service_candidates(stop_service_name)
        self._auto_recharge_stop_service_name = self._auto_recharge_stop_service_candidates[0] if self._auto_recharge_stop_service_candidates else ""
        self._auto_recharge_stop_timeout = float(auto_recharge_cfg.get("stop_service_timeout", self._auto_recharge_timeout))
        self._auto_recharge_stop_clients: List[Tuple[str, Any]] = []
        if len(self._auto_recharge_stop_service_candidates) > 1:
            rospy.loginfo(
                "Auto recharge stop service candidates: %s",
                ", ".join(self._auto_recharge_stop_service_candidates),
            )
        for candidate in self._auto_recharge_stop_service_candidates:
            try:
                client = rospy.ServiceProxy(candidate, Trigger)
            except Exception as exc:  # noqa: BLE001
                rospy.logwarn("Failed to prepare auto recharge stop service proxy %s: %s", candidate, exc)
                continue
            self._auto_recharge_stop_clients.append((candidate, client))
        self._rest_server = RestApiServer(self, rest_host, rest_port, rest_endpoint, rest_token, rest_timeout)

        self._manager_thread = threading.Thread(target=self._goal_loop, daemon=True)
        self._shutdown = False
        rospy.on_shutdown(self._on_shutdown)
        self._rest_server.start()
        self._manager_thread.start()

        self._publish_charge_flag(False)

    def _on_shutdown(self) -> None:
        with self._lock:
            self._shutdown = True
            self._goal_available.notify_all()
        self._rest_server.shutdown()
        self._cmd_vel_pub.publish(Twist())

    def _bump_metric(self, key: str, delta: int = 1) -> None:
        with self._lock:
            self._metrics[key] = self._metrics.get(key, 0) + delta

    def handle_rest_goal(self, payload: Dict[str, Any], timeout: float) -> Tuple[bool, str]:
        # REST 插队：验证 JSON 并将任务插入到最高优先级队列
        if not isinstance(payload, dict):
            return False, "payload must be json object"
        goal_data = payload.get("goal") or payload
        if not isinstance(goal_data, dict):
            return False, "goal must be json object"
        if "position" not in goal_data:
            return False, "missing position"
        frame_id = goal_data.get("frame_id") or self._config.get("frame_id", "map")
        try:
            orientation = _build_orientation(goal_data.get("orientation", {}), self._config.get("fallback_orientation", {"yaw": 0.0}))
            position = _normalize_position(goal_data.get("position", {}))
            wait_before = _to_float(goal_data.get("wait_before", 0.0), "wait_before", 0.0)
            wait_after = _to_float(goal_data.get("wait_after", 0.0), "wait_after", 0.0)
        except ValueError as exc:
            return False, f"invalid goal data: {exc}"
        wait_after = max(wait_after, self._override_min_dwell)
        name = goal_data.get("name") or f"override_{int(time.time())}"
        override = Goal(name=name, frame_id=frame_id, position=position, orientation=orientation, wait_before=wait_before, wait_after=wait_after, source="override")
        rospy.loginfo("REST override accepted: %s (frame %s)", override.name, override.frame_id)
        self._bump_metric("override_requests")
        with self._goal_available:
            now_ts = time.time()
            self._hold_last_activity = now_ts
            if self._hold_active:
                rospy.loginfo("Override %s requested; releasing hold state", override.name)
                self._hold_active = False
                self._hold_triggered_recharge = False
            active_goal = self._active_goal
            self._override_goals.appendleft(override)
            if active_goal and active_goal.source == "sequence" and self._resume_previous_goal:
                self._pending_goal = active_goal
            self._active_goal = None
            self._active_goal_deadline = rospy.Time(0)
            self._post_goal_busy = False
            self._goal_available.notify_all()
        if self._request_charge_release(reason=f"override:{override.name}", manual=True):
            rospy.loginfo("Override %s requested; charging release triggered", override.name)
        if active_goal and self._cancel_pub:
            self._cancel_pub.publish(GoalID())
            rospy.loginfo("REST override %s cancelling active goal %s", override.name, active_goal.name)
        elif active_goal and not self._cancel_pub:
            rospy.logwarn("Override goal %s requested but cancel publisher unavailable", override.name)
        return True, "accepted"

    def cancel_navigation(self) -> Tuple[bool, str, int]:
        if not self._cancel_pub:
            return False, "cancel publisher unavailable", 503
        rospy.loginfo("REST cancel navigation requested")
        with self._goal_available:
            active = self._active_goal
            self._active_goal = None
            self._active_goal_deadline = rospy.Time(0)
            self._post_goal_busy = False
            self._goal_available.notify_all()
        self._cancel_pub.publish(GoalID())
        if active:
            rospy.loginfo("Navigation goal %s cancelled via REST", active.name)
            return True, f"cancelled {active.name}", 200
        return True, "no active goal, cancel broadcast", 200

    def hold_position(self, payload: Optional[Dict[str, Any]]) -> Tuple[bool, str, int]:
        idle_timeout = self._hold_idle_timeout
        requested_timeout = None
        if isinstance(payload, dict):
            requested_timeout = payload.get("idle_timeout")
        if requested_timeout is not None:
            try:
                idle_timeout = max(0.0, float(requested_timeout))
            except (TypeError, ValueError):
                return False, "invalid idle_timeout", 400
        with self._goal_available:
            now_ts = time.time()
            self._hold_idle_timeout = idle_timeout
            self._hold_active = True
            self._hold_triggered_recharge = False
            self._hold_last_activity = now_ts
            active_goal = self._active_goal
            if active_goal and active_goal.source == "sequence" and self._resume_previous_goal:
                self._pending_goal = active_goal
            else:
                self._pending_goal = None
            self._active_goal = None
            self._active_goal_deadline = rospy.Time(0)
            self._active_goal_sent = rospy.Time(0)
            self._post_goal_busy = False
            self._override_goals.clear()
            self._goal_available.notify_all()
        rospy.loginfo("Navigation hold engaged (idle timeout %.1fs)", idle_timeout)
        self._bump_metric("hold_requests")
        if self._cancel_pub:
            self._cancel_pub.publish(GoalID())
        self._cmd_vel_pub.publish(Twist())
        return True, f"hold engaged, idle timeout {idle_timeout:.1f}s", 200

    def resume_schedule(self, payload: Optional[Dict[str, Any]]) -> Tuple[bool, str, int]:
        clear_overrides = False
        trigger_recharge = False
        stop_charging = False
        charging_was_suspended = False
        if isinstance(payload, dict):
            clear_overrides = bool(payload.get("clear_overrides", False))
            trigger_recharge = bool(payload.get("trigger_auto_recharge", False))
            stop_charging = bool(payload.get("stop_auto_recharge", False))
        with self._goal_available:
            was_hold = self._hold_active or self._hold_triggered_recharge
            if clear_overrides:
                self._override_goals.clear()
            self._hold_active = False
            self._hold_triggered_recharge = False
            self._hold_last_activity = time.time()
            charging_was_suspended = self._charging_suspended
            self._goal_available.notify_all()
        self._bump_metric("resume_requests")
        rospy.loginfo(
            "Resume requested (clear_overrides=%s, trigger_auto_recharge=%s, was_hold=%s)",
            clear_overrides,
            trigger_recharge,
            was_hold,
        )
        if stop_charging:
            rospy.loginfo("Resume request includes stop_auto_recharge flag")
            released = self._request_charge_release(reason="resume_stop", manual=True, force=True)
            if released:
                rospy.loginfo("Stop auto recharge executed for resume request")
        elif charging_was_suspended and not trigger_recharge:
            rospy.loginfo("Charging suspension cleared due to resume request")
            self._request_charge_release(reason="resume_release", manual=True)
        if trigger_recharge:
            self._trigger_auto_recharge()
        if was_hold:
            return True, "resume acknowledged", 200
        return True, "no hold active", 200

    def _goal_to_dict(self, goal: Optional[Goal]) -> Optional[Dict[str, Any]]:
        if not goal:
            return None
        return {
            "name": goal.name,
            "frame_id": goal.frame_id,
            "position": goal.position,
            "orientation": goal.orientation,
            "wait_before": goal.wait_before,
            "wait_after": goal.wait_after,
            "source": goal.source,
        }

    def _serialized_default_goals(self) -> List[Dict[str, Any]]:
        return [_goal_to_config_entry(goal) for goal in self._default_goals]

    def _persist_default_goals_locked(self) -> None:
        serialized = self._serialized_default_goals()
        self._config["goals"] = serialized
        if not self._goal_store_path:
            return
        directory = os.path.dirname(self._goal_store_path)
        if directory and not os.path.isdir(directory):
            os.makedirs(directory, exist_ok=True)
        payload = {
            "frame_id": self._config.get("frame_id", "map"),
            "fallback_orientation": self._config.get("fallback_orientation", {"yaw": 0.0}),
            "goals": serialized,
        }
        tmp_path = f"{self._goal_store_path}.tmp"
        with open(tmp_path, "w", encoding="utf-8") as handle:
            try:
                yaml.safe_dump(payload, handle, allow_unicode=False, sort_keys=False)
            except TypeError:
                yaml.safe_dump(payload, handle, allow_unicode=False)
        os.replace(tmp_path, self._goal_store_path)

    def _load_runtime_goals(self) -> Optional[List[Goal]]:
        if not self._goal_store_path or not os.path.isfile(self._goal_store_path):
            return None
        try:
            with open(self._goal_store_path, "r", encoding="utf-8") as handle:
                data = yaml.safe_load(handle) or {}
        except FileNotFoundError:
            return None
        except (OSError, yaml.YAMLError) as exc:
            rospy.logwarn("Failed to load runtime goals from %s: %s", self._goal_store_path, exc)
            return None
        overlay_cfg = {
            "frame_id": data.get("frame_id", self._config.get("frame_id", "map")),
            "fallback_orientation": data.get("fallback_orientation", self._config.get("fallback_orientation", {"yaw": 0.0})),
            "goals": data.get("goals", []),
        }
        runtime_goals = list(_load_goals(overlay_cfg))
        rospy.loginfo("Loaded %d runtime default goals from %s", len(runtime_goals), self._goal_store_path)
        return runtime_goals

    def _unique_goal_name(self, proposed: Optional[str], existing: Optional[Set[str]] = None) -> str:
        candidate_pool = existing if existing is not None else {goal.name for goal in self._default_goals}
        base = _sanitize_segment(proposed, "waypoint") if proposed else "waypoint"
        candidate = base
        suffix = 1
        while candidate in candidate_pool:
            candidate = f"{base}_{suffix:02d}"
            suffix += 1
        return candidate

    def _build_sequence_goal(self, data: Dict[str, Any]) -> Goal:
        if not isinstance(data, dict):
            raise ValueError("goal must be json object")
        frame_id = data.get("frame_id") or self._config.get("frame_id", "map")
        if "position" not in data:
            raise ValueError("missing position")
        try:
            orientation = _build_orientation(data.get("orientation", {}), self._config.get("fallback_orientation", {"yaw": 0.0}))
            position = _normalize_position(data.get("position", {}))
            wait_before = max(0.0, _to_float(data.get("wait_before", 0.0), "wait_before", 0.0))
            wait_after = max(0.0, _to_float(data.get("wait_after", 0.0), "wait_after", 0.0))
        except ValueError as exc:
            raise ValueError(f"invalid goal data: {exc}") from exc
        name = data.get("name")
        if not name:
            raise ValueError("goal name missing")
        return Goal(name=name, frame_id=frame_id, position=position, orientation=orientation, wait_before=wait_before, wait_after=wait_after, source="sequence")

    def default_goals_snapshot(self) -> Dict[str, Any]:
        with self._goal_available:
            goals = [self._goal_to_dict(goal) for goal in self._default_goals]
            snapshot = {
                "frame_id": self._config.get("frame_id", "map"),
                "loop": self._loop_sequence,
                "resume_previous_goal": self._resume_previous_goal,
                "wait_between_goals": self._goal_interval,
                "wait_between_patrols": self._patrol_interval,
                "count": len(goals),
                "goals": goals,
                "goal_store_path": self._goal_store_path,
            }
        return snapshot

    def update_default_goals(self, payload: Dict[str, Any]) -> Tuple[bool, Dict[str, Any], int]:
        if not isinstance(payload, dict):
            return False, {"error": "payload must be json object"}, 400
        if "goals" in payload:
            return self._replace_default_goals(payload.get("goals"), payload)
        return self._append_default_goal(payload)

    def _append_default_goal(self, payload: Dict[str, Any]) -> Tuple[bool, Dict[str, Any], int]:
        goal_data = payload.get("goal") or payload
        if not isinstance(goal_data, dict):
            return False, {"error": "goal must be json object"}, 400
        index_hint = payload.get("insert_index", payload.get("index"))
        if index_hint is not None:
            try:
                insert_index = int(index_hint)
            except (TypeError, ValueError):
                return False, {"error": "insert_index must be integer"}, 400
            insert_index = max(0, min(insert_index, len(self._default_goals)))
        else:
            insert_index = len(self._default_goals)
        activate_raw = payload.get("activate")
        restart_raw = payload.get("restart")
        activate_flag = _to_bool(activate_raw) if activate_raw is not None else True
        restart_flag = _to_bool(restart_raw)
        trigger_activate = activate_flag or restart_flag
        cancel_active = False
        with self._goal_available:
            existing_names: Set[str] = {goal.name for goal in self._default_goals}
            goal_name = self._unique_goal_name(goal_data.get("name"), existing_names)
            goal_payload = dict(goal_data)
            goal_payload["name"] = goal_name
            try:
                new_goal = self._build_sequence_goal(goal_payload)
            except ValueError as exc:
                return False, {"error": str(exc)}, 400
            shift_pointer = insert_index <= self._goal_index
            self._default_goals.insert(insert_index, new_goal)
            if trigger_activate:
                self._goal_index = insert_index
                self._pending_goal = None
                self._post_goal_busy = False
                self._active_goal_deadline = rospy.Time(0)
                if self._active_goal and self._active_goal.source == "sequence":
                    if self._cancel_pub:
                        cancel_active = True
                        self._active_goal = None
                    else:
                        rospy.logwarn(
                            "Activate request for %s but cancel publisher unavailable; waiting for current goal to finish",
                            goal_name,
                        )
                self._goal_available.notify_all()
            elif shift_pointer:
                self._goal_index += 1
            try:
                self._persist_default_goals_locked()
            except OSError as exc:
                self._default_goals.pop(insert_index)
                return False, {"error": f"failed to persist goals: {exc}"}, 500
            self._goal_available.notify_all()
        if cancel_active and self._cancel_pub:
            self._cancel_pub.publish(GoalID())
            self._cmd_vel_pub.publish(Twist())
        rospy.loginfo(
            "Default goal %s inserted at %d (activate=%s, restart=%s)",
            goal_name,
            insert_index,
            trigger_activate,
            restart_flag,
        )
        response = {
            "goal": self._goal_to_dict(new_goal),
            "index": insert_index,
            "count": len(self._default_goals),
            "activated": trigger_activate,
        }
        return True, response, 200

    def _replace_default_goals(self, entries: Any, options: Dict[str, Any]) -> Tuple[bool, Dict[str, Any], int]:
        if not isinstance(entries, list):
            return False, {"error": "goals must be array"}, 400
        new_goals: List[Goal] = []
        used_names: Set[str] = set()
        for idx, entry in enumerate(entries):
            if not isinstance(entry, dict):
                return False, {"error": f"goal[{idx}] must be json object"}, 400
            goal_payload = dict(entry)
            goal_payload["name"] = self._unique_goal_name(goal_payload.get("name"), used_names)
            try:
                goal = self._build_sequence_goal(goal_payload)
            except ValueError as exc:
                return False, {"error": f"goal[{idx}] invalid: {exc}"}, 400
            new_goals.append(goal)
            used_names.add(goal.name)
        restart = bool(options.get("restart", False))
        cancel_active = False
        with self._goal_available:
            if restart and self._active_goal and self._active_goal.source == "sequence":
                if self._cancel_pub:
                    cancel_active = True
                    self._active_goal = None
                    self._active_goal_deadline = rospy.Time(0)
                    self._post_goal_busy = False
                else:
                    rospy.logwarn("Restart requested but cancel publisher unavailable; waiting for current goal to finish")
            self._default_goals = new_goals
            self._goal_index = 0
            self._pending_goal = None
            try:
                self._persist_default_goals_locked()
            except OSError as exc:
                return False, {"error": f"failed to persist goals: {exc}"}, 500
            self._goal_available.notify_all()
        if cancel_active and self._cancel_pub:
            self._cancel_pub.publish(GoalID())
            self._cmd_vel_pub.publish(Twist())
        rospy.loginfo("Default goal list replaced with %d entries (restart=%s)", len(new_goals), restart)
        response = {
            "count": len(new_goals),
            "goals": [self._goal_to_dict(goal) for goal in new_goals],
        }
        return True, response, 200

    def status_snapshot(self) -> Dict[str, Any]:
        with self._goal_available:
            active = self._goal_to_dict(self._active_goal)
            pending = self._goal_to_dict(self._pending_goal)
            overrides = [self._goal_to_dict(goal) for goal in list(self._override_goals)[:5]]
            override_count = len(self._override_goals)
            default_goal_count = len(self._default_goals)
            charging = self._charging_suspended
            last_sent = self._active_goal_sent.to_sec()
            deadline = self._active_goal_deadline.to_sec()
            latest_voltage = self._latest_voltage
            voltage_stamp = self._latest_voltage_stamp
            hold_active = self._hold_active
            hold_triggered = self._hold_triggered_recharge
            hold_idle_timeout = self._hold_idle_timeout
            hold_last_activity = self._hold_last_activity
            metrics = dict(self._metrics)
        last_sent_iso = None
        if last_sent:
            try:
                last_sent_iso = datetime.utcfromtimestamp(last_sent).strftime("%Y-%m-%dT%H:%M:%SZ")
            except (OverflowError, OSError, ValueError):
                last_sent_iso = None
        deadline_iso = None
        if deadline:
            try:
                deadline_iso = datetime.utcfromtimestamp(deadline).strftime("%Y-%m-%dT%H:%M:%SZ")
            except (OverflowError, OSError, ValueError):
                deadline_iso = None
        voltage_iso = None
        if voltage_stamp:
            try:
                voltage_iso = datetime.utcfromtimestamp(voltage_stamp).strftime("%Y-%m-%dT%H:%M:%SZ")
            except (OverflowError, OSError, ValueError):
                voltage_iso = None
        hold_activity_iso = None
        hold_idle_elapsed = None
        hold_idle_remaining = None
        if hold_last_activity:
            try:
                hold_activity_iso = datetime.utcfromtimestamp(hold_last_activity).strftime("%Y-%m-%dT%H:%M:%SZ")
            except (OverflowError, OSError, ValueError):
                hold_activity_iso = None
        if hold_idle_timeout > 0.0:
            elapsed = max(0.0, time.time() - hold_last_activity)
            hold_idle_elapsed = elapsed
            hold_idle_remaining = max(0.0, hold_idle_timeout - elapsed)
        snapshot: Dict[str, Any] = {
            "node": self._node_name,
            "active_goal": active,
            "pending_goal": pending,
            "override_queue": overrides,
            "override_count": override_count,
            "charging_suspended": charging,
            "last_goal_sent": last_sent_iso,
            "goal_deadline": deadline_iso,
            "sequence_loop": self._loop_sequence,
            "resume_previous_goal": self._resume_previous_goal,
            "photo_directory": self._photo_directory,
            "image_topic": self._image_topic,
            "latest_voltage": latest_voltage,
            "latest_voltage_timestamp": voltage_iso,
            "override_wait_after_sec": self._override_min_dwell,
            "goal_interval_sec": self._goal_interval,
            "patrol_interval_sec": self._patrol_interval,
            "hold_active": hold_active,
            "hold_triggered_recharge": hold_triggered,
            "hold_idle_timeout_sec": hold_idle_timeout,
            "hold_last_activity": hold_activity_iso,
            "hold_idle_elapsed_sec": hold_idle_elapsed,
            "hold_idle_remaining_sec": hold_idle_remaining,
            "metrics": metrics,
            "auto_recharge_service": self._auto_recharge_service_name,
            "auto_recharge_service_candidates": list(self._auto_recharge_service_candidates),
            "default_goal_count": default_goal_count,
            "goal_store_path": self._goal_store_path,
        }
        return snapshot

    def map_info(self) -> Dict[str, Any]:
        with self._lock:
            hold_timeout = self._hold_idle_timeout
            hold_active = self._hold_active
            metrics = dict(self._metrics)
        return {
            "frame_id": self._config.get("frame_id", "map"),
            "goal_count": len(self._default_goals),
            "loop": self._loop_sequence,
            "photo_directory": self._photo_directory,
            "image_topic": self._image_topic,
            "rest_endpoint": self._rest_server.goal_endpoint() if self._rest_server else "/api/navigation/goal",
            "auto_recharge_service": self._auto_recharge_service_name,
            "auto_recharge_service_candidates": list(self._auto_recharge_service_candidates),
            "patrol_interval_sec": self._patrol_interval,
            "hold_idle_timeout_sec": hold_timeout,
            "hold_active": hold_active,
            "metrics": metrics,
            "goal_store_path": self._goal_store_path,
        }

    def _build_service_candidates(self, raw_name: str) -> List[str]:
        if not raw_name:
            return []
        resolved = rospy.resolve_name(raw_name)
        candidates: List[str] = []
        if resolved:
            candidates.append(resolved)
        if not raw_name.startswith("/") and not raw_name.startswith("~"):
            global_name = "/" + raw_name.lstrip("/")
            if global_name and global_name not in candidates:
                candidates.append(global_name)
        unique: List[str] = []
        seen: Set[str] = set()
        for name in candidates:
            if name and name not in seen:
                unique.append(name)
                seen.add(name)
        return unique

    def _allowed_photo_root(self) -> Optional[str]:
        if not self._photo_directory:
            return None
        return os.path.abspath(os.path.expanduser(self._photo_directory))

    def capture_manual_photo(self, payload: Optional[Dict[str, Any]]) -> Tuple[bool, Dict[str, Any]]:
        if not isinstance(payload, dict):
            payload = {}
        if not self._photo_directory:
            return False, {"error": "photo directory not configured"}
        now = datetime.utcnow()
        session_default = now.strftime("%Y%m%dT%H%M%SZ")
        timestamp_iso = now.strftime("%Y-%m-%dT%H:%M:%SZ")
        label = payload.get("label") or payload.get("name") or "manual"
        safe_label = _sanitize_segment(label, "manual")
        session_hint = payload.get("session")
        safe_session = _sanitize_segment(session_hint, session_default) if session_hint else session_default
        session_tag = f"{safe_session}_manual"
        synthetic_goal = Goal(
            name=safe_label,
            frame_id=self._config.get("frame_id", "map"),
            position={"x": 0.0, "y": 0.0, "z": 0.0},
            orientation={"x": 0.0, "y": 0.0, "z": 0.0, "w": 1.0},
            wait_before=0.0,
            wait_after=0.0,
            source="manual_capture",
        )
        captured_path = self._capture_photo(synthetic_goal, 0, session_tag)
        if not captured_path:
            rospy.logwarn("Manual capture %s failed", safe_label)
            return False, {"error": "manual capture failed"}
        base = self._allowed_photo_root()
        response: Dict[str, Any] = {
            "message": "captured",
            "path": captured_path,
            "label": safe_label,
            "session": session_tag,
            "timestamp": timestamp_iso,
        }
        if base and captured_path.startswith(base):
            response["relative_path"] = os.path.relpath(captured_path, base)
        rospy.loginfo("Manual capture stored at %s", captured_path)
        return True, response

    def list_camera_images(self, requested_path: Optional[str]) -> Tuple[bool, Dict[str, Any]]:
        base = self._allowed_photo_root()
        if not base:
            return False, {"error": "photo directory not configured"}
        target = base
        warning = None
        if requested_path:
            expanded = os.path.expanduser(requested_path)
            candidate = expanded if os.path.isabs(expanded) else os.path.join(base, expanded)
            candidate = os.path.abspath(candidate)
            if candidate.startswith(base):
                target = candidate
            else:
                warning = f"requested path {requested_path} outside allowed directory"
        if not os.path.isdir(target):
            return False, {"error": f"path not found: {target}", "path": target}
        supported = {".jpg", ".jpeg", ".png", ".bmp"}
        limit = max(1, int(self._photo_cfg.get("api_max_images", 200)))
        collected: List[Tuple[float, str, str, int]] = []
        try:
            for root, _, files in os.walk(target):
                for filename in files:
                    extension = os.path.splitext(filename)[1].lower()
                    if extension not in supported:
                        continue
                    file_path = os.path.join(root, filename)
                    try:
                        stat_info = os.stat(file_path)
                    except OSError:
                        continue
                    collected.append((stat_info.st_mtime, file_path, filename, stat_info.st_size))
        except OSError as exc:
            return False, {"error": f"failed to list images: {exc}"}
        collected.sort(key=lambda item: item[0], reverse=True)
        total = len(collected)
        payload_images: List[Dict[str, Any]] = []
        for mtime, file_path, filename, size in collected[:limit]:
            payload_images.append(
                {
                    "name": filename,
                    "path": file_path,
                    "relative_path": os.path.relpath(file_path, base),
                    "timestamp": datetime.utcfromtimestamp(mtime).strftime("%Y-%m-%dT%H:%M:%SZ"),
                    "size": size,
                }
            )
        response: Dict[str, Any] = {
            "images": payload_images,
            "total": total,
            "returned": len(payload_images),
            "root": base,
            "path": target,
        }
        if warning:
            response["warning"] = warning
        return True, response

    def resolve_camera_file(self, requested: Optional[str]) -> Tuple[bool, Dict[str, Any]]:
        base = self._allowed_photo_root()
        if not base:
            return False, {"error": "photo directory not configured", "status": 404}
        if not requested:
            return False, {"error": "missing image path", "status": 400}
        expanded = os.path.expanduser(requested)
        candidate = expanded if os.path.isabs(expanded) else os.path.join(base, expanded)
        candidate = os.path.abspath(candidate)
        if not candidate.startswith(base):
            return False, {"error": "path outside allowed directory", "status": 403}
        if not os.path.isfile(candidate):
            return False, {"error": "file not found", "status": 404}
        mime = mimetypes.guess_type(candidate)[0] or "application/octet-stream"
        return True, {"path": candidate, "mime": mime}

    def _goal_loop(self) -> None:
        # 核心循环：监督巡逻任务、临时点与充电状态之间的优先级
        rate = rospy.Rate(max(1.0, 1.0 / max(self._publish_interval, 0.1)))
        while not rospy.is_shutdown():
            goal: Optional[Goal] = None
            trigger_recharge = False
            with self._goal_available:
                if self._shutdown:
                    return
                now_ts = time.time()
                if self._hold_active:
                    if self._override_goals:
                        rospy.loginfo("Hold released due to pending override request")
                        self._hold_active = False
                        self._hold_triggered_recharge = False
                        self._hold_last_activity = now_ts
                    else:
                        if not self._hold_triggered_recharge and self._hold_idle_timeout > 0.0 and now_ts - self._hold_last_activity >= self._hold_idle_timeout:
                            rospy.loginfo("Hold idle timeout %.1fs exceeded; triggering auto recharge", self._hold_idle_timeout)
                            self._hold_triggered_recharge = True
                            self._hold_last_activity = now_ts
                            self._bump_metric("hold_idle_timeouts")
                            trigger_recharge = True
                        if self._hold_active and not trigger_recharge:
                            self._goal_available.wait(timeout=self._idle_wait)
                            continue
                if not trigger_recharge:
                    if self._charging_suspended and not self._active_goal:
                        self._goal_available.wait(timeout=self._idle_wait)
                        continue
                    now = rospy.Time.now()
                    if self._active_goal:
                        if self._active_goal_deadline and now > self._active_goal_deadline:
                            rospy.logwarn("Goal %s timed out, resending", self._active_goal.name)
                            goal = self._active_goal
                            self._active_goal = None
                            self._active_goal_deadline = rospy.Time(0)
                        else:
                            self._goal_available.wait(timeout=self._publish_interval)
                            continue
                    if self._charging_suspended and not self._override_goals:
                        self._goal_available.wait(timeout=self._idle_wait)
                        continue
                    if self._post_goal_busy:
                        self._goal_available.wait(timeout=self._idle_wait)
                        continue
                    if not goal:
                        goal = self._pick_next_goal_locked()
                    if not goal:
                        self._goal_available.wait(timeout=self._idle_wait)
                        continue
                    self._active_goal = goal
            if trigger_recharge:
                self._trigger_auto_recharge()
                rate.sleep()
                continue
            if goal:
                self._dispatch_goal(goal)
            rate.sleep()

    def _pick_next_goal_locked(self) -> Optional[Goal]:
        if self._override_goals:
            return self._override_goals.popleft()
        if self._pending_goal:
            goal = self._pending_goal
            self._pending_goal = None
            return goal
        if self._goal_index < len(self._default_goals):
            goal = self._default_goals[self._goal_index]
            self._goal_index += 1
            return goal
        if self._loop_sequence and self._default_goals:
            self._goal_index = 1 if self._default_goals else 0
            return self._default_goals[0]
        return None

    def _dispatch_goal(self, goal: Goal) -> None:
        rospy.loginfo("Dispatching goal %s (%s)", goal.name, goal.source)
        with self._goal_available:
            manual_release = self._charging_suspended or self._charge_flag_last == self._charge_flag_on
        force_release = not manual_release
        if self._request_charge_release(reason=f"dispatch:{goal.name}", manual=manual_release, force=force_release):
            rospy.loginfo("Goal %s triggered charge release before dispatch", goal.name)
            with self._goal_available:
                # 确保停充流程彻底完成，再继续派发导航
                while self._charging_release_active and not rospy.is_shutdown():
                    self._goal_available.wait(timeout=0.1)
        if goal.wait_before > 0.0:
            self._timed_sleep(goal.wait_before)
        msg = goal.pose_stamped()
        msg.header.stamp = rospy.Time.now()
        if self._use_action_goal:
            action_msg = MoveBaseActionGoal()
            action_msg.header.stamp = msg.header.stamp
            action_msg.header.frame_id = msg.header.frame_id
            action_msg.goal.target_pose = msg
            action_msg.goal_id.stamp = rospy.Time.now()
            action_msg.goal_id.id = f"{self._node_name}_{self._goal_seq}"
            self._goal_seq += 1
            self._simple_goal_pub.publish(action_msg)
        else:
            self._simple_goal_pub.publish(msg)
        with self._goal_available:
            self._active_goal_sent = rospy.Time.now()
            if self._goal_timeout > 0.0:
                deadline = self._active_goal_sent + rospy.Duration.from_sec(self._goal_timeout)
                self._active_goal_deadline = deadline
            else:
                self._active_goal_deadline = rospy.Time(0)
            if not self._hold_active:
                self._hold_last_activity = time.time()

    def _timed_sleep(self, duration: float) -> None:
        end_time = time.time() + duration
        while time.time() < end_time and not rospy.is_shutdown():
            time.sleep(min(0.1, end_time - time.time()))

    def _result_callback(self, msg: MoveBaseActionResult) -> None:
        status = msg.status.status
        with self._goal_available:
            if not self._active_goal:
                return
            goal = self._active_goal
            if status == GoalStatus.SUCCEEDED:
                rospy.loginfo("Goal %s reached", goal.name)
                self._active_goal = None
                self._active_goal_deadline = rospy.Time(0)
                self._post_goal_busy = True
                self._goal_available.notify_all()
            else:
                rospy.logwarn("Goal %s failed with status %d", goal.name, status)
                self._active_goal = None
                self._active_goal_deadline = rospy.Time(0)
                if goal.source == "sequence":
                    self._pending_goal = goal
                else:
                    self._override_goals.append(goal)
                self._goal_available.notify_all()
        if status == GoalStatus.SUCCEEDED:
            self._handle_success(goal)

    def _handle_success(self, goal: Goal) -> None:
        try:
            wait_after = max(goal.wait_after, 0.0)
            if wait_after:
                self._timed_sleep(wait_after)
            captured_files = self._rotate_and_capture(goal)
            self._archive_goal(goal, captured_files)
            self._bump_metric("goals_completed")
            sequence_complete = (
                goal.source == "sequence"
                and self._default_goals
                and self._goal_index >= len(self._default_goals)
            )
            if goal.source == "override":
                self._bump_metric("override_goals_completed")
                rospy.loginfo("Override goal %s complete; triggering auto recharge", goal.name)
                self._trigger_auto_recharge()
            elif sequence_complete:
                self._bump_metric("sequence_cycles_completed")
                rospy.loginfo("Sequence cycle complete after goal %s; triggering auto recharge", goal.name)
                self._trigger_auto_recharge()
            if sequence_complete:
                if self._patrol_interval > 0.0:
                    self._timed_sleep(self._patrol_interval)
            elif self._goal_interval > 0.0:
                self._timed_sleep(self._goal_interval)
        finally:
            with self._goal_available:
                self._post_goal_busy = False
                self._goal_available.notify_all()

    def _rotate_and_capture(self, goal: Goal) -> List[str]:
        # 拍照流程：按配置完成旋转、延时与多张快照
        rotation_speed = float(self._photo_cfg.get("rotation_speed", 0.0))
        rotation_duration = float(self._photo_cfg.get("rotation_duration", 0.0))
        snapshots = int(self._photo_cfg.get("snapshots", 0))
        interval = float(self._photo_cfg.get("snapshot_interval", 1.0))
        wait_before = float(self._photo_cfg.get("wait_before_rotation", 0.0))
        wait_after = float(self._photo_cfg.get("wait_after_rotation", 0.0))
        captured_paths: List[str] = []
        if wait_before > 0.0:
            self._timed_sleep(wait_before)
        rotation_active = rotation_duration > 0.0 and abs(rotation_speed) > 0.0
        captures_during_rotation = rotation_active and snapshots > 0
        captured_count = 0
        session_stamp = datetime.utcnow().strftime("%Y%m%dT%H%M%SZ")
        if rotation_active:
            rate = rospy.Rate(20)
            twist = Twist()
            twist.angular.z = rotation_speed
            start_time = time.time()
            end_time = start_time + rotation_duration
            next_capture_time = start_time
            if captures_during_rotation:
                if interval > 0.0:
                    capture_spacing = interval
                else:
                    capture_spacing = rotation_duration / max(snapshots, 1)
                next_capture_time = start_time
            else:
                capture_spacing = 0.0
            while time.time() < end_time and not rospy.is_shutdown():
                now = time.time()
                self._cmd_vel_pub.publish(twist)
                if captures_during_rotation and captured_count < snapshots and now >= next_capture_time:
                    saved = self._capture_photo(goal, captured_count, session_stamp)
                    if saved:
                        captured_paths.append(saved)
                    captured_count += 1
                    next_capture_time = now + capture_spacing if interval > 0.0 else start_time + capture_spacing * captured_count
                rate.sleep()
            self._cmd_vel_pub.publish(Twist())
        if wait_after > 0.0:
            self._timed_sleep(wait_after)
        if snapshots > 0:
            while captured_count < snapshots:
                saved = self._capture_photo(goal, captured_count, session_stamp)
                if saved:
                    captured_paths.append(saved)
                captured_count += 1
                if captured_count < snapshots and interval > 0.0:
                    self._timed_sleep(interval)
        return captured_paths

    def _capture_photo(self, goal: Goal, sequence_id: int, session_stamp: Optional[str] = None) -> Optional[str]:
        request = TriggerRequest()
        timeout = float(self._photo_cfg.get("service_timeout", 5.0))
        captured_path: Optional[str] = None
        if not session_stamp:
            session_stamp = datetime.utcnow().strftime("%Y%m%dT%H%M%SZ")
        if self._photo_service:
            try:
                if timeout > 0.0 and not self._photo_service_ready:
                    self._photo_service.wait_for_service(timeout=timeout)
                    self._photo_service_ready = True
                if self._photo_service_ready:
                    response = self._photo_service(request)
                    rospy.loginfo("Photo capture %s[%d]: %s", goal.name, sequence_id, response.message)
            except rospy.ROSException as exc:
                rospy.logwarn("Photo capture service %s unavailable: %s, disable service calls", self._photo_service_name, exc)
                self._photo_service = None
                self._photo_service_ready = False
            except rospy.ServiceException as exc:
                rospy.logwarn("Photo capture failed: %s", exc)
        if self._image_topic:
            captured_path = self._save_latest_image(goal, sequence_id, session_stamp)
        return captured_path

    def _archive_goal(self, goal: Goal, photos: Optional[List[str]] = None) -> None:
        archive_dir = self._photo_cfg.get("archive_directory", "")
        if not archive_dir:
            return
        timestamp = datetime.utcnow().strftime("%Y%m%dT%H%M%SZ")
        extension = self._photo_cfg.get("log_extension", ".json")
        extension = extension if extension.startswith(".") else f".{extension}"
        safe_name = goal.name.replace("/", "_")
        file_path = os.path.join(archive_dir, f"{timestamp}_{safe_name}{extension}")
        payload = {
            "timestamp": timestamp,
            "goal": goal.name,
            "source": goal.source,
            "frame_id": goal.frame_id,
            "position": goal.position,
            "orientation": goal.orientation,
            "photos": photos or [],
        }
        try:
            with open(file_path, "w", encoding="utf-8") as handle:
                json.dump(payload, handle, indent=2)
        except OSError as exc:
            rospy.logwarn("Failed to archive goal data: %s", exc)

    def _trigger_auto_recharge(self) -> None:
        if not self._auto_recharge_clients:
            rospy.logdebug("Auto recharge service not configured; skip trigger")
            return
        timeout = float(self._auto_recharge_timeout)
        self._bump_metric("auto_recharge_requests")
        with self._goal_available:
            self._charging_inhibit_until = 0.0
        errors: List[str] = []
        for service_name, client in self._auto_recharge_clients:
            try:
                if timeout > 0.0:
                    client.wait_for_service(timeout=timeout)
                else:
                    client.wait_for_service()
            except rospy.ROSException as exc:
                errors.append(f"{service_name}: wait failed ({exc})")
                continue
            rospy.loginfo("Calling auto recharge service %s", service_name)
            try:
                response = client(TriggerRequest())
            except rospy.ServiceException as exc:
                errors.append(f"{service_name}: call failed ({exc})")
                continue
            if getattr(response, "success", False):
                rospy.loginfo("Auto recharge triggered via %s: %s", service_name, getattr(response, "message", "ok"))
                self._bump_metric("auto_recharge_success")
                return
            errors.append(f"{service_name}: returned failure ({getattr(response, 'message', '')})")
        self._bump_metric("auto_recharge_failures")
        if errors:
            rospy.logwarn("Auto recharge trigger failed: %s", "; ".join(errors))
        else:
            rospy.logwarn("Auto recharge trigger failed: no providers available")

    def _stop_auto_recharge(self, reason: str) -> None:
        if not self._auto_recharge_stop_clients:
            rospy.logdebug("Auto recharge stop service not configured; skip stop (%s)", reason)
            return
        timeout = float(self._auto_recharge_stop_timeout)
        self._bump_metric("auto_recharge_stop_requests")
        errors: List[str] = []
        for service_name, client in self._auto_recharge_stop_clients:
            try:
                if timeout > 0.0:
                    client.wait_for_service(timeout=timeout)
                else:
                    client.wait_for_service()
            except rospy.ROSException as exc:
                errors.append(f"{service_name}: wait failed ({exc})")
                continue
            rospy.loginfo("Calling auto recharge stop service %s (%s)", service_name, reason)
            try:
                response = client(TriggerRequest())
            except rospy.ServiceException as exc:
                errors.append(f"{service_name}: call failed ({exc})")
                continue
            if getattr(response, "success", False):
                rospy.loginfo(
                    "Auto recharge stop acknowledged via %s: %s",
                    service_name,
                    getattr(response, "message", "ok"),
                )
                return
            errors.append(f"{service_name}: returned failure ({getattr(response, 'message', '')})")
        self._bump_metric("auto_recharge_stop_failures")
        if errors:
            rospy.logwarn("Auto recharge stop failed (%s): %s", reason, "; ".join(errors))
        else:
            rospy.logwarn("Auto recharge stop failed (%s): no providers available", reason)

    # 使用最近一次缓存的图像消息保存照片文件
    def _save_latest_image(self, goal: Goal, sequence_id: int, session_stamp: str) -> Optional[str]:
        if not self._photo_directory:
            return None
        with self._image_lock:
            latest = self._latest_image
            stamp = self._latest_image_stamp
        if latest is None:
            rospy.logwarn("No image received yet on %s; skipping capture", self._image_topic or "<unknown>")
            return None
        if self._max_image_age > 0.0:
            # 超过最大允许延迟的帧直接丢弃，避免保存过期图像
            now = rospy.Time.now()
            if stamp.is_zero() or (now - stamp).to_sec() > self._max_image_age:
                rospy.logwarn("Latest image on %s is stale; skip saving", self._image_topic)
                return None
        safe_goal = _sanitize_segment(goal.name, default="goal")
        extension = self._image_extension if self._image_extension.startswith(".") else f".{self._image_extension}"
        if isinstance(latest, CompressedImage):
            fmt = (latest.format or "").lower()
            if "png" in fmt:
                extension = ".png"
            elif "jpeg" in fmt or "jpg" in fmt:
                extension = ".jpg"
        session_dir = _sanitize_segment(session_stamp, default=datetime.utcnow().strftime("%Y%m%dT%H%M%SZ"))
        session_root = os.path.join(self._photo_directory, session_dir)
        capture_root = os.path.join(session_root, safe_goal)
        # 检查剩余空间，如有必要先删除旧会话，避免磁盘耗尽导致异常退出
        if not self._ensure_photo_storage(0, protected=[session_root]):
            rospy.logerr("Insufficient storage, skip saving %s", capture_root)
            return None
        if not _ensure_directory(session_root) or not _ensure_directory(capture_root):
            return None
        file_name = f"{safe_goal}_{sequence_id:02d}{extension}"
        file_path = os.path.join(capture_root, file_name)
        try:
            if isinstance(latest, CompressedImage):
                data = latest.data
                if not data:
                    rospy.logwarn("Compressed image data empty; skip %s", file_path)
                    return None
                if not self._ensure_photo_storage(len(data), protected=[session_root]):
                    rospy.logerr("Insufficient storage, skip saving %s", file_path)
                    return None
                if cv2 is not None and np is not None:
                    array = np.frombuffer(data, dtype=np.uint8)
                    image = cv2.imdecode(array, cv2.IMREAD_COLOR)
                    if image is None:
                        rospy.logwarn("Failed to decode compressed image, writing raw buffer to %s", file_path)
                        with open(file_path, "wb") as handle:
                            handle.write(data)
                    elif not cv2.imwrite(file_path, image):
                        rospy.logwarn("Failed to write decoded image %s", file_path)
                        return None
                else:
                    with open(file_path, "wb") as handle:
                        handle.write(data)
            else:
                if not self._bridge:
                    rospy.logwarn("cv_bridge unavailable, cannot convert raw image")
                    return None
                if cv2 is None:
                    rospy.logwarn("OpenCV not available, cannot write raw image to %s", file_path)
                    return None
                cv_image = self._bridge.imgmsg_to_cv2(latest, desired_encoding=self._raw_encoding)
                if not self._ensure_photo_storage(int(cv_image.nbytes), protected=[session_root]):
                    rospy.logerr("Insufficient storage, skip saving %s", file_path)
                    return None
                if not cv2.imwrite(file_path, cv_image):
                    rospy.logwarn("Failed to write image file %s", file_path)
                    return None
        except OSError as exc:
            rospy.logwarn("Failed to save image to %s: %s", file_path, exc)
            return None
        rospy.loginfo("Saved image for goal %s -> %s", goal.name, file_path)
        return file_path

    def _ensure_photo_storage(self, required_bytes: int, protected: Optional[List[str]] = None) -> bool:
        if self._photo_min_free_bytes <= 0 or not self._photo_directory:
            return True
        protected = protected or []
        with self._photo_storage_lock:
            try:
                usage = shutil.disk_usage(self._photo_directory)
            except OSError as exc:
                rospy.logwarn("Unable to query disk usage for %s: %s", self._photo_directory, exc)
                return True
            free = usage.free
            threshold = self._photo_min_free_bytes + max(0, required_bytes)
            if free >= threshold:
                return True
            target_free = max(self._photo_target_free_bytes, threshold)
            # 超出阈值时优先清理旧会话目录，为当前拍照腾出空间
            self._prune_old_photos(protected, target_free)
            try:
                usage = shutil.disk_usage(self._photo_directory)
            except OSError as exc:
                rospy.logwarn("Unable to re-check disk usage after cleanup: %s", exc)
                return False
            free = usage.free
            if free >= threshold:
                return True
            rospy.logerr("Photo storage low: %.2f MB free, need %.2f MB", free / 1048576.0, threshold / 1048576.0)
            return False

    def _prune_old_photos(self, protected: List[str], target_free: int) -> None:
        protected_set = {os.path.abspath(path) for path in protected if path}
        try:
            entries = [entry for entry in os.scandir(self._photo_directory) if entry.is_dir()]
        except OSError as exc:
            rospy.logwarn("Unable to list photo directory %s: %s", self._photo_directory, exc)
            return
        # 按目录修改时间从旧到新排序，逐批删除
        sessions: List[Tuple[float, str]] = []
        for entry in entries:
            session_path = os.path.abspath(entry.path)
            if session_path in protected_set:
                continue
            try:
                stat_info = entry.stat()
            except OSError:
                continue
            sessions.append((stat_info.st_mtime, session_path))
        sessions.sort()
        removed = 0
        for _, path in sessions:
            if removed >= self._photo_cleanup_batch:
                break
            try:
                shutil.rmtree(path)
                rospy.logwarn("Removed old photo session %s", path)
            except OSError as exc:
                rospy.logerr("Failed to remove %s: %s", path, exc)
                continue
            removed += 1
            try:
                usage = shutil.disk_usage(self._photo_directory)
            except OSError:
                return
            if usage.free >= target_free:
                break

    def _image_callback(self, msg: Union[Image, CompressedImage]) -> None:
        with self._image_lock:
            self._latest_image = msg
            self._latest_image_stamp = rospy.Time.now()

    def _voltage_callback(self, msg: Float32) -> None:
        threshold = float(self._charging_cfg.get("voltage_threshold", 0.0))
        resume = float(self._charging_cfg.get("resume_threshold", threshold + 1.0))
        debounce = float(self._charging_cfg.get("debounce_sec", 5.0))
        voltage = float(msg.data)
        now = time.time()
        with self._goal_available:
            self._latest_voltage = voltage
            self._latest_voltage_stamp = now
        if threshold <= 0.0:
            return
        if voltage <= threshold:
            with self._goal_available:
                last_call = self._last_charge_call
                suspended = self._charging_suspended
                inhibit_until = self._charging_inhibit_until
            if inhibit_until > now:
                if math.isinf(inhibit_until):
                    rospy.logdebug(
                        "Auto recharge manually inhibited indefinitely; skip activation (voltage %.2f)",
                        voltage,
                    )
                else:
                    remaining = max(0.0, inhibit_until - now)
                    rospy.logdebug(
                        "Auto recharge inhibited for %.1fs; skip activation (voltage %.2f)",
                        remaining,
                        voltage,
                    )
                return
            if suspended and now - last_call < debounce:
                return
            rospy.logwarn("Voltage %.2f below threshold %.2f, engage charging workflow", voltage, threshold)
            self._activate_charging(now)
        else:
            with self._goal_available:
                suspended = self._charging_suspended
            if suspended and voltage >= resume:
                rospy.loginfo("Voltage %.2f above resume %.2f, resume patrol", voltage, resume)
                self._deactivate_charging(manual=False, reason="voltage_resume")

    # 低电压触发自动回充工作流，必要时取消导航、发布标志并调用服务
    def _activate_charging(self, trigger_time: float) -> None:
        if self._cancel_pub:
            self._cancel_pub.publish(GoalID())
        self._publish_charge_flag(True)
        self._call_charge_service(enable=True)
        with self._goal_available:
            self._last_charge_call = trigger_time
            self._charging_inhibit_until = 0.0
            if self._active_goal:
                if self._active_goal.source == "sequence" and self._resume_previous_goal:
                    self._pending_goal = self._active_goal
                else:
                    self._override_goals.appendleft(self._active_goal)
                rospy.loginfo("Charging pause: parking goal %s", self._active_goal.name)
                self._active_goal = None
                self._active_goal_deadline = rospy.Time(0)
            if not self._charging_suspended:
                self._charging_suspended = True
            self._goal_available.notify_all()

    # 电压恢复后的收尾动作，恢复调度并通知底盘
    def _deactivate_charging(self, manual: bool = False, reason: str = "deactivate") -> None:
        tag = reason or ("manual" if manual else "deactivate")
        self._stop_auto_recharge(tag)
        self._publish_charge_flag(False)
        self._call_charge_service(enable=False)
        if manual and self._charge_exit_delay > 0.0:
            rospy.loginfo(
                "Waiting %.1fs for charger exit (reason=%s)",
                self._charge_exit_delay,
                tag,
            )
            self._timed_sleep(self._charge_exit_delay)
        with self._goal_available:
            self._charging_suspended = False
            if manual:
                duration = self._manual_charge_inhibit
                if duration > 0.0:
                    inhibit_until = time.time() + duration
                    if inhibit_until > self._charging_inhibit_until:
                        self._charging_inhibit_until = inhibit_until
                        rospy.loginfo(
                            "Manual stop inhibits auto recharge for %.1fs (reason=%s)",
                            duration,
                            tag,
                        )
                elif duration < 0.0:
                    self._charging_inhibit_until = float("inf")
                    rospy.loginfo("Manual stop disables auto recharge until manually re-enabled (reason=%s)", tag)
                else:
                    self._charging_inhibit_until = 0.0
            self._goal_available.notify_all()

    def _request_charge_release(self, reason: str, manual: bool = True, force: bool = False) -> bool:
        trigger = False
        set_busy = False
        with self._goal_available:
            condition = force or manual or self._charging_suspended or self._charge_flag_last == self._charge_flag_on
            if condition:
                trigger = True
                if not getattr(self, "_charging_release_active", False):
                    self._charging_release_active = True
                else:
                    rospy.logdebug("Charge release already active; coalescing request (%s)", reason)
                    return True
                if not self._post_goal_busy:
                    self._post_goal_busy = True
                    set_busy = True
            else:
                trigger = False
        if not trigger:
            return False
        try:
            self._deactivate_charging(manual=manual, reason=reason)
        finally:
            with self._goal_available:
                self._charging_release_active = False
                if set_busy:
                    self._post_goal_busy = False
                    self._goal_available.notify_all()
                else:
                    self._goal_available.notify_all()
        return True

    def _publish_charge_flag(self, enable: bool) -> None:
        if not self._charge_flag_pub:
            return
        value = self._charge_flag_on if enable else self._charge_flag_off
        if self._charge_flag_last == value:
            return
        repeats = max(1, self._charge_flag_repeats)
        msg = Int8()
        msg.data = value
        for _ in range(repeats):
            self._charge_flag_pub.publish(msg)
        self._charge_flag_last = value

    def _call_charge_service(self, enable: bool) -> None:
        # 兼容多种底盘实现的回充服务调用协议
        if not self._charge_service:
            return
        timeout = float(self._charge_service_timeout)
        try:
            if timeout > 0.0:
                self._charge_service.wait_for_service(timeout=timeout)
            else:
                self._charge_service.wait_for_service()
        except rospy.ROSException as exc:
            rospy.logerr("Charge service %s unavailable: %s", self._charge_service_name, exc)
            return
        try:
            if self._charge_service_type == "trigger":
                response = self._charge_service(TriggerRequest())
                rospy.loginfo("Charge service response: %s", getattr(response, "message", response))
            elif self._charge_service_type == "set_bool":
                if SetBoolRequest is None:
                    rospy.logwarn("SetBoolRequest unavailable; skip charge toggle")
                    return
                request = SetBoolRequest(data=enable)
                response = self._charge_service(request)
                rospy.loginfo("Charge service ack: %s", getattr(response, "message", response))
            elif self._charge_service_type == "spawn":
                value = float(self._charge_request_on if enable else self._charge_request_off)
                response = self._charge_service(x=value)
                rospy.loginfo("Charge spawn response: %s", getattr(response, "name", response))
            else:
                rospy.logwarn("Unsupported charge service type %s", self._charge_service_type)
        except rospy.ServiceException as exc:
            rospy.logerr("Charge service call failed: %s", exc)


def main() -> None:
    rospy.init_node("dlrobot_autocontrol")
    try:
        AutoControlNode()
    except Exception as exc:  # noqa: BLE001
        rospy.logfatal("Failed to start dlrobot_autocontrol: %s", exc)
        raise
    rospy.spin()


if __name__ == "__main__":
    main()
