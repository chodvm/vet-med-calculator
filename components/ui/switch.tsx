import * as React from "react";
import * as SwitchPr from "@radix-ui/react-switch";
import { cn } from "@/components/ui/lib";

export function Switch({ className, ...props }: React.ComponentPropsWithoutRef<typeof SwitchPr.Root>) {
  return (
    <SwitchPr.Root
      className={cn("peer inline-flex h-6 w-10 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors data-[state=checked]:bg-gray-900 data-[state=unchecked]:bg-gray-300", className)}
      {...props}
    >
      <SwitchPr.Thumb className="block h-5 w-5 rounded-full bg-white shadow transition-transform data-[state=checked]:translate-x-4 data-[state=unchecked]:translate-x-0" />
    </SwitchPr.Root>
  );
}
