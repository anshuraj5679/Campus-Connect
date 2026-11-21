import { ForbiddenView } from "@/components/shared/forbidden-view";

/** Rendered (with HTTP 403) when a page calls forbidden(), e.g. another student's complaint. */
export default function Forbidden() {
  return <ForbiddenView />;
}
