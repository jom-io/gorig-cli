#!/bin/bash

# 确保脚本有执行权限
# chmod +x npm_publish.sh

set -u

NPM_OFFICIAL_REGISTRY="https://registry.npmjs.org/"
ORIGINAL_REGISTRY="$(npm config get registry)"
TEMP_NPMRC=""

cleanup() {
    if [ -n "$TEMP_NPMRC" ] && [ -f "$TEMP_NPMRC" ]; then
        rm -f "$TEMP_NPMRC"
    fi
}
trap cleanup EXIT

echo "当前 npm registry: $ORIGINAL_REGISTRY"

if [ "$ORIGINAL_REGISTRY" != "$NPM_OFFICIAL_REGISTRY" ]; then
    echo "提示：当前不是官方源，发布时将临时使用官方源（不会修改全局配置）。"
fi

PUBLISH_ARGS=(publish --registry "$NPM_OFFICIAL_REGISTRY")

if [ -n "${NPM_TOKEN:-}" ]; then
    echo "检测到 NPM_TOKEN，使用 token 进行非交互发布。"
    TEMP_NPMRC="$(mktemp)"
    printf "//registry.npmjs.org/:_authToken=%s\n" "$NPM_TOKEN" > "$TEMP_NPMRC"
    PUBLISH_ARGS+=(--userconfig "$TEMP_NPMRC")
else
    echo "未检测到 NPM_TOKEN，将使用当前登录态发布。"
    echo "当前账号：$(npm whoami 2>/dev/null || echo "未登录")"
    echo "是否先执行 npm login？（建议在账号切换或未登录时选择 y）"
    read -r -p "[y/n]: " NEED_LOGIN

    if [ "$NEED_LOGIN" = "y" ] || [ "$NEED_LOGIN" = "Y" ]; then
        npm login --registry "$NPM_OFFICIAL_REGISTRY" || {
            echo "npm 登录失败。"
            exit 1
        }
    fi

    echo "如你的 npm 账号发布需要 OTP，请输入 6 位验证码；不需要请直接回车。"
    read -r -p "OTP: " OTP_CODE
    if [ -n "$OTP_CODE" ]; then
        PUBLISH_ARGS+=(--otp "$OTP_CODE")
    fi
fi

echo "开始执行：npm ${PUBLISH_ARGS[*]}"
npm "${PUBLISH_ARGS[@]}"
EXIT_CODE=$?

if [ $EXIT_CODE -ne 0 ]; then
    echo "发布失败，请检查上方日志。"
    echo "若报 2FA/token 相关错误，请使用带 bypass 2fa 的 granular token。"
    exit $EXIT_CODE
fi

echo "发布成功！"
