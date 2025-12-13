# ARM64 Ubuntu 18.04 兼容版本

## 📋 系统要求
- **操作系统**: Ubuntu 18.04 LTS (ARM64)
- **Node.js**: 版本 14.x 或更高（推荐16.x LTS）
- **内存**: 至少 2GB RAM
- **存储**: 至少 1GB 可用空间

## 🚀 快速开始

### 1. 安装Node.js (Ubuntu 18.04 ARM64)

```bash
# 方法1: 使用NodeSource仓库安装Node.js 16.x LTS
curl -fsSL https://deb.nodesource.com/setup_16.x | sudo -E bash -
sudo apt-get install -y nodejs

# 验证安装
node --version  # 应该显示 v16.x.x
npm --version   # 应该显示 8.x.x
```

### 2. 安装项目依赖

```bash
# 进入项目目录
cd dlrobot-front

# 安装依赖
npm install

# 如果遇到权限问题，可以尝试
npm install --unsafe-perm
```

### 3. 启动开发服务器

```bash
# 开发模式
npm run dev

# 或者生产构建
npm run build
npm run preview
```

## 🔧 兼容性配置

### 针对ARM64的优化配置

项目已经针对ARM64架构进行了以下优化：

1. **使用兼容的依赖版本**
2. **禁用不必要的原生模块**
3. **优化构建配置**

### 网络配置

确保防火墙允许以下端口：
- **3000**: 前端开发服务器
- **9001**: MQTT WebSocket连接
- **5000**: REST API后端

## 🐛 常见问题解决

### 1. Node.js版本过旧

如果系统Node.js版本低于14.x：

```bash
# 卸载旧版本
sudo apt remove nodejs npm

# 清理残留
sudo apt autoremove

# 重新安装Node.js 16.x
curl -fsSL https://deb.nodesource.com/setup_16.x | sudo -E bash -
sudo apt-get install -y nodejs
```

### 2. 内存不足

ARM64设备可能内存较小，可以优化：

```bash
# 增加swap空间
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile

# 永久生效，添加到 /etc/fstab
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

### 3. 构建失败

如果构建过程中出现内存不足：

```bash
# 增加Node.js内存限制
export NODE_OPTIONS="--max-old-space-size=4096"

# 然后重新构建
npm run build
```

### 4. 端口被占用

修改默认端口：

```bash
# 修改vite.config.js中的端口
# 或者使用环境变量
PORT=8080 npm run dev
```

## 📊 性能优化建议

### 1. 针对ARM64的构建优化

```bash
# 使用更快的构建工具
npm install -g @vitejs/app

# 或者使用esbuild（更快）
npm install esbuild --save-dev
```

### 2. 生产环境优化

```bash
# 最小化构建
npm run build -- --mode production

# 启用gzip压缩
npm install compression --save
```

### 3. 监控资源使用

```bash
# 安装系统监控工具
sudo apt install htop iotop

# 监控Node.js进程
htop -p $(pgrep node)
```

## 🔄 更新和维护

### 定期更新依赖

```bash
# 检查过时的依赖
npm outdated

# 安全更新
npm audit fix

# 更新所有依赖
npm update
```

### 备份配置

重要配置文件：
- `package.json`
- `vite.config.js` 
- 环境变量文件

## 📞 技术支持

如果遇到问题，请检查：

1. Node.js和npm版本是否符合要求
2. 系统内存和存储空间是否充足
3. 网络连接和防火墙设置
4. 查看控制台错误信息

## 🎯 验证部署

部署完成后，访问以下地址验证：
- 前端界面: http://localhost:3000
- MQTT连接: ws://localhost:9001
- API服务: http://localhost:5000

确保所有服务都能正常访问和通信。