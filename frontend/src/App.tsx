/**
 * Root application component.
 * Wraps the router and shared UI providers (tooltip, toaster).
 */
import { lazy, Suspense } from "react";
import { Switch, Route } from "wouter";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Layout } from "@/components/layout";

// Route-level splitting keeps the first Vercel page load focused on the page
// the visitor requested instead of downloading every view.
const NotFound = lazy(() => import("@/pages/not-found"));
const Home = lazy(() => import("@/pages/home"));
const Destinations = lazy(() => import("@/pages/destinations"));
const Admin = lazy(() => import("@/pages/admin"));
const AdminSecurity = lazy(() => import("@/pages/admin-security"));

function App() {
  return (
    <TooltipProvider>
      <Layout>
        <Suspense fallback={<main className="min-h-screen" aria-busy="true" />}>
          <Switch>
            <Route path="/" component={Home} />
            <Route path="/destinations" component={Destinations} />
            <Route path="/admin" component={Admin} />
            <Route path="/admin/security" component={AdminSecurity} />
            <Route component={NotFound} />
          </Switch>
        </Suspense>
      </Layout>
      <Toaster />
    </TooltipProvider>
  );
}

export default App;
