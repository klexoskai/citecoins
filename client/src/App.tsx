import { Switch, Route, Router } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { WalletProvider } from "@/lib/contracts/wallet";
import { ThemeProvider } from "@/lib/theme";
import { Layout } from "@/components/layout";
import NotFound from "@/pages/not-found";

// ── Pages ──────────────────────────────────────────────────────────────────────
import Feed from "@/pages/feed";
import BucketDetail from "@/pages/bucket-detail";
import CreateBucket from "@/pages/create-bucket";
import CreateEpoch from "@/pages/create-epoch";
import Publish from "@/pages/publish";
import EpochDetail from "@/pages/epoch-detail";
import ArticleDetail from "@/pages/article-detail";
import Claim from "@/pages/claim";
import Profile from "@/pages/profile";

// ── Router ─────────────────────────────────────────────────────────────────────

function AppRouter() {
  return (
    <Layout>
      <Switch>
        <Route path="/" component={Feed} />
        <Route path="/buckets/:id" component={BucketDetail} />
        <Route path="/create-bucket" component={CreateBucket} />
        <Route path="/create-epoch" component={CreateEpoch} />
        <Route path="/publish" component={Publish} />
        <Route path="/epochs/:id" component={EpochDetail} />
        <Route path="/articles/:id" component={ArticleDetail} />
        <Route path="/claim" component={Claim} />
        <Route path="/profile" component={Profile} />
        <Route component={NotFound} />
      </Switch>
    </Layout>
  );
}

// ── App ────────────────────────────────────────────────────────────────────────

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <WalletProvider>
        <ThemeProvider>
          <TooltipProvider>
            <Toaster />
            <Router hook={useHashLocation}>
              <AppRouter />
            </Router>
          </TooltipProvider>
        </ThemeProvider>
      </WalletProvider>
    </QueryClientProvider>
  );
}

export default App;
