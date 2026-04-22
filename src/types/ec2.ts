export interface AwsRegion {
  code: string;
  name: string;
  group: string;
}

export interface Ec2Tag {
  Key: string;
  Value: string;
}

export interface Ec2BlockDevice {
  DeviceName: string;
  VolumeId?: string;
  Status?: string;
  AttachTime?: string;
  DeleteOnTermination?: boolean;
  Size?: number;
  VolumeType?: string;
  Iops?: number;
  Throughput?: number;
  Encrypted?: boolean;
  SnapshotId?: string;
  AvailabilityZone?: string;
  CreateTime?: string;
}

export interface Ec2NetworkInterface {
  NetworkInterfaceId: string;
  SubnetId?: string;
  VpcId?: string;
  Description?: string;
  Status?: string;
  MacAddress?: string;
  PrivateIpAddress?: string;
  PrivateDnsName?: string;
  SourceDestCheck?: boolean;
  Groups?: { GroupId: string; GroupName: string }[];
  OwnerId?: string;
  AttachmentId?: string;
  AttachmentStatus?: string;
  DeviceIndex?: number;
  DeleteOnTermination?: boolean;
  PublicIp?: string;
  AssociationPublicDnsName?: string;
}

export interface Ec2SecurityGroup {
  GroupId: string;
  GroupName: string;
}

export interface Ec2Instance {
  InstanceId: string;
  Name: string;
  State: string;
  StateReason?: string;
  InstanceType: string;
  AvailabilityZone: string;
  PrivateIpAddress?: string;
  PublicIpAddress?: string;
  PrivateDnsName?: string;
  PublicDnsName?: string;
  ImageId: string;
  KeyName?: string;
  LaunchTime: string;
  VpcId?: string;
  SubnetId?: string;
  Architecture?: string;
  Platform?: string;
  PlatformDetails?: string;
  RootDeviceName?: string;
  RootDeviceType?: string;
  VirtualizationType?: string;
  Hypervisor?: string;
  EbsOptimized?: boolean;
  Monitoring?: string;
  CpuCoreCount?: number;
  CpuThreadsPerCore?: number;
  IamInstanceProfile?: string;
  Tags: Ec2Tag[];
  SecurityGroups: Ec2SecurityGroup[];
  BlockDeviceMappings: Ec2BlockDevice[];
  NetworkInterfaces: Ec2NetworkInterface[];
}
