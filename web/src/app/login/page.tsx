import Image from "next/image";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import LoginForm from "./LoginForm";

export const metadata = { title: "Sign in" };

export default async function LoginPage() {
  if (await getCurrentUser()) redirect("/");
  return (
    <div className="login">
      <div className="login-box">
        <Image src="/logo.jpg" alt="Heavyworks Garage" width={140} height={140} priority />
        <h2 style={{ textAlign: "center" }}>Workshop sign in</h2>
        <LoginForm />
      </div>
    </div>
  );
}
