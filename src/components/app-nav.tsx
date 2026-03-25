"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

type AppNavProps = {
  items: Array<{
    href: string;
    label: string;
  }>;
};

export function AppNav({ items }: AppNavProps) {
  const pathname = usePathname();

  return (
    <nav className="flex flex-wrap gap-2">
      {items.map((item) => {
        const isActive =
          pathname === item.href || pathname.startsWith(`${item.href}/`);

        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "rounded-full px-4 py-2 text-sm font-semibold",
              isActive
                ? "bg-slate-950 text-white shadow-[0_12px_24px_rgba(15,23,42,0.18)]"
                : "bg-white/70 text-slate-700 hover:bg-white",
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
