import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import {
  Home,
  PlusCircle,
  PenSquare,
  Gift,
  User,
  Wallet,
  Sun,
  Moon,
  Menu,
  X,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { useWallet, shortenAddress } from "@/lib/contracts/wallet";
import { useTheme } from "@/lib/theme";
import { useTokenActions } from "@/lib/contracts/hooks";
import type { ReactNode } from "react";

// ── CiteChain Logo SVG ────────────────────────────────────────────────────────

function CiteChainLogo({ size = 28 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 28 28"
      fill="none"
      aria-label="CiteChain logo"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Chain link left arc */}
      <path
        d="M8 10 C4 10 2 13 2 14 C2 15 4 18 8 18 L11 18"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        fill="none"
      />
      {/* Chain link right arc */}
      <path
        d="M17 10 L20 10 C24 10 26 13 26 14 C26 15 24 18 20 18 L17 18"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        fill="none"
      />
      {/* Center connection */}
      <path
        d="M9 14 L19 14"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      {/* Citation quote mark — top-right */}
      <circle cx="22" cy="6" r="2" fill="currentColor" className="text-primary" />
      <circle cx="17" cy="6" r="2" fill="currentColor" className="text-primary" />
    </svg>
  );
}

// ── Nav items ─────────────────────────────────────────────────────────────────

const NAV_ITEMS = [
  { href: "/", label: "Feed", Icon: Home, testid: "nav-feed" },
  { href: "/create-bucket", label: "Create Bucket", Icon: PlusCircle, testid: "nav-create-bucket" },
  { href: "/publish", label: "Publish Article", Icon: PenSquare, testid: "nav-publish" },
  { href: "/claim", label: "Claim Rewards", Icon: Gift, testid: "nav-claim" },
  { href: "/profile", label: "My Profile", Icon: User, testid: "nav-profile" },
];

// ── Sidebar content ───────────────────────────────────────────────────────────

function SidebarContent({ onClose }: { onClose?: () => void }) {
  const [location] = useLocation();
  const { address, connect, disconnect, isConnecting, chainId } = useWallet();
  const { theme, toggleTheme } = useTheme();
  const { getBalance } = useTokenActions();
  const [citeBalance, setCiteBalance] = useState<string>("0");

  useEffect(() => {
    if (address) {
      getBalance().then(setCiteBalance).catch(() => setCiteBalance("0"));
    } else {
      setCiteBalance("0");
    }
  }, [address, getBalance]);

  const isActive = (href: string) => {
    if (href === "/") return location === "/" || location === "";
    return location.startsWith(href);
  };

  return (
    <div className="flex flex-col h-full" data-testid="sidebar">
      {/* Header */}
      <div className="flex items-center justify-between px-4 h-14 shrink-0">
        <Link href="/" data-testid="sidebar-logo">
          <span className="flex items-center gap-2.5 text-foreground hover:text-primary transition-colors">
            <CiteChainLogo size={26} />
            <span className="font-serif text-lg font-normal tracking-tight">CiteChain</span>
          </span>
        </Link>
        {onClose && (
          <button
            onClick={onClose}
            className="p-1 rounded-md text-muted-foreground hover:text-foreground transition-colors"
            data-testid="sidebar-close"
            aria-label="Close sidebar"
          >
            <X size={18} />
          </button>
        )}
      </div>

      <Separator />

      {/* Navigation */}
      <nav className="flex-1 px-3 py-3 space-y-0.5 overflow-y-auto" data-testid="sidebar-nav">
        {NAV_ITEMS.map(({ href, label, Icon, testid }) => (
          <Link key={href} href={href}>
            <span
              onClick={onClose}
              data-testid={testid}
              className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors cursor-pointer ${
                isActive(href)
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/60"
              }`}
            >
              <Icon size={16} className={isActive(href) ? "text-primary" : ""} />
              {label}
              {isActive(href) && <ChevronRight size={14} className="ml-auto text-primary" />}
            </span>
          </Link>
        ))}
      </nav>

      <Separator />

      {/* Bottom: wallet + theme */}
      <div className="px-3 py-3 space-y-2 shrink-0">
        {/* CITE balance (only when connected) */}
        {address && (
          <div
            className="flex items-center justify-between px-3 py-2 rounded-md bg-sidebar-accent/50"
            data-testid="cite-balance-display"
          >
            <span className="text-xs text-muted-foreground">CITE</span>
            <span className="text-xs font-medium font-mono">
              {parseFloat(citeBalance).toFixed(2)}
            </span>
          </div>
        )}

        {/* Wallet button */}
        {address ? (
          <div className="space-y-1">
            <div
              className="flex items-center gap-2 px-3 py-2 rounded-md bg-sidebar-accent/50"
              data-testid="wallet-address-display"
            >
              <Wallet size={14} className="text-primary shrink-0" />
              <span className="text-xs font-mono text-foreground truncate">{shortenAddress(address)}</span>
              {chainId !== 31337 && (
                <span className="ml-auto text-xs text-destructive shrink-0">Wrong chain</span>
              )}
            </div>
            <Button
              variant="outline"
              size="sm"
              className="w-full text-xs h-8"
              onClick={disconnect}
              data-testid="wallet-disconnect-btn"
            >
              Disconnect
            </Button>
          </div>
        ) : (
          <Button
            variant="default"
            size="sm"
            className="w-full text-xs h-8 gap-2"
            onClick={connect}
            disabled={isConnecting}
            data-testid="wallet-connect-btn"
          >
            <Wallet size={14} />
            {isConnecting ? "Connecting…" : "Connect Wallet"}
          </Button>
        )}

        {/* Theme toggle */}
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start gap-3 text-xs h-8 text-muted-foreground hover:text-foreground"
          onClick={toggleTheme}
          data-testid="theme-toggle"
          aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
        >
          {theme === "dark" ? <Sun size={14} /> : <Moon size={14} />}
          {theme === "dark" ? "Light mode" : "Dark mode"}
        </Button>
      </div>
    </div>
  );
}

// ── Layout ────────────────────────────────────────────────────────────────────

export function Layout({ children }: { children: ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="flex h-screen bg-background text-foreground overflow-hidden">
      {/* Desktop sidebar */}
      <aside
        className="hidden md:flex flex-col w-[240px] shrink-0 bg-sidebar border-r border-sidebar-border"
        data-testid="sidebar-desktop"
      >
        <SidebarContent />
      </aside>

      {/* Mobile sidebar overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
            data-testid="sidebar-backdrop"
          />
          {/* Drawer */}
          <aside className="absolute left-0 top-0 bottom-0 w-[240px] bg-sidebar border-r border-sidebar-border flex flex-col shadow-xl">
            <SidebarContent onClose={() => setMobileOpen(false)} />
          </aside>
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Mobile top bar */}
        <header className="md:hidden flex items-center gap-3 px-4 h-14 border-b border-border shrink-0 bg-background">
          <button
            onClick={() => setMobileOpen(true)}
            className="p-1 rounded-md text-muted-foreground hover:text-foreground transition-colors"
            data-testid="sidebar-open-btn"
            aria-label="Open navigation"
          >
            <Menu size={20} />
          </button>
          <span className="flex items-center gap-2 text-foreground">
            <CiteChainLogo size={22} />
            <span className="font-serif text-base font-normal">CiteChain</span>
          </span>
        </header>

        {/* Page content */}
        <main
          className="flex-1 overflow-y-auto px-4 py-6 md:px-8 md:py-8"
          data-testid="main-content"
        >
          {children}
        </main>
      </div>
    </div>
  );
}
