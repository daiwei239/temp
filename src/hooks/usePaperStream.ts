import { useEffect, useRef, useState } from 'react';

interface Handlers {
  onStatusChange?: (msg: string) => void;
  onStep1Stream?: (content: string) => void;
  onStep1Done?: (data: any) => void;
}

export function usePaperStream(paperId: string | null, handlers: Handlers) {
  const wsRef = useRef<WebSocket | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!paperId) return;

    const ws = new WebSocket(`ws://localhost:8002/ws/paper/${paperId}`);
    wsRef.current = ws;

    ws.onopen = () => setConnected(true);
    ws.onclose = () => setConnected(false);

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      switch (data.type) {
        case 'status_change':
          handlers.onStatusChange?.(data.msg);
          break;
        case 'step1_stream':
          handlers.onStep1Stream?.(data.content);
          break;
        case 'step1_done':
          handlers.onStep1Done?.(data.data);
          break;
        default:
          break;
      }
    };

    return () => {
      ws.close();
    };
  }, [paperId]);

  const sendAction = (action: string) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    wsRef.current.send(JSON.stringify({ action }));
  };

  return { sendAction, connected };
}

