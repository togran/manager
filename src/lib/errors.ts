type AwsLikeError = Error & {
  name?: string;
  $metadata?: { httpStatusCode?: number };
};

const AWS_FRIENDLY_MESSAGES: Record<string, string> = {
  AccessDenied: "You are not authorized to perform this AWS action.",
  UnauthorizedOperation: "You are not authorized to perform this AWS action.",
  AuthFailure: "AWS credentials are invalid or expired.",
  ExpiredToken: "AWS session expired. Please retry after refreshing credentials.",
  InvalidClientTokenId: "AWS credentials are invalid.",
  RequestLimitExceeded: "AWS rate limit reached. Please retry in a moment.",
  Throttling: "AWS rate limit reached. Please retry in a moment.",
  ThrottlingException: "AWS rate limit reached. Please retry in a moment.",
};

export function getFriendlyAwsErrorMessage(error: unknown, fallback: string) {
  if (!(error instanceof Error)) return fallback;
  const awsError = error as AwsLikeError;
  const mappedByName = awsError.name ? AWS_FRIENDLY_MESSAGES[awsError.name] : undefined;
  if (mappedByName) return mappedByName;

  if (awsError.$metadata?.httpStatusCode === 403) {
    return "AWS denied this request. Please verify role permissions.";
  }

  if (/credentials|token|signature/i.test(awsError.message)) {
    return "AWS credentials could not be validated. Please check credential provider.";
  }

  return fallback;
}
