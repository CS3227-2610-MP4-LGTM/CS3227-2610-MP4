import { RoleLanding } from "@/components/account/role-landing";
export const instant = false;
export default function Page(props: PageProps<"/learner/history">) {
  return <RoleLanding role="learner" heading="Review history" empty="No reviews yet." searchParams={props.searchParams} />;
}
