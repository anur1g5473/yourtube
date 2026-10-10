import {
  Home,
  Compass,
  PlaySquare,
  Clock,
  ThumbsUp,
  History,
  User,
  Video,
  Download,
  CreditCard,
} from "lucide-react";
import Link from "next/link";
import React, { useState } from "react";
import { Button } from "./ui/button";
import Channeldialogue from "./channeldialogue";
import { useUser } from "@/lib/AuthContext";
import styles from "./Sidebar.module.css";

const Sidebar = () => {
  const { user } = useUser();

  const [isdialogeopen, setisdialogeopen] = useState(false);
  return (
    <>
    <aside className={`${styles.sidebar} bg-white dark:bg-slate-950`}>
      <nav className="space-y-1">
        <Link href="/">
          <Button variant="ghost" className="w-full justify-start">
            <Home className="w-5 h-5 mr-3" />
            Home
          </Button>
        </Link>
        <Link href="/explore">
          <Button variant="ghost" className="w-full justify-start">
            <Compass className="w-5 h-5 mr-3" />
            Explore
          </Button>
        </Link>
        <Link href="/plans">
          <Button variant="ghost" className="w-full justify-start">
            <PlaySquare className="w-5 h-5 mr-3" />
            Plans &amp; billing
          </Button>
        </Link>
        <Link href="/meetings">
          <Button variant="ghost" className="w-full justify-start">
            <Video className="w-5 h-5 mr-3" />
            Meetings
          </Button>
        </Link>

        {user && (
          <>
            <div className="border-t pt-2 mt-2">
              <Link href="/history">
                <Button variant="ghost" className="w-full justify-start">
                  <History className="w-5 h-5 mr-3" />
                  History
                </Button>
              </Link>
              <Link href="/liked">
                <Button variant="ghost" className="w-full justify-start">
                  <ThumbsUp className="w-5 h-5 mr-3" />
                  Liked videos
                </Button>
              </Link>
              <Link href="/watch-later">
                <Button variant="ghost" className="w-full justify-start">
                  <Clock className="w-5 h-5 mr-3" />
                  Watch later
                </Button>
              </Link>
              {user?.channelname ? (
                <Link href={`/channel/${user.id}`}>
                  <Button variant="ghost" className="w-full justify-start">
                    <User className="w-5 h-5 mr-3" />
                    Your channel
                  </Button>
                </Link>
              ) : (
                <div className="px-2 py-1.5">
                  <Button
                    variant="secondary"
                    size="sm"
                    className="w-full"
                    onClick={() => setisdialogeopen(true)}
                  >
                    Create Channel
                  </Button>
                </div>
              )}
            </div>
          </>
        )}
      </nav>
    </aside>
      <nav className={styles.mobileNav} aria-label="Mobile navigation">
        <Link href="/" aria-label="Home">
          <Home className="h-5 w-5" aria-hidden="true" />
          <span>Home</span>
        </Link>
        <Link href="/explore" aria-label="Explore">
          <Compass className="h-5 w-5" aria-hidden="true" />
          <span>Explore</span>
        </Link>
        <Link href="/plans" aria-label="Plans and billing">
          <CreditCard className="h-5 w-5" aria-hidden="true" />
          <span>Plans</span>
        </Link>
        <Link href="/meetings" aria-label="Meetings">
          <Video className="h-5 w-5" aria-hidden="true" />
          <span>Meetings</span>
        </Link>
        <Link href="/downloads" aria-label="Downloads">
          <Download className="h-5 w-5" aria-hidden="true" />
          <span>Downloads</span>
        </Link>
      </nav>
      <Channeldialogue
        isopen={isdialogeopen}
        onclose={() => setisdialogeopen(false)}
        mode="create"
      />
      </>
  );
};

export default Sidebar;
