import { type ReactNode, useCallback } from "react";
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { AuthProvider } from "@workspace/replit-auth-web";
import { ErrorBoundary } from "@/components/error-boundary";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Dashboard from "@/pages/dashboard";
import Ministries from "@/pages/ministries";
import Ministry from "@/pages/ministry";
import Administration from "@/pages/administration";
import Integrations from "@/pages/integrations";
import Imports from "@/pages/imports";
import SystemPage from "@/pages/system";
import Documentation from "@/pages/documentation";
import DocumentPage from "@/pages/document";
import { AppShell } from "@/components/shell";
import { Redirect, Route, Switch, useLocation, Router as WouterRouter } from "wouter";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 300000, refetchOnWindowFocus: false, retry: 1 },
  },
});

function Router() {
  return (
    <AppShell>
      <RoutedErrorBoundary>
        <Switch>
          <Route path="/" component={Dashboard} />
          <Route path="/attendance">
            <Redirect to="/ministries/service-programming" />
          </Route>
          <Route path="/ministries" component={Ministries} />
          <Route path="/ministries/:slug" component={Ministry} />
          <Route path="/administration" component={Administration} />
          <Route path="/administration/integrations" component={Integrations} />
          <Route path="/administration/imports" component={Imports} />
          <Route path="/system" component={SystemPage} />
          <Route path="/documentation" component={Documentation} />
          <Route path="/documentation/:slug" component={DocumentPage} />
          <Route component={NotFound} />
        </Switch>
      </RoutedErrorBoundary>
    </AppShell>
  );
}

function AuthenticatedApp() {
  const queryClient = useQueryClient();
  const onIdentityChange = useCallback(() => {
    return queryClient.cancelQueries().then(() => queryClient.clear());
  }, [queryClient]);
  return (
    <AuthProvider onIdentityChange={onIdentityChange}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </AuthProvider>
  );
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthenticatedApp />
    </QueryClientProvider>
  );
}

export default App;
