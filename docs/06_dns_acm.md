# Route 53 / ACM 設計

## 1. ドメイン管理

### 1.1 ドメイン情報

| 項目 | 値 |
|------|----|
| ドメイン名 | `tokita202603.com` |
| レジストラ | 取得済み |
| ホストゾーン | Route 53 パブリックホストゾーン |

### 1.2 前提条件

- ドメイン `tokita202603.com` は取得済み
- Route 53 にホストゾーンが作成済みであること (または CDK デプロイ前に作成する)
- CDK からはホストゾーン ID を参照して使用する

---

## 2. Route 53 ホストゾーン

| 項目 | 値 |
|------|----|
| ホストゾーン名 | `tokita202603.com` |
| タイプ | パブリックホストゾーン |
| レコードセット | 以下参照 |

### 2.1 DNS レコード

| レコード名 | タイプ | 値 / ターゲット | 目的 |
|-----------|--------|----------------|------|
| `tokita202603.com` | A (Alias) | ALB DNS 名 | メインサイト |
| `auth.tokita202603.com` | CNAME | Cognito ドメイン検証 | Cognito Hosted UI |
| ACM 検証レコード | CNAME | ACM 発行値 | 証明書ドメイン検証 |

---

## 3. ACM 証明書設計

### 3.1 証明書 1: ALB 用 (ap-northeast-1)

| 項目 | 値 |
|------|----|
| リージョン | `ap-northeast-1` (東京) |
| ドメイン | `tokita202603.com` |
| 追加ドメイン | `*.tokita202603.com` |
| 検証方法 | DNS 検証 (Route 53 で自動) |
| 用途 | ALB HTTPS リスナー |

### 3.2 証明書 2: Cognito カスタムドメイン用 (us-east-1)

| 項目 | 値 |
|------|----|
| リージョン | **`us-east-1` (バージニア北部)** |
| ドメイン | `auth.tokita202603.com` |
| 検証方法 | DNS 検証 (Route 53 で自動) |
| 用途 | Cognito ユーザープールカスタムドメイン |

> **重要:** Cognito カスタムドメインには CloudFront が使われるため、ACM 証明書は必ず **us-east-1** で作成する必要がある。

---

## 4. CDK での証明書作成とクロスリージョン対応

Cognito カスタムドメイン用証明書は us-east-1 で作成する必要があるため、
CDK では `Certificate` の `region` オプション または クロスリージョンスタックを使用する。

### 4.1 実装方針

```typescript
// us-east-1 の証明書 (Cognito 用)
// 別スタックで us-east-1 に作成する
class CertificateStack extends cdk.Stack {
  public readonly cognitoCertificate: acm.Certificate;

  constructor(scope: Construct, id: string, props: cdk.StackProps) {
    super(scope, id, {
      ...props,
      env: { region: 'us-east-1' }, // バージニア北部を指定
    });

    this.cognitoCertificate = new acm.Certificate(this, 'CognitoCert', {
      domainName: 'auth.tokita202603.com',
      validation: acm.CertificateValidation.fromDns(hostedZone),
    });
  }
}

// ap-northeast-1 の証明書 (ALB 用)
const albCertificate = new acm.Certificate(this, 'AlbCert', {
  domainName: 'tokita202603.com',
  subjectAlternativeNames: ['*.tokita202603.com'],
  validation: acm.CertificateValidation.fromDns(hostedZone),
});
```

### 4.2 Route 53 A レコード (ALB Alias)

```typescript
new route53.ARecord(this, 'AlbARecord', {
  zone: hostedZone,
  recordName: 'tokita202603.com',
  target: route53.RecordTarget.fromAlias(
    new route53Targets.LoadBalancerTarget(alb)
  ),
});
```

---

## 5. Cognito カスタムドメイン検証フロー

```
1. CDK が us-east-1 で ACM 証明書を作成
2. ACM が DNS 検証用 CNAME レコードを Route 53 に自動追加
3. ACM が証明書を発行 (数分)
4. CDK が Cognito カスタムドメイン auth.tokita202603.com を作成
5. Cognito が Route 53 に CNAME レコードを追加
   auth.tokita202603.com → <cognito-domain>.cloudfront.net
```
