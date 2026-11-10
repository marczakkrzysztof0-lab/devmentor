"use client";

import { useRouter } from "next/navigation";
import { MentorPayouts } from "@devmentor/ui/product";
import type { ComponentProps } from "react";

type Props = Omit<ComponentProps<typeof MentorPayouts>, "onRefresh">;

/** Client boundary for refreshing payout data after a manual status check. */
export default function MentorPayoutsClient(props: Props) {
  const router = useRouter();
  return <MentorPayouts {...props} onRefresh={() => router.refresh()} />;
}
