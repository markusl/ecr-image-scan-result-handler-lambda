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
    console.log(JSON.stringify(event, undefined, 2)); 

    const imageScanCompletedEvent = JSON.parse(event.Records[0].Sns.Message);

    const repositoryName = imageScanCompletedEvent.detail['repository-name'];
    const params: AWS.ECR.DescribeImageScanFindingsRequest = {
        imageId: {
            imageTag: 'latest',
        },
        repositoryName,
    };

    const findingsResult = await ecr.describeImageScanFindings(params).promise();
    if (findingsResult.$response.error || !findingsResult.imageScanFindings) {
        throw new Error(JSON.stringify(findingsResult.$response.error));
    }

    const findings = findingsResult.imageScanFindings.findings;
    if (!findings) {
        console.log(`No image scan findings for ${findingsResult.repositoryName}`);
        return;
    }

    const amountOfFindings = findings.length;
    if (amountOfFindings > 0) {
        const summary = `Got ${amountOfFindings} security findings for ${repositoryName} at ${findingsResult.imageScanFindings.imageScanCompletedAt}`;
        const combinedDetails = findings.reduce((previous, current) =>
            `${current.name} (${current.severity}): ${current.uri}\n\n${previous}`, '');
        console.log(summary);
        console.log(combinedDetails);
        await sendEmail(summary, combinedDetails);
    }
};
