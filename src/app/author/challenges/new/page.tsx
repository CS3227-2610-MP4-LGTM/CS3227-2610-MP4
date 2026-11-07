import { RoleLanding } from "@/components/account/role-landing";
export const instant = false;
export default function Page(props: PageProps<"/author/challenges/new">) {
  return <RoleLanding role="author" heading="Create challenge" searchParams={props.searchParams} />;
}
