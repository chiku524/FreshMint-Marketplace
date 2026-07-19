"use client";

import { EngraveBackground } from "@/components/EngraveBackground";
import { variantFromPathname } from "@/components/engrave/variants";
import { usePathname } from "next/navigation";

/** Picks a distinct engraved plate from the current route. */
export function PageEngraveBackground() {
  const pathname = usePathname() || "/";
  const variant = variantFromPathname(pathname);
  return <EngraveBackground variant={variant} />;
}
