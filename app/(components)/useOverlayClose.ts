"use client";

import { useRef } from "react";

/**
 * Retorna props pro elemento overlay de um modal pra que ele só feche
 * quando o usuário clica no fundo (e não quando arrasta de dentro pra fora).
 *
 * Uso:
 *   const overlayProps = useOverlayClose(onClose);
 *   <div className="fixed inset-0 ..." {...overlayProps}> ...modal... </div>
 */
export function useOverlayClose(onClose: () => void) {
  const downOnOverlayRef = useRef(false);

  return {
    onMouseDown: (e: React.MouseEvent<HTMLDivElement>) => {
      downOnOverlayRef.current = e.target === e.currentTarget;
    },
    onMouseUp: (e: React.MouseEvent<HTMLDivElement>) => {
      const upOnOverlay = e.target === e.currentTarget;
      if (downOnOverlayRef.current && upOnOverlay) {
        onClose();
      }
      downOnOverlayRef.current = false;
    },
  };
}
