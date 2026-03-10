#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { CertificateStack } from '../lib/certificate-stack';
import { CognitoStack } from '../lib/cognito-stack';
import { NetworkStack } from '../lib/network-stack';
import { AppStack } from '../lib/app-stack';

const app = new cdk.App();

const domainName = 'tokita202603.com';
const authSubdomain = 'auth';

const account = process.env.CDK_DEFAULT_ACCOUNT;
if (!account) {
  throw new Error(
    'CDK_DEFAULT_ACCOUNT が設定されていません。AWS CLI の認証情報を設定してください。'
  );
}

// ----------------------------------------------------------------
// CertificateStack (us-east-1)
// Cognito カスタムドメイン用 ACM 証明書
// ----------------------------------------------------------------
const certStack = new CertificateStack(app, 'CertificateStack', {
  env: { account, region: 'us-east-1' },
  domainName,
  authSubdomain,
  description: 'ACM certificate for Cognito custom domain (us-east-1 required)',
});

// ----------------------------------------------------------------
// CognitoStack (ap-northeast-1)
// UserPool と UserPoolClient のみ。
// カスタムドメインは AppStack で作成 (A レコード後に作成する必要があるため)。
// ----------------------------------------------------------------
const cognitoStack = new CognitoStack(app, 'CognitoStack', {
  env: { account, region: 'ap-northeast-1' },
  domainName,
  description: 'Cognito User Pool for authentication',
});

// ----------------------------------------------------------------
// NetworkStack (ap-northeast-1)
// ----------------------------------------------------------------
const networkStack = new NetworkStack(app, 'NetworkStack', {
  env: { account, region: 'ap-northeast-1' },
  description: 'VPC and network resources',
});

// ----------------------------------------------------------------
// AppStack (ap-northeast-1)
// ECS Fargate, ALB, Route53 A レコード, Cognito カスタムドメイン
//
// cognitoCertArn は deploy.sh が -c cognitoCertArn=<ARN> で渡す。
// ----------------------------------------------------------------
const cognitoCertArn: string =
  (app.node.tryGetContext('cognitoCertArn') as string | undefined) ??
  'arn:aws:acm:us-east-1:000000000000:certificate/00000000-0000-0000-0000-000000000000';

const appStack = new AppStack(app, 'AppStack', {
  env: { account, region: 'ap-northeast-1' },
  domainName,
  authSubdomain,
  cognitoCertificateArn: cognitoCertArn,
  vpc: networkStack.vpc,
  albSecurityGroup: networkStack.albSecurityGroup,
  ecsSecurityGroup: networkStack.ecsSecurityGroup,
  userPool: cognitoStack.userPool,
  userPoolClient: cognitoStack.userPoolClient,
  description: 'ECS Fargate app with ALB and Cognito authentication',
});
appStack.addDependency(networkStack);
appStack.addDependency(cognitoStack);

// certStack は AppStack (cognitoCertArn) に依存するが、
// ARN はコンテキスト文字列で渡すので CDK 依存は不要
void certStack;

app.synth();
