import { notFound, redirect } from "next/navigation";
import SectionApp from "@/components/section-app";

const sections = ["scan-documents", "all-documents", "categories", "users", "statistics", "logs", "settings"] as const;

export function generateStaticParams() {
  return sections.map((section) => ({ section }));
}

export default async function SectionPage({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  if (section === "search") redirect("/all-documents");
  if (!sections.includes(section as (typeof sections)[number])) notFound();
  return <SectionApp section={section} />;
}
