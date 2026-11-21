import Link from "next/link";
import { FileQuestionMark as FileQuestion } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-background px-4">
      <div className="max-w-sm text-center">
        <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-muted">
          <FileQuestion aria-hidden className="size-6 text-muted-foreground" />
        </div>
        <p className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">Error 404</p>
        <h1 className="mt-1 text-xl font-semibold tracking-tight">Page not found</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you are looking for does not exist or has been moved.
        </p>
        <Button asChild className="mt-6">
          <Link href="/">Back to my dashboard</Link>
        </Button>
      </div>
    </main>
  );
}
