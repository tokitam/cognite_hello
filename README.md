# Amazon Cognito サンプルアプリケーション

AWS CDK を使って構築する、Amazon Cognito 認証付き Web アプリケーションのサンプルです。

## アーキテクチャ

```
インターネット
    │
    ▼
Route 53 (tokita202603.com)
    │ A レコード (Alias)
    ▼
Application Load Balancer (ALB)  ← HTTPS / ACM 証明書
    │ Cognito 認証 (authenticate-cognito)
    ▼
ECS Fargate × 2 タスク
    └── PHP アプリ (debian:bookworm-slim + Apache)

認証:
  https://auth.tokita202603.com  ← Cognito Hosted UI
```

## 技術スタック

| 分類 | 技術 |
|------|------|
| インフラ管理 | AWS CDK (TypeScript) |
| コンピュート | Amazon ECS on AWS Fargate |
| ロードバランサー | Application Load Balancer |
| 認証 | Amazon Cognito ユーザープール |
| DNS | Amazon Route 53 |
| TLS 証明書 | AWS Certificate Manager (ACM) |
| コンテナ | debian:bookworm-slim + PHP + Apache |
| アプリ | PHP |

## ディレクトリ構成

```
.
├── README.md
├── deploy.sh               # ワンコマンドデプロイ
├── create_test_user.sh     # テストユーザー作成
├── app/
│   ├── Dockerfile          # debian:bookworm-slim ベース
│   └── src/
│       ├── index.php       # メインページ (ログイン状態に応じてリンク表示)
│       ├── logout.php      # Cognito ログアウト処理
│       └── health.php      # ALB ヘルスチェック用
├── cdk/
│   ├── bin/app.ts          # CDK エントリポイント
│   └── lib/
│       ├── certificate-stack.ts  # ACM 証明書 (us-east-1)
│       ├── cognito-stack.ts      # Cognito ユーザープール
│       ├── network-stack.ts      # VPC・サブネット・SG
│       └── app-stack.ts          # ECS・ALB・Route53・Cognito ドメイン
└── docs/                   # 詳細設計ドキュメント
```

## 前提条件

- AWS CLI v2 (認証情報設定済み)
- Node.js v18 以上
- Docker (イメージビルド用)
- ドメイン `tokita202603.com` が Route 53 に登録済み

## デプロイ

```bash
./deploy.sh
```

内部で以下の順に実行されます。

| ステップ | スタック | 内容 |
|---------|---------|------|
| 1 | CertificateStack | ACM 証明書を **us-east-1** に作成 (Cognito カスタムドメイン用) |
| 2 | CognitoStack | ユーザープール・アプリクライアントを作成 |
| 3 | NetworkStack | VPC・サブネット・NAT Gateway・SG を作成 |
| 4 | AppStack | ALB・ECS・Route53・Cognito カスタムドメインを作成 |

> **初回デプロイ時のみ** CDK ブートストラップ (`ap-northeast-1` / `us-east-1`) が実行されます。

## テストユーザー作成

デプロイ完了後に実行してください。

```bash
# パスワードポリシーを更新 (小文字不要に設定)
aws cognito-idp update-user-pool \
  --user-pool-id <USER_POOL_ID> \
  --policies 'PasswordPolicy={MinimumLength=8,RequireUppercase=true,RequireLowercase=false,RequireNumbers=true,RequireSymbols=true}' \
  --region ap-northeast-1

# テストユーザーを作成
./create_test_user.sh
```

テストユーザーのログイン情報は `docs/10_test_users.md` を参照してください。

## アクセス

| URL | 説明 |
|-----|------|
| `https://tokita202603.com` | アプリケーション (未ログイン時は自動的にログイン画面へ) |
| `https://auth.tokita202603.com/login` | Cognito ホスト UI ログイン画面 |

## CDK スタックの詳細

### CertificateStack (us-east-1)

Cognito カスタムドメイン (`auth.tokita202603.com`) に使用する ACM 証明書を作成します。
Cognito は CloudFront を使用するため、証明書は **us-east-1 必須** です。

### CognitoStack (ap-northeast-1)

- ユーザープール (`CognitoSampleUserPool`)
- アプリクライアント (ALB 統合用、クライアントシークレットあり)

### NetworkStack (ap-northeast-1)

- VPC: `10.0.0.0/16`、2 AZ
- パブリック/プライベートサブネット
- NAT Gateway × 1

### AppStack (ap-northeast-1)

- ALB (Internet-facing)
- ECS Fargate サービス (タスク × 2、プライベートサブネット)
- Route53 A レコード: `tokita202603.com` → ALB
- Cognito カスタムドメイン: `auth.tokita202603.com` (A レコード作成後に設定)
- Route53 CNAME: `auth.tokita202603.com` → Cognito CloudFront
- HTTPS リスナー: Cognito 認証 → ECS へ転送

## PHP アプリの動作

| 状態 | 表示 |
|------|------|
| ログイン済み | `Hello, world!` + ようこそメッセージ + **ログアウト** リンク |
| 未ログイン | ALB が Cognito ログイン画面へ自動リダイレクト |

ログアウトリンクをクリックすると Cognito セッションが削除され、再度ログイン画面が表示されます。

## 設計ドキュメント

詳細は `docs/` を参照してください。

| ファイル | 内容 |
|---------|------|
| [01_overview.md](docs/01_overview.md) | システム概要・アーキテクチャ |
| [02_network.md](docs/02_network.md) | ネットワーク設計 |
| [03_ecs_fargate.md](docs/03_ecs_fargate.md) | ECS / Fargate 設計 |
| [04_alb.md](docs/04_alb.md) | ALB・Cognito 認証統合 |
| [05_cognito.md](docs/05_cognito.md) | Cognito ユーザープール設計 |
| [06_dns_acm.md](docs/06_dns_acm.md) | Route 53 / ACM 設計 |
| [07_php_app.md](docs/07_php_app.md) | PHP アプリケーション設計 |
| [08_cdk_structure.md](docs/08_cdk_structure.md) | CDK スタック構成 |
| [09_sequence.md](docs/09_sequence.md) | 認証シーケンス図 |

## 注意事項

- `docs/10_test_users.md` には認証情報が含まれます。`.gitignore` で Git 管理対象外にしています。
- Cognito カスタムドメインを作成するには、親ドメイン (`tokita202603.com`) の A レコードが DNS で解決できる必要があります。そのため、`AppStack` 内で ALB の A レコード作成後に Cognito ドメインを作成しています。
- 本番環境では `removalPolicy: DESTROY` を `RETAIN` に変更することを推奨します。
