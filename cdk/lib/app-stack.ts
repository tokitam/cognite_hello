import * as path from 'path';
import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as actions from 'aws-cdk-lib/aws-elasticloadbalancingv2-actions';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as route53Targets from 'aws-cdk-lib/aws-route53-targets';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as ecrAssets from 'aws-cdk-lib/aws-ecr-assets';
import { Construct } from 'constructs';

export interface AppStackProps extends cdk.StackProps {
  readonly domainName: string;
  readonly authSubdomain: string;
  /**
   * us-east-1 で発行した Cognito カスタムドメイン用 ACM 証明書 ARN
   * deploy.sh が -c cognitoCertArn=<ARN> として渡す
   */
  readonly cognitoCertificateArn: string;
  readonly vpc: ec2.Vpc;
  readonly albSecurityGroup: ec2.SecurityGroup;
  readonly ecsSecurityGroup: ec2.SecurityGroup;
  readonly userPool: cognito.UserPool;
  readonly userPoolClient: cognito.UserPoolClient;
}

/**
 * アプリケーションスタック
 *
 * 作成順序 (Cognito custom domain の制約に対応):
 *   1. ACM 証明書 (ALB 用, ap-northeast-1)
 *   2. ALB
 *   3. Route53 A レコード (tokita202603.com → ALB)
 *      ★ここで親ドメインが DNS 解決可能になる
 *   4. Cognito UserPoolDomain (A レコードに依存)
 *   5. Route53 CNAME (auth.tokita202603.com → Cognito CloudFront)
 *   6. ALB HTTPS リスナー (Cognito 認証付き)
 *   7. ECS クラスター・タスク・サービス
 */
export class AppStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: AppStackProps) {
    super(scope, id, props);

    // ------------------------------------------------
    // Route53 ホストゾーン & ACM 証明書 (ALB 用, ap-northeast-1)
    // ------------------------------------------------
    const hostedZone = route53.HostedZone.fromLookup(this, 'HostedZone', {
      domainName: props.domainName,
    });

    const albCertificate = new acm.Certificate(this, 'AlbCertificate', {
      domainName: props.domainName,
      subjectAlternativeNames: [`www.${props.domainName}`],
      validation: acm.CertificateValidation.fromDns(hostedZone),
    });

    // ------------------------------------------------
    // ECS クラスター
    // ------------------------------------------------
    const cluster = new ecs.Cluster(this, 'Cluster', {
      clusterName: 'CognitoSampleCluster',
      vpc: props.vpc,
    });

    // ------------------------------------------------
    // Docker イメージ (CDK が ECR へ自動ビルド & プッシュ)
    // ------------------------------------------------
    const imageAsset = new ecrAssets.DockerImageAsset(this, 'PhpAppImage', {
      directory: path.join(__dirname, '../../app'),
      platform: ecrAssets.Platform.LINUX_AMD64,
    });

    // ------------------------------------------------
    // CloudWatch ロググループ
    // ------------------------------------------------
    const logGroup = new logs.LogGroup(this, 'LogGroup', {
      logGroupName: '/ecs/cognito-sample',
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // ------------------------------------------------
    // ECS タスク定義
    // ------------------------------------------------
    const taskDefinition = new ecs.FargateTaskDefinition(this, 'TaskDef', {
      memoryLimitMiB: 512,
      cpu: 256,
    });

    taskDefinition.addContainer('PhpApp', {
      image: ecs.ContainerImage.fromDockerImageAsset(imageAsset),
      portMappings: [{ containerPort: 80 }],
      environment: {
        COGNITO_DOMAIN: `${props.authSubdomain}.${props.domainName}`,
        COGNITO_CLIENT_ID: props.userPoolClient.userPoolClientId,
      },
      logging: ecs.LogDrivers.awsLogs({
        streamPrefix: 'php-app',
        logGroup,
      }),
      healthCheck: {
        command: ['CMD-SHELL', 'curl -f http://localhost/health.php || exit 1'],
        interval: cdk.Duration.seconds(30),
        timeout: cdk.Duration.seconds(5),
        retries: 3,
        startPeriod: cdk.Duration.seconds(60),
      },
    });

    // ------------------------------------------------
    // ECS サービス (タスク数: 2, プライベートサブネット)
    // ------------------------------------------------
    const service = new ecs.FargateService(this, 'Service', {
      serviceName: 'CognitoSampleService',
      cluster,
      taskDefinition,
      desiredCount: 2,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      securityGroups: [props.ecsSecurityGroup],
      assignPublicIp: false,
    });

    // ------------------------------------------------
    // ALB
    // ------------------------------------------------
    const alb = new elbv2.ApplicationLoadBalancer(this, 'ALB', {
      loadBalancerName: 'CognitoSampleAlb',
      vpc: props.vpc,
      internetFacing: true,
      securityGroup: props.albSecurityGroup,
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
    });

    // HTTP → HTTPS リダイレクト (ポート 80)
    alb.addListener('HttpListener', {
      port: 80,
      defaultAction: elbv2.ListenerAction.redirect({
        protocol: 'HTTPS',
        port: '443',
        permanent: true,
      }),
    });

    // ターゲットグループ
    const targetGroup = new elbv2.ApplicationTargetGroup(this, 'TargetGroup', {
      targetGroupName: 'CognitoSampleTG',
      vpc: props.vpc,
      port: 80,
      protocol: elbv2.ApplicationProtocol.HTTP,
      targetType: elbv2.TargetType.IP,
      healthCheck: {
        path: '/health.php',
        interval: cdk.Duration.seconds(30),
        healthyThresholdCount: 2,
        unhealthyThresholdCount: 3,
        timeout: cdk.Duration.seconds(5),
        healthyHttpCodes: '200',
      },
    });

    service.attachToApplicationTargetGroup(targetGroup);

    // ------------------------------------------------
    // Route53 A レコード (tokita202603.com → ALB)
    //
    // ★ Cognito カスタムドメイン作成前にこの A レコードが必要。
    //   Cognito は親ドメインが DNS で解決できることを検証するため。
    // ------------------------------------------------
    const albARecord = new route53.ARecord(this, 'AlbARecord', {
      zone: hostedZone,
      recordName: props.domainName,
      target: route53.RecordTarget.fromAlias(
        new route53Targets.LoadBalancerTarget(alb)
      ),
    });

    // ------------------------------------------------
    // Cognito カスタムドメイン (auth.tokita202603.com)
    //
    // A レコード作成後に作成する (DNS 解決可能になった後)。
    // ------------------------------------------------
    const cognitoCert = acm.Certificate.fromCertificateArn(
      this, 'CognitoCert', props.cognitoCertificateArn
    );

    // props.userPool.addDomain() は CognitoStack のノードに追加されるため循環依存が発生する。
    // new UserPoolDomain(this, ...) で AppStack スコープに直接作成する。
    const userPoolDomain = new cognito.UserPoolDomain(this, 'CognitoCustomDomain', {
      userPool: props.userPool,
      customDomain: {
        domainName: `${props.authSubdomain}.${props.domainName}`,
        certificate: cognitoCert,
      },
    });

    // A レコードが作成された後に Cognito ドメインを作成するよう明示的に依存関係を設定
    userPoolDomain.node.addDependency(albARecord);

    // ------------------------------------------------
    // Route53 CNAME (auth.tokita202603.com → Cognito CloudFront)
    // ------------------------------------------------
    new route53.CnameRecord(this, 'AuthCnameRecord', {
      zone: hostedZone,
      recordName: props.authSubdomain,
      domainName: userPoolDomain.cloudFrontDomainName,
      ttl: cdk.Duration.minutes(5),
    });

    // ------------------------------------------------
    // HTTPS リスナー + Cognito 認証 (ポート 443)
    // ------------------------------------------------
    alb.addListener('HttpsListener', {
      port: 443,
      certificates: [albCertificate],
      sslPolicy: elbv2.SslPolicy.RECOMMENDED_TLS,
      defaultAction: new actions.AuthenticateCognitoAction({
        userPool: props.userPool,
        userPoolClient: props.userPoolClient,
        userPoolDomain,
        next: elbv2.ListenerAction.forward([targetGroup]),
        sessionTimeout: cdk.Duration.days(7),
        sessionCookieName: 'AWSELBAuthSessionCookie',
      }),
    });

    // ------------------------------------------------
    // Outputs
    // ------------------------------------------------
    new cdk.CfnOutput(this, 'AlbDnsName', {
      value: alb.loadBalancerDnsName,
      description: 'ALB DNS name',
    });
    new cdk.CfnOutput(this, 'AppUrl', {
      value: `https://${props.domainName}`,
      description: 'Application URL',
    });
  }
}
