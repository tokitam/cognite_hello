# ECS / Fargate 設計

## 1. クラスター設定

| 項目 | 値 |
|------|----|
| クラスター名 | `CognitoSampleCluster` |
| 起動タイプ | AWS Fargate |
| Container Insights | 有効 |

---

## 2. タスク定義

### 2.1 タスク定義基本設定

| 項目 | 値 |
|------|----|
| タスク定義名 | `CognitoSampleTask` |
| 互換性 | FARGATE |
| CPU | 256 (.25 vCPU) |
| メモリ | 512 MB |
| ネットワークモード | awsvpc |
| タスク実行ロール | `ecsTaskExecutionRole` |
| タスクロール | `ecsTaskRole` |

### 2.2 コンテナ定義

| 項目 | 値 |
|------|----|
| コンテナ名 | `php-app` |
| イメージ | Amazon ECR リポジトリ (debian:bookworm-slim ベース) |
| ポートマッピング | 80 (TCP) |
| ログドライバー | `awslogs` |
| ログ設定 | CloudWatch Logs グループ `/ecs/cognito-sample` |

### 2.3 ベースイメージ

```dockerfile
FROM debian:bookworm-slim

RUN apt-get update && apt-get install -y \
    apache2 \
    php \
    libapache2-mod-php \
    && rm -rf /var/lib/apt/lists/*

COPY src/ /var/www/html/
EXPOSE 80
CMD ["apache2ctl", "-D", "FOREGROUND"]
```

---

## 3. ECS サービス設定

| 項目 | 値 |
|------|----|
| サービス名 | `CognitoSampleService` |
| 希望タスク数 | **2** |
| 最小ヘルシーパーセント | 50% |
| 最大パーセント | 200% |
| デプロイタイプ | Rolling update |
| ネットワーク | Private Subnet (1a, 1c) |
| セキュリティグループ | `sg-ecs` |
| パブリック IP 割当 | 無効 (プライベートサブネット) |

---

## 4. IAM ロール

### 4.1 タスク実行ロール (`ecsTaskExecutionRole`)

| ポリシー | 目的 |
|---------|------|
| `AmazonECSTaskExecutionRolePolicy` | ECR イメージ pull / CloudWatch ログ書き込み |

### 4.2 タスクロール (`ecsTaskRole`)

| ポリシー | 目的 |
|---------|------|
| `AmazonSSMManagedInstanceCore` | SSM セッションマネージャーによるコンテナアクセス (デバッグ用) |

---

## 5. ECR リポジトリ

| 項目 | 値 |
|------|----|
| リポジトリ名 | `cognito-sample/php-app` |
| イメージスキャン | プッシュ時スキャン有効 |
| ライフサイクルポリシー | 最新 10 世代のみ保持 |

---

## 6. CDK コード概要

```typescript
// ECS Fargate サービス (参考)
const taskDef = new ecs.FargateTaskDefinition(this, 'TaskDef', {
  memoryLimitMiB: 512,
  cpu: 256,
});

taskDef.addContainer('PhpApp', {
  image: ecs.ContainerImage.fromEcrRepository(ecrRepo),
  portMappings: [{ containerPort: 80 }],
  logging: ecs.LogDrivers.awsLogs({
    streamPrefix: 'cognito-sample',
    logGroup: new logs.LogGroup(this, 'LogGroup', {
      logGroupName: '/ecs/cognito-sample',
      retention: logs.RetentionDays.ONE_WEEK,
    }),
  }),
});

const service = new ecs.FargateService(this, 'Service', {
  cluster,
  taskDefinition: taskDef,
  desiredCount: 2,
  vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
  securityGroups: [ecsSecurityGroup],
});
```
