import { setRequestLocale } from "next-intl/server";
import { LandingExperience } from "@/components/sections/LandingExperience";

type Props = { params: Promise<{ locale: string }> };

export default async function HomePage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <LandingExperience />;
}
