# ALB 設計・Cognito 認証統合

## 1. ALB 基本設定

| 項目 | 値 |
|------|----|
| ALB 名 | `CognitoSampleAlb` |
| タイプ | Application Load Balancer |
| スキーム | internet-facing |
| IP アドレスタイプ | IPv4 |
| サブネット | Public Subnet 1a, 1c |
| セキュリティグループ | `sg-alb` |

---

## 2. リスナー設定

### 2.1 HTTP リスナー (ポート 80)

| 項目 | 値 |
|------|----|
| プロトコル | HTTP |
| ポート | 80 |
| デフォルトアクション | HTTPS (443) へリダイレクト (301) |

### 2.2 HTTPS リスナー (ポート 443)

| 項目 | 値 |
|------|----|
| プロトコル | HTTPS |
| ポート | 443 |
| SSL ポリシー | `ELBSecurityPolicy-TLS13-1-2-2021-06` |
| SSL 証明書 | ACM 証明書 (`*.tokita202603.com` / `tokita202603.com`) |
| デフォルトアクション | Cognito 認証 → ECS ターゲットグループへ転送 |

---

## 3. Cognito 認証統合 (ALB Authenticate-Cognito)

ALB の組み込み Cognito 認証機能を使用する。

### 3.1 認証アクション設定

| 項目 | 値 |
|------|----|
| タイプ | `authenticate-cognito` |
| ユーザープール ARN | Cognito ユーザープール ARN |
| ユーザープールクライアント ID | Cognito アプリクライアント ID |
| ユーザープールドメイン | `auth.tokita202603.com` |
| セッションクッキー名 | `AWSELBAuthSessionCookie` |
| セッションタイムアウト | 604800 秒 (7 日) |
| 未認証リクエスト | `authenticate` (ログインページへリダイレクト) |
| スコープ | `openid email` |

### 3.2 認証フロー

```
1. ユーザーが https://tokita202603.com にアクセス
2. ALB が未認証を検知
3. ALB が Cognito Hosted UI (https://auth.tokita202603.com/login) へリダイレクト
4. ユーザーがログイン情報を入力
5. Cognito が認証し、ALB のコールバック URL へリダイレクト
   - コールバック URL: https://tokita202603.com/oauth2/idpresponse
6. ALB がトークンを検証し、セッションクッキーを発行
7. ECS タスクへリクエストを転送
8. PHP アプリが X-Amzn-Oidc-* ヘッダーからユーザー情報を取得
```

### 3.3 PHP アプリへ渡されるヘッダー

| ヘッダー名 | 内容 |
|-----------|------|
| `X-Amzn-Oidc-Accesstoken` | Cognito アクセストークン |
| `X-Amzn-Oidc-Identity` | ユーザー識別子 (sub) |
| `X-Amzn-Oidc-Data` | JWT 形式のユーザー情報 (email 等) |

---

## 4. ターゲットグループ

| 項目 | 値 |
|------|----|
| ターゲットグループ名 | `CognitoSampleTG` |
| タイプ | IP (Fargate 用) |
| プロトコル | HTTP |
| ポート | 80 |
| VPC | CognitoSampleVpc |
| ヘルスチェックパス | `/health.php` |
| ヘルスチェック間隔 | 30 秒 |
| 正常閾値 | 2 回連続成功 |
| 異常閾値 | 3 回連続失敗 |
| タイムアウト | 5 秒 |
| 正常ステータスコード | `200` |

---

## 5. CDK コード概要

```typescript
// ALB + Cognito 統合 (参考)
const alb = new elbv2.ApplicationLoadBalancer(this, 'ALB', {
  vpc,
  internetFacing: true,
  securityGroup: albSg,
});

// HTTP → HTTPS リダイレクト
alb.addListener('HttpListener', {
  port: 80,
  defaultAction: elbv2.ListenerAction.redirect({
    protocol: 'HTTPS',
    port: '443',
    permanent: true,
  }),
});

// HTTPS リスナー + Cognito 認証
const httpsListener = alb.addListener('HttpsListener', {
  port: 443,
  certificates: [certificate],
  sslPolicy: elbv2.SslPolicy.RECOMMENDED_TLS,
  defaultAction: new actions.AuthenticateCognitoAction({
    userPool,
    userPoolClient,
    userPoolDomain,
    next: elbv2.ListenerAction.forward([targetGroup]),
  }),
});
```
