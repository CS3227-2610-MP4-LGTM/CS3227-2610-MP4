import { RoleLanding } from "@/components/account/role-landing";
export const instant = false;
export default function Page(props: PageProps<"/learner/challenges">) {
  return <RoleLanding role="learner" heading="Challenges" empty="No challenges available." searchParams={props.searchParams} />;
}
