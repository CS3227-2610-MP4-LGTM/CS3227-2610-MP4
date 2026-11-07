export type Role = "learner" | "author" | "ta";

export const roleLabels: Record<Role, string> = { learner: "Learner", author: "Author", ta: "TA" };
export const roleLinks = {
  learner: [
    { label: "Challenges", href: "/learner/challenges" },
    { label: "Review history", href: "/learner/history" },
  ],
  author: [
    { label: "My challenges", href: "/author/challenges" },
    { label: "Create challenge", href: "/author/challenges/new" },
  ],
  ta: [
    { label: "Submissions", href: "/ta/submissions" },
    { label: "Flagged submissions", href: "/ta/flags" },
    { label: "Learners", href: "/ta/learners" },
  ],
} satisfies Record<Role, { label: string; href: string }[]>;

export function workspaceHref(role: Role) { return roleLinks[role][0].href; }

export const accountNotices: Record<string, string> = {
  "account-created": "Account created.",
  "created-without-session": "Account created. Sign in to continue.",
  "signed-out": "You have signed out.",
  "sign-out-unconfirmed": "Local sign-out completed, but the service could not confirm sign-out. Sign in again to continue.",
  "sign-in-required": "Sign in to continue.",
  "session-expired": "Your session has expired. Sign in again.",
};
