import { RoleLanding } from "@/components/account/role-landing";
export const instant = false;
export default function Page(props: PageProps<"/ta/flags">) {
  return <RoleLanding role="ta" heading="Flagged submissions" empty="No flagged submissions." searchParams={props.searchParams} />;
}
