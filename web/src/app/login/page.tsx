import Image from "next/image";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getI18n } from "@/i18n/server";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import LoginForm from "./LoginForm";

export async function generateMetadata() {
  return { title: (await getI18n()).t("login.submit") };
}

export default async function LoginPage() {
  if (await getCurrentUser()) redirect("/");
  const { t } = await getI18n();
  return (
    <div className="login">
      <div className="login-box">
        <div className="login-lang"><LanguageSwitcher className="on-light" /></div>
        <Image src="/logo.jpg" alt={t("app.name")} width={140} height={140} priority />
        <h2 style={{ textAlign: "center" }}>{t("login.title")}</h2>
        <LoginForm />
      </div>
    </div>
  );
}
