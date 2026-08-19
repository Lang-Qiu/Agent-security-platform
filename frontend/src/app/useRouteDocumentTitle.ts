import { useEffect } from "react";

export function useRouteDocumentTitle(title: string): void {
  useEffect(() => {
    document.title = title;
  }, [title]);
}
