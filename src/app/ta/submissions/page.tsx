import { RoleLanding } from "@/components/account/role-landing";
export const instant = false;
export default function Page(props: PageProps<"/ta/submissions">) {
  return <RoleLanding role="ta" heading="Submissions" empty="No submissions yet." searchParams={props.searchParams} />;
}
