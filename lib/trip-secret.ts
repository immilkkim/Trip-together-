import "server-only";
import { configuredInviteToken } from "./runtime-config";

// Configure a private token for your own deployment. The example is for local demos.
export const INVITE_TOKEN = configuredInviteToken(process.env);
