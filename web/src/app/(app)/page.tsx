import { redirect } from "next/navigation";

/** The app opens on Work orders (the urgent items sit at the top of that page). */
export default function Home() {
  redirect("/jobs");
}
