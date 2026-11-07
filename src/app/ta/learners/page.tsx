import { RoleLanding } from "@/components/account/role-landing";
export const instant = false;
export default function Page(props: PageProps<"/ta/learners">) {
  return <RoleLanding role="ta" heading="Learners" empty="No learners yet." searchParams={props.searchParams} />;
}
