"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Bell, LogOut, Menu, Moon, Sun, User, X } from "lucide-react";

import { useAuth } from "@/components/auth/AuthProvider";
import { usePageTransition, useTheme } from "@/components/app-shell";
import { LanguageSwitcher, useTranslation } from "@/components/i18n";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { apiRequest } from "@/lib/api";
import type { TranslationKey } from "@/lib/translations";

type NavLink = {
  href: string;
  labelKey: TranslationKey;
};

const RESERVATION_COUNT_REFRESH_EVENT = "reservation-count-refresh";

const publicLinks: NavLink[] = [
  { href: "/", labelKey: "navHome" },
  { href: "/lab", labelKey: "navLab" },
];

const studentLinks: NavLink[] = [
  { href: "/", labelKey: "navHome" },
  { href: "/lab", labelKey: "navLab" },
  { href: "/reservations", labelKey: "navMyReservations" },
];

const adminLinks: NavLink[] = [
  { href: "/", labelKey: "navHome" },
  { href: "/lab", labelKey: "navLab" },
  { href: "/dashboard", labelKey: "navDashboard" },
  { href: "/admin/reservations", labelKey: "navReservations" },
  { href: "/machines", labelKey: "navMachines" },
  { href: "/users", labelKey: "navUsers" },
];

export default function Navbar() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [reservationCount, setReservationCount] = useState(0);
  const [notifications, setNotifications] = useState<
    Array<{ id: number; message: string; is_read: boolean }>
  >([]);

  const pathname = usePathname();
  const router = useRouter();
  const { theme, toggleTheme } = useTheme();
  const { user, token, loading, logout } = useAuth();
  const startLoading = usePageTransition();
  const { t } = useTranslation();

  const navLinks = loading
    ? publicLinks
    : user?.role === "admin"
      ? adminLinks
      : user
        ? studentLinks
        : publicLinks;

  useEffect(() => {
    const loadNotifications = async () => {
      if (!user || user.role !== "student" || !token) return;
      const data = await apiRequest<{
        unread_count: number;
        notifications: Array<{ id: number; message: string; is_read: boolean }>;
      }>("/notifications/my", { token });
      setUnread(data.unread_count);
      setNotifications(data.notifications.slice(0, 6));
    };

    void loadNotifications();
    const timer = setInterval(() => void loadNotifications(), 15000);
    return () => clearInterval(timer);
  }, [token, user]);

  useEffect(() => {
    const loadReservationCount = async () => {
      if (!user || !token) {
        setReservationCount(0);
        return;
      }

      try {
        if (user.role === "admin") {
          const data = await apiRequest<{ pending_count: number }>("/admin/reservation-stats/pending-count", { token });
          setReservationCount(data.pending_count);
          return;
        }

        const reservations = await apiRequest<Array<{ id: number }>>("/reservations/my", { token });
        setReservationCount(reservations.length);
      } catch {
        setReservationCount(0);
      }
    };

    void loadReservationCount();
    window.addEventListener(RESERVATION_COUNT_REFRESH_EVENT, loadReservationCount);
    const timer = setInterval(() => void loadReservationCount(), 15000);
    return () => {
      window.removeEventListener(RESERVATION_COUNT_REFRESH_EVENT, loadReservationCount);
      clearInterval(timer);
    };
  }, [token, user]);

  const markAllAsRead = async () => {
    if (!token) return;
    await apiRequest<void>("/notifications/read-all", { method: "PUT", token });
    setUnread(0);
    setNotifications((prev) => prev.map((item) => ({ ...item, is_read: true })));
  };

  const handleLogout = () => {
    startLoading();
    logout();
    setMobileOpen(false);
    router.push("/login");
  };

  const renderCountBadge = (count: number, className = "absolute -top-1 -right-1") =>
    count > 0 ? (
      <span className={`${className} min-w-5 h-5 px-1 rounded-full bg-red-500 text-white text-[10px] grid place-content-center`}>
        {count > 9 ? "9+" : count}
      </span>
    ) : null;

  const renderThemeToggleButton = () => (
    <button
      onClick={toggleTheme}
      className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      aria-label={theme === "dark" ? t("navSwitchLight") : t("navSwitchDark")}
      title={theme === "dark" ? t("navSwitchLight") : t("navSwitchDark")}
    >
      {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
      
    </button>
  );

  return (
    <nav className="sticky top-0 z-50 w-full border-b border-border bg-background/80 backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <Link href="/" className="flex items-center gap-2 group">
            <div className="w-35 h-8 rounded-lg flex items-center justify-center group-hover:scale-110 transition-transform">
              <Image
                src="/logo.png"
                alt="Illustration"
                width={400}
                height={400}
                className="object-contain"
              />
            </div>
          </Link>

          <div className="hidden md:flex items-center gap-4">
            {navLinks.map(({ href, labelKey }) => {
              const isActive = pathname === href;
              const label = t(labelKey);
              const showReservationBadge =
                reservationCount > 0 && (labelKey === "navMyReservations" || labelKey === "navReservations");
              return (
                <Link
                  key={href}
                  href={href}
                  onClick={startLoading}
                  className="relative py-2 group"
                >
                  <span
                    className={`text-sm font-medium transition-colors duration-200 ${
                      isActive ? "text-primary" : "text-muted-foreground group-hover:text-foreground"
                    }`}
                  >
                    {label}
                  </span>
                  {showReservationBadge && renderCountBadge(reservationCount, "absolute -top-2 -right-4")}
                  <span
                    className={`absolute bottom-0 left-0 h-0.5 bg-primary transition-all duration-300 ease-in-out ${
                      isActive
                        ? "w-full opacity-100"
                        : "w-0 opacity-0 group-hover:w-full group-hover:opacity-100"
                    }`}
                  />
                </Link>
              );
            })}
          </div>

          <div className="flex items-center gap-2">
            <div className="hidden sm:block">
              <LanguageSwitcher />
            </div>
            {renderThemeToggleButton()}

            {user?.role === "student" && (
              <div className="relative">
                <button
                  onClick={() => setNotificationsOpen((prev) => !prev)}
                  className="p-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors relative"
                >
                  <Bell className="w-5 h-5" />
                  {renderCountBadge(unread)}
                </button>
                {notificationsOpen && (
                  <div className="absolute right-0 mt-2 w-80 rounded-xl border border-border bg-card shadow-lg z-50 p-3">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-sm font-semibold">{t("navNotifications")}</p>
                      <button
                        className="text-xs text-primary hover:underline"
                        onClick={() => void markAllAsRead()}
                      >
                        {t("navMarkAllRead")}
                      </button>
                    </div>
                    <div className="space-y-2 max-h-72 overflow-y-auto">
                      {notifications.length === 0 && (
                        <p className="text-xs text-muted-foreground">{t("navNoNotifications")}</p>
                      )}
                      {notifications.map((item) => (
                        <div
                          key={item.id}
                          className={`rounded-lg border px-2 py-2 text-xs ${
                            item.is_read ? "border-border" : "border-primary/40 bg-primary/5"
                          }`}
                        >
                          {item.message}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {user ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="flex items-center gap-2 rounded-full border border-border bg-card px-3 py-2 text-sm hover:bg-accent transition-colors">
                    <div className="grid h-8 w-8 place-content-center rounded-full bg-primary/10 text-primary">
                      <User className="h-4 w-4" />
                    </div>
                    <div className="hidden sm:block text-left leading-tight">
                      <p className="max-w-32 truncate font-medium">{user.full_name}</p>
                      <p className="text-xs text-muted-foreground">
                        {user.role === "admin" ? t("roleAdmin") : t("roleStudent")}
                      </p>
                    </div>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuItem
                    onClick={() => {
                      startLoading();
                      router.push("/profile");
                    }}
                  >
                    <User className="h-4 w-4" />
                    {t("navProfile")}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="text-red-600 focus:text-red-600"
                    onClick={handleLogout}
                  >
                    <LogOut className="h-4 w-4" />
                    {t("navLogout")}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <>
                <Link href="/login" onClick={startLoading}>
                  <Button size="sm" variant="outline" className="hidden sm:flex">
                    {t("navLogin")}
                  </Button>
                </Link>
                <Link href="/register" onClick={startLoading}>
                  <Button size="sm" className="hidden sm:flex">
                    {t("navRegister")}
                  </Button>
                </Link>
              </>
            )}

            <button
              onClick={() => setMobileOpen(!mobileOpen)}
              className="md:hidden p-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            >
              {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </div>

      {mobileOpen && (
        <div className="md:hidden border-t border-border bg-background">
          <div className="px-4 py-3 space-y-1">
            {navLinks.map(({ href, labelKey }) => {
              const isActive = pathname === href;
              const label = t(labelKey);
              const showReservationBadge =
                reservationCount > 0 && (labelKey === "navMyReservations" || labelKey === "navReservations");
              return (
                <Link key={href} href={href}>
                  <button
                    onClick={() => setMobileOpen(false)}
                    className={`relative w-full text-left px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                      isActive
                        ? "bg-primary/10 text-primary"
                        : "text-muted-foreground hover:text-foreground hover:bg-accent"
                    }`}
                  >
                    {label}
                    {showReservationBadge && renderCountBadge(reservationCount, "absolute right-3 top-1/2 -translate-y-1/2")}
                  </button>
                </Link>
              );
            })}
            <div className="flex items-center gap-2 px-3 py-2">
              <LanguageSwitcher />
              {renderThemeToggleButton()}
            </div>
          </div>
        </div>
      )}
    </nav>
  );
}
