# 認証シーケンス図

## 1. ログインシーケンス

```
ブラウザ          ALB               Cognito            PHP (ECS)
  │                │                  │                   │
  │ GET https://   │                  │                   │
  │ tokita202603.com│                 │                   │
  ├───────────────►│                  │                   │
  │                │                  │                   │
  │                │ 未認証を検知       │                   │
  │                │ (セッション Cookie なし)               │
  │                │                  │                   │
  │ 302 Redirect   │                  │                   │
  │ → Cognito ログイン URL            │                   │
  │◄───────────────┤                  │                   │
  │                │                  │                   │
  │ GET https://auth.tokita202603.com/login              │
  │ ?client_id=xxx                    │                   │
  │ &redirect_uri=.../oauth2/idpresponse                 │
  │ &response_type=code               │                   │
  ├──────────────────────────────────►│                   │
  │                │                  │                   │
  │                │     Cognito ログインページ表示         │
  │◄──────────────────────────────────┤                   │
  │                │                  │                   │
  │ ユーザーが Email/Password を入力   │                   │
  │                │                  │                   │
  │ POST ログイン情報                  │                   │
  ├──────────────────────────────────►│                   │
  │                │                  │                   │
  │                │    認証成功       │                   │
  │                │    認証コード発行  │                   │
  │                │                  │                   │
  │ 302 Redirect   │                  │                   │
  │ → https://tokita202603.com/oauth2/idpresponse        │
  │   ?code=AUTHORIZATION_CODE        │                   │
  │◄──────────────────────────────────┤                   │
  │                │                  │                   │
  │ GET /oauth2/idpresponse?code=xxx  │                   │
  ├───────────────►│                  │                   │
  │                │                  │                   │
  │                │ POST /oauth2/token (code 交換)        │
  │                ├─────────────────►│                   │
  │                │                  │                   │
  │                │  ID/Access/Refresh トークン           │
  │                │◄─────────────────┤                   │
  │                │                  │                   │
  │                │ セッション Cookie 発行                 │
  │                │ (AWSELBAuthSessionCookie)             │
  │                │                  │                   │
  │ 302 Redirect → https://tokita202603.com/             │
  │◄───────────────┤                  │                   │
  │                │                  │                   │
  │ GET https://tokita202603.com/      │                   │
  │ Cookie: AWSELBAuthSessionCookie=xxx                  │
  ├───────────────►│                  │                   │
  │                │                  │                   │
  │                │ Cookie 検証 OK    │                   │
  │                │ X-Amzn-Oidc-* ヘッダー付与            │
  │                │                  │                   │
  │                │ GET / + OIDC ヘッダー                 │
  │                ├──────────────────────────────────────►│
  │                │                  │                   │
  │                │                  │   PHP が応答生成   │
  │                │                  │   (ログイン済み状態) │
  │                │                  │                   │
  │                │◄──────────────────────────────────────┤
  │                │                  │                   │
  │ Hello, world! + ログアウトリンク   │                   │
  │◄───────────────┤                  │                   │
```

---

## 2. ログアウトシーケンス

```
ブラウザ          ALB               Cognito            PHP (ECS)
  │                │                  │                   │
  │ GET /logout.php │                 │                   │
  │ Cookie: AWSELBAuthSessionCookie   │                   │
  ├───────────────►│                  │                   │
  │                │                  │                   │
  │                │ 認証済み → PHP へ転送                  │
  │                ├──────────────────────────────────────►│
  │                │                  │                   │
  │                │                  │   PHP: logout.php  │
  │                │                  │   Cognito logout   │
  │                │                  │   URL へリダイレクト│
  │                │                  │                   │
  │ 302 Redirect   │                  │                   │
  │ → https://auth.tokita202603.com/logout               │
  │   ?client_id=xxx                  │                   │
  │   &logout_uri=https://tokita202603.com/              │
  │◄──────────────────────────────────────────────────────┤
  │                │                  │                   │
  │ GET /logout?client_id=xxx&logout_uri=...             │
  ├──────────────────────────────────►│                   │
  │                │                  │                   │
  │                │   Cognito セッション削除               │
  │                │                  │                   │
  │ 302 Redirect   │                  │                   │
  │ → https://tokita202603.com/        │                   │
  │◄──────────────────────────────────┤                   │
  │                │                  │                   │
  │ GET https://tokita202603.com/      │                   │
  │ (Cookie なし / 期限切れ)           │                   │
  ├───────────────►│                  │                   │
  │                │                  │                   │
  │                │ 未認証 → Cognito ログインへリダイレクト │
  │ 302 → Cognito ログイン画面         │                   │
  │◄───────────────┤                  │                   │
```

---

## 3. ALB ヘルスチェックシーケンス

```
ALB                               PHP (ECS) /health.php
 │                                          │
 │ GET /health.php (30秒ごと)               │
 ├─────────────────────────────────────────►│
 │                                          │
 │                               HTTP 200 OK
 │                               "OK"
 │◄─────────────────────────────────────────┤
 │                                          │
 │ ターゲット: Healthy                       │
```

---

## 4. 主要エンドポイント一覧

| URL | 処理 |
|-----|------|
| `https://tokita202603.com/` | メインページ (index.php) |
| `https://tokita202603.com/logout.php` | ログアウト処理 |
| `https://tokita202603.com/health.php` | ALB ヘルスチェック |
| `https://tokita202603.com/oauth2/idpresponse` | ALB Cognito コールバック (ALB が処理) |
| `https://auth.tokita202603.com/login` | Cognito Hosted UI ログイン |
| `https://auth.tokita202603.com/logout` | Cognito ログアウトエンドポイント |
