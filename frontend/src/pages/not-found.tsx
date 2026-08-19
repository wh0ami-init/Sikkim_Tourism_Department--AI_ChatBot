import { Link } from "wouter";
import { MapPin } from "lucide-react";

export default function NotFound() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center p-8 animate-rise-fade">
      <div className="animate-ambient-drift w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-6">
        <MapPin className="w-10 h-10 text-primary/40" />
      </div>
      <h2 className="font-serif text-3xl font-bold text-foreground mb-3">
        Page not found
      </h2>
      <p className="text-muted-foreground mb-6">
        The trail you followed seems to have ended here.
      </p>
      <Link
        href="/"
        className="interactive-lift rounded-full bg-primary/10 px-4 py-2 text-primary text-sm font-medium hover:bg-primary/15"
      >
        Return to guide
      </Link>
    </div>
  );
}
