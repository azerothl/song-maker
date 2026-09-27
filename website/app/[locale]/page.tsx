import { setRequestLocale } from "next-intl/server";
import { Hero } from "@/components/sections/Hero";
import { PromiseSection } from "@/components/sections/PromiseSection";
import { FeaturesTour } from "@/components/sections/FeaturesTour";
import { AudioExamples } from "@/components/sections/AudioExamples";
import { FrameGallery } from "@/components/sections/FrameGallery";
import { LicenseSection } from "@/components/sections/LicenseSection";
import { FaqSection } from "@/components/sections/FaqSection";
import { CtaFinal } from "@/components/sections/CtaFinal";
import { ScrollMotion } from "@/components/ScrollMotion";

type Props = {
  params: Promise<{ locale: string }>;
};

export default async function HomePage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <>
      <ScrollMotion />
      <Hero />
      <PromiseSection />
      <FeaturesTour />
      <AudioExamples />
      <FrameGallery />
      <LicenseSection />
      <FaqSection />
      <CtaFinal />
    </>
  );
}
