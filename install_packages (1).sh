#!/bin/bash

ENV_NAME="py23env"

PACKAGES=(
    "fastapi"
    "uvicorn"
    "python-socketio"
    "opencv-python"
    "mediapipe"
    "numpy"
    "aiohttp"
)

echo "=========================================="
echo " conda環境: $ENV_NAME にパッケージをインストール"
echo "=========================================="

# conda環境の存在確認
if ! conda env list | grep -q "^$ENV_NAME "; then
    echo "[ERROR] conda環境 '$ENV_NAME' が見つかりません。"
    echo "以下のコマンドで確認してください: conda env list"
    exit 1
fi

TOTAL=${#PACKAGES[@]}
SUCCESS=0
FAILED=()

for i in "${!PACKAGES[@]}"; do
    PKG="${PACKAGES[$i]}"
    NUM=$((i + 1))
    echo ""
    echo "[$NUM/$TOTAL] インストール中: $PKG"
    echo "------------------------------------------"

    conda run -n "$ENV_NAME" pip install "$PKG"

    if [ $? -eq 0 ]; then
        echo "✓ $PKG インストール成功"
        SUCCESS=$((SUCCESS + 1))
    else
        echo "✗ $PKG インストール失敗"
        FAILED+=("$PKG")
    fi
done

echo ""
echo "=========================================="
echo " 結果: $SUCCESS/$TOTAL 成功"
if [ ${#FAILED[@]} -gt 0 ]; then
    echo " 失敗したパッケージ:"
    for PKG in "${FAILED[@]}"; do
        echo "   - $PKG"
    done
fi
echo "=========================================="
