<?php
$cognitoDomain = getenv('COGNITO_DOMAIN') ?: 'auth.tokita202603.com';
$clientId = getenv('COGNITO_CLIENT_ID') ?: '';
$logoutUri = 'https://tokita202603.com/';

$logoutUrl = sprintf(
    'https://%s/logout?client_id=%s&logout_uri=%s',
    $cognitoDomain,
    urlencode($clientId),
    urlencode($logoutUri)
);

header('Location: ' . $logoutUrl);
exit;
