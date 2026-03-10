#!/bin/bash
set -euo pipefail

# ================================================================
# Cognito サンプル デプロイスクリプト
# ================================================================

REGION="ap-northeast-1"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CDK_DIR="${SCRIPT_DIR}/cdk"

echo "=========================================="
echo "  Cognito サンプル デプロイ開始"
echo "=========================================="

# AWS アカウント ID 取得
echo ""
echo "[1/6] AWS アカウント情報を確認中..."
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
echo "  アカウント ID: ${ACCOUNT_ID}"
echo "  リージョン: ${REGION}"

export CDK_DEFAULT_ACCOUNT="${ACCOUNT_ID}"
export CDK_DEFAULT_REGION="${REGION}"

# Node.js 依存パッケージインストール
echo ""
echo "[2/6] CDK 依存パッケージをインストール中..."
cd "${CDK_DIR}"
npm install --silent

# CDK ブートストラップ (初回のみ)
echo ""
echo "[3/6] CDK ブートストラップ中 (初回のみ実行)..."
npx cdk bootstrap "aws://${ACCOUNT_ID}/${REGION}" --region "${REGION}" 2>&1 | grep -E "(Bootstrapping|✅|Already)" || true
npx cdk bootstrap "aws://${ACCOUNT_ID}/us-east-1" --region "us-east-1" 2>&1 | grep -E "(Bootstrapping|✅|Already)" || true

# ----------------------------------------------------------------
# CertificateStack デプロイ (us-east-1)
# ----------------------------------------------------------------
echo ""
echo "[4/6] CertificateStack をデプロイ中 (us-east-1)..."
npx cdk deploy CertificateStack \
    --require-approval never \
    --outputs-file /tmp/certificate-outputs.json

# CertificateStack の出力から証明書 ARN を取得
CERT_ARN=$(aws cloudformation describe-stacks \
    --stack-name CertificateStack \
    --region us-east-1 \
    --query 'Stacks[0].Outputs[?OutputKey==`CognitoCertificateArn`].OutputValue' \
    --output text)

if [ -z "${CERT_ARN}" ]; then
    echo "ERROR: 証明書 ARN を取得できませんでした。CertificateStack の出力を確認してください。"
    exit 1
fi
echo "  証明書 ARN: ${CERT_ARN}"

# ----------------------------------------------------------------
# CognitoStack デプロイ
# ROLLBACK_COMPLETE の場合は先に削除する
# ----------------------------------------------------------------
echo ""
echo "[5/6] CognitoStack をデプロイ中..."

COGNITO_STATUS=$(aws cloudformation describe-stacks \
    --stack-name CognitoStack \
    --region "${REGION}" \
    --query 'Stacks[0].StackStatus' \
    --output text 2>/dev/null || echo "DOES_NOT_EXIST")

if [ "${COGNITO_STATUS}" = "ROLLBACK_COMPLETE" ]; then
    echo "  CognitoStack が ROLLBACK_COMPLETE のため削除中..."
    aws cloudformation delete-stack \
        --stack-name CognitoStack \
        --region "${REGION}"
    echo "  削除完了を待機中..."
    aws cloudformation wait stack-delete-complete \
        --stack-name CognitoStack \
        --region "${REGION}"
    echo "  削除完了"
fi

# CognitoStack デプロイ (UserPool + UserPoolClient のみ, カスタムドメインは AppStack で作成)
npx cdk deploy CognitoStack \
    --require-approval never \
    --outputs-file /tmp/cognito-outputs.json

# ----------------------------------------------------------------
# NetworkStack & AppStack デプロイ
# ----------------------------------------------------------------
echo ""
echo "[6/6] NetworkStack & AppStack をデプロイ中..."
echo "  ※ Docker イメージのビルド & プッシュを含むため時間がかかります"
npx cdk deploy NetworkStack AppStack \
    --require-approval never \
    --context "cognitoCertArn=${CERT_ARN}" \
    --outputs-file /tmp/app-outputs.json \
    --concurrency 1

echo ""
echo "=========================================="
echo "  デプロイ完了!"
echo "=========================================="
echo ""
echo "アクセス URL: https://tokita202603.com"
echo ""
echo "--- AppStack Outputs ---"
cat /tmp/app-outputs.json 2>/dev/null || true
echo ""
echo "--- CognitoStack Outputs ---"
cat /tmp/cognito-outputs.json 2>/dev/null || true
