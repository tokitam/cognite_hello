<?php
/**
 * ログアウト処理
 *
 * ALB は Cognito 認証後に AWSELBAuthSessionCookie-0 (および -1) という
 * セッションクッキーを発行する。Cognito の /logout エンドポイントを呼ぶだけでは
 * Cognito サーバー側のセッションは無効になるが、ブラウザの ALB クッキーは残る。
 * そのため、ALB クッキーを先に削除してから Cognito ログアウトへリダイレクトする。
 */

// ALB セッションクッキーを削除 (過去日時で上書き)
// ALB は sessionCookieName を基に -0, -1 ... と分割して設定する
$albCookieNames = ['AWSELBAuthSessionCookie-0', 'AWSELBAuthSessionCookie-1'];
foreach ($albCookieNames as $name) {
    setcookie($name, '', [
        'expires'  => time() - 3600,
        'path'     => '/',
        'secure'   => true,
        'httponly' => true,
        'samesite' => 'Lax',
    ]);
}

// Cognito ログアウトエンドポイントへリダイレクト
// → Cognito サーバー側のセッションも無効化される
$cognitoDomain = getenv('COGNITO_DOMAIN') ?: 'auth.tokita202603.com';
$clientId      = getenv('COGNITO_CLIENT_ID') ?: '';
$logoutUri     = 'https://tokita202603.com/';

$logoutUrl = sprintf(
    'https://%s/logout?client_id=%s&logout_uri=%s',
    $cognitoDomain,
    urlencode($clientId),
    urlencode($logoutUri)
);

header('Location: ' . $logoutUrl);
exit;
