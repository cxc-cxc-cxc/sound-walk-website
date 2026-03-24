"use client";
import { SessionProvider } from "next-auth/react";
import { useState, useEffect } from "react";

export default function Providers({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  if (!mounted) return <div style={{ visibility: "hidden" }}>{children}</div>;
  return <SessionProvider>{children}</SessionProvider>;
}
