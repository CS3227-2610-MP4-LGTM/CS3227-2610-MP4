import { RoleLanding } from "@/components/account/role-landing";
export const instant = false;
export default function Page(props: PageProps<"/author/challenges">) {
  return <RoleLanding role="author" heading="My challenges" empty="No challenges yet." searchParams={props.searchParams} />;
}
