"use client";

import {
  BarChart3,
  Database,
  LayoutDashboard,
  Menu,
  PanelLeftClose,
  Sparkles,
  Upload,
  X,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";

export type AppView = "overview" | "product" | "opportunities" | "data";

const navItems: Array<{
  id: AppView;
  label: string;
  icon: typeof LayoutDashboard;
}> = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "product", label: "Product analysis", icon: BarChart3 },
  { id: "opportunities", label: "Opportunities", icon: Sparkles },
  { id: "data", label: "Data workspace", icon: Database },
];

const titles: Record<AppView, { eyebrow: string; title: string }> = {
  overview: { eyebrow: "Executive overview", title: "Pricing command center" },
  product: { eyebrow: "Product intelligence", title: "Product analysis" },
  opportunities: { eyebrow: "Decision queue", title: "Pricing opportunities" },
  data: { eyebrow: "Data workspace", title: "Import & validate" },
};

export function AppShell({
  activeView,
  onNavigate,
  productCount,
  dataLabel,
  children,
}: {
  activeView: AppView;
  onNavigate: (view: AppView) => void;
  productCount: number;
  dataLabel: string;
  children: ReactNode;
}) {
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [activeView]);

  const navigate = (view: AppView) => {
    setMenuOpen(false);
    onNavigate(view);
  };

  return (
    <div className="app-shell">
      <button
        className={`mobile-scrim ${menuOpen ? "mobile-scrim--visible" : ""}`}
        aria-label="Close navigation"
        onClick={() => setMenuOpen(false)}
      />

      <aside className={`sidebar ${menuOpen ? "sidebar--open" : ""}`}>
        <div className="brand">
          <span className="brand__mark" aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
          <span className="brand__name">PricePilot</span>
          <button
            className="sidebar__close"
            aria-label="Close navigation"
            onClick={() => setMenuOpen(false)}
          >
            <X size={18} />
          </button>
        </div>

        <nav className="primary-nav" aria-label="Primary navigation">
          <p className="nav-label">Workspace</p>
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                className={activeView === item.id ? "nav-item nav-item--active" : "nav-item"}
                onClick={() => navigate(item.id)}
              >
                <Icon size={18} strokeWidth={1.8} />
                <span>{item.label}</span>
                {item.id === "opportunities" && productCount > 0 && (
                  <span className="nav-count">{productCount}</span>
                )}
              </button>
            );
          })}
        </nav>

        <div className="sidebar__footer">
          <div className="data-status">
            <span className="data-status__pulse" />
            <div>
              <span>Active dataset</span>
              <strong>{dataLabel}</strong>
            </div>
          </div>
          <div className="model-note">
            <PanelLeftClose size={15} />
            <span>Deterministic model · No AI key</span>
          </div>
        </div>
      </aside>

      <main className="main-shell">
        <header className="topbar">
          <div className="topbar__title">
            <button
              className="mobile-menu"
              aria-label="Open navigation"
              onClick={() => setMenuOpen(true)}
            >
              <Menu size={20} />
            </button>
            <div>
              <span>{titles[activeView].eyebrow}</span>
              <h1>{titles[activeView].title}</h1>
            </div>
          </div>
          <div className="topbar__actions">
            <span className="dataset-pill">
              <span />
              {dataLabel}
            </span>
            <button className="button button--dark button--compact" onClick={() => navigate("data")}>
              <Upload size={16} />
              <span>Import data</span>
            </button>
          </div>
        </header>
        <div className="page-content">{children}</div>
      </main>
    </div>
  );
}
