# PHP アプリケーション設計

## 1. 概要

| 項目 | 値 |
|------|----|
| 言語 | PHP 8.x |
| Web サーバー | Apache 2.4 (mod_php) |
| ベースイメージ | `debian:bookworm-slim` |
| 機能 | Hello, world! 表示 / ログイン・ログアウト |

---

## 2. ディレクトリ構成

```
app/
├── Dockerfile
└── src/
    ├── index.php       # メインページ
    ├── logout.php      # ログアウト処理
    └── health.php      # ALB ヘルスチェック用
```

---

## 3. 各ファイルの仕様

### 3.1 index.php (メインページ)

**機能:**
- ALB が付与する `X-Amzn-Oidc-Data` ヘッダーを確認
- ヘッダーが存在する場合 → ログイン済み → 「ログアウト」リンクを表示
- ヘッダーが存在しない場合 → 未ログイン → 「ログイン」リンクを表示
- 「Hello, world!」を表示

**ログイン状態の判定:**

ALB は認証済みリクエストに以下のヘッダーを付与する:
- `X-Amzn-Oidc-Identity`: ユーザーの sub (Cognito ユーザー ID)
- `X-Amzn-Oidc-Accesstoken`: アクセストークン
- `X-Amzn-Oidc-Data`: ユーザー情報 JWT

```php
<?php
// ログイン状態の確認
$isLoggedIn = isset($_SERVER['HTTP_X_AMZN_OIDC_IDENTITY']);
$userEmail = '';

if ($isLoggedIn) {
    // JWT の payload 部分をデコード (検証は ALB が実施済み)
    $oidcData = $_SERVER['HTTP_X_AMZN_OIDC_DATA'] ?? '';
    if ($oidcData) {
        $parts = explode('.', $oidcData);
        if (count($parts) >= 2) {
            $payload = json_decode(base64_decode(
                str_pad(strtr($parts[1], '-_', '+/'),
                strlen($parts[1]) % 4, '=', STR_PAD_RIGHT)
            ), true);
            $userEmail = $payload['email'] ?? '';
        }
    }
}
?>
<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8">
    <title>Hello, world!</title>
</head>
<body>
    <h1>Hello, world!</h1>
    <?php if ($isLoggedIn): ?>
        <p>ようこそ、<?= htmlspecialchars($userEmail) ?> さん</p>
        <a href="/logout.php">ログアウト</a>
    <?php else: ?>
        <a href="/login">ログイン</a>
    <?php endif; ?>
</body>
</html>
```

### 3.2 logout.php (ログアウト処理)

```php
<?php
// Cognito ログアウトエンドポイントへリダイレクト
$cognitoDomain = 'auth.tokita202603.com';
$clientId = getenv('COGNITO_CLIENT_ID');
$logoutUri = 'https://tokita202603.com/';

$logoutUrl = "https://{$cognitoDomain}/logout?"
           . "client_id={$clientId}"
           . "&logout_uri=" . urlencode($logoutUri);

header("Location: {$logoutUrl}");
exit;
```

### 3.3 health.php (ヘルスチェック)

```php
<?php
http_response_code(200);
header('Content-Type: text/plain');
echo 'OK';
```

---

## 4. 環境変数

コンテナ実行時に以下の環境変数を渡す:

| 変数名 | 値 | 設定方法 |
|-------|----|---------|
| `COGNITO_CLIENT_ID` | Cognito アプリクライアント ID | ECS タスク定義 / Secrets Manager |
| `COGNITO_DOMAIN` | `auth.tokita202603.com` | ECS タスク定義 |

---

## 5. Dockerfile

```dockerfile
FROM debian:bookworm-slim

# 非インタラクティブモードでインストール
ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y \
    apache2 \
    php \
    libapache2-mod-php \
    && rm -rf /var/lib/apt/lists/*

# Apache の設定
RUN a2enmod rewrite
RUN echo "ServerName localhost" >> /etc/apache2/apache2.conf

# アプリのコピー
COPY src/ /var/www/html/

# デフォルトの index.html を削除
RUN rm -f /var/www/html/index.html

EXPOSE 80

CMD ["apache2ctl", "-D", "FOREGROUND"]
```

---

## 6. ログイン・ログアウト UI 仕様

### ログイン済み画面

```
┌─────────────────────────────┐
│  Hello, world!              │
│                             │
│  ようこそ、user@example.com さん │
│                             │
│  [ログアウト]                │
└─────────────────────────────┘
```

### 未ログイン画面 (通常は ALB が Cognito へリダイレクト)

```
┌─────────────────────────────┐
│  Hello, world!              │
│                             │
│  [ログイン]                  │
└─────────────────────────────┘
```

> **注意:** ALB の Cognito 認証が有効な場合、未認証ユーザーは自動的に Cognito ログインページへリダイレクトされるため、「ログイン」リンクが表示されるケースは ALB をバイパスした直接アクセス時のみ。
> ログアウト後は ALB が再度 Cognito へリダイレクトする。
