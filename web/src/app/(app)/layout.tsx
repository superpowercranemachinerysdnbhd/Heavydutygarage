import Image from "next/image";
import Link from "next/link";
import Nav from "@/components/Nav";
import { requireUser } from "@/lib/auth";
import { can, ROLE_LABEL } from "@/lib/permissions";
import { logout } from "@/app/login/actions";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const items = [
    { href: "/", label: "Dashboard" },
    { href: "/jobs", label: "Jobs" },
    { href: "/machinery", label: "Machinery" },
    ...(can(user.role, "customer.manage") ? [{ href: "/customers", label: "Customers" }] : []),
    { href: "/team", label: "Team" },
  ];
  return (
    <>
      <header className="top">
        <div className="wrap">
          <div className="top-row">
            <Link href="/" className="brand plain">
              <Image src="/logo.jpg" alt="" width={40} height={40} priority />
              <div><h1>Heavyworks Garage</h1><small>Workshop control</small></div>
            </Link>
            <div className="userbox">
              <span><b>{user.name}</b> · {ROLE_LABEL[user.role]}</span>
              <Link href="/account" style={{ color: "var(--steel-ink)" }}>Account</Link>
              <form action={logout}><button type="submit">Sign out</button></form>
            </div>
          </div>
          <Nav items={items} />
        </div>
      </header>
      <main className="wrap">{children}</main>
    </>
  );
}
