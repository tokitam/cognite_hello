import * as cdk from 'aws-cdk-lib';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as route53 from 'aws-cdk-lib/aws-route53';
import { Construct } from 'constructs';

export interface CertificateStackProps extends cdk.StackProps {
  readonly domainName: string;
  readonly authSubdomain: string;
}

/**
 * Cognito カスタムドメイン用 ACM 証明書スタック
 *
 * Cognito ホスト UI のカスタムドメインは CloudFront を使用するため、
 * ACM 証明書は必ず us-east-1 (バージニア北部) で作成する必要がある。
 * このスタックは us-east-1 にデプロイすること。
 */
export class CertificateStack extends cdk.Stack {
  public readonly cognitoCertificate: acm.ICertificate;

  constructor(scope: Construct, id: string, props: CertificateStackProps) {
    super(scope, id, props);

    const hostedZone = route53.HostedZone.fromLookup(this, 'HostedZone', {
      domainName: props.domainName,
    });

    // auth.tokita202603.com 用証明書 (us-east-1 必須)
    this.cognitoCertificate = new acm.Certificate(this, 'CognitoCert', {
      domainName: `${props.authSubdomain}.${props.domainName}`,
      validation: acm.CertificateValidation.fromDns(hostedZone),
    });

    new cdk.CfnOutput(this, 'CognitoCertificateArn', {
      value: this.cognitoCertificate.certificateArn,
      description: 'Cognito custom domain ACM certificate ARN (us-east-1)',
    });
  }
}
