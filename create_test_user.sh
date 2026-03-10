#!/bin/bash
set -euo pipefail

# ================================================================
# テストユーザー作成スクリプト
# AppStack デプロイ後に実行すること
# ================================================================

REGION="ap-northeast-1"

echo "Cognito ユーザープール ID を取得中..."
USER_POOL_ID=$(aws cognito-idp list-user-pools \
    --max-results 10 \
    --region "${REGION}" \
    --query "UserPools[?Name=='CognitoSampleUserPool'].Id" \
    --output text)

if [ -z "${USER_POOL_ID}" ]; then
    echo "ERROR: ユーザープール 'CognitoSampleUserPool' が見つかりません。"
    echo "       先に deploy.sh を実行してください。"
    exit 1
fi

echo "ユーザープール ID: ${USER_POOL_ID}"

# テストユーザー作成
# ユーザープールが Email サインインのため、username もメールアドレスにする
USERNAME="testuser1@tokita202603.com"
EMAIL="testuser1@tokita202603.com"
PASSWORD='EKZJ9$W#'

echo ""
echo "テストユーザーを作成中..."
echo "  ユーザー名: ${USERNAME}"
echo "  メール: ${EMAIL}"

# ユーザー作成 (メール確認不要で即時有効化)
CREATE_OUTPUT=$(aws cognito-idp admin-create-user \
    --user-pool-id "${USER_POOL_ID}" \
    --username "${USERNAME}" \
    --user-attributes \
        Name=email,Value="${EMAIL}" \
        Name=email_verified,Value=true \
    --temporary-password "${PASSWORD}" \
    --message-action SUPPRESS \
    --region "${REGION}" 2>&1) || {
    if echo "${CREATE_OUTPUT}" | grep -q "UsernameExistsException"; then
        echo "  ※ ユーザーはすでに存在します (パスワードを更新します)"
    else
        echo "ERROR: ユーザー作成失敗: ${CREATE_OUTPUT}"
        exit 1
    fi
}

# 永続パスワードを設定 (FORCE_CHANGE_PASSWORD を解除)
echo "パスワードを永続化中..."
aws cognito-idp admin-set-user-password \
    --user-pool-id "${USER_POOL_ID}" \
    --username "${USERNAME}" \
    --password "${PASSWORD}" \
    --permanent \
    --region "${REGION}"

echo ""
echo "テストユーザーの作成が完了しました。"
echo ""
echo "ログイン情報:"
echo "  URL     : https://tokita202603.com"
echo "  メール  : ${EMAIL}"
echo "  パスワード: ${PASSWORD}"
