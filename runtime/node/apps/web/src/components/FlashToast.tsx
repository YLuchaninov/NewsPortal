import { useEffect } from "react";
import { Toaster, toast } from "sonner";

interface FlashToastProps {
  flash?: { status: "success" | "error"; message: string } | null;
}

export function FlashToast({ flash }: FlashToastProps) {
  useEffect(() => {
    if (!flash) return;
    if (flash.status === "success") {
      toast.success(flash.message);
    } else {
      toast.error(flash.message);
    }
  }, []);

  return (
    <Toaster
      richColors
      position="top-right"
      toastOptions={{
        duration: 4000,
        classNames: {
          toast:
            "group-[.toaster]:shadow-lg group-[.toaster]:rounded-xl",
        },
      }}
    />
  );
}

