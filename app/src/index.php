<?php

/**
 * ALB が認証済みリクエストに付与する X-Amzn-Oidc-Identity ヘッダーで
 * ログイン状態を判定する。
 * PHP では HTTP ヘッダーは $_SERVER['HTTP_*'] で取得できる。
 */
function base64UrlDecode(string $data): string
{
    $remainder = strlen($data) % 4;
    if ($remainder) {
        $data .= str_repeat('=', 4 - $remainder);
    }
    return base64_decode(strtr($data, '-_', '+/'));
}

$isLoggedIn = isset($_SERVER['HTTP_X_AMZN_OIDC_IDENTITY']);
$userEmail = '';

if ($isLoggedIn) {
    // X-Amzn-Oidc-Data は JWT 形式 (header.payload.signature)
    // ALB がすでに署名検証済みなので、payload をデコードするだけでよい
    $oidcData = $_SERVER['HTTP_X_AMZN_OIDC_DATA'] ?? '';
    if ($oidcData !== '') {
        $parts = explode('.', $oidcData);
        if (count($parts) >= 2) {
            $payload = json_decode(base64UrlDecode($parts[1]), true);
            $userEmail = $payload['email'] ?? '';
        }
    }
}

?><!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Hello, world!</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            max-width: 800px;
            margin: 80px auto;
            padding: 0 20px;
            color: #333;
        }
        h1 { font-size: 2.5rem; margin-bottom: 1rem; }
        .user-info { color: #555; margin-bottom: 1.5rem; }
        .btn {
            display: inline-block;
            padding: 10px 20px;
            border: 1px solid #007bff;
            border-radius: 4px;
            color: #007bff;
            text-decoration: none;
            font-size: 1rem;
            transition: background-color 0.2s, color 0.2s;
        }
        .btn:hover {
            background-color: #007bff;
            color: #fff;
        }
    </style>
</head>
<body>
    <h1>Hello, world!</h1>

    <?php if ($isLoggedIn): ?>
        <?php if ($userEmail !== ''): ?>
            <p class="user-info">ようこそ、<?= htmlspecialchars($userEmail, ENT_QUOTES, 'UTF-8') ?> さん</p>
        <?php endif; ?>
        <a class="btn" href="/logout.php">ログアウト</a>
    <?php else: ?>
        <a class="btn" href="/login">ログイン</a>
    <?php endif; ?>
</body>
</html>
