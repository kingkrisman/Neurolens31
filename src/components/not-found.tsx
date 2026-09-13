import { Link } from "@tanstack/react-router";
import { PublicLayout } from "@/components/public-layout";
import { Button } from "@/components/ui/button";

export function NotFound() {
  return (
    <PublicLayout eyebrow="404" title="This page is not here.">
      <p>The page you requested does not exist, or it has moved.</p>
      <Button asChild className="mt-4">
        <Link to="/">Return home</Link>
      </Button>
    </PublicLayout>
  );
}
