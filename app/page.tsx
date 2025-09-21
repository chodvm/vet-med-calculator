import dynamic from "next/dynamic";

const VetMedDrugCalculator = dynamic(() => import("@/src/VetMedDrugCalculator"), { ssr: false });

export default function Page() {
  return <VetMedDrugCalculator />;
}
