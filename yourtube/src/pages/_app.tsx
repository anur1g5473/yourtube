import Header from "@/components/Header";
import Sidebar from "@/components/Sidebar";
import { Toaster } from "@/components/ui/sonner";
import "@/styles/globals.css";
import type { AppProps } from "next/app";
import { UserProvider } from "../lib/AuthContext";
export default function App({ Component, pageProps }: AppProps) {
  return (
    <UserProvider>
      <div className="min-h-screen bg-white text-black">
        <title>Your-Tube Clone</title>
        <Header />
        <Toaster />
        <div className="flex min-w-0 pb-16 md:pb-0">
          <Sidebar />
          <div className="min-w-0 flex-1">
            <Component {...pageProps} />
          </div>
        </div>
      </div>
    </UserProvider>
  );
}
