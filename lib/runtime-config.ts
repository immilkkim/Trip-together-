type RuntimeVariables = {
  [key: string]: string | undefined;
  TRIP_INVITE_TOKEN?: string;
  TRIP_REQUIRE_CONFIGURATION?: string;
  TRIP_STORAGE_ID?: string;
};

export function requiresConfiguration(variables: RuntimeVariables): boolean {
  return variables.TRIP_REQUIRE_CONFIGURATION === "true";
}

export function configuredInviteToken(variables: RuntimeVariables): string | undefined {
  const token = variables.TRIP_INVITE_TOKEN?.trim();
  if (token) return token;
  // A missing production secret must never enable the published demo invite.
  return requiresConfiguration(variables) ? undefined : "local-demo-invite";
}

export function storageId(variables: RuntimeVariables): string {
  return variables.TRIP_STORAGE_ID?.trim() || "demo-trip";
}
