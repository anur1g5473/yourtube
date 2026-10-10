import { Bell, Menu, Mic, Moon, Search, ShieldCheck, SunMedium, User, VideoIcon } from "lucide-react";
import React, { useEffect, useState } from "react";
import { Button } from "./ui/button";
import Link from "next/link";
import { Input } from "./ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar";
import Channeldialogue from "./channeldialogue";
import { useRouter } from "next/router";
import { useUser } from "@/lib/AuthContext";
import axiosInstance from "@/lib/axiosinstance";
import styles from "./Header.module.css";

const Header = () => {
  const { user, login, logout, handlegooglesignin } = useUser();
  const [searchQuery, setSearchQuery] = useState("");
  const [isdialogeopen, setisdialogeopen] = useState(false);
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const router = useRouter();

  useEffect(() => {
    if (user?.preferredTheme === "light" || user?.preferredTheme === "dark") {
      setTheme(user.preferredTheme);
      return;
    }
    if (!user) {
      const savedTheme = localStorage.getItem("theme");
      setTheme(savedTheme === "dark" ? "dark" : "light");
      return;
    }

    const istHour = Number(
      new Intl.DateTimeFormat("en-IN", {
        timeZone: "Asia/Kolkata",
        hour: "2-digit",
        hourCycle: "h23",
      }).format(new Date())
    );
    const preferredTheme = istHour >= 5 && istHour < 12 ? "light" : "dark";
    setTheme(preferredTheme);
    axiosInstance
      .patch("/user/preferences", { preferredTheme })
      .then((response) => login(response.data.user))
      .catch((error) => console.error("Unable to save login-time theme preference:", error));
  }, [user?._id, user?.preferredTheme]);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    document.documentElement.classList.toggle("dark", theme === "dark");
    localStorage.setItem("theme", theme);
  }, [theme]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      router.push(`/search?q=${encodeURIComponent(searchQuery.trim())}`);
    }
  };

  const handleKeypress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSearch(e as any);
    }
  };

  const toggleTheme = async () => {
    const nextTheme = theme === "dark" ? "light" : "dark";
    setTheme(nextTheme);
    if (!user) return;
    try {
      const response = await axiosInstance.patch("/user/preferences", {
        preferredTheme: nextTheme,
      });
      login(response.data.user);
    } catch (error) {
      console.error("Unable to save theme preference:", error);
      window.alert("Your theme changed on this device but could not be saved to your account.");
    }
  };

  return (
    <header className={`${styles.header} border-b bg-white px-4 py-2 dark:bg-slate-950 dark:text-white`}>
      <div className={`${styles.brand} flex items-center gap-4`}>
        <Button variant="ghost" size="icon" className={styles.menuButton}>
          <Menu className="h-6 w-6" />
        </Button>
        <Link href="/" className="flex items-center gap-1">
          <div className="rounded bg-red-600 p-1">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="white">
              <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
            </svg>
          </div>
          <span className="text-xl font-medium">YourTube</span>
          <span className="ml-1 text-xs text-gray-400">IN</span>
        </Link>
      </div>
      <form onSubmit={handleSearch} className={`${styles.search} mx-4 flex max-w-2xl flex-1 items-center gap-2`}>
        <div className="flex flex-1">
          <Input
            type="search"
            placeholder="Search"
            value={searchQuery}
            onKeyPress={handleKeypress}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="rounded-l-full border-r-0 focus-visible:ring-0"
          />
          <Button type="submit" className="rounded-r-full border border-l-0 bg-gray-50 px-6 text-gray-600 hover:bg-gray-100">
            <Search className="h-5 w-5" />
          </Button>
        </div>
        <Button variant="ghost" size="icon" className={`rounded-full ${styles.microphone}`}>
          <Mic className="h-5 w-5" />
        </Button>
      </form>
      <div className={styles.headerActions}>
        <Button variant="ghost" size="icon" onClick={toggleTheme} aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}>
          {theme === "dark" ? <SunMedium className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
        </Button>
        <nav className={styles.desktopLinks} aria-label="Quick links">
          <Link href="/plans">
            <Button variant="ghost" size="sm">Plans</Button>
          </Link>
          <Link href="/meetings" aria-label="Meetings" title="Meetings" className="inline-flex items-center gap-1 rounded px-2 py-1 text-sm hover:bg-gray-100">
            <VideoIcon className="h-5 w-5" />
            <span>Meetings</span>
          </Link>
          <Link href="/downloads">
            <Button variant="ghost" size="sm">Downloads</Button>
          </Link>
          <Link href="/security">
            <Button variant="ghost" size="sm" className="gap-1">
              <ShieldCheck className="h-4 w-4" /> Security
            </Button>
          </Link>
        </nav>
        {user ? (
          <>
            <Button variant="ghost" size="icon">
              <Bell className="h-6 w-6" />
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="relative h-8 w-8 rounded-full">
                  <Avatar className="h-8 w-8">
                    <AvatarImage src={user.image} />
                    <AvatarFallback>{user.name?.[0] || "U"}</AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-56" align="end" forceMount>
                {user?.channelname ? (
                  <DropdownMenuItem asChild>
                    <Link href={`/channel/${user?._id}`}>Your channel</Link>
                  </DropdownMenuItem>
                ) : (
                  <div className="px-2 py-1.5">
                    <Button variant="secondary" size="sm" className="w-full" onClick={() => setisdialogeopen(true)}>
                      Create Channel
                    </Button>
                  </div>
                )}
                <DropdownMenuItem asChild>
                  <Link href="/history">History</Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/liked">Liked videos</Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/watch-later">Watch later</Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/downloads">Downloads</Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/security">Security</Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={logout}>Sign out</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        ) : (
          <Button className="flex items-center gap-2" onClick={handlegooglesignin}>
            <User className="h-4 w-4" />
            Sign in
          </Button>
        )}
      </div>
      <Channeldialogue isopen={isdialogeopen} onclose={() => setisdialogeopen(false)} mode="create" />
    </header>
  );
};

export default Header;
