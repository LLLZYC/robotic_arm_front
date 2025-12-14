# 相机图像API文档

## 概述
这个API用于从服务器获取相机图像列表并提供图像访问。

## 后端实现要求

### 1. 获取图像列表
**端点**: `GET /api/camera/images`

**查询参数**:
- `path` (string): 图像文件夹路径，默认为 `/home/dlrobot_autocontrol`

**响应示例**:
```json
{
  "success": true,
  "images": [
    {
      "name": "camera_2024_01_15_10_30_25.jpg",
      "path": "/home/dlrobot_autocontrol/camera_2024_01_15_10_30_25.jpg",
      "timestamp": "2024-01-15T10:30:25.000Z",
      "size": 245678
    },
    {
      "name": "camera_2024_01_15_10_30_30.jpg",
      "path": "/home/dlrobot_autocontrol/camera_2024_01_15_10_30_30.jpg",
      "timestamp": "2024-01-15T10:30:30.000Z",
      "size": 248901
    }
  ],
  "total": 2
}
```

### 2. 获取单个图像
**端点**: `GET /api/camera/image/:path`

**路径参数**:
- `path` (string): URL编码的图像文件路径

**响应**: 
- Content-Type: `image/jpeg` 或 `image/png`
- 图像二进制数据

## Python Flask 实现示例

```python
from flask import Flask, jsonify, send_file, request
from flask_cors import CORS
import os
from datetime import datetime
from urllib.parse import unquote

app = Flask(__name__)
CORS(app)  # 允许跨域请求

# 默认图像路径
DEFAULT_IMAGE_PATH = '/home/dlrobot_autocontrol'

@app.route('/api/camera/images', methods=['GET'])
def get_camera_images():
    """获取相机图像列表"""
    try:
        # 获取图像路径参数
        image_path = request.args.get('path', DEFAULT_IMAGE_PATH)
        
        # 检查路径是否存在
        if not os.path.exists(image_path):
            return jsonify({
                'success': False,
                'error': f'路径不存在: {image_path}'
            }), 404
        
        # 获取所有图像文件
        images = []
        supported_formats = ('.jpg', '.jpeg', '.png', '.bmp')
        
        for filename in os.listdir(image_path):
            if filename.lower().endswith(supported_formats):
                file_path = os.path.join(image_path, filename)
                file_stat = os.stat(file_path)
                
                images.append({
                    'name': filename,
                    'path': file_path,
                    'timestamp': datetime.fromtimestamp(file_stat.st_mtime).isoformat(),
                    'size': file_stat.st_size
                })
        
        # 按时间戳降序排序（最新的在前）
        images.sort(key=lambda x: x['timestamp'], reverse=True)
        
        return jsonify({
            'success': True,
            'images': images,
            'total': len(images)
        })
        
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/camera/image/<path:image_path>', methods=['GET'])
def get_camera_image(image_path):
    """获取单个图像文件"""
    try:
        # URL解码
        decoded_path = unquote(image_path)
        
        # 安全检查：确保路径在允许的目录内
        if not decoded_path.startswith('/home/dlrobot_autocontrol'):
            return jsonify({
                'success': False,
                'error': '访问被拒绝'
            }), 403
        
        # 检查文件是否存在
        if not os.path.exists(decoded_path):
            return jsonify({
                'success': False,
                'error': '文件不存在'
            }), 404
        
        # 返回图像文件
        return send_file(decoded_path, mimetype='image/jpeg')
        
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)
```

## Node.js Express 实现示例

```javascript
const express = require('express');
const cors = require('cors');
const fs = require('fs').promises;
const path = require('path');

const app = express();
app.use(cors());

const DEFAULT_IMAGE_PATH = '/home/dlrobot_autocontrol';

// 获取图像列表
app.get('/api/camera/images', async (req, res) => {
  try {
    const imagePath = req.query.path || DEFAULT_IMAGE_PATH;
    
    // 检查路径是否存在
    try {
      await fs.access(imagePath);
    } catch {
      return res.status(404).json({
        success: false,
        error: `路径不存在: ${imagePath}`
      });
    }
    
    // 读取目录
    const files = await fs.readdir(imagePath);
    const supportedFormats = ['.jpg', '.jpeg', '.png', '.bmp'];
    
    const images = [];
    
    for (const filename of files) {
      const ext = path.extname(filename).toLowerCase();
      if (supportedFormats.includes(ext)) {
        const filePath = path.join(imagePath, filename);
        const stats = await fs.stat(filePath);
        
        images.push({
          name: filename,
          path: filePath,
          timestamp: stats.mtime.toISOString(),
          size: stats.size
        });
      }
    }
    
    // 按时间戳降序排序
    images.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    
    res.json({
      success: true,
      images,
      total: images.length
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// 获取单个图像
app.get('/api/camera/image/:imagePath(*)', async (req, res) => {
  try {
    const decodedPath = decodeURIComponent(req.params.imagePath);
    
    // 安全检查
    if (!decodedPath.startsWith('/home/dlrobot_autocontrol')) {
      return res.status(403).json({
        success: false,
        error: '访问被拒绝'
      });
    }
    
    // 检查文件是否存在
    try {
      await fs.access(decodedPath);
    } catch {
      return res.status(404).json({
        success: false,
        error: '文件不存在'
      });
    }
    
    // 发送文件
    res.sendFile(decodedPath);
    
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.listen(5000, () => {
  console.log('Server running on http://localhost:5000');
});
```

## 使用说明

1. **部署后端API**: 选择Python Flask或Node.js Express实现，部署到机器人服务器
2. **配置路径**: 确保 `/home/dlrobot_autocontrol` 目录存在且有读取权限
3. **测试API**: 
   ```bash
   # 获取图像列表
   curl http://localhost:5000/api/camera/images
   
   # 获取单个图像
   curl http://localhost:5000/api/camera/image/%2Fhome%2Fdlrobot_autocontrol%2Ftest.jpg
   ```

## 前端配置

在前端系统设置中配置REST API地址为后端服务器地址（例如：`http://192.168.6.214:5000`）

## 安全建议

1. 添加身份验证（JWT或API Key）
2. 限制访问路径范围
3. 添加文件大小限制
4. 实现访问日志记录
5. 使用HTTPS加密传输
