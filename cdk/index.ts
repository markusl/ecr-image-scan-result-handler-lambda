import * as cdk from '@aws-cdk/core';
import * as lambda from '@aws-cdk/aws-lambda';
import * as iam from '@aws-cdk/aws-iam';
import * as sns from '@aws-cdk/aws-sns';
import * as ecr from '@aws-cdk/aws-ecr';
import * as targets from '@aws-cdk/aws-events-targets';
import * as sns_subs from '@aws-cdk/aws-sns-subscriptions';

const basicLambdaPolicy = iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole');
const componentName = 'EcrImageScanResultHandler';

export const createEcrImageScanResultHandlerStack = (
    scope: cdk.Construct,
    notificationTopicArn: string,
    fromAddress: string,
    toAddress: string,
    props: cdk.StackProps) =>
{
    const lambdaStack = new cdk.Stack(scope, componentName, props);
    const lambdaLayerCode = lambda.Code.fromAsset('../lambda-runtime-layer');
    const lambdaCode = lambda.Code.fromAsset('../lambda-handler/dist');

    const roleName = `${componentName}-role`;
    const lambdaRole = new iam.Role(lambdaStack, roleName, {
        roleName,
        assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
        inlinePolicies: {
            ecrPolicy: new iam.PolicyDocument({
                statements: [new iam.PolicyStatement({
                    actions: ['ecr:DescribeImageScanFindings'],
                    resources: ['*'],
                })],
            }),
            emailPolicy: new iam.PolicyDocument({
                statements: [new iam.PolicyStatement({
                    actions: ['ses:SendEmail'],
                    resources: ['*'],
                    conditions: {
                    'StringEquals': {
                        'ses:FromAddress': fromAddress,
                    },
                    }
                })
            ]}),
        }
    });
    lambdaRole.addManagedPolicy(basicLambdaPolicy);

    const lambdaLibLayer = new lambda.LayerVersion(lambdaStack, `${componentName}-AwsSdkLayer`, {
        code: lambdaLayerCode,
        compatibleRuntimes: [lambda.Runtime.NODEJS_12_X],
        description: 'A layer to include AWS SDK for Lambda',
    });

    const ecrScanResultHandlerLambda = new lambda.Function(lambdaStack, componentName, {
        functionName: componentName,
        description: `Handler for ECR Image Scan results`,
        runtime: lambda.Runtime.NODEJS_12_X,
        handler: 'handler.handler',
        role: lambdaRole,
        code: lambdaCode,
        layers: [lambdaLibLayer],
        environment: {
            FROM_ADDRESS: fromAddress,
            TO_ADDRESS: toAddress,
        }
    });

    const notificationTopic = sns.Topic.fromTopicArn(lambdaStack, `${componentName}-Topic`, notificationTopicArn);
    notificationTopic.addSubscription(new sns_subs.LambdaSubscription(ecrScanResultHandlerLambda));
};

const app = new cdk.App();
export const CdkEnvironment: cdk.Environment = {
  // TODO Setup your variables
  // region: 'eu-central-1',
};

// This is just some sample code for you to try this out:
// 1. First deploy 'ExampleStack' (cdk deploy ExampleStack)
// 2. Save the output ExampleStack.ImageScanCompletedTopicOutput and configure cdk.json
// 3. Deploy stack EcrImageScanResultHandler
const exampleStack = new cdk.Stack(app, 'ExampleStack');
const exampleRepository = new ecr.Repository(exampleStack, `ExampleEcrRepository`);
const exampleTopic = new sns.Topic(exampleStack, 'ImageScanCompletedTopic');
exampleRepository.onImageScanCompleted(`ScanResults`, {
    target: new targets.SnsTopic(exampleTopic),
});
new cdk.CfnOutput(exampleStack, `ImageScanCompletedTopicOutput`, { value: exampleTopic.topicArn });

const fromAddress = app.node.tryGetContext('from_email');
const toAddress = app.node.tryGetContext('target_email');
const notificationTopicArn = app.node.tryGetContext('notification_topic');
createEcrImageScanResultHandlerStack(app, notificationTopicArn, fromAddress, toAddress, { env: CdkEnvironment });
