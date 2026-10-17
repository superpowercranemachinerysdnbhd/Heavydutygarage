"use client";
import { setLists, type Lists } from "@/lib/lists";

/** Hands the Head Manager's lists and settings to the browser, so drop-downs and labels match the server. */
export default function ListsProvider({ lists, children }: { lists: Lists; children: React.ReactNode }) {
  setLists(lists);
  return <>{children}</>;
}
