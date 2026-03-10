# Cognito ユーザープール設計

## 1. ユーザープール

### 1.1 基本設定

| 項目 | 値 |
|------|----|
| ユーザープール名 | `CognitoSampleUserPool` |
| リージョン | ap-northeast-1 |
| サインイン属性 | Email アドレス |
| パスワードポリシー | 最小 8 文字、大文字・小文字・数字・記号を含む |
| MFA | オプション (TOTP) |
| アカウント復旧 | Email による確認コード |
| セルフサービスサインアップ | 有効 |
| メール確認 | 必須 |

### 1.2 属性設定

| 属性名 | タイプ | 必須 | 変更可否 |
|--------|--------|------|---------|
| email | String | 必須 | 不可 |
| email_verified | Boolean | - | - |

### 1.3 メール設定

| 項目 | 値 |
|------|----|
| 送信元 | Cognito デフォルト (SES 未使用) |
| 確認コード有効期間 | 24 時間 |

---

## 2. アプリクライアント

### 2.1 基本設定

| 項目 | 値 |
|------|----|
| クライアント名 | `CognitoSampleAppClient` |
| クライアントシークレット | **生成する** (ALB 統合で必要) |
| 認証フロー | `ALLOW_USER_SRP_AUTH`, `ALLOW_REFRESH_TOKEN_AUTH` |

### 2.2 OAuth 2.0 設定

| 項目 | 値 |
|------|----|
| 許可された OAuth フロー | Authorization code grant |
| 許可された OAuth スコープ | `openid`, `email`, `profile` |
| コールバック URL | `https://tokita202603.com/oauth2/idpresponse` |
| サインアウト URL | `https://tokita202603.com/` |
| ID トークン有効期間 | 60 分 |
| アクセストークン有効期間 | 60 分 |
| リフレッシュトークン有効期間 | 30 日 |

---

## 3. ユーザープールドメイン

### 3.1 カスタムドメイン設定

| 項目 | 値 |
|------|----|
| カスタムドメイン | `auth.tokita202603.com` |
| ACM 証明書 | `auth.tokita202603.com` 用証明書 (**us-east-1** リージョン必須) |

> **注意:** Cognito カスタムドメインに使用する ACM 証明書は **us-east-1 (バージニア北部)** で発行する必要がある。

### 3.2 Hosted UI カスタマイズ

| 項目 | 値 |
|------|----|
| ロゴ | なし (デフォルト) |
| CSS カスタマイズ | なし (デフォルト) |

---

## 4. ログイン・ログアウトフロー

### 4.1 ログインフロー

```
1. ユーザーが https://tokita202603.com にアクセス
2. ALB が Cognito Hosted UI へリダイレクト
   → https://auth.tokita202603.com/login?
       client_id=<CLIENT_ID>
       &redirect_uri=https://tokita202603.com/oauth2/idpresponse
       &response_type=code
       &scope=openid+email
3. ユーザーがメール・パスワードを入力してログイン
4. Cognito が認証コードを発行し、ALB コールバックへリダイレクト
5. ALB がコードをトークンと交換
6. 認証完了、PHP アプリへ転送
```

### 4.2 ログアウトフロー

```
1. ユーザーがアプリの「ログアウト」リンクをクリック
   → /logout エンドポイントへアクセス (PHP で処理)
2. PHP が Cognito ログアウトエンドポイントへリダイレクト
   → https://auth.tokita202603.com/logout?
       client_id=<CLIENT_ID>
       &logout_uri=https://tokita202603.com/
3. Cognito がセッションを削除
4. https://tokita202603.com/ へリダイレクト (未認証状態)
5. ALB がログインページへリダイレクト
```

---

## 5. CDK コード概要

```typescript
// Cognito ユーザープール (参考)
const userPool = new cognito.UserPool(this, 'UserPool', {
  userPoolName: 'CognitoSampleUserPool',
  signInAliases: { email: true },
  selfSignUpEnabled: true,
  autoVerify: { email: true },
  passwordPolicy: {
    minLength: 8,
    requireLowercase: true,
    requireUppercase: true,
    requireDigits: true,
    requireSymbols: true,
  },
  accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
});

const userPoolDomain = userPool.addDomain('CustomDomain', {
  customDomain: {
    domainName: 'auth.tokita202603.com',
    certificate: cognitoCertificate, // us-east-1 の証明書
  },
});

const userPoolClient = userPool.addClient('AppClient', {
  userPoolClientName: 'CognitoSampleAppClient',
  generateSecret: true,
  oAuth: {
    flows: { authorizationCodeGrant: true },
    scopes: [
      cognito.OAuthScope.OPENID,
      cognito.OAuthScope.EMAIL,
      cognito.OAuthScope.PROFILE,
    ],
    callbackUrls: ['https://tokita202603.com/oauth2/idpresponse'],
    logoutUrls: ['https://tokita202603.com/'],
  },
  accessTokenValidity: Duration.minutes(60),
  idTokenValidity: Duration.minutes(60),
  refreshTokenValidity: Duration.days(30),
});
```
