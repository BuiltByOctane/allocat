import { IphoneSmsGuide } from "@/components/guides/IphoneSmsGuide";

export const metadata = {
  title: "Auto-log bank SMS on iPhone | AlloCat",
  description:
    "Set up an iPhone Shortcuts automation so every bank debit SMS is logged in AlloCat automatically. About 3 minutes, one time.",
  alternates: { canonical: "https://allocat.xyz/guides/iphone-sms" },
};

export default function IphoneSmsGuidePage() {
  return <IphoneSmsGuide />;
}
