#!/bin/bash

# ARM64 Ubuntu 18.04 部署脚本
# 适用于树莓派、Jetson Nano等ARM64设备

set -e  # 遇到错误立即退出

echo "🚀 开始部署 DL-Robot 前端到 ARM64 Ubuntu 18.04..."

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 日志函数
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# 检查系统架构
check_architecture() {
    local arch=$(uname -m)
    if [ "$arch" != "aarch64" ] && [ "$arch" != "arm64" ]; then
        log_error "此脚本仅适用于ARM64架构，当前架构: $arch"
        exit 1
    fi
    log_info "检测到ARM64架构: $arch"
}

# 检查Ubuntu版本
check_ubuntu_version() {
    if [ -f /etc/os-release ]; then
        . /etc/os-release
        if [ "$ID" = "ubuntu" ] && [ "$VERSION_ID" = "18.04" ]; then
            log_info "检测到Ubuntu 18.04 LTS"
        else
            log_warn "当前系统: $PRETTY_NAME，此脚本主要针对Ubuntu 18.04优化"
        fi
    else
        log_warn "无法检测操作系统版本，继续执行..."
    fi
}

# 安装Node.js
install_nodejs() {
    if command -v node >/dev/null 2>&1; then
        local node_version=$(node --version)
        log_info "Node.js 已安装: $node_version"
        
        # 检查版本是否足够新
        local major_version=$(echo $node_version | cut -d'.' -f1 | sed 's/v//')
        if [ $major_version -lt 14 ]; then
            log_warn "Node.js版本过旧 ($node_version)，建议升级到14.x或更高"
        fi
        return 0
    fi
    
    log_info "安装Node.js 16.x LTS..."
    
    # 添加NodeSource仓库
    curl -fsSL https://deb.nodesource.com/setup_16.x | sudo -E bash -
    
    # 安装Node.js
    sudo apt-get install -y nodejs
    
    # 验证安装
    if command -v node >/dev/null 2>&1; then
        log_info "Node.js 安装成功: $(node --version)"
    else
        log_error "Node.js 安装失败"
        exit 1
    fi
}

# 安装系统依赖
install_system_deps() {
    log_info "安装系统依赖..."
    
    sudo apt-get update
    sudo apt-get install -y \
        curl \
        wget \
        build-essential \
        python3 \
        git
}

# 配置系统优化
configure_system() {
    log_info "配置系统优化..."
    
    # 增加swap空间（如果内存小于2GB）
    local total_mem=$(free -m | awk '/^Mem:/{print $2}')
    if [ $total_mem -lt 2048 ]; then
        log_warn "检测到内存较小 ($total_mem MB)，配置swap空间..."
        
        sudo fallocate -l 2G /swapfile
        sudo chmod 600 /swapfile
        sudo mkswap /swapfile
        sudo swapon /swapfile
        
        # 永久生效
        echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
    fi
    
    # 增加文件监视限制（针对Vite热重载）
    echo 'fs.inotify.max_user_watches=524288' | sudo tee -a /etc/sysctl.conf
    sudo sysctl -p
}

# 安装项目依赖
install_project_deps() {
    log_info "安装项目依赖..."
    
    # 备份现有node_modules（如果有）
    if [ -d "node_modules" ]; then
        log_info "备份现有依赖..."
        mv node_modules "node_modules.backup.$(date +%Y%m%d_%H%M%S)"
    fi
    
    # 清理npm缓存
    npm cache clean --force
    
    # 安装依赖（针对ARM64优化）
    NODE_OPTIONS="--max-old-space-size=2048" npm install --unsafe-perm
    
    if [ $? -eq 0 ]; then
        log_info "依赖安装成功"
    else
        log_error "依赖安装失败"
        exit 1
    fi
}

# 构建项目
build_project() {
    log_info "构建项目..."
    
    # 设置构建环境变量
    export NODE_OPTIONS="--max-old-space-size=2048"
    
    # 执行构建
    npm run build
    
    if [ $? -eq 0 ]; then
        log_info "项目构建成功"
    else
        log_error "项目构建失败"
        exit 1
    fi
}

# 配置生产环境
setup_production() {
    log_info "配置生产环境..."
    
    # 安装PM2（进程管理）
    if ! command -v pm2 >/dev/null 2>&1; then
        log_info "安装PM2..."
        sudo npm install -g pm2
    fi
    
    # 创建PM2配置文件
    cat > ecosystem.config.js << EOF
module.exports = {
  apps: [{
    name: 'dlrobot-front',
    script: './server.js',
    instances: 1,
    exec_mode: 'fork',
    watch: false,
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    },
    max_memory_restart: '512M',
    node_args: '--max-old-space-size=512'
  }]
}
EOF
    
    log_info "PM2配置已创建"
}

# 启动服务
start_service() {
    log_info "启动服务..."
    
    # 使用PM2启动服务
    if command -v pm2 >/dev/null 2>&1; then
        pm2 start ecosystem.config.js
        pm2 save
        pm2 startup
        
        log_info "服务已启动，使用以下命令管理："
        echo "  pm2 status              # 查看状态"
        echo "  pm2 logs                 # 查看日志"
        echo "  pm2 stop dlrobot-front   # 停止服务"
        echo "  pm2 restart dlrobot-front # 重启服务"
    else
        # 直接启动
        log_info "直接启动服务..."
        npm run preview &
        
        log_info "服务已启动在后台，访问 http://localhost:3000"
    fi
}

# 显示部署信息
show_deployment_info() {
    log_info "🎉 部署完成！"
    echo ""
    echo "📊 部署信息："
    echo "   前端地址: http://localhost:3000"
    echo "   健康检查: http://localhost:3000/health"
    echo "   平台架构: $(uname -m)"
    echo "   Node版本: $(node --version)"
    echo ""
    echo "🔧 常用命令："
    echo "   npm run dev      # 开发模式"
    echo "   npm run build    # 构建项目"
    echo "   npm run preview  # 预览构建结果"
    echo "   npm start        # 生产模式"
    echo ""
    echo "📖 文档："
    echo "   查看 README.md 获取详细使用说明"
}

# 主函数
main() {
    log_info "开始DL-Robot前端部署..."
    
    # 执行部署步骤
    check_architecture
    check_ubuntu_version
    install_system_deps
    configure_system
    install_nodejs
    install_project_deps
    build_project
    setup_production
    start_service
    show_deployment_info
    
    log_info "部署完成！"
}

# 脚本入口
if [ "$1" = "--help" ] || [ "$1" = "-h" ]; then
    echo "使用说明："
    echo "  ./deploy.sh          # 完整部署"
    echo "  ./deploy.sh --dev    # 仅开发环境设置"
    echo "  ./deploy.sh --build  # 仅构建项目"
    exit 0
fi

# 执行主函数
main "$@"