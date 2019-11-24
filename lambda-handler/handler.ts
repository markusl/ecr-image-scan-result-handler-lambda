import * as AWS from 'aws-sdk';
import * as Lambda from 'aws-lambda';
const ecr = new AWS.ECR();
const ses = new AWS.SES();

const sendEmail = async (subject: string, content: string) => {
    const fromAddress = process.env.FROM_ADDRESS;
    if (!fromAddress) {
        throw new Error('Missing FROM_ADDRESS');
    }
    const toAddress = process.env.TO_ADDRESS;
    if (!toAddress) {
        throw new Error('Missing TO_ADDRESS');
    }

    const emailParams: AWS.SES.Types.SendEmailRequest = {
        Source: fromAddress,
        Destination: {
            ToAddresses: [toAddress],
        },
        Message: {
            Subject: { Data: subject },
            Body: { Text: { Data: content } },
        }
    };
    const response = await ses.sendEmail(emailParams).promise();
    console.log(response);
};

exports.handler = async (event: Lambda.SNSEvent) => {
    console.log(JSON.stringify(event));

    const imageScanCompletedEvent = JSON.parse(event.Records[0].Sns.Message);

    const repositoryName = imageScanCompletedEvent.detail['repository-name'];
    const params: AWS.ECR.DescribeImageScanFindingsRequest = {
        imageId: {
            imageTag: 'latest',
        },
        repositoryName,
    };

    const findings = await ecr.describeImageScanFindings(params).promise();
    if (findings.$response.error || findings.imageScanFindings === undefined) {
        throw new Error(JSON.stringify(findings.$response.error));
    }

    if (!findings.imageScanFindings.findings) {
        console.log(`No image scan findings for ${findings.repositoryName}`);
        return;
    }

    const numFindings = findings.imageScanFindings.findings.length;
    const summary = `Got ${numFindings} security findings for ${repositoryName} at ${findings.imageScanFindings.imageScanCompletedAt}`;
    if (numFindings) {
        const details = findings.imageScanFindings.findings.map((finding) =>
            `${finding.name} (${finding.severity}): ${finding.uri}`);
        const combinedDetails = details.reduce((previous, current) => `${previous}\n\n${current}`);
        console.log(summary);
        console.log(combinedDetails);
        await sendEmail(summary, combinedDetails);
    }
};

// Test event
// {
//     "version": "0",
//     "id": "99c9ba1f-bba7-95c3-ca10-5d6dc8a992ee",
//     "detail-type": "ECR Image Scan",
//     "source": "aws.ecr",
//     "account": "804416728801",
//     "time": "2019-11-14T09:52:31Z",
//     "region": "eu-central-1",
//     "resources": ["arn:aws:ecr:eu-central-1:804416728801:repository/repository-name"],
//     "detail": {
//         "scan-status": "COMPLETE",
//         "repository-name": "repository-name",
//         "image-digest": "sha256:99c9ba1fbba795c3ca105d6dc8a992ee99c9ba1fbba795c3ca105d6dc8a992ee",
//         "image-tags": ["99c9ba1fbba795c3ca105d6dc8a992ee", "latest"]
//     }
// };
