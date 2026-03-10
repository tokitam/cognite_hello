# 詳細設計書 - Amazon Cognito サンプルアプリケーション

## 1. システム概要

### 1.1 目的

Amazon Cognito を使用したユーザー認証付き Web アプリケーションのサンプル実装。
AWS CDK を用いてインフラを構築し、ALB + ECS (Fargate) 構成で PHP アプリケーションを稼働させる。

### 1.2 主要技術スタック

| 分類 | 技術 |
|------|------|
| インフラ管理 | AWS CDK (TypeScript) |
| コンピュート | Amazon ECS on AWS Fargate |
| ロードバランサー | Application Load Balancer (ALB) |
| 認証 | Amazon Cognito (ユーザープール + アプリクライアント) |
| DNS | Amazon Route 53 |
| TLS 証明書 | AWS Certificate Manager (ACM) |
| コンテナイメージ | debian:bookworm-slim + PHP + Apache |
| Web アプリ | PHP |
| ドメイン | tokita202603.com |

### 1.3 アクセス URL

- 本番 URL: `https://tokita202603.com`
- Cognito ホスト UI: `https://auth.tokita202603.com`

---

## 2. アーキテクチャ概要

```
インターネット
    │
    ▼
Route 53 (tokita202603.com)
    │ A レコード (Alias)
    ▼
Application Load Balancer (ALB) ── HTTPS 443 ──► ACM 証明書
    │
    │ ターゲットグループ (HTTP 80)
    ├──► ECS Task 1 (Fargate)
    │       └── PHP コンテナ (debian-slim)
    └──► ECS Task 2 (Fargate)
            └── PHP コンテナ (debian-slim)

認証フロー:
ブラウザ ──► ALB (未認証) ──► Cognito Hosted UI (ログイン)
              │
              ◄── コールバック (JWT トークン) ──┘
              │
              ▼
         ALB (認証済み) ──► ECS タスク (PHP アプリ)
```

---

## 3. ドキュメント一覧

| ファイル | 内容 |
|---------|------|
| [01_overview.md](./01_overview.md) | システム概要・アーキテクチャ |
| [02_network.md](./02_network.md) | ネットワーク設計 (VPC, サブネット等) |
| [03_ecs_fargate.md](./03_ecs_fargate.md) | ECS / Fargate 設計 |
| [04_alb.md](./04_alb.md) | ALB 設計・Cognito 認証統合 |
| [05_cognito.md](./05_cognito.md) | Cognito ユーザープール設計 |
| [06_dns_acm.md](./06_dns_acm.md) | Route 53 / ACM 設計 |
| [07_php_app.md](./07_php_app.md) | PHP アプリケーション設計 |
| [08_cdk_structure.md](./08_cdk_structure.md) | CDK スタック構成 |
| [09_sequence.md](./09_sequence.md) | 認証シーケンス図 |
| [10_test_users.md](./10_test_users.md) | テストユーザー情報 |
