# CDK スタック構成

## 1. プロジェクト構成

```
cognite_hello/
├── PROMPT.txt
├── docs/
│   ├── 01_overview.md
│   ├── 02_network.md
│   ├── 03_ecs_fargate.md
│   ├── 04_alb.md
│   ├── 05_cognito.md
│   ├── 06_dns_acm.md
│   ├── 07_php_app.md
│   ├── 08_cdk_structure.md
│   └── 09_sequence.md
├── cdk/
│   ├── package.json
│   ├── tsconfig.json
│   ├── cdk.json
│   ├── bin/
│   │   └── app.ts                  # CDK エントリポイント
│   └── lib/
│       ├── certificate-stack.ts    # ACM (us-east-1)
│       ├── network-stack.ts        # VPC / セキュリティグループ
│       ├── cognito-stack.ts        # Cognito ユーザープール
│       ├── ecr-stack.ts            # ECR リポジトリ
│       └── app-stack.ts            # ECS / ALB / Route53
└── app/
    ├── Dockerfile
    └── src/
        ├── index.php
        ├── logout.php
        └── health.php
```

---

## 2. スタック依存関係

```
CertificateStack (us-east-1)
    │ Cognito 用証明書
    ▼
CognitoStack (ap-northeast-1)
    │ UserPool, UserPoolClient, UserPoolDomain
    ▼
NetworkStack (ap-northeast-1)
    │ VPC, サブネット, SG
    │
    ├──► EcrStack
    │       ECR リポジトリ
    │
    └──► AppStack
            ECS クラスター, タスク, ALB, Route53, ACM(ALB用)
```

---

## 3. 各スタックの責務

### 3.1 CertificateStack (`certificate-stack.ts`)

- **リージョン:** us-east-1
- **作成リソース:**
  - ACM 証明書 `auth.tokita202603.com` (Cognito カスタムドメイン用)
- **エクスポート:**
  - 証明書 ARN → CognitoStack へ渡す

### 3.2 CognitoStack (`cognito-stack.ts`)

- **リージョン:** ap-northeast-1
- **作成リソース:**
  - Cognito ユーザープール
  - Cognito アプリクライアント
  - Cognito カスタムドメイン (`auth.tokita202603.com`)
  - Route 53 CNAME レコード (Cognito ドメイン検証)
- **エクスポート:**
  - UserPool ARN / ID
  - UserPoolClient ID
  - UserPoolDomain

### 3.3 NetworkStack (`network-stack.ts`)

- **リージョン:** ap-northeast-1
- **作成リソース:**
  - VPC (CIDR: 10.0.0.0/16)
  - パブリック/プライベートサブネット (各 2 AZ)
  - NAT Gateway
  - セキュリティグループ (ALB 用, ECS 用)
- **エクスポート:**
  - VPC
  - セキュリティグループ
  - サブネット情報

### 3.4 EcrStack (`ecr-stack.ts`)

- **リージョン:** ap-northeast-1
- **作成リソース:**
  - ECR リポジトリ (`cognito-sample/php-app`)
- **エクスポート:**
  - ECR リポジトリ URI

### 3.5 AppStack (`app-stack.ts`)

- **リージョン:** ap-northeast-1
- **依存:** NetworkStack, CognitoStack, EcrStack, CertificateStack
- **作成リソース:**
  - ECS クラスター
  - ECS タスク定義 (Fargate)
  - ECS サービス (desiredCount: 2)
  - ALB (Internet-facing)
  - ALB リスナー (HTTP 80 → HTTPS 443 リダイレクト)
  - ALB リスナー (HTTPS 443, Cognito 認証付き)
  - ターゲットグループ
  - ACM 証明書 (tokita202603.com, ap-northeast-1)
  - Route 53 A レコード (tokita202603.com → ALB)
  - CloudWatch ロググループ

---

## 4. CDK bin/app.ts エントリポイント

```typescript
#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { CertificateStack } from '../lib/certificate-stack';
import { CognitoStack } from '../lib/cognito-stack';
import { NetworkStack } from '../lib/network-stack';
import { EcrStack } from '../lib/ecr-stack';
import { AppStack } from '../lib/app-stack';

const app = new cdk.App();

const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: 'ap-northeast-1',
};

// us-east-1 に Cognito 用証明書を作成
const certStack = new CertificateStack(app, 'CertificateStack', {
  env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: 'us-east-1' },
  crossRegionReferences: true,
});

// Cognito ユーザープール
const cognitoStack = new CognitoStack(app, 'CognitoStack', {
  env,
  cognitoCertificate: certStack.cognitoCertificate,
  crossRegionReferences: true,
});
cognitoStack.addDependency(certStack);

// ネットワーク
const networkStack = new NetworkStack(app, 'NetworkStack', { env });

// ECR
const ecrStack = new EcrStack(app, 'EcrStack', { env });

// アプリケーション (ECS + ALB + Route53)
const appStack = new AppStack(app, 'AppStack', {
  env,
  vpc: networkStack.vpc,
  albSecurityGroup: networkStack.albSecurityGroup,
  ecsSecurityGroup: networkStack.ecsSecurityGroup,
  ecrRepository: ecrStack.repository,
  userPool: cognitoStack.userPool,
  userPoolClient: cognitoStack.userPoolClient,
  userPoolDomain: cognitoStack.userPoolDomain,
  crossRegionReferences: true,
});
appStack.addDependency(networkStack);
appStack.addDependency(cognitoStack);
appStack.addDependency(ecrStack);
```

---

## 5. デプロイ手順

```bash
# 1. CDK ブートストラップ (初回のみ)
cd cdk
npx cdk bootstrap aws://ACCOUNT_ID/ap-northeast-1
npx cdk bootstrap aws://ACCOUNT_ID/us-east-1

# 2. Docker イメージビルド & ECR プッシュ
cd ../app
aws ecr get-login-password --region ap-northeast-1 | \
  docker login --username AWS --password-stdin ACCOUNT_ID.dkr.ecr.ap-northeast-1.amazonaws.com
docker build -t cognito-sample/php-app .
docker tag cognito-sample/php-app:latest \
  ACCOUNT_ID.dkr.ecr.ap-northeast-1.amazonaws.com/cognito-sample/php-app:latest
docker push ACCOUNT_ID.dkr.ecr.ap-northeast-1.amazonaws.com/cognito-sample/php-app:latest

# 3. CDK デプロイ (順序通りに)
cd ../cdk
npx cdk deploy CertificateStack
npx cdk deploy CognitoStack
npx cdk deploy NetworkStack EcrStack
npx cdk deploy AppStack
```

---

## 6. 前提条件

| 項目 | 要件 |
|------|----|
| AWS CLI | v2 インストール済み、認証情報設定済み |
| Node.js | v18 以上 |
| AWS CDK | v2 (`npm install -g aws-cdk`) |
| Docker | イメージビルド用 |
| ドメイン | `tokita202603.com` 取得済み、Route 53 ホストゾーン作成済み |

---

## 7. コスト見積もり (月額概算)

| リソース | 費用 |
|---------|------|
| Fargate (0.25vCPU/0.5GB × 2) | 約 $15/月 |
| ALB | 約 $18/月 |
| NAT Gateway | 約 $35/月 |
| Route 53 ホストゾーン | $0.50/月 |
| ACM 証明書 | 無料 |
| Cognito (MAU 50 まで) | 無料 |
| ECR ストレージ | 約 $1/月 |
| CloudWatch Logs | 約 $1/月 |
| **合計** | **約 $70/月** |
