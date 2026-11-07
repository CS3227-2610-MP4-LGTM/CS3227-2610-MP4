import "server-only";
import { headers } from "next/headers";

// The proxy strips the incoming header and sets it only after a failed refresh.
// This hint chooses presentation only; getAccount independently authorizes.
export async function signInNotice() {
  try {
    return (await headers()).get("x-lgtm-session-expired") === "1"
      ? "session-expired" : "sign-in-required";
  } catch {
    // A caller without a request context has no refresh evidence.
    return "sign-in-required";
  }
}
