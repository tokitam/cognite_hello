# ネットワーク設計

## 1. VPC 設計

### 1.1 VPC 基本設定

| 項目 | 値 |
|------|----|
| VPC CIDR | `10.0.0.0/16` |
| リージョン | `ap-northeast-1` (東京) |
| VPC 名 | `CognitoSampleVpc` |

### 1.2 サブネット構成

| サブネット種別 | AZ | CIDR | 用途 |
|--------------|-----|------|------|
| Public Subnet 1 | ap-northeast-1a | `10.0.0.0/24` | ALB |
| Public Subnet 2 | ap-northeast-1c | `10.0.1.0/24` | ALB |
| Private Subnet 1 | ap-northeast-1a | `10.0.10.0/24` | ECS Fargate タスク |
| Private Subnet 2 | ap-northeast-1c | `10.0.11.0/24` | ECS Fargate タスク |

### 1.3 ゲートウェイ・ルーティング

| コンポーネント | 配置 | 設定 |
|--------------|------|------|
| Internet Gateway | VPC | パブリックサブネットのデフォルトルート |
| NAT Gateway | Public Subnet 1 | プライベートサブネットのアウトバウンド通信用 |

---

## 2. セキュリティグループ設計

### 2.1 ALB セキュリティグループ (`sg-alb`)

| ルール | プロトコル | ポート | ソース | 説明 |
|--------|-----------|-------|--------|------|
| インバウンド | TCP | 443 | `0.0.0.0/0` | HTTPS アクセス許可 |
| インバウンド | TCP | 80 | `0.0.0.0/0` | HTTP → HTTPS リダイレクト用 |
| アウトバウンド | ALL | ALL | `0.0.0.0/0` | すべて許可 |

### 2.2 ECS タスク セキュリティグループ (`sg-ecs`)

| ルール | プロトコル | ポート | ソース | 説明 |
|--------|-----------|-------|--------|------|
| インバウンド | TCP | 80 | `sg-alb` | ALB からのみ HTTP 許可 |
| アウトバウンド | ALL | ALL | `0.0.0.0/0` | Cognito/ECR/CloudWatch 通信 |

---

## 3. CDK コード概要 (ネットワーク)

```typescript
// lib/network-stack.ts (参考)
const vpc = new ec2.Vpc(this, 'CognitoSampleVpc', {
  ipAddresses: ec2.IpAddresses.cidr('10.0.0.0/16'),
  maxAzs: 2,
  subnetConfiguration: [
    {
      cidrMask: 24,
      name: 'Public',
      subnetType: ec2.SubnetType.PUBLIC,
    },
    {
      cidrMask: 24,
      name: 'Private',
      subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
    },
  ],
  natGateways: 1,
});
```
