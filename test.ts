import { EC2Client, DescribeInstancesCommand } from "@aws-sdk/client-ec2";

type EC2Instance = {
  instanceId?: string;
  instanceType?: string;
  state?: string;
  privateIp?: string;
  publicIp?: string;
};

const ec2Client = new EC2Client({
  region: process.env.AWS_REGION || "ap-southeast-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "",
  },
});

async function listInstances(): Promise<void> {
  try {
    const command = new DescribeInstancesCommand({});
    const response = await ec2Client.send(command);

    const instances: EC2Instance[] = [];

    response.Reservations?.forEach((reservation) => {
      reservation.Instances?.forEach((instance) => {
        instances.push({
          instanceId: instance.InstanceId,
          instanceType: instance.InstanceType,
          state: instance.State?.Name,
          privateIp: instance.PrivateIpAddress,
          publicIp: instance.PublicIpAddress,
        });
      });
    });

    console.log("✅ EC2 Instances:", instances);
  } catch (error) {
    console.error("❌ Error fetching instances:", error);
  }
}

listInstances();