#!/bin/bash

# 确保脚本有执行权限
# chmod +x npm_publish.sh

# 设置官方源地址和原仓库源地址
NPM_OFFICIAL_REGISTRY="https://registry.npmjs.org/"
CUSTOM_REGISTRY=$(npm config get registry)

# 检查原始仓库源是否为官方源
if [ "$CUSTOM_REGISTRY" = "$NPM_OFFICIAL_REGISTRY" ]; then
    echo "当前已经是官方源，不需要切换。"
else
    echo "当前仓库源为: $CUSTOM_REGISTRY"
    echo "正在切换为官方源: $NPM_OFFICIAL_REGISTRY"
    npm config set registry $NPM_OFFICIAL_REGISTRY
fi

# 验证是否成功切换到官方源
CURRENT_REGISTRY=$(npm config get registry)
if [ "$CURRENT_REGISTRY" = "$NPM_OFFICIAL_REGISTRY" ]; then
    echo "仓库源已成功切换为官方源。"
else
    echo "切换仓库源失败，请检查。"
    exit 1
fi

# 登录 npm 账户
echo "开始登录 npm，请根据提示输入用户名、密码和邮箱地址。"
npm login
if [ $? -ne 0 ]; then
    echo "npm 登录失败，请检查用户名、密码和邮箱是否正确。"
    exit 1
fi

# 执行 yarn publish 或 npm publish
echo "请选择使用 yarn 还是 npm 发布包（输入 y 表示使用 yarn，输入 n 表示使用 npm）："
read -p "[y/n]: " CHOICE

if [ "$CHOICE" = "y" ]; then
    yarn publish
elif [ "$CHOICE" = "n" ]; then
    npm publish
else
    echo "无效输入，请重新运行脚本并选择 y 或 n。"
    exit 1
fi

if [ $? -ne 0 ]; then
    echo "发布失败，请检查日志。"
    exit 1
else
    echo "发布成功！"
fi

# 恢复原始仓库源
if [ "$CUSTOM_REGISTRY" != "$NPM_OFFICIAL_REGISTRY" ]; then
    echo "正在恢复原始仓库源: $CUSTOM_REGISTRY"
    npm config set registry $CUSTOM_REGISTRY
    echo "仓库源已恢复为: $(npm config get registry)"
else
    echo "仓库源保持为官方源，无需恢复。"
fi

echo "脚本执行完成。"
