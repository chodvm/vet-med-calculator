"use client";
import * as React from "react";
import * as RadixLabel from "@radix-ui/react-label";
import { cn } from "@/components/ui/lib";

export const Label = React.forwardRef<
  React.ElementRef<typeof RadixLabel.Root>,
  React.ComponentPropsWithoutRef<typeof RadixLabel.Root>
>(({ className, ...props }, ref) => (
  <RadixLabel.Root ref={ref} className={cn("text-sm font-medium", className)} {...props} />
));
Label.displayName = "Label";
