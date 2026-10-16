import Image from "next/image";
import Link from "next/link";
import Nav from "@/components/Nav";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { unreadTotal } from "@/lib/chat";
import { getI18n } from "@/i18n/server";
import { roleLabel } from "@/i18n/labels";
import { logout } from "@/app/login/actions";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const { t } = await getI18n();
  const items = [
    { href: "/", label: t("nav.dashboard") },
    { href: "/jobs", label: t("nav.jobs") },
    { href: "/chat", label: t("nav.chat") },
    { href: "/machinery", label: t("nav.machinery") },
    { href: "/parts", label: t("nav.parts") },
    ...(can(user.role, "po.create") ? [{ href: "/purchasing", label: t("nav.purchasing") }] : []),
    ...(can(user.role, "customer.manage") ? [{ href: "/customers", label: t("nav.customers") }] : []),
    { href: "/team", label: t("nav.team") },
  ];
  const chatUnread = await unreadTotal(user);
  return (
    <>
      <header className="top">
        <div className="wrap">
          <div className="top-row">
            <Link href="/" className="brand plain">
              <Image src="/logo.jpg" alt="" width={40} height={40} priority />
              <div><h1>{t("app.name")}</h1><small>{t("app.tagline")}</small></div>
            </Link>
            <div className="userbox">
              <span><b>{user.name}</b> · {roleLabel(t, user.role)}</span>
              <LanguageSwitcher />
              <Link href="/account" style={{ color: "var(--steel-ink)" }}>{t("common.account")}</Link>
              <form action={logout}><button type="submit">{t("common.signOut")}</button></form>
            </div>
          </div>
          <Nav items={items} chatUnread={chatUnread} />
        </div>
      </header>
      <main className="wrap">{children}</main>
    </>
  );
}
