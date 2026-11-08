"use client";
import { useSearchParams } from "next/navigation";
import { FlagQueue } from "./flag-queue";
import { readFlagPage } from "./moderation-client";
export function FlagsRoute() {
 const search=useSearchParams().toString();
 return <FlagQueue search={search} readPage={readFlagPage} navigate={href => window.history.pushState(null,"",href)}/>;
}
