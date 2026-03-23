import { useEffect } from "react";
import { Toaster, toast } from "sonner";

interface AdminFlashToastProps {
  flash?: { status: "success" | "error"; message: string } | null;
}

export function AdminFlashToast({ flash }: AdminFlashToastProps) {
  useEffect(() => {
    if (!flash) return;
    if (flash.status === "success") toast.success(flash.message);
    else toast.error(flash.message);
  }, []);

  return (
    <Toaster
      richColors
      position="top-right"
      toastOptions={{ duration: 4000 }}
    />
  );
}

